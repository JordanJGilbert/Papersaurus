import os
import json
import asyncio
import traceback
from typing import List, Dict, Any, Tuple, Optional, Callable, Awaitable
from google import genai
from google.genai import types
from system_prompts import PROFESSIONAL_PROMPT, get_system_prompt
from datetime import datetime
import pytz
from utils.signal_utils import send_signal_message
import base64
import uuid
import re # Add re import for placeholder resolution

# --- Imports from llm_adapters ---
from llm_adapters import (
    get_llm_adapter,
    StandardizedLLMConfig,
    StandardizedMessage,
    StandardizedToolDefinition,
    StandardizedToolCall,
    StandardizedLLMResponse,
    AttachmentPart,
    ensure_serializable_tool_result
)

# --- History Management ---
HISTORY_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "history")
os.makedirs(HISTORY_DIR, exist_ok=True)

def _get_history_filepath(user_number: str) -> str:
    safe_user_number = ''.join(c for c in user_number if c.isalnum() or c in '._- ')
    return os.path.join(HISTORY_DIR, f"{safe_user_number}_history.json")

def load_conversation_history_from_file(user_number: str) -> List[StandardizedMessage]:
    """Loads conversation history from a JSON file and parses it into StandardizedMessage objects."""
    filepath = _get_history_filepath(user_number)
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r') as f:
                history_data_raw = json.load(f) # List of dicts
            
            reconstructed_history: List[StandardizedMessage] = []
            if isinstance(history_data_raw, list):
                for item_dict in history_data_raw:
                    if isinstance(item_dict, dict):
                        try:
                            # Pydantic V2 uses model_validate for parsing dicts
                            reconstructed_history.append(StandardizedMessage.model_validate(item_dict))
                        except Exception as e_parse:
                            print(f"Error parsing item into StandardizedMessage for user {user_number}: {item_dict}. Error: {e_parse}")
                            traceback.print_exc()
                            # Optionally skip problematic entries or handle them
                    else:
                        print(f"Warning: Expected a dict in history file for {user_number}, got {type(item_dict)}. Skipping.")
            return reconstructed_history
        except json.JSONDecodeError:
            print(f"Warning: History file {filepath} for {user_number} is not valid JSON or is empty. Starting fresh.")
            return []
        except Exception as e:
            print(f"Error loading and parsing history for {user_number} from {filepath}: {e}")
            traceback.print_exc()
            return [] # Return empty list on other errors
    return [] # No history file found

def save_conversation_history_to_file(user_number: str, history: List[StandardizedMessage]):
    """Saves a list of StandardizedMessage objects to a JSON file."""
    filepath = _get_history_filepath(user_number)
    serializable_history = []
    for message in history:
        if isinstance(message, StandardizedMessage):
            # Use mode='json' to ensure complex types like UUID are serialized to strings
            # exclude_none=True is good practice for cleaner JSON
            serializable_history.append(message.model_dump(mode='json', exclude_none=True))
        else:
            print(f"Warning: Item in history for {user_number} is not a StandardizedMessage (type: {type(message)}). Skipping.")

    try:
        with open(filepath, 'w') as f:
            json.dump(serializable_history, f, indent=2)
    except Exception as e:
        print(f"Error saving history for {user_number} to {filepath}: {e}")
        traceback.print_exc()

def clear_conversation_history_for_user(user_number: str) -> bool:
    """Deletes the history file for the user. Returns True if successful."""
    filepath = _get_history_filepath(user_number)
    file_deleted_or_not_exists = False
    if os.path.exists(filepath):
        try:
            os.remove(filepath)
            file_deleted_or_not_exists = True
            print(f"Deleted history file for {user_number}: {filepath}")
        except Exception as e:
            print(f"Error deleting history file {filepath} for {user_number}: {e}")
            return False
    else:
        file_deleted_or_not_exists = True
        print(f"No history file found to delete for {user_number} at {filepath}")
    return file_deleted_or_not_exists

# --- End History Management ---

