import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
from mcp.server.fastmcp import FastMCP
import io
import contextlib
import re
from typing import Annotated, Literal, Optional, List, Dict, Any
from pydantic import Field
from llm_adapters import get_llm_adapter, StandardizedMessage, StandardizedLLMConfig
import logging
# --- Begin: Additional utility imports ---
from pathlib import Path
import datetime
import uuid
import asyncio
import inspect
import requests
import json
# --- End: Additional utility imports ---

mcp = FastMCP("Python Code Execution Server")
logger = logging.getLogger(__name__)

# --- Supported LLM Models (copied from document_generation_server.py for consistency) ---
MODELS_LITERAL = Literal[
    "gemini-2.5-flash-preview-05-20",
    "gemini-2.5-pro-preview-05-06",
    "models/gemini-2.0-flash",
    "gemini-2.0-flash",
    "claude-3-7-sonnet-latest",
    "gpt-4.1-2025-04-14",
    "o4-mini-2025-04-16",
    "gemini-2.5-flash-preview-05-20"
]

CREATE_PYTHON_SYSTEM_PROMPT_TEMPLATE = """You are an expert Python programmer. Your primary task is to write a single, complete, and directly executable Python function based on the user's request.

- The entire output Python code should be encapsulated within a single function.
- This function MUST be named `generated_function_name`.
- The function should take appropriate arguments if needed and return a value if logical based on the user's request.
- If you need to call other available MCP tools, you can use the special asynchronous function `_call_mcp_tool(tool_name: str, arguments: dict)`. This function will be available in the execution environment. For example: `response_data = await _call_mcp_tool('some_tool_name', dict(parameter1='value1', parameter2='value2'))`. The `caller_user_id` context for the tool call is handled automatically. Do not try to import or define `_call_mcp_tool` yourself. If using it, `generated_function_name` must be an `async def` function.
{available_tools_section}
- Output the Python code, including the `generated_function_name` function definition, enclosed in a diff-fenced markdown code block, using 'temp.py' as the filename.
The format MUST be:
```temp.py
async def generated_function_name(args_if_any): # Make it async if using _call_mcp_tool
    # ... your Python code here ...
    # Example: result = await _call_mcp_tool('some_tool_name', dict(parameter1='value1', parameter2='value2'))
    # Example: print("Hello from generated_function_name")
    return "result_if_any"
```
- Do not include any explanations, comments outside the code, or any other text before or after the code block.
- The generated function should be self-contained if possible. If it requires external libraries, assume they are installed, and include necessary imports *inside* the function if they are specific to it, or at the top of the `temp.py` block if they are general.
- Focus on fulfilling the user's request for Python *function* generation. If an `additional_context` is provided, use it to inform the code generation process.
- Do NOT include any `if __name__ == '__main__':` block in your generated code. The function `generated_function_name` will be called directly by the execution environment.
"""

EDIT_PYTHON_REGENERATE_SYSTEM_PROMPT_TEMPLATE = """You are an expert Python programmer. You will be given an existing Python code block (typically a single function) and a user's request describing desired modifications.
You might also be provided with `additional_context` which could contain relevant information from previous steps (e.g., search results, API documentation) that should inform your edits.
Your task is to rewrite the entire Python code block, incorporating the requested changes and leveraging any provided context, and output the new, complete code block.

- The entire output Python code should be encapsulated within a single function, or if the original code was not a function, the appropriate complete structure.
- If the original code was a function, the modified function MUST be named `generated_function_name`.
- The function should take appropriate arguments if needed and return a value if logical, consistent with the original code's structure unless the edit request implies changes here.
- If you need to call other available MCP tools, you can use the special asynchronous function `_call_mcp_tool(tool_name: str, arguments: dict)`. This function will be available in the execution environment. For example: `response_data = await _call_mcp_tool('some_tool_name', dict(parameter1='value1', parameter2='value2'))`. The `caller_user_id` context for the tool call is handled automatically. Do not try to import or define `_call_mcp_tool` yourself. If using it, `generated_function_name` must be an `async def` function.
{available_tools_section}
- Output the new, complete Python code, including the `generated_function_name` function definition (if applicable), enclosed in a diff-fenced markdown code block, using 'temp.py' as the filename.
The format MUST be:
```temp.py
# Potentially some module-level imports if they were in the original or are newly required

async def generated_function_name(args_if_any): # Make it async if using _call_mcp_tool
    # ... your new, complete Python code here ...
    # Example: result = await _call_mcp_tool('some_tool_name', dict(parameter1='value1', parameter2='value2'))
    # Example: print("Hello from modified generated_function_name")
    return "new_result_if_any"
```
- Or, if the original code was not a function, output the complete modified script in the same format:
```temp.py
# ... new, complete script content ...
# (If this script part needs to call MCP tools, it must handle async execution itself, e.g. by defining and running an async main function)
```
- Do not include any explanations, comments outside the code, or any other text before or after the code block.
- The generated code should be self-contained if possible. If it requires external libraries, assume they are installed. Include necessary imports *inside* the function if they are specific to it and were handled that way originally, or at the top of the `temp.py` block if they are general (mirroring common Python style).
- Focus on fulfilling the user's request by providing a fully rewritten, directly executable Python code block.
- If `additional_context` is provided, ensure your edits reflect the information or requirements mentioned in it, in addition to the primary `edit_request`.
- Do NOT include any `if __name__ == '__main__':` block in your generated code unless it was part of the original code structure provided.
- Ensure the returned code is a complete, standalone piece of Python that reflects the requested edits to the original.
"""