def deep_convert_to_dict(obj: Any) -> Any:
    """
    Recursively convert objects to dictionaries, stripping out keys whose values 
    become None after processing. Handles google.genai types explicitly.
    Empty dictionaries and lists resulting from this process are preserved.
    None items in lists are also preserved.
    """
    # Priority 1: Explicitly handle genai Content and Part objects
    if isinstance(obj, (types.Content, types.Part)): # types should be google.genai.types
        if hasattr(obj, 'to_dict') and callable(getattr(obj, 'to_dict')):
            try:
                dict_representation = obj.to_dict()
                return deep_convert_to_dict(dict_representation) 
            except Exception as e:
                print(f"Warning: Error calling to_dict() on {type(obj).__name__} (which has the attribute): {e}.")
                traceback.print_exc() 
                return str(obj) 
        else:
            print(f"Warning: Object IS instance of {type(obj).__name__} but LACKS 'to_dict' method. Object: {str(obj)[:250]}")
            return str(obj)
    
    elif hasattr(obj, 'to_dict') and callable(getattr(obj, 'to_dict')) and \
         not isinstance(obj, (dict, list, str, int, float, bool, type(None))):
        try:
            dict_representation = obj.to_dict()
            return deep_convert_to_dict(dict_representation)
        except Exception as e:
            print(f"Warning: Failed to call to_dict() on {type(obj).__name__} (generic handling) or process its result: {e}.")
            traceback.print_exc()
            return str(obj)

    elif hasattr(obj, 'model_dump') and callable(getattr(obj, 'model_dump')) and \
         not isinstance(obj, (dict, list, str, int, float, bool, type(None))):
        try:
            dict_representation = obj.model_dump(exclude_none=True) # StandardizedMessage would use this
            return deep_convert_to_dict(dict_representation)
        except Exception as e:
            print(f"Warning: Failed to call model_dump() on {type(obj).__name__}: {e}.")
            traceback.print_exc()
            return str(obj)

    if isinstance(obj, list):
        return [deep_convert_to_dict(item) for item in obj]

    if isinstance(obj, dict):
        cleaned_dict = {}
        for key, value in obj.items():
            processed_value = deep_convert_to_dict(value) 
            if processed_value is not None: 
                cleaned_dict[key] = processed_value
        return cleaned_dict

    return obj

# +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

# --- Placeholder Resolution Logic --- START ---
def _resolve_path(data_dict: Dict[str, Any], path_str: str) -> Any:
    """
    Safely navigates a dictionary structure using a dot-separated path.
    Raises KeyError or IndexError if the path is invalid.
    """
    keys = path_str.split('__')
    current = data_dict
    for key_or_index in keys:
        if isinstance(current, dict):
            if key_or_index not in current:
                raise KeyError(f"Key '{key_or_index}' not found in dictionary.")
            current = current[key_or_index]
        elif isinstance(current, list):
            try:
                idx = int(key_or_index)
                if not (0 <= idx < len(current)):
                    raise IndexError(f"Index {idx} out of bounds for list of length {len(current)}.")
                current = current[idx]
            except ValueError:
                raise ValueError(f"Invalid list index '{key_or_index}'. Must be an integer.")
            except IndexError: # Should be caught by the length check, but as a safeguard
                raise
        else:
            raise TypeError(f"Cannot access path component '{key_or_index}' on non-dict/non-list type: {type(current).__name__}.")
    return current

def _resolve_placeholders_in_args(
    arguments: Dict[str, Any],
    history: List[StandardizedMessage] # Standardized history where results are on 'tool_result'
) -> Dict[str, Any]:
    """
    Resolves placeholders like @@ref_<TOOL_CALL_ID>__<PATH_TO_VALUE> in tool arguments.
    """
    print(f"DEBUG: _resolve_placeholders_in_args called with arguments: {arguments}")
    print(f"DEBUG: History for placeholder resolution (first 3 messages): {history[:3]}")
    resolved_args = {}
    # Regex to find placeholders like @@ref_abcdef12__some_key__0__another_key
    # It captures the 8-char hex ID (call_id) and the double-underscore-separated path.
    placeholder_pattern = re.compile(r"^@@ref_([0-9a-fA-F]{8})__(.+)$") # Using __ as path delimiter

    for key, value in arguments.items():
        print(f"DEBUG: Processing arg key='{key}', value='{str(value)[:100]}...'")
        if isinstance(value, str):
            match = placeholder_pattern.match(value)
            if match:
                call_id_str, path_str = match.groups()
                print(f"DEBUG: Matched placeholder for arg '{key}'. call_id_str='{call_id_str}', path_str='{path_str}'")
                found_referenced_message = False
                try:
                    for i, referenced_message in enumerate(history):
                        # We are looking for a 'tool' role message whose tool_call_id matches
                        print(f"DEBUG: Checking history message {i}: role='{referenced_message.role}', tool_call_id='{referenced_message.tool_call_id}'")
                        if referenced_message.role == "tool" and referenced_message.tool_call_id == call_id_str:
                            print(f"DEBUG: Found matching tool message in history at index {i} for call_id_str='{call_id_str}'")
                            if referenced_message.tool_result is not None:
                                print(f"DEBUG: Tool message has tool_result: {str(referenced_message.tool_result)[:200]}...")
                                retrieved_value = _resolve_path(referenced_message.tool_result, path_str)
                                resolved_args[key] = retrieved_value
                                print(f"DEBUG: Successfully resolved placeholder '{value}' (id: {call_id_str}) to: {type(retrieved_value)} from history index {i}. Value: {str(retrieved_value)[:100]}...")
                                found_referenced_message = True
                                break # Found and processed
                            else:
                                print(f"DEBUG: Placeholder '{value}' (id: {call_id_str}) references tool message at history index {i} which has None tool_result. Passing placeholder as is.")
                                resolved_args[key] = value # Pass placeholder as is
                                found_referenced_message = True # Found, but result was None
                                break
                    
                    if not found_referenced_message:
                        print(f"DEBUG: Placeholder '{value}' (id: {call_id_str}) did not find a matching 'tool' role message with this tool_call_id in history. Passing placeholder as is.")
                        resolved_args[key] = value

                except Exception as e:
                    print(f"DEBUG: Error resolving placeholder '{value}' (id: {call_id_str}): {type(e).__name__} - {e}. Passing placeholder as is.")
                    traceback.print_exc() # Add traceback for the exception
                    resolved_args[key] = value # Pass placeholder as is on error
            else:
                print(f"DEBUG: Arg '{key}' value is a string but not a placeholder.")
                resolved_args[key] = value # Not a placeholder string
        else:
            print(f"DEBUG: Arg '{key}' value is not a string.")
            resolved_args[key] = value # Not a string, pass as is
    print(f"DEBUG: _resolve_placeholders_in_args returning: {resolved_args}")
    return resolved_args

def _get_referenceable_tool_outputs_summary(history: List[StandardizedMessage]) -> str:
    """
    Creates a summary of available tool outputs from history for the LLM prompt.
    """
    summary_lines = []
    for i, msg in enumerate(history):
        # We are interested in messages of role 'tool' as these contain 'tool_result'
        if msg.role == "tool" and msg.tool_name and msg.tool_result and msg.tool_call_id:
            # msg.tool_result is already a dict due to ensure_serializable_tool_result
            # and now it's wrapped like {'tool_name_response': {...original_result...}}
            wrapped_result_keys = list(msg.tool_result.keys()) # Should be one key: f"{msg.tool_name}_response"
            
            inner_result_preview = "Output structure is unexpected or result is not a dictionary."
            # Path for @@ref should start with the key in tool_result, e.g., {tool_name}_response
            path_prefix_for_ref = ""
            if wrapped_result_keys:
                path_prefix_for_ref = wrapped_result_keys[0] # e.g. "web_search_response"
                inner_result = msg.tool_result[path_prefix_for_ref]
                if isinstance(inner_result, dict):
                    output_keys = list(inner_result.keys())
                    if not output_keys:
                        inner_result_preview = f"Tool '{msg.tool_name}' output (under '{path_prefix_for_ref}') is an empty dictionary."
                    else:
                        inner_result_preview = f"Tool '{msg.tool_name}' output (under '{path_prefix_for_ref}') contains keys: {', '.join(output_keys[:3])}{'...' if len(output_keys) > 3 else ''}."
                else:
                    # If the inner result (e.g., from web_search_response) is a string or list directly
                    inner_result_preview = f"Tool '{msg.tool_name}' output (under '{path_prefix_for_ref}') is a {type(inner_result).__name__}. To reference it directly, use @@ref_{msg.tool_call_id}__{path_prefix_for_ref}."
            
            summary_lines.append(
                f"- Tool Call ID '{msg.tool_call_id}' (for tool '{msg.tool_name}') executed. {inner_result_preview} "
                f"To reference an output (e.g., a key named 'example_key' from the dictionary under '{path_prefix_for_ref}'), use the format @@ref_{msg.tool_call_id}__{path_prefix_for_ref}__example_key. "
                f"For nested outputs, append more keys: @@ref_{msg.tool_call_id}__{path_prefix_for_ref}__outer_key__inner_key. "
                f"If the output under '{path_prefix_for_ref}' is a simple type (string, list) and you want to reference it directly, use @@ref_{msg.tool_call_id}__{path_prefix_for_ref}."
            )
    
    if not summary_lines:
        return "No previous tool results available for referencing in this conversation turn."
    
    return "Available previous tool results for reference (use the format @@ref_<TOOL_CALL_ID>__<PATH_USING_DOUBLE_UNDERSCORES> to use a result in a tool argument):\n" + "\n".join(summary_lines)

# --- Placeholder Resolution Logic --- END ---

# Add this new helper function before function_calling_loop
def extract_conversation_history(contents) -> str:
    """
    Extract formatted conversation history from message contents.
    Returns a string containing the formatted conversation.
    """
    raw_conversation = ""
    for content in contents:
        if content.role == "user":
            # Extract the text from user content
            user_text = ""
            function_responses = []
            
            for p in content.parts:
                if hasattr(p, "text") and p.text is not None:
                    user_text += p.text
                elif hasattr(p, "function_response") and p.function_response:
                    # Extract function response data
                    func_name = p.function_response.name
                    try:
                        # Try to get the response data
                        if hasattr(p.function_response, "response") and p.function_response.response:
                            resp_str = str(p.function_response.response)
                            function_responses.append(f"Function Response ({func_name}): {resp_str}")
                    except Exception as e:
                        function_responses.append(f"Function Response ({func_name}): [Error extracting response: {str(e)}]")
            
            # Add user text if present
            if user_text:
                raw_conversation += f"User: {user_text}\n---\n"
            
            # Add function responses if any
            for resp in function_responses:
                raw_conversation += f"{resp}\n---\n"
                
        elif content.role == "model":
            # Extract the text or function calls from model content
            model_text = ""
            function_calls = []
            
            for p in content.parts:
                if hasattr(p, "text") and p.text is not None:
                    model_text += p.text
                elif hasattr(p, "function_call") and p.function_call:
                    # Extract function call info
                    func_name = p.function_call.name
                    try:
                        # Try to extract args
                        if hasattr(p.function_call, "args") and p.function_call.args:
                            args_str = str(p.function_call.args)
                            if len(args_str) > 500:
                                args_str = args_str[:500] + "... [truncated]"
                            function_calls.append(f"Function Call: {func_name}({args_str})")
                        else:
                            function_calls.append(f"Function Call: {func_name}()")
                    except Exception as e:
                        function_calls.append(f"Function Call: {func_name}([Error extracting args: {str(e)}])")
            
            # Add model text if present
            if model_text:
                raw_conversation += f"Assistant: {model_text}\n---\n"
            
            # Add function calls if any
            for call in function_calls:
                raw_conversation += f"{call}\n---\n"
    
    return raw_conversation