@mcp.tool()
async def execute_python_code(
    code: Annotated[str, Field(description="The Python code to execute.")],
    function_args: Annotated[Optional[List[Any]], Field(description="Optional list of positional arguments to pass to 'generated_function_name' if it is called. Ignored if 'generated_function_name' is not found or not callable.", default=None)] = None,
    function_kwargs: Annotated[Optional[Dict[str, Any]], Field(description="Optional dictionary of keyword arguments to pass to 'generated_function_name' if it is called. Ignored if 'generated_function_name' is not found or not callable.", default=None)] = None,
    timeout_seconds: Annotated[Optional[int], Field(description="Optional timeout in seconds for the code execution.", ge=1, le=300)] = 60,
    caller_user_id: Annotated[Optional[str], Field(description="User ID for context if the executed code calls other MCP tools. This is automatically passed by the system.", default=None)] = None,
    additional_context: Annotated[Optional[str], Field(description="Optional textual context that might inform how the results of this execution are interpreted or used in subsequent steps. This string can be as detailed as necessary, containing all relevant information (e.g., from previous tool calls like search results or API documentation) to best inform subsequent actions. This context is not directly passed to the executing code unless specified in function_args/kwargs or embedded in the code string.", default=None)] = None
) -> dict:
    """
    Executes arbitrary Python code provided by the user in a restricted environment. 
    The code runs with the full permissions of the user invoking this tool; therefore, the user is responsible for the nature and security implications of the executed code.
    It first executes the entire code block, then specifically attempts to call a function 
    named 'generated_function_name' (if defined in the code) optionally with 'function_args' and 'function_kwargs'.
    The executed code can also call other MCP tools using 'await _call_mcp_tool(tool_name, arguments)'.
    Standard output, standard error, and the function's return value (if called) are captured.
    
    IMPORTANT: If the Python code to be executed was generated by a previous tool call in this 
    conversation (e.g., by 'create_python_code'), you SHOULD use the placeholder syntax
    '@@ref_<TOOL_CALL_ID>__<PATH_TO_VALUE>' to pass the existing code to the 'code' argument directly.
    FAILURE TO USE THIS SYNTAX FOR REFERENCING PREVIOUSLY GENERATED CODE MAY LEAD TO ERRORS OR UNEXPECTED BEHAVIOR. ALWAYS PREFER @@ref WHEN POSSIBLE.
    
    The `stdout`, `stderr`, and `function_result` from the execution are directly visible to the user in the interface. 
    In your textual response following this tool's execution, avoid restating these outputs verbatim. 
    Instead, you can confirm successful execution, interpret the results if necessary, or propose next steps.
    Output schema: {"status": "success/error", "stdout": "...", "stderr": "...", "function_called": true/false, "function_result": "...", "message": "..."}
    """
    if not code:
        return {"status": "error", "message": "No code provided to execute."}

    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()
    
    global_vars = {} 
    function_result_repr = None
    was_function_called = False
    execution_message = "Code block executed."

    # --- Define the _call_mcp_tool helper to be injected ---
    async def _injected_call_mcp_tool_impl(tool_name: str, arguments: dict):
        # caller_user_id is from the outer scope of execute_python_code
        mcp_service_base_url = os.getenv("MCP_SERVICE_BASE_URL", "http://127.0.0.1:5001")
        internal_api_key = os.getenv("MCP_INTERNAL_API_KEY")

        if not internal_api_key:
            logger.error("MCP_INTERNAL_API_KEY not set in environment. Cannot make internal tool calls.")
            raise EnvironmentError("MCP_INTERNAL_API_KEY not configured for internal tool calls by executed Python code.")

        http_request_timeout = timeout_seconds - 5 if timeout_seconds > 10 else max(1, timeout_seconds - 1) # Ensure positive timeout
        if http_request_timeout <=0: http_request_timeout = 5 # Fallback to 5s if calculation is too low

        def make_request_sync():
            # Ensure these are properly captured if this function were nested deeper or passed around differently
            # For asyncio.to_thread, variables from the surrounding scope are naturally captured.
            headers = {
                "X-Internal-API-Key": internal_api_key,
                "Content-Type": "application/json"
            }
            payload = {
                "tool_name": tool_name,
                "arguments": arguments,
                "user_id_context": caller_user_id 
            }
            target_url = f"{mcp_service_base_url}/internal/call_mcp_tool"
            
            logger.info(f"Python exec: Making internal MCP tool call. URL: {target_url}, Tool: {tool_name}, Args: {arguments}, Context User: {caller_user_id}")
            
            try:
                response = requests.post(target_url, json=payload, headers=headers, timeout=http_request_timeout)
                response.raise_for_status() # Raise an exception for HTTP error codes (4xx or 5xx)
                return response.json()
            except requests.exceptions.Timeout:
                logger.error(f"Python exec: Timeout calling internal MCP tool '{tool_name}' at {target_url}")
                raise TimeoutError(f"Timeout calling internal MCP tool '{tool_name}'")
            except requests.exceptions.RequestException as req_err:
                logger.error(f"Python exec: HTTP error calling internal MCP tool '{tool_name}': {req_err}. Response: {req_err.response.text if req_err.response else 'No response'}")
                raise Exception(f"HTTP error calling internal MCP tool '{tool_name}': {req_err}") from req_err

        try:
            response_data = await asyncio.to_thread(make_request_sync)
        except Exception as e: # Catch errors from make_request_sync, including re-raised ones
            logger.error(f"Python exec: Exception during asyncio.to_thread for internal tool call '{tool_name}': {e}")
            raise # Re-raise to be caught by the main try-except block of execute_python_code

        logger.info(f"Python exec: Internal MCP tool call to '{tool_name}' response data: {response_data}")

        if response_data.get("error"):
            err_msg = response_data["error"]
            logger.error(f"Python exec: Error received from internal MCP tool '{tool_name}': {err_msg}")
            raise Exception(f"Error from MCP tool '{tool_name}': {err_msg}")
        
        raw_result = response_data.get("result")
        if raw_result is None:
            logger.warning(f"Python exec: 'result' field missing in response from internal tool call for '{tool_name}'. Response: {response_data}")
            return None
        try:
            return json.loads(raw_result) # Attempt to parse if result is a JSON string
        except (json.JSONDecodeError, TypeError):
            return raw_result # Otherwise, return raw result (e.g., if it's already a parsed type or plain string)

    global_vars['_call_mcp_tool'] = _injected_call_mcp_tool_impl
    # --- End of _call_mcp_tool helper ---

    try:
        with contextlib.redirect_stdout(stdout_capture), contextlib.redirect_stderr(stderr_capture):
            exec(code, global_vars) 
            
            if 'generated_function_name' in global_vars and callable(global_vars['generated_function_name']):
                target_function = global_vars['generated_function_name']
                
                args_to_use = function_args if function_args is not None else []
                kwargs_to_use = function_kwargs if function_kwargs is not None else {}
                
                if inspect.iscoroutinefunction(target_function):
                    logger.info("Python exec: 'generated_function_name' is an async function, awaiting its result.")
                    function_actual_result = await target_function(*args_to_use, **kwargs_to_use)
                else:
                    logger.info("Python exec: 'generated_function_name' is a sync function, calling it directly.")
                    function_actual_result = target_function(*args_to_use, **kwargs_to_use)
                
                function_result_repr = repr(function_actual_result)
                was_function_called = True
                
                if function_args or function_kwargs:
                    execution_message = "Function 'generated_function_name' was called with provided arguments."
                else:
                    execution_message = "Function 'generated_function_name' was called without arguments."
            elif 'generated_function_name' in global_vars:
                execution_message = "'generated_function_name' was found but is not callable." 
            # If 'generated_function_name' is not found, the code block itself was still exec'd.

        stdout_val = stdout_capture.getvalue()
        stderr_val = stderr_capture.getvalue()
        
        final_status = "success"
        
        if stderr_val: # If there's any stderr, even from successful code, mention it.
            execution_message += " Execution produced standard error output."
            # Consider if stderr should always imply an error status, or if it's informational.
            # For now, stderr doesn't automatically make status="error" unless an exception occurs.

        if not stdout_val and not stderr_val and not was_function_called:
            execution_message = "Code block executed, no output; 'generated_function_name' not found or not called."
        elif not stdout_val and not stderr_val and was_function_called and function_result_repr == 'None':
             execution_message = "Function 'generated_function_name' called, returned None, no stdout/stderr."

        return {
            "status": final_status,
            "stdout": stdout_val,
            "stderr": stderr_val,
            "function_called": was_function_called,
            "function_result": function_result_repr,
            "message": execution_message.strip()
        }

    except Exception as e:
        # Capture stdout/stderr even if an exception occurs mid-way
        stdout_val = stdout_capture.getvalue()
        stderr_val = stderr_capture.getvalue()
        
        error_type = type(e).__name__
        error_message_str = str(e)
        
        # Log the full error traceback for server-side debugging
        import traceback
        logger.error(f"Exception during Python code execution: {error_type}: {error_message_str}\nTraceback:\n{traceback.format_exc()}")

        full_error_message = f"Exception during execution: {error_type}: {error_message_str}"

        # Append the specific exception to stderr_val if it's not already the last thing there
        # This ensures the direct error message from the exception is part of the stderr output
        # Handle cases where error_message_str might be multi-line or already captured by redirect_stderr
        if error_message_str and not stderr_val.strip().endswith(error_message_str.strip()):
            separator = "\n" if stderr_val.strip() else ""
            stderr_val += f"{separator}Runtime Exception: {error_type}: {error_message_str}"
        elif not error_message_str and not stderr_val: # If no stderr and no specific message string
            stderr_val = f"Runtime Exception: {error_type}"


        return {
            "status": "error",
            "stdout": stdout_val,
            "stderr": stderr_val.strip(),
            "function_called": was_function_called, 
            "function_result": function_result_repr, # Might be None if error before/during function call
            "message": full_error_message
        }
    finally:
        stdout_capture.close()
        stderr_capture.close()

@mcp.tool()
async def create_python_code(
    user_request: Annotated[str, Field(description="A natural language description of the Python code to be generated.")],
    model: Annotated[MODELS_LITERAL, Field(description="The LLM model to use for code generation.")] = "gemini-2.5-pro-preview-05-06",
    available_tool_names_for_code_gen: Annotated[Optional[List[str]], Field(description="Optional list of MCP tool names that the generated Python code can call using `_call_mcp_tool`.", default=None)] = None,
    additional_context: Annotated[Optional[str], Field(description="Optional textual context to guide the code generation. This string should contain all necessary and relevant details from previous steps (e.g., search results, API documentation, or user clarifications) to produce the optimal code. The LLM should synthesize this string to be as detailed as required.", default=None)] = None
) -> dict:
    """
    Generates arbitrary Python code based on a user's natural language request using an LLM.
    The generated code can call other MCP tools if `_call_mcp_tool` is used and tools are available.
    The user is responsible for reviewing and understanding the generated code before execution, as it will run with their full permissions via the 'execute_python_code' tool.
    Returns the generated Python code as a string.
    The 'user_request' can be a string directly provided by the LLM or can be populated
    by referencing a previous tool's output using the '@@ref_<TOOL_CALL_ID>__<PATH_TO_VALUE>' syntax.
    Output schema: {"status": "success/error/warning", "generated_code": "...", "message": "..."}
    
    The `generated_code` is directly visible to the user in the interface. 
    In your textual response after this tool runs, simply confirm that the code has been generated 
    and perhaps ask if the user wants to execute or modify it. Do not repeat the generated code in your message.
    """
    if not user_request:
        return {"status": "error", "message": "User request cannot be empty for code generation."}

    adapter = get_llm_adapter(model_name=model)
    
    prompt_content = f"User request for Python code: {user_request}"
    if additional_context:
        prompt_content += f"\n\nAdditional Context to consider for this request:\n{additional_context}"
    
    available_tools_section_str = ""
    if available_tool_names_for_code_gen:
        tools_list_str = ", ".join([f"'{name}'" for name in available_tool_names_for_code_gen])
        available_tools_section_str = f"- The following MCP tools are potentially available for you to call with `await _call_mcp_tool(tool_name, arguments)`: [{tools_list_str}]. You should only call tools that are logically necessary for the user's request. The schema for these tools is not provided here; assume standard arguments or make your best guess if unsure."
    else:
        available_tools_section_str = "- You may attempt to call other MCP tools using `await _call_mcp_tool(tool_name, arguments)`. The system will determine if the tool is available. Make reasonable assumptions about tool names and arguments if needed."

    final_system_prompt = CREATE_PYTHON_SYSTEM_PROMPT_TEMPLATE.format(available_tools_section=available_tools_section_str)

    history = [StandardizedMessage(role="user", content=prompt_content)]
    llm_config = StandardizedLLMConfig(system_prompt=final_system_prompt)

    try:
        llm_response = await adapter.generate_content(
            model_name=model,
            history=history,
            tools=None,
            config=llm_config,
            stream_callback=None  # Explicitly disable streaming for this internal call
        )

        if llm_response.error:
            return {"status": "error", "message": f"LLM API error: {llm_response.error}"}
        
        response_text = llm_response.text_content
        if not response_text:
            return {"status": "error", "message": "LLM returned no content for code generation."}

        # Extract Python code from markdown block
        # Regex to capture code within ```temp.py ... ``` or ``` ... ```
        code_match = re.search(r"```(?:temp\.py)?\s*([\s\S]*?)\s*```", response_text, re.DOTALL)
        if code_match:
            generated_code = code_match.group(1).strip()
            return {"status": "success", "generated_code": generated_code}
        else:
            # If no markdown block, return the raw response and flag it
            return {"status": "warning", "message": "LLM response did not contain a Python code block. Returning raw response as generated_code.", "generated_code": response_text}

    except Exception as e:
        import traceback
        return {"status": "error", "message": f"Error during LLM call for code generation: {str(e)}", "traceback": traceback.format_exc()}