# +++++++++++++++++++++ NEW ERROR HANDLER ++++++++++++++++++++++++++
def handle_gemini_api_error(api_error: Exception, contents: List[types.Content]):
    """Handles and prints details of a Gemini API error."""
    print("\nGemini API ERROR DETAILS:")
    print(f"Error type: {type(api_error).__name__}")
    print(f"Error message: {str(api_error)}")

    # Try to extract and print more details if available
    if hasattr(api_error, 'status_code'):
        print(f"Status code: {api_error.status_code}")
    if hasattr(api_error, 'response_json'):
        try:
            print(f"Response JSON: {json.dumps(api_error.response_json, indent=2)}")
        except:
            print(f"Response JSON (raw): {api_error.response_json}")

    # Print the contents we were trying to send with improved inspection
    print("\nDEBUG - Contents being sent to API:")
    for i, content in enumerate(contents):
        try:
            role = content.role
            parts_info = []
            if hasattr(content, 'parts') and content.parts: # Check if parts exist and is iterable
                for part in content.parts:
                    if part is None: # Check if a part itself is None
                        parts_info.append("part: None")
                        continue

                    part_desc = "part: Unknown type"
                    if hasattr(part, "text") and part.text is not None:
                        part_desc = f"text: '{part.text[:50]}...'"
                    elif hasattr(part, "function_call") and part.function_call is not None:
                        fc_name = getattr(part.function_call, 'name', 'UnknownName')
                        part_desc = f"function_call: {fc_name}"
                    elif hasattr(part, "function_response") and part.function_response is not None:
                        fr_name = getattr(part.function_response, 'name', 'UnknownName')
                        # Also try to show response type and content for debugging
                        fr_resp_type = "UnknownResp"
                        fr_resp_content_preview = "[Could not serialize response]"
                        if hasattr(part.function_response, 'response'):
                            fr_resp_type = type(part.function_response.response).__name__
                            try:
                                # Attempt to serialize the response to JSON for preview
                                response_json = json.dumps(part.function_response.response)
                                fr_resp_content_preview = response_json[:150] + ('...' if len(response_json) > 150 else '')
                            except Exception:
                                # If serialization fails, show a basic representation
                                try:
                                    fr_resp_content_preview = str(part.function_response.response)[:150] + '...'
                                except Exception:
                                     fr_resp_content_preview = "[Error getting string representation]"

                        part_desc = f"function_response: {fr_name} (resp_type: {fr_resp_type}, content: {fr_resp_content_preview})"

                    parts_info.append(part_desc)
            else:
                parts_info.append("parts: None or Empty") # Handle empty/None parts list

            print(f"  {i}: role={role}, parts=[{', '.join(parts_info)}]")
        except Exception as inspect_e:
            print(f"  {i}: Error inspecting content: {inspect_e}")
            # Add traceback for inspection errors
            traceback.print_exc()

    print("\nPlease try again with a different query.")
# +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