@mcp.tool()
async def edit_python_code(
    original_code: Annotated[str, Field(description="The original Python code to be edited.")],
    edit_request: Annotated[str, Field(description="A natural language description of the changes to make to the Python code.")],
    model: Annotated[MODELS_LITERAL, Field(description="The LLM model to use for code editing.")] = "gemini-2.5-pro-preview-05-06",
    available_tool_names_for_code_gen: Annotated[Optional[List[str]], Field(description="Optional list of MCP tool names that the generated Python code can call using `_call_mcp_tool`.", default=None)] = None,
    additional_context: Annotated[Optional[str], Field(description="Optional textual context to guide the code editing. This string should contain all necessary and relevant details from previous steps (e.g., search results, API documentation, or user clarifications) to perform the optimal edit. The LLM should synthesize this string to be as detailed as required.", default=None)] = None
) -> dict:
    """
    Edits existing Python code by regenerating the entire code block with arbitrary changes based on the original and a user's natural language request.
    The LLM will generate the complete, new Python code, which can call other MCP tools.
    The user is responsible for reviewing and understanding the edited code before execution, as it will run with their full permissions via the 'execute_python_code' tool.
    Returns the complete, modified Python code as a string, along with the original code for comparison.
    
    IMPORTANT: If the 'original_code' to be edited was generated or made available by a previous 
    tool call in this conversation, you SHOULD use the placeholder syntax 
    '@@ref_<TOOL_CALL_ID>__<PATH_TO_VALUE>' to pass that existing code to the 'original_code' argument.
    FAILURE TO USE THIS SYNTAX FOR REFERENCING PREVIOUSLY GENERATED OR ACCESSED CODE MAY LEAD TO ERRORS OR UNEXPECTED BEHAVIOR. ALWAYS PREFER @@ref WHEN POSSIBLE.
    
    The 'original_code' and 'edit_request' arguments can be strings directly provided by
    the LLM or can be populated by referencing a previous tool's output using the
    '@@ref_<TOOL_CALL_ID>__<PATH_TO_VALUE>' syntax.
    Output schema: {"status": "success/error/warning", "original_code": "...", "edited_code": "...", "message": "..."}

    The `edited_code` is directly visible to the user in the interface.
    In your textual response after this tool runs, simply confirm that the code has been edited 
    and perhaps ask if the user wants to execute or modify it further. Do not repeat the edited code in your message.
    """
    if not edit_request:
        return {"status": "error", "message": "Edit request cannot be empty."}
    if not original_code:
        return {"status": "error", "message": "Original code cannot be empty for regeneration."}

    adapter = get_llm_adapter(model_name=model)
    
    # Construct prompt for the LLM, asking for full regeneration
    prompt_to_llm = f"""Original Python Code:
```python
{original_code}
```

User's request for changes:
"{edit_request}"

Please rewrite the entire Python code block above, incorporating these changes, and provide the new, complete code block as per the system instructions.
"""

    if additional_context:
        prompt_to_llm += f"\n\nAdditional Context to consider while making these edits:\n{additional_context}"

    available_tools_section_str = ""
    if available_tool_names_for_code_gen:
        tools_list_str = ", ".join([f"'{name}'" for name in available_tool_names_for_code_gen])
        available_tools_section_str = f"- The following MCP tools are potentially available for you to call with `await _call_mcp_tool(tool_name, arguments)`: [{tools_list_str}]. You should only call tools that are logically necessary for the user's request. The schema for these tools is not provided here; assume standard arguments or make your best guess if unsure."
    else:
        available_tools_section_str = "- You may attempt to call other MCP tools using `await _call_mcp_tool(tool_name, arguments)`. The system will determine if the tool is available. Make reasonable assumptions about tool names and arguments if needed."
    
    final_system_prompt = EDIT_PYTHON_REGENERATE_SYSTEM_PROMPT_TEMPLATE.format(available_tools_section=available_tools_section_str)
    
    history = [StandardizedMessage(role="user", content=prompt_to_llm)]
    # Use the new system prompt for regeneration
    llm_config = StandardizedLLMConfig(system_prompt=final_system_prompt)

    try:
        llm_response = await adapter.generate_content(
            model_name=model,
            history=history,
            tools=None,
            config=llm_config,
            stream_callback=None 
        )

        if llm_response.error:
            return {"status": "error", "edited_code": original_code, "message": f"LLM API error during code regeneration: {llm_response.error}"}
        
        response_text = llm_response.text_content
        if not response_text:
            return {"status": "error", "edited_code": original_code, "message": "LLM returned no content for code regeneration."}

        # --- BEGIN: Debugging - Save raw LLM output ---
        try:
            debug_log_dir = Path(".debug_logs")
            debug_log_dir.mkdir(exist_ok=True)
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            random_hex = uuid.uuid4().hex[:8]
            debug_file_path = debug_log_dir / f"llm_regenerated_code_{timestamp}_{random_hex}.txt"
            with open(debug_file_path, "w", encoding="utf-8") as f_debug:
                f_debug.write("--- Original code provided to LLM for regeneration ---\n")
                f_debug.write(original_code + "\n")
                f_debug.write("--- End of original code ---\n\n")
                f_debug.write(f"--- Edit request: ---\n{edit_request}\n---\n\n")
                f_debug.write(f"--- Full LLM response (regenerated code attempt): ---\n")
                f_debug.write(response_text)
            logger.info(f"Saved raw LLM response for debugging regeneration to: {debug_file_path.resolve()}")
        except Exception as e_debug_save:
            logger.error(f"Failed to save debug LLM regeneration output: {e_debug_save}")
        # --- END: Debugging - Save raw LLM output ---

        # Extract Python code from markdown block (similar to create_python_code)
        code_match = re.search(r"```(?:temp\.py)?\s*([\s\S]*?)\s*```", response_text, re.DOTALL)
        if code_match:
            edited_code = code_match.group(1).strip()
            if edited_code == original_code.strip():
                 return {"status": "success", "original_code": original_code, "edited_code": edited_code, "message": "LLM regenerated the code, but it was identical to the original."}
            return {"status": "success", "original_code": original_code, "edited_code": edited_code, "message": "Code regenerated successfully."}
        else:
            # If no markdown block, return the raw response and flag it
            logger.warning(f"LLM response for regeneration did not contain a valid Python code block. Response: {response_text[:500]}...")
            return {"status": "warning", 
                    "original_code": original_code, # Still return original code
                    "edited_code": original_code, # Return original on failure to extract
                    "message": "LLM response did not contain a recognizable Python code block. Raw response from LLM provided in debug logs.", 
                    "raw_llm_response": response_text}

    except Exception as e:
        import traceback
        logger.error(f"Error during LLM call for code regeneration: {str(e)}")
        return {"status": "error", 
                "edited_code": original_code, 
                "message": f"Error during LLM call for code regeneration: {str(e)}", 
                "traceback": traceback.format_exc()}

# Note: The main function call mcp.run() and any test/example code should be outside this diff. 
# The diff should focus only on the edit_python_code function's internals.

if __name__ == "__main__":
    # A simple test for execute_python_code
    # async def main():
    #     test_code = """
# print("Hello from exec!")
# import sys
# print(f"Python version: {sys.version}")
# for i in range(3):
# print(f"Number: {i}")
# # x = 1 / 0 # Test error
# """
    #     # result = await execute_python_code(code=test_code)
    #     # print("Execution Result:", result)

    #     # test_request = "Create a python function that takes two numbers and returns their sum."
    #     # creation_result = await create_python_code(user_request=test_request)
    #     # print("\nCode Creation Result:", creation_result)
        
    #     # if creation_result["status"] == "success" and "generated_code" in creation_result:
    #     #     print("\nExecuting generated code:")
    #     #     exec_generated_result = await execute_python_code(code=creation_result["generated_code"] + "\nprint(add(5,3))")
    #     #     print("Execution of generated code:", exec_generated_result)
            
    # import asyncio
    # asyncio.run(main())
    
    mcp.run() 