async def function_calling_loop(
    user_input: str,
    mcp_tools_list: Optional[List[Any]] = None,
    mcp_tool_to_session_map: Optional[Dict[str, Any]] = None,
    user_number="typically_a_phone_number_string",
    conversation_history: Optional[List[StandardizedMessage]] = None,
    test_mode=False,
    attachments: Optional[List[Dict[str, Any]]] = None,
    stream_chunk_handler: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None,
    final_response_json_schema: Optional[Dict[str, Any]] = None
):
    MAX_CONVERSATION_HISTORY_MESSAGES = 30
    model_name = "gemini-2.5-pro-preview-05-06"

    if user_input.strip().lower() == "clear" or user_input.strip().lower() == "buddy clear":
        clear_conversation_history_for_user(user_number)
        await send_signal_message(user_number, message="Conversation history cleared.")
        return "Conversation history cleared.", [], None

    current_standardized_history: List[StandardizedMessage]
    if conversation_history is None:
        current_standardized_history = load_conversation_history_from_file(user_number)
    else:
        current_standardized_history = conversation_history

    if not mcp_tools_list or not mcp_tool_to_session_map:
        print("Warning: function_calling_loop called without MCP tool data.")
        mcp_tools_list = []
        mcp_tool_to_session_map = {}

    try:
        llm_adapter = get_llm_adapter(model_name)
    except Exception as e:
        print(f"Error getting LLM adapter: {e}")
        if stream_chunk_handler:
            await stream_chunk_handler({"type": "error", "content": f"LLM adapter error: {e}"})
            await stream_chunk_handler({"type": "stream_end"})
        return f"Error initializing LLM: {e}", current_standardized_history, str(e)
    
    print(f"Initialized LLM adapter for model: {model_name}")

    standardized_tools: List[StandardizedToolDefinition] = []
    if mcp_tools_list:
        for mcp_tool_obj in mcp_tools_list:
            standardized_tools.append(
                StandardizedToolDefinition(
                    name=mcp_tool_obj.name,
                    description=mcp_tool_obj.description,
                    parameters_schema=mcp_tool_obj.inputSchema if mcp_tool_obj.inputSchema else {}
                )
            )
        print(f"Prepared {len(standardized_tools)} standardized tool definitions.")

    now = datetime.now()
    current_time = now.strftime("%H:%M:%S")
    current_date = now.strftime("%Y-%m-%d")
    day_of_week = now.strftime("%A")
    timezone = str(datetime.now(pytz.timezone('UTC')).astimezone().tzinfo)
    channel = "web_chat" if stream_chunk_handler else "signal"
    base_prompt = get_system_prompt(channel)
    system_instruction_text = (
        base_prompt
        + f"\n\nCURRENT DATE CONTEXT:"
        + f"\n  Current time: {current_time}"
        + f"\n  Current date: {current_date}"
        + f"\n  Day of week: {day_of_week}"
        + f"\n  Timezone: {timezone}"
        + f"\n\nUSER NUMBER: {user_number}"
        + "\n\nMULTI-STEP OPERATIONS & CONTEXT PASSING VIA 'additional_context':"
        + "\n  - Several tools (e.g., code generation, document generation/editing) accept an 'additional_context' STRING parameter."
        + "\n  - GENERAL RULE: The 'additional_context' parameter MUST always receive a string. It cannot be a complex object like a JSON dictionary or list resolved from an @@ref_."
        + "\n  - USING @@ref_ TO POPULATE ARGUMENTS (INCLUDING 'additional_context'):"
        + "\n    - If you use @@ref_<TOOL_CALL_ID>__<PATH_TO_VALUE> to populate any argument, ensure the <PATH_TO_VALUE> resolves to the correct type for that argument."
        + "\n    - For 'additional_context', this means the <PATH_TO_VALUE> must resolve to a STRING. Example: 'additional_context': '@@ref_prev_call_id__tool_response__summary_text'."
        + "\n  - SPECIAL GUIDANCE FOR 'additional_context' IN DOCUMENT *CREATION* TOOLS (create_web_app, create_pdf_document):"
        + "\n    - For these specific creation tools, you are responsible for SYNTHESIZING the string for 'additional_context'."
        + "\n    - DO NOT use @@ref_ to point 'additional_context' to a complex object (like a full JSON dictionary from 'search_batch_tool')."
        + "\n    - INSTEAD: If data from a complex object (e.g., search results) is needed for document creation:"
        + "\n      1. Have the search tool return its results (which will be in history)."
        + "\n      2. In your thought process for the create_web_app/create_pdf_document call, analyze those results."
        + "\n      3. Formulate a STRING containing all necessary details from those results. This might be a comprehensive summary, a list of extracted key information, or any textual representation that is optimally detailed for the creation task. Ensure it is a single string."
        + "\n      4. Pass this *self-generated, appropriately detailed string* directly as the value for 'additional_context'."
        + "\n  - GUIDANCE FOR 'additional_context' IN *OTHER* TOOLS (e.g., code/document *editing* tools):"
        + "\n    - For tools like 'edit_python_code', 'edit_web_app', 'edit_pdf_document', if you use @@ref_ to populate 'additional_context', it is permissible as long as the <PATH_TO_VALUE> resolves to a string (e.g., pointing to a specific text field from a previous tool's output)."
        + "\n    - ALWAYS be strategic: the string passed to 'additional_context' should contain all relevant information needed for the task, structured clearly if possible. Avoid including truly irrelevant data, but prioritize completeness of necessary details over excessive brevity if that detail is required for optimal performance of the next tool."
    )

    # Add instruction about final response schema if provided
    if final_response_json_schema:
        try:
            schema_string = json.dumps(final_response_json_schema, indent=2)
            system_instruction_text += (
                "\n\nFINAL RESPONSE JSON SCHEMA ENFORCEMENT:"
                "\n  - When you are ready to provide the final answer to the user (i.e., you will not be calling any more tools), "
                "\n  your response text MUST be a single, valid JSON object that strictly conforms to the following JSON schema:"
                "\n```json"
                f"\n{schema_string}"
                "\n```"
                "\n  - Ensure your entire final textual response is ONLY this JSON object. Do not include any other text, explanations, or markdown formatting outside of this JSON object."
            )
        except Exception as e_schema_dump:
            print(f"Warning: Could not serialize final_response_json_schema to string: {e_schema_dump}")
            # Optionally, inform the LLM that a schema was intended but couldn't be provided
            system_instruction_text += (
                "\n\nFINAL RESPONSE JSON SCHEMA ENFORCEMENT:"
                "\n  - A JSON schema for the final response was intended, but could not be processed. Please provide your final answer as clearly as possible."
            )

    # Prepare user message with attachments
    user_message_content = user_input
    user_attachments_for_sm: List[AttachmentPart] = []

    if attachments:
        user_message_content += (
            "\n\nAttachments have been uploaded. "
            "Use the 'list_attachments' tool to retrieve attachment metadata (key, URL, mime_type, label, description) before using 'fetch_attachments'."
        )

    current_standardized_history.append(StandardizedMessage(
        role="user", 
        content=user_message_content,
        attachments=user_attachments_for_sm if user_attachments_for_sm else None
    ))

    async def process_standardized_function_call(
        tool_call: StandardizedToolCall, 
        current_user_input_text: str,
        current_user_number_str: str,
        history_for_placeholders: List[StandardizedMessage],
        stream_handler_func: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None
    ) -> Tuple[str, str, dict]:
        tool_name = tool_call.name
        tool_id = tool_call.call_id
        print(f"Processing standardized function call ID {tool_id}: {tool_name}")
        
        if tool_name not in mcp_tool_to_session_map:
            error_msg = f"Tool '{tool_name}' is not available (called by ID {tool_id})."
            print(f"Warning: {error_msg}")
            print("Available tools: " + ", ".join(list(mcp_tool_to_session_map.keys())))
            return tool_id, tool_name, {"error": error_msg}
        
        session_for_tool = mcp_tool_to_session_map[tool_name]
        
        try:
            resolved_args_dict = _resolve_placeholders_in_args(tool_call.arguments, history_for_placeholders)
            print(f"Original arguments for {tool_name} (ID: {tool_id}): {tool_call.arguments}")
            print(f"Resolved arguments for {tool_name} (ID: {tool_id}): {resolved_args_dict}")
        except Exception as e_resolve:
            print(f"Critical error during placeholder resolution for {tool_name} (ID: {tool_id}): {e_resolve}")
            traceback.print_exc()
            # Fallback to original arguments if resolution fails, but log critical error
            resolved_args_dict = tool_call.arguments 
        
        args_dict = resolved_args_dict
        
        print(f"DEBUG: Calling tool '{tool_name}' (ID: {tool_id}) with parameters:")
        try:
            print(json.dumps(args_dict, indent=2))
        except TypeError as e_json_dump_args:
            print(f"  (Could not JSON serialize args_dict for full debug print: {e_json_dump_args}. Args: {args_dict})")
        print("--- End of tool parameters ---")

        try:
            # Temporarily attach the stream_handler_func to the session object's _custom_state
            # This allows the sampling_handler (if used by this tool via ctx.sample)
            # to potentially access it and stream sample generation back to the client.
            # _custom_state is a dict on the Client instance.
            handler_was_set_in_custom_state = False
            if stream_handler_func:
                if not hasattr(session_for_tool, '_custom_state') or not isinstance(session_for_tool._custom_state, dict):
                    session_for_tool._custom_state = {} 
                session_for_tool._custom_state['_main_frontend_stream_handler'] = stream_handler_func
                handler_was_set_in_custom_state = True

            result_or_generator = await session_for_tool.call_tool(tool_name, arguments=args_dict)
            
            final_response_payload: Dict[str, Any]
            last_item_from_stream = None

            if hasattr(result_or_generator, '__aiter__') and hasattr(result_or_generator, '__anext__'):
                print(f"Tool '{tool_name}' (ID: {tool_id}) returned an async generator. Streaming results...")
                item_count = 0
                async for item in result_or_generator:
                    item_count += 1
                    print(f"  Stream item {item_count} for {tool_name} (ID: {tool_id}): {str(item)[:200]}...")
                    current_payload_for_stream = item
                    last_item_from_stream = current_payload_for_stream

                    if stream_handler_func:
                        try:
                            await stream_handler_func({
                                "type": "tool_result",
                                "call_id": tool_id,
                                "name": tool_name,
                                "result": current_payload_for_stream,
                                "is_error": "error" in current_payload_for_stream if isinstance(current_payload_for_stream, dict) else False,
                                "is_partial": True
                            })
                        except Exception as e_stream_item:
                            print(f"Error sending tool_result stream item chunk for {tool_name} (ID: {tool_id}): {e_stream_item}")
                
                if last_item_from_stream is not None:
                    final_response_payload = last_item_from_stream
                else: 
                    final_response_payload = {"status": "success", "message": f"Tool '{tool_name}' (ID: {tool_id}) streamed 0 items."}
            else: 
                print(f"Tool '{tool_name}' (ID: {tool_id}) returned a single result.")
                final_response_payload = result_or_generator

            print(f"Final response payload for {tool_name} (ID: {tool_id}) (for history): {str(final_response_payload)[:200]}...")
            return tool_id, tool_name, final_response_payload
        except Exception as e_tool_call:
            print(f"Error executing tool {tool_name} (ID: {tool_id}): {str(e_tool_call)}")
            traceback.print_exc()
            return tool_id, tool_name, {"error": str(e_tool_call), "details": traceback.format_exc()}
        finally:
            # Clean up the temporarily attached handler from _custom_state
            if handler_was_set_in_custom_state:
                if hasattr(session_for_tool, '_custom_state') and session_for_tool._custom_state and '_main_frontend_stream_handler' in session_for_tool._custom_state:
                    del session_for_tool._custom_state['_main_frontend_stream_handler']
                    # If _custom_state becomes empty, optionally delete it or leave it.
                    # For now, just remove the key.

    turns = 0
    max_turns = 10
    final_assistant_response_text = ""
    error_message_from_loop = None
    intermediate_text_sent_via_signal_non_streaming = False

    while turns < max_turns:
        turns += 1
        print(f"Function calling loop turn {turns}")

        if len(current_standardized_history) > MAX_CONVERSATION_HISTORY_MESSAGES:
            original_len = len(current_standardized_history)
            # Keep system prompt if first, then user, then alternate assistant/user/tool
            # For simplicity now, just tail truncate, but a more sophisticated strategy could be used.
            # If the first message is system, we might want to preserve it.
            if current_standardized_history and current_standardized_history[0].role == "system": # Check if history is not empty
                 current_standardized_history = [current_standardized_history[0]] + current_standardized_history[-(MAX_CONVERSATION_HISTORY_MESSAGES-1):]
            else:
                 current_standardized_history = current_standardized_history[-MAX_CONVERSATION_HISTORY_MESSAGES:]
            print(f"Standardized History Truncation (to max length): Original len {original_len}, new len {len(current_standardized_history)}.")

        # Additional logic to ensure history doesn't start with a tool call or tool result
        while current_standardized_history:
            first_message = current_standardized_history[0]
            is_tool_result = first_message.role == "tool"
            is_pure_assistant_tool_call = (
                first_message.role == "assistant" and 
                (first_message.content is None or not first_message.content.strip()) and 
                first_message.tool_calls is not None and len(first_message.tool_calls) > 0
            )

            if is_tool_result or is_pure_assistant_tool_call:
                print(f"Trimming leading message (Role: {first_message.role}, Type: {'ToolResult' if is_tool_result else 'PureAssistantToolCall'}) from history start.")
                current_standardized_history.pop(0)
            else:
                break # First message is acceptable (user, system, or assistant with content/no tool calls)
        
        if not current_standardized_history and original_len > 0: # original_len check from truncation block
            print("Warning: History became empty after trimming leading tool calls/results.")

        reference_summary = _get_referenceable_tool_outputs_summary(current_standardized_history)
        current_system_prompt = system_instruction_text + "\n\n" + reference_summary
        
        current_llm_config = StandardizedLLMConfig(
            system_prompt=current_system_prompt,
            include_thoughts=True if stream_chunk_handler else None, 
        )

        try:
            print(f"Calling LLM adapter ({model_name}) with {len(current_standardized_history)} history messages.")
            if current_standardized_history:
                print(f"Last history message (turn {turns-1}): role='{current_standardized_history[-1].role}', content='{str(current_standardized_history[-1].content)[:100]}...'")
            
            llm_response: StandardizedLLMResponse = await llm_adapter.generate_content(
                model_name=model_name,
                history=current_standardized_history,
                tools=standardized_tools if standardized_tools else None,
                config=current_llm_config,
                stream_callback=stream_chunk_handler
            )
            print(f"LLM adapter response received. Stop reason: {llm_response.stop_reason}")

        except Exception as api_error:
            print(f"Error calling LLM Adapter: {api_error}")
            traceback.print_exc()
            error_message_from_loop = str(api_error)
            if stream_chunk_handler: 
                await stream_chunk_handler({"type": "error", "content": error_message_from_loop})
                await stream_chunk_handler({"type": "stream_end"})
            break 

        if llm_response.error:
            print(f"LLM Response Error: {llm_response.error}")
            error_message_from_loop = llm_response.error
            if stream_chunk_handler and not llm_response.raw_response:
                 await stream_chunk_handler({"type": "stream_end"})
            break

        # Capture all parts of the assistant's response for history
        # An assistant's turn can have text_content, tool_calls, or both.
        if llm_response.text_content or llm_response.tool_calls:
            assistant_message_to_add = StandardizedMessage(
                role="assistant",
                content=llm_response.text_content if llm_response.text_content else None,
                tool_calls=llm_response.tool_calls if llm_response.tool_calls else None
            )
            current_standardized_history.append(assistant_message_to_add)
            
            # Accumulate final text for return value and non-streaming Signal message
            if llm_response.text_content:
                final_assistant_response_text += (" " if final_assistant_response_text else "") + llm_response.text_content
                # If this is a non-streaming text response part, send it via Signal
                # This handles cases where an assistant provides text BEFORE or AFTER tool calls in the same turn.
                if stream_chunk_handler is None and llm_response.text_content:
                    await send_signal_message(user_number, message=llm_response.text_content)
                    intermediate_text_sent_via_signal_non_streaming = True
        
        # Now, if there were tool_calls, process them
        if llm_response.tool_calls:
            tool_processing_tasks = []
            for tool_call_from_llm in llm_response.tool_calls:
                if stream_chunk_handler:
                    try:
                        await stream_chunk_handler({
                            "type": "tool_call_pending",
                            "call_id": tool_call_from_llm.call_id,
                            "name": tool_call_from_llm.name,
                            "arguments": tool_call_from_llm.arguments
                        })
                    except Exception as e_stream_tc_pending:
                        print(f"Error sending tool_call_pending chunk to stream: {e_stream_tc_pending}")

                tool_processing_tasks.append(process_standardized_function_call(
                    tool_call_from_llm, 
                    user_input,
                    user_number,
                    current_standardized_history,
                    stream_chunk_handler 
                ))
            
            if not tool_processing_tasks:
                error_message_from_loop = "Error: Could not create tasks for standardized tool calls."
                if stream_chunk_handler: await stream_chunk_handler({"type": "error", "content": error_message_from_loop })
                break
            
            function_call_results = await asyncio.gather(*tool_processing_tasks)
            
            tool_response_messages_for_history: List[StandardizedMessage] = []
            for tool_call_id, tool_name, tool_result_payload in function_call_results:
                # Ensure the tool result is serializable before processing
                serialized_payload = ensure_serializable_tool_result(tool_result_payload)
                is_error_in_tool = isinstance(serialized_payload, dict) and "error" in serialized_payload

                # For history, we still wrap the payload for compatibility
                wrapped_payload = {f"{tool_name}_response": serialized_payload}

                if stream_chunk_handler:
                    # For streaming, send the unwrapped serialized result directly
                    final_tool_result_chunk = {
                        "type": "tool_result",
                        "call_id": tool_call_id,
                        "name": tool_name,
                        "result": serialized_payload,  # Send unwrapped serialized payload to stream
                        "is_error": is_error_in_tool
                    }
                    try:
                        await stream_chunk_handler(final_tool_result_chunk)
                    except Exception as e_stream_tc_result:
                        print(f"Error sending final tool_result chunk to stream for {tool_name} (ID: {tool_call_id}): {e_stream_tc_result}")

                tool_response_messages_for_history.append(
                    StandardizedMessage.from_tool_result(
                        tool_call_id=tool_call_id,
                        tool_name=tool_name,
                        result=wrapped_payload, # Use wrapped payload for history
                        is_error=is_error_in_tool
                    )
                )
            
            if tool_response_messages_for_history:
                current_standardized_history.extend(tool_response_messages_for_history)
            else:
                print("Warning: No tool response messages generated after processing calls, though tasks were created.")
            
            continue 

        if llm_response.stop_reason in ["stop", "max_tokens", "safety", "recitation"] or not llm_response.tool_calls:
            print(f"Loop finished. Stop reason: {llm_response.stop_reason}. Has text: {bool(final_assistant_response_text)}")
            break 
        
        if turns >= max_turns:
            print("Max turns reached in function calling loop.")
            if not error_message_from_loop:
                 error_message_from_loop = "Max turns reached without final response."
            if stream_chunk_handler and error_message_from_loop:
                await stream_chunk_handler({"type": "error", "content": error_message_from_loop })
            break

    save_conversation_history_to_file(user_number, current_standardized_history)

    if stream_chunk_handler is None:
        if final_assistant_response_text and not intermediate_text_sent_via_signal_non_streaming:
            await send_signal_message(user_number, message=final_assistant_response_text)
        elif error_message_from_loop:
            await send_signal_message(user_number, message=f"Sorry, an error occurred: {error_message_from_loop}")
        elif not final_assistant_response_text and not error_message_from_loop and not intermediate_text_sent_via_signal_non_streaming:
            if not (user_input.strip().lower() == "clear" or user_input.strip().lower() == "buddy clear"):
                 await send_signal_message(user_number, message="I don't have a further response right now.")
    elif stream_chunk_handler and not error_message_from_loop and not final_assistant_response_text and not llm_response.tool_calls:
        print("Loop ended for streaming case with no text/tools/error, ensuring stream_end.")

    return final_assistant_response_text, current_standardized_history, error_message_from_loop
