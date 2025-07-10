#!/usr/bin/env python3

# Configure logging BEFORE any imports to ensure it takes precedence
import logging

# Set up basic logging configuration to prevent child processes from overriding
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=None  # Don't set a stream handler here, let individual loggers handle it
)

# Suppress specific noisy loggers
logging.getLogger("sse_starlette").setLevel(logging.WARNING)
logging.getLogger("sse_starlette.sse").setLevel(logging.WARNING)
logging.getLogger("mcp.server.streamable_http").setLevel(logging.WARNING)
logging.getLogger("mcp.server").setLevel(logging.WARNING)
logging.getLogger("mcp").setLevel(logging.WARNING)

# Now import everything else
import os
import sys
import json
import asyncio
import tempfile
import base64
import mimetypes
from typing import Dict, List, Any, Optional, Tuple, Set
import uvicorn
from fastapi import FastAPI, Request, HTTPException, Security, Depends, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, model_validator
from dotenv import load_dotenv
from contextlib import asynccontextmanager, AsyncExitStack
from collections import defaultdict
import subprocess
import traceback
import uuid

# Import FastMCP client classes instead of standard MCP
from fastmcp.client import Client, PythonStdioTransport
from mcp import types # Keep types import for compatibility

# Add StreamableHttpTransport import
from fastmcp.client import StreamableHttpTransport

# Import new history function from ai_models
from ai_models import function_calling_loop, clear_conversation_history_for_user

# Load environment variables - REMOVED .env file specific loading.
# The application will now rely on environment variables being set globally.
# For example, set MCP_INTERNAL_API_KEY in your shell or deployment environment.
logging.info("Relying on globally set environment variables. Ensure necessary variables (e.g., MCP_INTERNAL_API_KEY, API keys for services) are available.")

# --- Placeholder for Internal API Key (SHOULD BE IN ENV VARS) ---
INTERNAL_API_KEY = os.getenv("MCP_INTERNAL_API_KEY", "your_secret_internal_api_key_here")
INTERNAL_API_KEY_NAME = "X-Internal-API-Key"

from fastapi.security.api_key import APIKeyHeader
api_key_header = APIKeyHeader(name=INTERNAL_API_KEY_NAME, auto_error=True)

async def verify_internal_api_key(key: str = Security(api_key_header)):
    if key != INTERNAL_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing internal API Key")
    return key

# --- Utility Functions ---
def _mcp_config_key(config: dict) -> str:
    args = config.get("args", [])
    if args is None:
        args = []
    # Ensure consistent key for comparison, especially if env could be None vs {}
    env = config.get("env", {}) 
    if env is None:
        env = {}
    return json.dumps({"command": config.get("command"), "args": args, "env": env}, sort_keys=True)

def generate_tools_schemas_json(user_id: str) -> str:
    """
    Generate a JSON string containing available tools with their schemas for the given user.
    Format: [{"name": "tool_name", "description": "...", "input_schema": {...}}]
    The description includes detailed information about expected outputs from the tool's docstring.
    """
    global mcp_manager
    if not mcp_manager or not mcp_manager.initialized:
        return "[]"
    
    tools_list, _ = mcp_manager.get_tools_for_user_query(user_id)
    schemas_data = []
    
    for tool_obj in tools_list:
        schema_entry = {
            "name": tool_obj.name,
            "description": tool_obj.description,  # This should include output format info in the docstring
            "input_schema": tool_obj.inputSchema if tool_obj.inputSchema else {}
        }
        schemas_data.append(schema_entry)
    
    try:
        return json.dumps(schemas_data, indent=2)
    except Exception as e:
        print(f"Error serializing tools schemas: {e}")
        return "[]"

# Assume a sanitization function similar to test_server.py's sanitize_for_path
# For user IDs, we primarily care about removing '+' for key consistency.
def sanitize_user_id_for_key(user_id_str: str) -> str:
    if not user_id_str:
        return ""
    return user_id_str.replace('+', '')

async def handle_sampling_with_tools(
    messages: List,  # StandardizedMessage list
    system_prompt: str,
    model_name: str,
    stream_callback,
    sample_id: str
):
    """Handle sampling requests that need tool access by calling the query endpoint internally."""
    
    # Convert messages to a simple user query string
    user_query = ""
    for msg in messages:
        if hasattr(msg, 'role') and msg.role == "user" and hasattr(msg, 'content'):
            user_query = msg.content
            break
    
    if not user_query:
        return "Error: No user message found in sampling request"
    
    logging.info(f"[SAMPLING-{sample_id}] Converting to internal query: {user_query[:100]}...")
    
    try:
        # Determine if we should stream based on callback availability
        should_stream = stream_callback is not None
        
        # Create internal query request
        query_request = QueryRequest(
            query=user_query,
            sender="sampling_user",  # Special user ID for sampling context
            model=model_name,
            stream=should_stream,  # Enable streaming if callback is available
            system_prompt=system_prompt
        )
        
        if should_stream:
            # Handle streaming response
            logging.info(f"[SAMPLING-{sample_id}] Using streaming mode for tool-enabled sampling")
            
            # Call the query endpoint internally with streaming
            response = await handle_query(query_request)
            
            # For streaming, handle_query returns a StreamingResponse
            if hasattr(response, 'body_iterator'):
                accumulated_text = ""
                async for chunk in response.body_iterator:
                    try:
                        # Parse the chunk as JSON - handle both bytes and string chunks
                        if isinstance(chunk, bytes):
                            chunk_str = chunk.decode('utf-8').strip()
                        else:
                            chunk_str = str(chunk).strip()
                        
                        if chunk_str:
                            chunk_data = json.loads(chunk_str)
                            
                            # Forward different chunk types to the stream callback
                            if chunk_data.get("type") == "text_chunk":
                                content = chunk_data.get("content", "")
                                accumulated_text += content
                                # Forward to sampling stream callback
                                await stream_callback({
                                    "type": "text_chunk",
                                    "content": content
                                })
                            elif chunk_data.get("type") == "thought_summary":
                                # Forward thought chunks too
                                await stream_callback({
                                    "type": "thought_summary", 
                                    "content": chunk_data.get("content", "")
                                })
                            elif chunk_data.get("type") == "tool_call_pending":
                                # Could forward tool call info to stream if desired
                                pass
                            elif chunk_data.get("type") == "tool_result":
                                # Could forward tool results to stream if desired  
                                pass
                            elif chunk_data.get("type") == "stream_end":
                                break
                            elif chunk_data.get("type") == "error":
                                error_content = chunk_data.get("content", "Unknown error")
                                logging.error(f"[SAMPLING-{sample_id}] Streaming error: {error_content}")
                                return f"Error in tool-enabled sampling: {error_content}"
                    except json.JSONDecodeError:
                        # Skip malformed chunks
                        continue
                    except Exception as e:
                        logging.error(f"[SAMPLING-{sample_id}] Error processing stream chunk: {e}")
                        continue
                
                logging.info(f"[SAMPLING-{sample_id}] Tool-enabled streaming completed. Result length: {len(accumulated_text)} chars")
                return accumulated_text
            else:
                # Fallback if streaming response doesn't have expected format
                return str(response)
        else:
            # Non-streaming mode (original logic)
            response = await handle_query(query_request)
            
            if response.error:
                logging.error(f"[SAMPLING-{sample_id}] Error in tool-enabled sampling: {response.error}")
                return f"Error in tool-enabled sampling: {response.error}"
            
            logging.info(f"[SAMPLING-{sample_id}] Tool-enabled sampling completed successfully. Result length: {len(response.result)} chars")
            return response.result
        
    except Exception as e:
        logging.error(f"[SAMPLING-{sample_id}] Exception in tool-enabled sampling: {e}")
        logging.error(f"[SAMPLING-{sample_id}] Exception traceback:", exc_info=True)
        return f"Exception in tool-enabled sampling: {str(e)}"

# === MCPManager CLASS FOR ENCAPSULATION ===
class MCPManager:
    def __init__(self):
        self.exit_stack: Optional[AsyncExitStack] = None
        
        # Add port allocation tracking
        self.allocated_ports: Set[int] = set()
        self.base_port = 9000  # Starting port for MCP servers
        self.port_assignments: Dict[str, int] = {}  # config_key -> port mapping
        
        # User-scoped resources - now using FastMCP Client instead of ClientSession
        self.user_sessions: Dict[str, List[Client]] = defaultdict(list)
        self.user_tool_to_session: Dict[str, Dict[str, Client]] = defaultdict(dict)
        self.user_tools: Dict[str, List[types.Tool]] = defaultdict(list) # Store actual mcp.types.Tool objects
        self.user_session_to_tools: Dict[str, Dict[Client, List[str]]] = defaultdict(dict)
        self.user_config_to_session: Dict[str, Dict[str, Client]] = defaultdict(dict)
        
        # Global/Core server resources (could be managed under a special user_id like "_global")
        # For now, let's assume core servers are started and their tools are globally available
        # if a user's preferences select them. This might need refinement.
        self.core_sessions: List[Client] = []
        self.core_tool_to_session: Dict[str, Client] = {}
        self.core_tools: List[types.Tool] = [] # Store actual mcp.types.Tool objects
        self.core_session_to_tools: Dict[Client, List[str]] = {}
        self.core_config_to_session: Dict[str, Client] = {}

        self.temp_files_to_cleanup: List[str] = []
        self.user_server_preferences: Dict[str, List[str]] = {} # Key: user_id, Value: List of config_keys
        self.initialized: bool = False

        # --- Define default enabled core server config keys ---
        # These servers will always be active for users if running,
        # regardless of their explicit preferences.
        self.default_core_server_config_keys: Set[str] = set()

    def allocate_port(self) -> int:
        """Allocate a unique port for an MCP server."""
        port = self.base_port
        while port in self.allocated_ports:
            port += 1
        self.allocated_ports.add(port)
        return port

    async def initialize_exit_stack(self):
        if not self.exit_stack:
            self.exit_stack = AsyncExitStack()
            await self.exit_stack.__aenter__()

        # --- Populate default_core_server_config_keys after exit_stack is up ---
        # This ensures _mcp_config_key can be called if it relies on any global state
        # that might be set up during a broader initialization phase (though it's simple here).
        # Assuming CORE_SERVER_COMMANDS is accessible here or passed in.
        # For this example, we'll use the global CORE_SERVER_COMMANDS.
        # A more robust solution might pass CORE_SERVER_COMMANDS to the constructor or initialize.
        # global CORE_SERVER_COMMANDS # CORE_SERVER_COMMANDS is no longer used
        # for core_conf in CORE_SERVER_COMMANDS: # CORE_SERVER_COMMANDS is no longer used
        #     # Make all core servers default
        #     self.default_core_server_config_keys.add(_mcp_config_key(core_conf))
        # print(f"MCPManager: Default core server config keys set to: {self.default_core_server_config_keys}")
        pass # No default core server keys based on a static list anymore

    async def create_sampling_handler(self, client_custom_state: Dict[str, Any]): # Added parameter
        """Create a sampling handler that has access to the client's custom_state."""
        async def sampling_handler(messages, params, context_from_tool_call): # Renamed 'context' for clarity
            """Handle sampling requests from tools (ctx.sample() calls)
               'context_from_tool_call' is mcp.shared.context.RequestContext.
               'client_custom_state' is the _custom_state of the parent Client instance.
            """
            # Create a unique sample ID for tracking this specific ctx.sample call
            sample_id = str(uuid.uuid4())[:8]
            
            logging.info(f"[SAMPLING-{sample_id}] ===== CTX.SAMPLE CALL STARTED =====")
            logging.debug(f"[SAMPLING-{sample_id}] Message type: {type(messages)}")
            logging.debug(f"[SAMPLING-{sample_id}] Params type: {type(params)}")
            
            # Log message content preview (truncated for safety)
            if isinstance(messages, str):
                msg_preview = messages[:200] + "..." if len(messages) > 200 else messages
                logging.debug(f"[SAMPLING-{sample_id}] Message content preview: {msg_preview}")
            elif isinstance(messages, list):
                logging.debug(f"[SAMPLING-{sample_id}] Message list length: {len(messages)}")
            
            print(f"[SAMPLING_HANDLER DEBUG] Entered. Actual context type from tool: {type(context_from_tool_call)}")
            print(f"[SAMPLING_HANDLER DEBUG] messages type: {type(messages)}, messages: {messages}")
            print(f"[SAMPLING_HANDLER DEBUG] params type: {type(params)}, params: {params}")
            
            main_frontend_stream_handler = None
            parent_tool_call_id_for_sample_stream = None # New variable
            
            if client_custom_state: # Use the passed-in custom_state
                print(f"[SAMPLING_HANDLER DEBUG] client_custom_state received: {client_custom_state}")
                main_frontend_stream_handler = client_custom_state.get('_main_frontend_stream_handler')
                parent_tool_call_id_for_sample_stream = client_custom_state.get('_current_tool_call_id_for_sampling') # Retrieve the parent tool_call_id
                print(f"[SAMPLING_HANDLER DEBUG] main_frontend_stream_handler retrieved: {main_frontend_stream_handler}")
                print(f"[SAMPLING_HANDLER DEBUG] parent_tool_call_id_for_sample_stream retrieved: {parent_tool_call_id_for_sample_stream}")
                
                logging.debug(f"[SAMPLING-{sample_id}] Frontend stream handler available: {main_frontend_stream_handler is not None}")
                logging.debug(f"[SAMPLING-{sample_id}] Parent tool call ID: {parent_tool_call_id_for_sample_stream}")
            else:
                # This case should ideally not happen if create_sampling_handler is always called with a valid dict
                print(f"[SAMPLING_HANDLER DEBUG] client_custom_state is None or empty at the start of sampling_handler.")
                logging.warning(f"[SAMPLING-{sample_id}] No client custom state available")

            sample_llm_stream_callback = None
            accumulated_sample_text_for_tool = "" 

            if main_frontend_stream_handler and parent_tool_call_id_for_sample_stream: # Check for both now
                async def local_sample_llm_stream_callback(chunk: Dict[str, Any]):
                    nonlocal accumulated_sample_text_for_tool
                    # This callback is for the LLM generating the sample.
                    # It streams text and thoughts to the *main frontend stream*,
                    # now with parent_tool_call_id for frontend nesting.
                    if chunk.get("type") == "text_chunk" and "content" in chunk:
                        await main_frontend_stream_handler({
                            "type": "tool_sample_text_chunk", # New chunk type
                            "parent_tool_call_id": parent_tool_call_id_for_sample_stream,
                            "content": chunk["content"]
                        })
                        accumulated_sample_text_for_tool += chunk["content"]
                    elif chunk.get("type") == "thought_summary" and "content" in chunk:
                         await main_frontend_stream_handler({
                            "type": "tool_sample_thought_chunk", # New chunk type for thoughts
                            "parent_tool_call_id": parent_tool_call_id_for_sample_stream,
                            "content": chunk["content"]
                        })
                    # Do not propagate stream_end or error from here to main_frontend_stream_handler.
                    # The sampling_handler itself will return a final result or error to the tool.
                sample_llm_stream_callback = local_sample_llm_stream_callback
                print("[SAMPLING_HANDLER DEBUG] sample_llm_stream_callback has been SET (for tool-nested streaming).")
                logging.debug(f"[SAMPLING-{sample_id}] Streaming callback configured for frontend")
            else:
                print("[SAMPLING_HANDLER DEBUG] main_frontend_stream_handler OR parent_tool_call_id_for_sample_stream is None, so tool-nested sample_llm_stream_callback is NOT set.")
                logging.debug(f"[SAMPLING-{sample_id}] No streaming callback (non-streaming mode)")

            try:
                logging.debug(f"[SAMPLING-{sample_id}] Starting message processing...")
                
                # Import here to avoid circular imports
                from llm_adapters import get_llm_adapter, StandardizedMessage, StandardizedLLMConfig, AttachmentPart
                
                standardized_messages = []
                attachment_urls_from_messages = []
                
                # Process messages and extract smuggled attachments
                if isinstance(messages, str):
                    standardized_messages.append(StandardizedMessage(role="user", content=messages))
                elif isinstance(messages, list):
                    # NEW: Handle SamplingMessage objects from FastMCP
                    sampling_message_contents = []
                    for msg_item in messages:
                        if hasattr(msg_item, 'content') and hasattr(msg_item.content, 'text'):
                            # This is a SamplingMessage with TextContent
                            sampling_message_contents.append(msg_item.content.text)
                        elif hasattr(msg_item, 'role') and hasattr(msg_item, 'content'):
                            # Fallback for other message types
                            sampling_message_contents.append(str(msg_item.content))
                        elif isinstance(msg_item, str):
                            sampling_message_contents.append(msg_item)
                        else:
                            sampling_message_contents.append(str(msg_item))
                    
                    # Now check if we have a simplified format (first message is prompt, rest are URLs)
                    if len(sampling_message_contents) > 1:
                        # First message is the main prompt
                        standardized_messages.append(StandardizedMessage(role="user", content=sampling_message_contents[0]))
                        
                        # Check if remaining items are URLs
                        for content in sampling_message_contents[1:]:
                            if isinstance(content, str) and content.startswith(('http://', 'https://')):
                                attachment_urls_from_messages.append(content)
                                logging.debug(f"[SAMPLING-{sample_id}] Extracted URL from SamplingMessage: {content}")
                            else:
                                # If it's not a URL, add it as additional user content
                                standardized_messages.append(StandardizedMessage(role="user", content=content))
                    else:
                        # Single message, just add it
                        if sampling_message_contents:
                            standardized_messages.append(StandardizedMessage(role="user", content=sampling_message_contents[0]))
                else:
                    standardized_messages.append(StandardizedMessage(role="user", content=str(messages)))

                logging.debug(f"[SAMPLING-{sample_id}] Processed {len(standardized_messages)} messages")
                logging.debug(f"[SAMPLING-{sample_id}] Found {len(attachment_urls_from_messages)} attachment URLs from messages")

                # Process attachments from both sources (params and messages)
                attachment_parts = []
                all_attachment_urls = attachment_urls_from_messages[:]  # Start with URLs from messages
                
                # Also check params for backward compatibility
                if isinstance(params, dict):
                    params_attachments = params.get('attachments', [])
                    if params_attachments and isinstance(params_attachments, list):
                        all_attachment_urls.extend(params_attachments)
                
                # Download and process all attachment URLs
                if all_attachment_urls:
                    logging.debug(f"[SAMPLING-{sample_id}] Processing {len(all_attachment_urls)} attachments...")
                    import requests
                    import filetype
                    from PIL import Image
                    from io import BytesIO
                    
                    for attachment_url in all_attachment_urls:
                        if isinstance(attachment_url, str) and attachment_url.startswith(('http://', 'https://')):
                            try:
                                # Use asyncio.to_thread for non-blocking download like analyze_images
                                resp = await asyncio.to_thread(requests.get, attachment_url, timeout=10)
                                resp.raise_for_status()
                                
                                content_type = resp.headers.get('Content-Type', '')
                                
                                # Skip non-image attachments
                                if not content_type.startswith('image/'):
                                    logging.debug(f"[SAMPLING-{sample_id}] Skipping non-image attachment: {attachment_url} (type: {content_type})")
                                    continue
                                
                                # Process image through PIL like analyze_images does
                                image_bytes_io = BytesIO(resp.content)
                                image = await asyncio.to_thread(Image.open, image_bytes_io)
                                
                                # Re-save to ensure proper format
                                img_bytes_for_llm = BytesIO()
                                img_format = image.format if image.format and image.format.upper() in Image.SAVE.keys() else "PNG"
                                await asyncio.to_thread(image.save, img_bytes_for_llm, format=img_format)
                                img_bytes_for_llm.seek(0)
                                
                                # Use the processed image data
                                final_image_data = img_bytes_for_llm.getvalue()
                                
                                # Determine final mime type based on format
                                if img_format.upper() == "JPEG":
                                    final_mime_type = "image/jpeg"
                                elif img_format.upper() == "PNG":
                                    final_mime_type = "image/png"
                                elif img_format.upper() == "WEBP":
                                    final_mime_type = "image/webp"
                                else:
                                    final_mime_type = content_type  # Fallback to original
                                
                                attachment_parts.append(AttachmentPart(
                                    mime_type=final_mime_type, 
                                    data=final_image_data, 
                                    name=attachment_url
                                ))
                                logging.debug(f"[SAMPLING-{sample_id}] Added processed image attachment: {final_mime_type}, size: {len(final_image_data)} bytes")
                                
                            except Exception as e:
                                logging.warning(f"[SAMPLING-{sample_id}] Could not download/process attachment {attachment_url}: {e}")
                                print(f"Warning: Could not download/process attachment {attachment_url} for sampling: {e}")

                # Add attachments to the user message if any were processed
                if attachment_parts and standardized_messages:
                    standardized_messages[0].attachments = attachment_parts
                    logging.debug(f"[SAMPLING-{sample_id}] Added {len(attachment_parts)} attachments to first message")

                logging.debug(f"[SAMPLING-{sample_id}] Initializing LLM adapter...")
                llm_adapter = get_llm_adapter("gemini-2.5-flash-preview-05-20") # Use fast model for sampling
                
                system_prompt_for_sample = None
                model_preferences_for_sample = ["gemini-2.5-flash-preview-05-20"] # Default
                json_schema_for_sample = None

                logging.debug(f"[SAMPLING-{sample_id}] Processing parameters for model selection...")

                # Handle both dict params (legacy) and CreateMessageRequestParams object (FastMCP)
                if isinstance(params, dict):
                    # Legacy dict handling
                    system_prompt_for_sample = params.get('system_prompt') or params.get('systemPrompt')
                    model_preferences_raw = params.get('model_preferences', model_preferences_for_sample)
                    
                    logging.debug(f"[SAMPLING-{sample_id}] Dict params - System prompt length: {len(system_prompt_for_sample) if system_prompt_for_sample else 0}")
                    logging.debug(f"[SAMPLING-{sample_id}] Dict params - Model preferences: {model_preferences_raw}")
                    
                    # Check if model_preferences contains smuggled json_schema as second element
                    if isinstance(model_preferences_raw, (list, tuple)) and len(model_preferences_raw) == 2:
                        # First element should be actual model preferences, second should be json_schema (as JSON string)
                        if isinstance(model_preferences_raw[1], str):
                            try:
                                # Try to parse the second element as JSON schema
                                json_schema_for_sample = json.loads(model_preferences_raw[1])
                                model_preferences_for_sample = model_preferences_raw[0] if isinstance(model_preferences_raw[0], list) else [model_preferences_raw[0]]
                                logging.info(f"[SAMPLING-{sample_id}] Extracted JSON schema from model preferences")
                                print(f"[SAMPLING_HANDLER DEBUG] Extracted and parsed json_schema from model_preferences (dict): {json_schema_for_sample}")
                            except json.JSONDecodeError:
                                # If parsing fails, treat as regular model preferences
                                model_preferences_for_sample = model_preferences_raw
                                logging.warning(f"[SAMPLING-{sample_id}] Failed to parse JSON schema from model preferences")
                                print(f"[SAMPLING_HANDLER DEBUG] Failed to parse second element as JSON, treating as regular model preferences")
                        else:
                            model_preferences_for_sample = model_preferences_raw
                    else:
                        model_preferences_for_sample = model_preferences_raw
                else:
                    # FastMCP CreateMessageRequestParams object handling
                    if hasattr(params, 'systemPrompt') and params.systemPrompt:
                        system_prompt_for_sample = params.systemPrompt
                    elif hasattr(params, 'system_prompt'): # Alternative attribute name
                        system_prompt_for_sample = params.system_prompt
                    
                    logging.debug(f"[SAMPLING-{sample_id}] FastMCP params - System prompt length: {len(system_prompt_for_sample) if system_prompt_for_sample else 0}")
                    
                    if hasattr(params, 'modelPreferences') and params.modelPreferences and hasattr(params.modelPreferences, 'hints'):
                        hints = params.modelPreferences.hints
                        if hints and len(hints) >= 1:
                            # First hint should be the model name
                            model_preferences_for_sample = [hints[0].name]
                            
                            logging.debug(f"[SAMPLING-{sample_id}] FastMCP params - Model preferences: {model_preferences_for_sample}")
                            
                            # Check if there's a second hint containing the JSON schema
                            if len(hints) >= 2:
                                second_hint_name = hints[1].name
                                try:
                                    # Try to parse the second hint as JSON schema
                                    json_schema_for_sample = json.loads(second_hint_name)
                                    logging.info(f"[SAMPLING-{sample_id}] Extracted JSON schema from FastMCP hints")
                                    print(f"[SAMPLING_HANDLER DEBUG] Extracted and parsed json_schema from modelPreferences.hints: {json_schema_for_sample}")
                                except json.JSONDecodeError:
                                    # If parsing fails, treat as regular model preference
                                    model_preferences_for_sample.append(second_hint_name)
                                    logging.warning(f"[SAMPLING-{sample_id}] Failed to parse JSON schema from FastMCP hints")
                                    print(f"[SAMPLING_HANDLER DEBUG] Failed to parse second hint as JSON, treating as regular model preference")

                # Robust model selection with validation and fallback
                supported_models = [
                    "gemini-2.5-flash-preview-05-20",
                    "gemini-2.5-pro-preview-05-06", 
                    "gemini-2.5-flash-lite-preview-06-17",
                    "models/gemini-2.0-flash",
                    "gemini-2.0-flash",
                    "claude-3-7-sonnet-latest",
                    "gpt-4.1-2025-04-14",
                    "o4-mini-2025-04-16"
                ]
                
                target_model_for_sample = "gemini-2.5-flash-preview-05-20"  # Default fallback
                
                # Validate and select model from preferences
                if model_preferences_for_sample:
                    # Handle both single model and list of models
                    if isinstance(model_preferences_for_sample, str):
                        candidate_models = [model_preferences_for_sample]
                    elif isinstance(model_preferences_for_sample, list):
                        candidate_models = model_preferences_for_sample
                    else:
                        candidate_models = [str(model_preferences_for_sample)]
                    
                    # Try each candidate model in order of preference
                    for candidate in candidate_models:
                        if isinstance(candidate, str):
                            # Normalize model name variations
                            normalized_candidate = candidate.strip()
                            
                            # Handle common model name variations
                            if normalized_candidate.startswith("gemini-2.0-flash") and "models/" not in normalized_candidate:
                                normalized_candidate = f"models/{normalized_candidate}"
                            
                            if normalized_candidate in supported_models:
                                target_model_for_sample = normalized_candidate
                                logging.info(f"[SAMPLING-{sample_id}] Selected model: {target_model_for_sample}")
                                break
                            else:
                                logging.warning(f"[SAMPLING-{sample_id}] Unsupported model candidate: {candidate}")
                    else:
                        # No valid model found in preferences, log warning but continue with default
                        logging.warning(f"[SAMPLING-{sample_id}] No supported models found in preferences: {model_preferences_for_sample}. Using default: {target_model_for_sample}")
                        print(f"[SAMPLING_HANDLER DEBUG] No supported models in preferences, using default: {target_model_for_sample}")
                else:
                    logging.info(f"[SAMPLING-{sample_id}] No model preferences provided, using default: {target_model_for_sample}")

                # Validate the final selected model
                if target_model_for_sample not in supported_models:
                    logging.error(f"[SAMPLING-{sample_id}] Final selected model {target_model_for_sample} is not supported. This should not happen.")
                    target_model_for_sample = "gemini-2.5-flash-preview-05-20"  # Ultimate fallback
                
                # Create standardized config
                config_for_sample = StandardizedLLMConfig(
                    system_prompt=system_prompt_for_sample if system_prompt_for_sample else None,
                    include_thoughts=True if sample_llm_stream_callback else False, # Enable thoughts if streaming to frontend
                    json_schema=json_schema_for_sample  # Add json_schema support
                )
                
                # Check if tools should be enabled for this sampling request
                enable_tools = False
                if isinstance(params, dict):
                    enable_tools = params.get('enable_tools', False)
                elif hasattr(params, 'modelPreferences') and params.modelPreferences and hasattr(params.modelPreferences, 'hints'):
                    hints = params.modelPreferences.hints
                    if hints and len(hints) >= 2:
                        # Check if second hint contains enable_tools flag
                        try:
                            second_hint = json.loads(hints[1].name)
                            enable_tools = second_hint.get('enable_tools', False)
                        except (json.JSONDecodeError, AttributeError):
                            pass

                logging.info(f"[SAMPLING-{sample_id}] Tools enabled: {enable_tools}")
                
                if enable_tools:
                    logging.info(f"[SAMPLING-{sample_id}] Using tool-enabled sampling via internal query")
                    # Use the full tool calling loop via internal /query call
                    return await handle_sampling_with_tools(
                        standardized_messages, 
                        system_prompt_for_sample,
                        target_model_for_sample,
                        sample_llm_stream_callback,
                        sample_id
                    )

                logging.info(f"[SAMPLING-{sample_id}] Calling LLM adapter with model: {target_model_for_sample}")
                logging.debug(f"[SAMPLING-{sample_id}] JSON schema provided: {json_schema_for_sample is not None}")
                logging.debug(f"[SAMPLING-{sample_id}] Streaming enabled: {sample_llm_stream_callback is not None}")

                # Get appropriate LLM adapter for the selected model
                try:
                    llm_adapter = get_llm_adapter(target_model_for_sample)
                except Exception as adapter_error:
                    logging.error(f"[SAMPLING-{sample_id}] Failed to get adapter for model {target_model_for_sample}: {adapter_error}")
                    # Try fallback to default model
                    target_model_for_sample = "gemini-2.5-flash-preview-05-20"
                    logging.info(f"[SAMPLING-{sample_id}] Falling back to default model: {target_model_for_sample}")
                    try:
                        llm_adapter = get_llm_adapter(target_model_for_sample)
                    except Exception as fallback_error:
                        logging.error(f"[SAMPLING-{sample_id}] Failed to get adapter even for fallback model: {fallback_error}")
                        return f"Error: Could not initialize LLM adapter for any supported model. Last error: {fallback_error}"

                llm_response_obj = await llm_adapter.generate_content(
                    model_name=target_model_for_sample,
                    history=standardized_messages,
                    tools=None,  # No tools for simple sampling requests
                    config=config_for_sample,
                    stream_callback=sample_llm_stream_callback
                )
                
                logging.debug(f"[SAMPLING-{sample_id}] LLM call completed")
                
                if llm_response_obj.error:
                    # The tool that called ctx.sample() will get this error in its response.
                    # The frontend might have already seen an error via stream if it was critical.
                    logging.error(f"[SAMPLING-{sample_id}] LLM returned error: {llm_response_obj.error}")
                    return f"Error generating response during sampling: {llm_response_obj.error}" 
                
                # If streaming was active, accumulated_sample_text_for_tool should be populated.
                # If not, llm_response_obj.text_content will have the full text.
                final_text_for_tool = accumulated_sample_text_for_tool if sample_llm_stream_callback and accumulated_sample_text_for_tool else llm_response_obj.text_content
                
                result_length = len(final_text_for_tool) if final_text_for_tool else 0
                logging.info(f"[SAMPLING-{sample_id}] Sample completed successfully. Result length: {result_length} characters")
                logging.debug(f"[SAMPLING-{sample_id}] ===== CTX.SAMPLE CALL FINISHED =====")
                
                return final_text_for_tool or "No text content generated by sample."
                
            except Exception as e:
                logging.error(f"[SAMPLING-{sample_id}] Exception in sampling handler: {e}")
                logging.error(f"[SAMPLING-{sample_id}] Exception traceback:", exc_info=True)
                print(f"Error in sampling handler: {e}")
                traceback.print_exc()
                # This error is returned to the tool that called ctx.sample().
                # The frontend won't see this directly unless we explicitly stream an error here.
                return f"Error processing sampling request: {str(e)}"
        
        return sampling_handler

    async def _log_subprocess_output(self, stream, prefix: str, log_level: int):
        """Continuously read from subprocess stream and log to main service logger."""
        try:
            while True:
                line = await stream.readline()
                if not line:
                    break
                
                decoded_line = line.decode().rstrip()
                if decoded_line:  # Only log non-empty lines
                    # Log to the main service logger
                    logging.log(log_level, f"{prefix} {decoded_line}")
                    
        except Exception as e:
            logging.error(f"Error reading subprocess output for {prefix}: {e}")

    async def start_single_server(self, server_config: Dict[str, Any], user_id: Optional[str] = None) -> bool:
        """
        Starts a single server using FastMCP client. If user_id is provided, it's a user-specific server.
        If user_id is None, it's treated as a core/global server.
        """
        if self.exit_stack is None:
            raise RuntimeError("MCPManager.exit_stack not initialized.")

        config_key = _mcp_config_key(server_config)
        
        # Determine which set of dictionaries to use
        is_core_server = user_id is None
        sessions_dict = self.core_sessions if is_core_server else self.user_sessions[user_id]
        tool_to_session_map = self.core_tool_to_session if is_core_server else self.user_tool_to_session[user_id]
        tools_list = self.core_tools if is_core_server else self.user_tools[user_id]
        session_to_tools_map = self.core_session_to_tools if is_core_server else self.user_session_to_tools[user_id]
        config_to_session_map = self.core_config_to_session if is_core_server else self.user_config_to_session[user_id]

        if config_key in config_to_session_map:
            print(f"MCPManager: Server (user: {user_id or 'core'}) with config {config_key} is already running or known. Skipping start.")
            return True

        command = server_config["command"]
        args = server_config.get("args", [])
        env = dict(os.environ)
        if "env" in server_config and isinstance(server_config["env"], dict):
            env.update(server_config["env"])
        
        # Allocate a port for this server
        if config_key not in self.port_assignments:
            port = self.allocate_port()
            self.port_assignments[config_key] = port
        else:
            port = self.port_assignments[config_key]
        
        # Pass the port and transport type to the server via environment variables
        env["FASTMCP_TRANSPORT"] = "streamable-http"
        env["FASTMCP_PORT"] = str(port)
        env["FASTMCP_HOST"] = "127.0.0.1"
        
        # IMPORTANT: Force unbuffered output so print statements appear immediately in journal
        env["PYTHONUNBUFFERED"] = "1"
        
        try:
            prefix = f"(User: {user_id})" if user_id else "(Core)"
            print(f"MCPManager: {prefix} Attempting to start server on port {port}: {server_config}")
            
            # Start the server process with captured output using asyncio
            # Add -u flag for unbuffered output as additional safety measure
            server_process = await asyncio.create_subprocess_exec(
                command, "-u", *args,  # Added -u flag for unbuffered Python output
                env=env,
                # Let subprocess output go directly to parent stdout/stderr for immediate journal visibility
                stdout=None,  # Inherit parent stdout  
                stderr=None   # Inherit parent stderr
            )
            
            # Store the process reference for cleanup
            if not hasattr(self, 'server_processes'):
                self.server_processes: Dict[str, asyncio.subprocess.Process] = {}
            self.server_processes[config_key] = server_process
            
            # NOTE: Subprocess output now goes directly to parent stdout/stderr for immediate journal visibility
            # No need for background output capture tasks since stdout=None, stderr=None
            # Start background tasks to capture and log output
            # asyncio.create_task(self._log_subprocess_output(
            #     server_process.stdout, 
            #     f"[{config_key}]", 
            #     logging.INFO
            # ))
            # asyncio.create_task(self._log_subprocess_output(
            #     server_process.stderr, 
            #     f"[{config_key}]", 
            #     logging.WARNING
            # ))
            
            # Give the server time to start up
            await asyncio.sleep(3)
            
            # Check if the process is still running
            if server_process.returncode is not None:
                # stdout, stderr = await server_process.communicate()
                # raise RuntimeError(f"Server process exited immediately. stdout: {stdout.decode()}, stderr: {stderr.decode()}")
                raise RuntimeError(f"Server process exited immediately with return code {server_process.returncode}. Check journal for output.")
            
            # Create FastMCP client with HTTP transport
            http_transport = StreamableHttpTransport(f"http://127.0.0.1:{port}/mcp/v1")
            
            # Create a dictionary for the client's custom state.
            # This dictionary will be shared by reference with the sampling handler.
            custom_state_for_client = {}

            # Create the sampling handler, passing the custom_state dictionary.
            # The handler will close over this specific dictionary instance.
            sampling_handler_func = await self.create_sampling_handler(custom_state_for_client)
            
            # Now, create the FastMCP client instance, passing the transport and the created sampling handler.
            client = Client(
                transport=http_transport,
                sampling_handler=sampling_handler_func
            )
            # Assign the custom_state dictionary to the client instance so ai_models.py can access it.
            client._custom_state = custom_state_for_client
            
            # Register with exit stack for proper cleanup
            await self.exit_stack.enter_async_context(client)
            
            # Get available tools from the server
            tools = await client.list_tools()
            
            tool_names_for_this_session = []
            for tool_obj in tools: # tool_obj should be mcp.types.Tool
                # For user-specific tools, names only need to be unique within that user's scope.
                # For core tools, names should ideally be globally unique or carefully managed.
                if tool_obj.name in tool_to_session_map:
                    print(f"Warning: {prefix} Tool '{tool_obj.name}' from server {server_config} conflicts with an existing tool for this scope. It will be overridden.")
                
                tool_to_session_map[tool_obj.name] = client
                
                # Remove any existing tool with the same name from this scope's list
                # This is a simple override. More sophisticated merging might be needed if tools from different
                # servers (within the same scope) could have the same name but different functionality.
                original_len = len(tools_list)
                tools_list[:] = [t for t in tools_list if t.name != tool_obj.name]
                if len(tools_list) < original_len:
                     print(f"MCPManager: {prefix} Overrode existing tool '{tool_obj.name}' in scope list.")
                tools_list.append(tool_obj)
                tool_names_for_this_session.append(tool_obj.name)
            
            sessions_dict.append(client)
            session_to_tools_map[client] = tool_names_for_this_session
            config_to_session_map[config_key] = client
            print(f"MCPManager: {prefix} Successfully started and registered tools for server: {server_config}")
            return True
        except Exception as e:
            print(f"MCPManager: {prefix} Error starting or registering server {server_config}: {str(e)}")
            print(f"MCPManager: {prefix} Traceback: {traceback.format_exc()}")
            return False

    async def startup_all_servers(self, core_server_configs: List[Dict[str, Any]], dynamic_user_server_configs: Dict[str, List[Dict[str, Any]]]):
        await self.initialize_exit_stack() # This now also populates default_core_server_config_keys

        startup_tasks = []
        
        print(f"MCPManager: Queueing {len(core_server_configs)} core server configurations for startup...")
        for core_conf in core_server_configs: # This will now be the discovered server configs
            startup_tasks.append(self.start_single_server(core_conf, user_id=None)) # user_id=None for all discovered servers for now

        # REMOVED: Logic for dynamic_user_server_configs as all servers are discovered
        # print(f"MCPManager: Queueing dynamic server configurations for {len(dynamic_user_server_configs)} users.")
        # for user_id, configs_for_user in dynamic_user_server_configs.items():
        #     print(f"MCPManager: Queueing {len(configs_for_user)} servers for user '{user_id}'.")
        #     for user_conf in configs_for_user:
        #         startup_tasks.append(self.start_single_server(user_conf, user_id=user_id))

        if startup_tasks:
            print(f"MCPManager: Attempting to start {len(startup_tasks)} MCP servers concurrently...")
            results = await asyncio.gather(*startup_tasks, return_exceptions=False)
            successful_starts = sum(1 for r in results if r is True)
            failed_starts = len(results) - successful_starts
            print(f"MCPManager: Concurrent server startup complete. Successfully started: {successful_starts}, Failed: {failed_starts}")
        else:
            print("MCPManager: No server configurations found to start.")
        
        self.initialized = True
        total_user_tools = sum(len(tl) for tl in self.user_tools.values()) # tl is now List[types.Tool]
        print(f"MCPManager: Service initialized with {len(self.core_tools)} core tools and {total_user_tools} user-specific tools from various sessions.")

    def get_tools_for_user_query(self, user_id: str) -> Tuple[List[types.Tool], Dict[str, Client]]:
        """
        Returns all available tools for the user: all core tools plus all dynamic servers started for that user.
        Preferences are no longer applied; users see all running core and their running dynamic servers.
        Now returns FastMCP Client objects instead of ClientSession objects.
        """
        user_effective_tools_list: List[types.Tool] = []
        user_effective_tool_to_session_map: Dict[str, Client] = {}

        # Active config keys: default core servers
        active_config_keys = set(self.core_config_to_session.keys())
        # Include all dynamic server configs started by the user
        if user_id in self.user_config_to_session:
            for config_key, session in self.user_config_to_session[user_id].items():
                if session in self.user_sessions.get(user_id, []):
                    active_config_keys.add(config_key)

        # Collect tools from user's dynamic servers
        if user_id in self.user_config_to_session:
            users_own_tools_raw = self.user_tools.get(user_id, [])
            users_own_tool_to_session_raw = self.user_tool_to_session.get(user_id, {})
            for config_key, session in self.user_config_to_session[user_id].items():
                if config_key in active_config_keys and session in self.user_sessions.get(user_id, []):
                    tool_names_for_session = self.user_session_to_tools.get(user_id, {}).get(session, [])
                    for tool_name in tool_names_for_session:
                        if tool_name not in user_effective_tool_to_session_map:
                            tool_object = next((t for t in users_own_tools_raw if t.name == tool_name and users_own_tool_to_session_raw.get(t.name) == session), None)
                            if tool_object:
                                user_effective_tools_list.append(tool_object)
                                user_effective_tool_to_session_map[tool_name] = session

        # Collect tools from core servers
        for config_key, session in self.core_config_to_session.items():
            if config_key in active_config_keys and session in self.core_sessions:
                tool_names_for_session = self.core_session_to_tools.get(session, [])
                for tool_name in tool_names_for_session:
                    if tool_name not in user_effective_tool_to_session_map:
                        tool_object = next((t for t in self.core_tools if t.name == tool_name and self.core_tool_to_session.get(t.name) == session), None)
                        if tool_object:
                            user_effective_tools_list.append(tool_object)
                            user_effective_tool_to_session_map[tool_name] = session
        print(f"MCPManager: User {user_id} will have access to {len(user_effective_tools_list)} tools: {[t.name for t in user_effective_tools_list]}")
        return user_effective_tools_list, user_effective_tool_to_session_map

    async def remove_tools_for_server_by_config(self, server_config_to_remove: dict, user_id: Optional[str]) -> bool:
        """Removes tools for a server and stops the server process. If user_id is None, targets a core server."""
        config_key = _mcp_config_key(server_config_to_remove)
        
        is_core_server = user_id is None
        sessions_list = self.core_sessions if is_core_server else self.user_sessions.get(user_id, [])
        config_to_session_map = self.core_config_to_session if is_core_server else self.user_config_to_session.get(user_id, {})
        session_to_tools_map = self.core_session_to_tools if is_core_server else self.user_session_to_tools.get(user_id, {})
        tools_list_ref = self.core_tools if is_core_server else self.user_tools.get(user_id) # This is a list or None
        tool_to_session_map_ref = self.core_tool_to_session if is_core_server else self.user_tool_to_session.get(user_id) # This is a dict or None

        session_to_remove = config_to_session_map.get(config_key)

        if not session_to_remove:
            print(f"MCPManager: [Internal Remove] No active session found for config (user: {user_id or 'core'}): {config_key}. Tools might already be inactive.")
            return False

        tool_names_to_remove = session_to_tools_map.get(session_to_remove, [])
        
        # Remove tools from lists and mappings
        if tools_list_ref is not None:
            tools_list_ref[:] = [tool for tool in tools_list_ref if tool.name not in tool_names_to_remove]
        
        if tool_to_session_map_ref is not None:
            for name in tool_names_to_remove:
                if tool_to_session_map_ref.get(name) == session_to_remove:
                    tool_to_session_map_ref.pop(name, None)
        
        session_to_tools_map.pop(session_to_remove, None)
        config_to_session_map.pop(config_key, None)
        
        if session_to_remove in sessions_list:
            sessions_list.remove(session_to_remove)
        
        # NEW: Stop the actual server process if it exists
        process_stopped = False
        if hasattr(self, 'server_processes') and config_key in self.server_processes:
            process = self.server_processes[config_key]
            if process.returncode is None:  # Process is still running
                print(f"MCPManager: [Internal Remove] Terminating server process for {config_key}")
                process.terminate()
                try:
                    await asyncio.wait_for(process.wait(), timeout=5.0)
                    process_stopped = True
                except asyncio.TimeoutError:
                    print(f"MCPManager: [Internal Remove] Force killing server process for {config_key}")
                    process.kill()
                    await process.wait()
                    process_stopped = True
                except Exception as e:
                    print(f"MCPManager: [Internal Remove] Error during process termination: {e}")
                    process.kill()
                    process_stopped = True
            # Remove from process tracking
            del self.server_processes[config_key]
        
        # NEW: Release the port assignment
        if hasattr(self, 'port_assignments') and config_key in self.port_assignments:
            old_port = self.port_assignments[config_key]
            self.allocated_ports.discard(old_port)
            del self.port_assignments[config_key]
            print(f"MCPManager: [Internal Remove] Released port {old_port} for server {config_key}")
        
        print(f"MCPManager: [Internal Remove] De-registered tools {tool_names_to_remove} for server (user: {user_id or 'core'}) {config_key}.")
        if process_stopped:
            print(f"MCPManager: [Internal Remove] Server process stopped for {config_key}.")
        
        return True

    def get_all_known_server_configs_for_user(self, user_id: str, core_server_configs: List[Dict[str,Any]]) -> List[Dict[str, Any]]:
        """Gets all server configurations a specific user might interact with (their own + core)."""
        known_configs: Dict[str, Dict[str, Any]] = {} # Use dict to ensure uniqueness by config_key

        # Add core servers
        for core_conf in core_server_configs:
            key = _mcp_config_key(core_conf)
            if key not in known_configs:
                known_configs[key] = core_conf
        
        # Add user's own dynamic servers
        # all_user_dynamic_configs = load_dynamic_servers_per_user() # REMOVED
        # user_specific_dynamic_configs = all_user_dynamic_configs.get(user_id, []) # REMOVED
        # Instead, we consider all discovered servers as potentially available.
        # If we need to distinguish servers "owned" or specifically configured by a user in the future,
        # that would require a different mechanism than the old dynamic_servers.json.
        # For now, get_all_known_server_configs_for_user will get all discovered servers.

        # Filter discovered servers based on some criteria if needed (e.g. user permissions for specific server files)
        # For now, all discovered servers are considered "known" to any user for listing purposes.
        discovered_configs = [] # This needs to be populated by scanning the directory, similar to lifespan
        servers_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mcp_client", "mcp_servers")
        if os.path.exists(servers_dir) and os.path.isdir(servers_dir):
            for filename in os.listdir(servers_dir):
                if filename.endswith(".py") and filename != "__init__.py":
                    script_path = os.path.join("mcp_client", "mcp_servers", filename)
                    config = {"command": "python", "args": [script_path], "env": {}}
                    key = _mcp_config_key(config)
                    if key not in known_configs: # Ensure uniqueness
                        known_configs[key] = config
        
        return list(known_configs.values())
    
    def get_all_globally_known_server_configs(self, core_server_configs: List[Dict[str,Any]]) -> List[Dict[str, Any]]:
        """Gets all server configurations known to the system across all users and core."""
        all_configs: Dict[str, Dict[str, Any]] = {}

        # core_server_configs is now expected to be empty as we discover all servers
        # for core_conf in core_server_configs:
        #     key = _mcp_config_key(core_conf)
        #     if key not in all_configs:
        #         all_configs[key] = core_conf
        
        # Scan the directory for all .py files
        servers_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mcp_client", "mcp_servers")
        if os.path.exists(servers_dir) and os.path.isdir(servers_dir):
            for filename in os.listdir(servers_dir):
                if filename.endswith(".py") and filename != "__init__.py":
                    script_path = os.path.join("mcp_client", "mcp_servers", filename)
                    config = {"command": "python", "args": [script_path], "env": {}}
                    key = _mcp_config_key(config)
                    if key not in all_configs:
                         # Add owner info - for discovered files, there isn't an explicit owner unless we add another mechanism
                        all_configs[key] = {**config, "_owner_user_id": None} # Mark as None for discovered
        return list(all_configs.values())


    async def shutdown(self):
        print("MCPManager: Shutting down...")
        
        # Terminate all server processes
        if hasattr(self, 'server_processes'):
            for config_key, process in self.server_processes.items():
                if process.returncode is None:  # Process is still running
                    print(f"MCPManager: Terminating server process for {config_key}")
                    process.terminate()
                    try:
                        await asyncio.wait_for(process.wait(), timeout=5.0)  # Wait up to 5 seconds for graceful shutdown
                    except asyncio.TimeoutError:
                        print(f"MCPManager: Force killing server process for {config_key}")
                        process.kill()
                        await process.wait()
        
        if self.exit_stack:
            await self.exit_stack.aclose() 
            self.exit_stack = None 
        
        for temp_file in self.temp_files_to_cleanup:
            try:
                if os.path.exists(temp_file):
                    os.unlink(temp_file)
            except Exception as e:
                print(f"MCPManager: Error cleaning up temporary file {temp_file}: {str(e)}")
        self.temp_files_to_cleanup = [] 

        self.initialized = False
        print("MCPManager: Shutdown complete.")

    async def discover_and_start_new_servers(self) -> dict:
        """
        Scans for new .py server files and starts any that aren't already running.
        Returns a summary of what was discovered and started.
        """
        if not self.initialized:
            return {"status": "error", "message": "MCPManager not initialized"}
        
        servers_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mcp_client", "mcp_servers")
        if not os.path.exists(servers_dir):
            return {"status": "error", "message": f"Servers directory not found: {servers_dir}"}
        
        try:
            # Get currently running server config keys
            running_config_keys = set(self.core_config_to_session.keys())
            
            # Scan for all .py files
            discovered_configs = []
            for filename in os.listdir(servers_dir):
                if filename.endswith(".py") and filename != "__init__.py":
                    script_path = os.path.join("mcp_client", "mcp_servers", filename)
                    
                    # Prepare environment variables for the server
                    server_env = {}
                    if INTERNAL_API_KEY:
                        server_env["MCP_INTERNAL_API_KEY"] = INTERNAL_API_KEY
                    
                    # Ensure unbuffered output for immediate print statement visibility
                    server_env["PYTHONUNBUFFERED"] = "1"
                    # Suppress debug logging in child processes
                    server_env["PYTHONWARNINGS"] = "ignore"
                    server_env["MCP_LOG_LEVEL"] = "WARNING"
                    
                    config = {
                        "command": "python",
                        "args": [script_path],
                        "env": server_env
                    }
                    
                    config_key = _mcp_config_key(config)
                    
                    # Only add if not already running
                    if config_key not in running_config_keys:
                        discovered_configs.append(config)
            
            if not discovered_configs:
                return {
                    "status": "success", 
                    "message": "No new servers discovered",
                    "new_servers_count": 0,
                    "new_servers": []
                }
            
            # Start new servers
            startup_tasks = []
            for config in discovered_configs:
                startup_tasks.append(self.start_single_server(config, user_id=None))
            
            print(f"MCPManager: Starting {len(startup_tasks)} newly discovered servers...")
            results = await asyncio.gather(*startup_tasks, return_exceptions=False)
            
            successful_starts = sum(1 for r in results if r is True)
            failed_starts = len(results) - successful_starts
            
            new_server_info = []
            for i, config in enumerate(discovered_configs):
                new_server_info.append({
                    "script_path": config["args"][0],
                    "started_successfully": results[i] if i < len(results) else False
                })
            
            print(f"MCPManager: Dynamic discovery complete. Successfully started: {successful_starts}, Failed: {failed_starts}")
            
            return {
                "status": "success",
                "message": f"Discovered and attempted to start {len(discovered_configs)} new servers. {successful_starts} successful, {failed_starts} failed.",
                "new_servers_count": len(discovered_configs),
                "successful_starts": successful_starts,
                "failed_starts": failed_starts,
                "new_servers": new_server_info
            }
            
        except Exception as e:
            print(f"MCPManager: Error during dynamic server discovery: {str(e)}")
            
            print(f"MCPManager: Traceback: {traceback.format_exc()}")
            return {"status": "error", "message": f"Error during server discovery: {str(e)}"}

    async def reload_server(self, server_script_path: str) -> dict:
        """
        Stops and restarts a specific server by its script path.
        Useful for when a server file has been modified.
        Uses free port strategy to avoid conflicts.
        """
        if not self.initialized:
            return {"status": "error", "message": "MCPManager not initialized"}
        
        # Create config for the server to find it
        server_env = {}
        if INTERNAL_API_KEY:
            server_env["MCP_INTERNAL_API_KEY"] = INTERNAL_API_KEY
        
        # Ensure unbuffered output for immediate print statement visibility
        server_env["PYTHONUNBUFFERED"] = "1"
        # Suppress debug logging in child processes
        server_env["PYTHONWARNINGS"] = "ignore"
        server_env["MCP_LOG_LEVEL"] = "WARNING"
        
        # server_script_path can be absolute (e.g., from create_mcp_server) or relative
        config = {
            "command": "python",
            "args": [server_script_path], # python command can handle absolute or relative paths
            "env": server_env
        }
        config_key = _mcp_config_key(config)
        
        # Optional: Validate Python syntax before restarting
        try:
            # Determine the full path for compilation check
            # If server_script_path is absolute, use it directly.
            # If relative, resolve it against the current working directory of mcp_service.py
            # which should be the project root (/var/www/flask_app).
            path_for_compile_check = os.path.abspath(server_script_path)

            if os.path.exists(path_for_compile_check):
                with open(path_for_compile_check, 'r', encoding='utf-8') as f:
                    content = f.read()
                compile(content, path_for_compile_check, 'exec')
                print(f"MCPManager: Syntax validation passed for {path_for_compile_check}")
            else:
                # This could happen if a relative path was intended for a different CWD
                # or if an absolute path is simply wrong.
                return {"status": "error", "message": f"Server file for syntax check not found: {path_for_compile_check} (original path: {server_script_path})"}
        except SyntaxError as se:
            return {"status": "error", "message": f"Syntax error in {server_script_path}: {str(se)}"}
        except Exception as e:
            print(f"MCPManager: Warning - Could not validate syntax for {server_script_path}: {str(e)}")
        
        # Step 1: Remove the existing server's tools from registry
        removed = await self.remove_tools_for_server_by_config(config, user_id=None)
        
        # Step 2: Kill the old process if it exists
        old_process_killed = False
        if hasattr(self, 'server_processes') and config_key in self.server_processes:
            process = self.server_processes[config_key]
            if process.returncode is None:  # Process is still running
                print(f"MCPManager: Killing old server process for {config_key}")
                process.terminate()
                try:
                    await asyncio.wait_for(process.wait(), timeout=5.0)  # Increased timeout to 5 seconds
                    old_process_killed = True
                except asyncio.TimeoutError:
                    print(f"MCPManager: Force killing server process for {config_key}")
                    process.kill()
                    await process.wait()
                    old_process_killed = True
            # Remove from process tracking
            del self.server_processes[config_key]
        
        # Step 3: Release the old port assignment to allow fresh port allocation
        old_port = None
        if config_key in self.port_assignments:
            old_port = self.port_assignments[config_key]
            # Remove port from allocated set so it can be reused
            self.allocated_ports.discard(old_port)
            # Remove the port assignment so start_single_server allocates a new one
            del self.port_assignments[config_key]
            print(f"MCPManager: Released port {old_port} for server {config_key}")
        
        # Step 4: Wait longer for the port to be fully released by the OS
        print(f"MCPManager: Waiting 3 seconds for port cleanup and system stabilization...")
        await asyncio.sleep(3)  # Increased from 1 to 3 seconds
        
        # Step 5: Start the server again (will get a fresh port)
        print(f"MCPManager: Starting new instance of {server_script_path}")
        started = await self.start_single_server(config, user_id=None)
        
        # Step 6: Get the new port for reporting
        new_port = self.port_assignments.get(config_key, "unknown")
        
        # Step 7: Verify the new server is actually working by checking tools
        tools_registered = 0
        if started and config_key in self.core_config_to_session:
            session = self.core_config_to_session[config_key]
            tools_registered = len(self.core_session_to_tools.get(session, []))
        
        status_msg = []
        if removed:
            status_msg.append("de-registered old tools")
        if old_process_killed:
            status_msg.append(f"killed old process (port {old_port})")
        if started:
            status_msg.append(f"started on new port {new_port}")
            if tools_registered > 0:
                status_msg.append(f"registered {tools_registered} tools")
        
        overall_status = "success" if started and tools_registered > 0 else "error"
        
        result = {
            "status": overall_status,
            "message": f"Server {server_script_path}: {', '.join(status_msg) if status_msg else 'failed to start'}",
            "was_running": removed,
            "started_successfully": started,
            "tools_registered": tools_registered,
            "old_port": old_port,
            "new_port": new_port if started else None
        }
        
        if not started:
            result["message"] += ". Check server logs for startup errors."
        elif tools_registered == 0:
            result["message"] += ". Server started but no tools were registered - check for tool definition errors."
        
        return result

# --- Global State ---
# REMOVED: CORE_SERVER_COMMANDS as servers are now discovered
# CORE_SERVER_COMMANDS: List[Dict[str, Any]] = [
#     {
#         "command": "python",
# ... (rest of the old list) ...
#     }
# ]

mcp_manager: Optional[MCPManager] = None
service_globally_initialized = False

# Set up logger for mcp_service
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Create console handler if not already present
if not logger.handlers:
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

# --- FastAPI Lifespan ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    global mcp_manager, service_globally_initialized # REMOVED: CORE_SERVER_COMMANDS

    print("FastAPI Lifespan: MCP service starting up...")
    mcp_manager = MCPManager()

    discovered_server_configs: List[Dict[str, Any]] = []
    
    # --- Discover "core" servers ---
    core_servers_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mcp_client", "mcp_servers")
    if os.path.exists(core_servers_dir) and os.path.isdir(core_servers_dir):
        for filename in os.listdir(core_servers_dir):
            if filename.endswith(".py") and filename != "__init__.py": # Ignore __init__.py
                script_path = os.path.join("mcp_client", "mcp_servers", filename) # Path relative to workspace root
                
                server_env = {}
                if INTERNAL_API_KEY:
                    server_env["MCP_INTERNAL_API_KEY"] = INTERNAL_API_KEY
                server_env["PYTHONUNBUFFERED"] = "1"
                # Suppress debug logging in child processes
                server_env["PYTHONWARNINGS"] = "ignore"
                server_env["MCP_LOG_LEVEL"] = "WARNING"
                
                discovered_server_configs.append({
                    "command": "python",
                    "args": [script_path], # Relative path is fine as mcp_service.py is at project root
                    "env": server_env
                })
        print(f"Discovered {len(discovered_server_configs)} potential 'core' server scripts in {core_servers_dir}.")
    else:
        print(f"Warning: Core servers directory {core_servers_dir} not found. No 'core' servers will be auto-discovered.")

    # --- Discover dynamic user-created servers ---
    user_data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "user_data")
    dynamic_server_count = 0
    if os.path.exists(user_data_dir) and os.path.isdir(user_data_dir):
        print(f"Scanning for dynamic user servers in: {user_data_dir}")
        for user_id_folder in os.listdir(user_data_dir):
            user_mcp_servers_path = os.path.join(user_data_dir, user_id_folder, "mcp_servers")
            if os.path.isdir(user_mcp_servers_path):
                for server_name_folder in os.listdir(user_mcp_servers_path):
                    current_py_path = os.path.join(user_mcp_servers_path, server_name_folder, "current.py")
                    if os.path.isfile(current_py_path):
                        # Use absolute path for user dynamic servers for clarity and robustness
                        abs_script_path = os.path.abspath(current_py_path)
                        
                        server_env = {}
                        if INTERNAL_API_KEY:
                            server_env["MCP_INTERNAL_API_KEY"] = INTERNAL_API_KEY
                        server_env["PYTHONUNBUFFERED"] = "1"
                        # Suppress debug logging in child processes
                        server_env["PYTHONWARNINGS"] = "ignore"
                        server_env["MCP_LOG_LEVEL"] = "WARNING"

                        # Check if this server config (based on absolute path) is already in discovered_server_configs
                        # This avoids re-adding if a user server somehow matches a core server path pattern
                        # (though unlikely with absolute paths for user servers).
                        already_discovered = False
                        for existing_conf in discovered_server_configs:
                            if existing_conf["args"] and os.path.abspath(existing_conf["args"][0]) == abs_script_path:
                                already_discovered = True
                                break
                        
                        if not already_discovered:
                            discovered_server_configs.append({
                                "command": "python",
                                "args": [abs_script_path], # Absolute path for user dynamic servers
                                "env": server_env
                            })
                            dynamic_server_count += 1
                            print(f"  Discovered dynamic user server: {abs_script_path}")
        print(f"Discovered {dynamic_server_count} potential dynamic user server scripts.")
    else:
        print(f"Warning: User data directory {user_data_dir} not found. No dynamic user servers will be auto-discovered.")
    
    try:
        # All discovered servers (core + dynamic) are treated uniformly for startup
        await mcp_manager.startup_all_servers(discovered_server_configs, {}) 
        service_globally_initialized = mcp_manager.initialized 
    except Exception as e:
        print(f"FastAPI Lifespan: Error during MCP service startup: {str(e)}")
        
        print(f"FastAPI Lifespan: Traceback: {traceback.format_exc()}")
        service_globally_initialized = False 
    
    yield 
    
    print("FastAPI Lifespan: MCP service shutting down...")
    if mcp_manager:
        # mcp_manager.save_user_preferences_to_file() 
        await mcp_manager.shutdown()
    service_globally_initialized = False
    print("FastAPI Lifespan: MCP service shutdown complete.")


app = FastAPI(title="MCP Service API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Models --- Pydantic v2 uses model_validator
from pydantic import model_validator

class DirectToolCallPayload(BaseModel):
    tool_name: str
    arguments: Dict[str, Any]

class QueryRequest(BaseModel):
    query: Optional[str] = None
    direct_tool_call: Optional[DirectToolCallPayload] = None
    sender: Optional[str] = None # Will be treated as user_id
    attachments: Optional[List[Dict[str, Any]]] = None
    attachment_urls: Optional[List[str]] = None  # NEW: Direct URLs to attachments
    model: Optional[str] = "gemini-2.5-flash-preview-05-20" # Default model
    stream: Optional[bool] = False
    final_response_json_schema: Optional[Dict[str, Any]] = Field(default=None, description="An optional JSON schema that the final response from the LLM should adhere to (for natural language queries).")
    system_prompt: Optional[str] = Field(default=None, description="Optional system prompt override. If not provided, uses default prompt for the context.")
    conversation_history: Optional[List[Dict[str, Any]]] = Field(default=None, description="Optional conversation history override. If provided, this history will be used instead of loading from file. Pass empty list [] to start with no history.")
    allowed_tools: Optional[List[str]] = Field(default=None, description="Optional whitelist of tool names that the LLM is allowed to call for this request.")
    conversation_id: Optional[str] = Field(default=None, description="Optional unique ID for the conversation session, used for history management.")

    @model_validator(mode='before')
    def check_query_or_direct_call(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        query, direct_tool_call = values.get('query'), values.get('direct_tool_call')
        if query is None and direct_tool_call is None:
            raise ValueError('Either query or direct_tool_call must be provided')
        if query is not None and direct_tool_call is not None:
            raise ValueError('Provide either query or direct_tool_call, not both')
        return values

class AddServerRequest(BaseModel):
    user_id: str # Explicit user_id for adding a server
    command: str
    args: Optional[List[str]] = None
    env: Optional[Dict[str, str]] = None

class RemoveServerRequest(BaseModel):
    user_id: Optional[str] = None # Optional: if None, targets a core server by config
    command: str
    args: Optional[List[str]] = None
    env: Optional[Dict[str, str]] = None

class QueryResponse(BaseModel):
    result: str
    error: Optional[str] = None

class StatusResponse(BaseModel):
    status: str
    core_tools_count: int = 0
    user_specific_tools_count: int = 0 # Approximate, sum over users
    error: Optional[str] = None

class ToolResponse(BaseModel):
    name: str
    description: str
    input_schema: Dict[str, Any]
    output_schema: Optional[Dict[str, Any]] = None

class ToolsListResponse(BaseModel): # For a specific user
    tools: List[ToolResponse]
    count: int

class ServerDetail(BaseModel):
    config_key: str
    command: str
    args: List[str]
    env: Optional[Dict[str,str]] = None # Added env
    description: Optional[str] = "N/A" # This would ideally come from server itself
    is_running: bool
    tools_provided: List[str] = []
    owner_user_id: Optional[str] = None # For global list, indicates owner if dynamic

class AvailableServersResponse(BaseModel): # For a specific user or global list
    servers: List[ServerDetail]

class UserSelectedServers(BaseModel):
    selected_config_keys: List[str]

class InternalToolCallRequest(BaseModel):
    tool_name: str
    arguments: Dict[str, Any]
    user_id_context: Optional[str] = None # User ID for context if the target tool is user-specific or needs user context


# --- FastAPI Endpoints ---

@app.get("/status", response_model=StatusResponse)
async def get_status():
    global mcp_manager, service_globally_initialized
    if not service_globally_initialized or not mcp_manager:
        return StatusResponse(status="Not Initialized", error="MCP service or manager has not been initialized")
    
    total_user_tools = sum(len(tools) for tools in mcp_manager.user_tools.values())
    return StatusResponse(
        status="Initialized" if mcp_manager.initialized else "Manager Not Ready",
        core_tools_count=len(mcp_manager.core_tools),
        user_specific_tools_count=total_user_tools
    )

@app.get("/users/{user_id_path}/tools", response_model=ToolsListResponse) # Changed to user-specific
async def get_tools_for_user(user_id_path: str):
    global mcp_manager, service_globally_initialized
    if not service_globally_initialized or not mcp_manager or not mcp_manager.initialized:
        raise HTTPException(status_code=503, detail="MCP service not initialized")
    
    user_id = sanitize_user_id_for_key(user_id_path) # SANITIZE HERE
    effective_tools, _ = mcp_manager.get_tools_for_user_query(user_id)
    tools_list_response = []
    for tool_obj in effective_tools: 
        # Extract output_schema from annotations if available
        output_schema = None
        if hasattr(tool_obj, 'annotations') and tool_obj.annotations:
            if hasattr(tool_obj.annotations, 'outputSchema'):
                output_schema = tool_obj.annotations.outputSchema
        
        tools_list_response.append(
            ToolResponse(
                name=tool_obj.name,
                description=tool_obj.description,
                input_schema=tool_obj.inputSchema,
                output_schema=output_schema
            )
        )
    return ToolsListResponse(tools=tools_list_response, count=len(tools_list_response))


@app.get("/tools/all", response_model=ToolsListResponse)
async def get_all_tools_with_schemas():
    """
    Returns all available tools from all servers with their complete schemas.
    This endpoint provides a comprehensive view of all tools including:
    - name: Tool name
    - description: Tool description  
    - input_schema: JSON schema for tool parameters
    - output_schema: JSON schema for tool output (if defined in annotations)
    """
    global mcp_manager, service_globally_initialized
    if not service_globally_initialized or not mcp_manager or not mcp_manager.initialized:
        raise HTTPException(status_code=503, detail="MCP service not initialized")
    
    all_tools_response = []
    
    # Get all core tools
    for tool_obj in mcp_manager.core_tools:
        # Extract output_schema from annotations if available
        output_schema = None
        if hasattr(tool_obj, 'annotations') and tool_obj.annotations:
            if hasattr(tool_obj.annotations, 'outputSchema'):
                output_schema = tool_obj.annotations.outputSchema
        
        all_tools_response.append(
            ToolResponse(
                name=tool_obj.name,
                description=tool_obj.description,
                input_schema=tool_obj.inputSchema,
                output_schema=output_schema
            )
        )
    
    # Get all user-specific tools from all users
    for user_id, user_tools in mcp_manager.user_tools.items():
        for tool_obj in user_tools:
            # Extract output_schema from annotations if available
            output_schema = None
            if hasattr(tool_obj, 'annotations') and tool_obj.annotations:
                if hasattr(tool_obj.annotations, 'outputSchema'):
                    output_schema = tool_obj.annotations.outputSchema
            
            # Add user context to tool name to avoid conflicts
            tool_name = f"{tool_obj.name} (user: {user_id})" if user_id != "default" else tool_obj.name
            
            all_tools_response.append(
                ToolResponse(
                    name=tool_name,
                    description=tool_obj.description,
                    input_schema=tool_obj.inputSchema,
                    output_schema=output_schema
                )
            )
    
    return ToolsListResponse(tools=all_tools_response, count=len(all_tools_response))


@app.post("/query", response_model=QueryResponse) # response_model might need adjustment for streaming if not using QueryResponse for stream end
async def handle_query(request: QueryRequest):
    print(f"MCP_SERVICE_LOG: Received query request: {request.model_dump_json(indent=2)}")
    global mcp_manager, service_globally_initialized
    if not service_globally_initialized or not mcp_manager or not mcp_manager.initialized:
        raise HTTPException(status_code=503, detail="MCP service not initialized")
    
    raw_user_id = request.sender or "default_user_for_query" 
    user_id = sanitize_user_id_for_key(raw_user_id)

    if request.direct_tool_call:
        # --- Handle Direct Tool Call ---
        if request.stream:
            # Streaming is typically for LLM responses, not direct tool calls which are synchronous.
            # If streaming is requested with a direct tool call, it's likely a client error.
            # However, some tools *might* support streaming internally. For now, disallow for simplicity.
            # Or, we could allow it and let the tool handle it, but the response model might be tricky.
            # For now, returning an error if stream=True with direct_tool_call.
            # This can be revisited if tools themselves need to stream back to the Python code that called /query.
            return QueryResponse(result="", error="Streaming is not supported for direct_tool_call requests to /query endpoint.")

        tool_name = request.direct_tool_call.tool_name
        arguments = request.direct_tool_call.arguments
        
        # Inject user_id into arguments if 'user_number' is a common pattern and not already present.
        # The LLM should ideally be instructed to include it from its context.
        # if 'user_number' not in arguments and user_id:
        #     arguments['user_number'] = user_id

        target_session: Optional[Client] = None
        # Check core tools first, then user-specific tools
        if tool_name in mcp_manager.core_tool_to_session:
            target_session = mcp_manager.core_tool_to_session[tool_name]
        elif user_id in mcp_manager.user_tool_to_session and \
             tool_name in mcp_manager.user_tool_to_session[user_id]:
            target_session = mcp_manager.user_tool_to_session[user_id][tool_name]

        if not target_session:
            return QueryResponse(result="", error=f"Tool '{tool_name}' not found or not accessible for user '{user_id}'.")

        try:
            print(f"MCP_SERVICE_LOG: Executing direct tool call '{tool_name}' for user '{user_id}' with args: {arguments}")
            # mcp.types.ToolResponse is expected from call_tool
            tool_call_response_obj = await target_session.call_tool(tool_name, arguments=arguments)
            
            actual_tool_payload_dict: Optional[Dict[str, Any]] = None
            response_error_str: Optional[str] = None
            response_result_str: str = ""

            # Logic adapted from /internal/call_mcp_tool to extract payload
            if hasattr(tool_call_response_obj, 'content') and \
               isinstance(tool_call_response_obj.content, list) and \
               len(tool_call_response_obj.content) > 0 and \
               hasattr(tool_call_response_obj.content[0], 'text') and \
               isinstance(tool_call_response_obj.content[0].text, str):
                try:
                    # Attempt to parse the text content as JSON, assuming it's the tool's structured output
                    actual_tool_payload_dict = json.loads(tool_call_response_obj.content[0].text)
                except json.JSONDecodeError:
                    # If it's not JSON, it could be a simple string response from a tool, or an error.
                    # For direct tool calls, we generally expect a structured (dict) response.
                    # If tools can return plain text, this needs more sophisticated handling or clearer contracts.
                    response_error_str = f"Tool '{tool_name}' returned non-JSON text content via TextContent: {tool_call_response_obj.content[0].text[:200]}"
            # FastMCP might return the dict directly if the server tool returns a dict
            elif isinstance(tool_call_response_obj, dict):
                 actual_tool_payload_dict = tool_call_response_obj
            else:
                response_error_str = f"Unexpected response type from tool '{tool_name}': {type(tool_call_response_obj)}. Expected a dictionary or ToolResponse with parsable TextContent."

            if actual_tool_payload_dict is not None:
                if "error" in actual_tool_payload_dict and actual_tool_payload_dict["error"] is not None:
                    # If the tool's payload itself indicates an error
                    response_error_str = str(actual_tool_payload_dict["error"])
                # Always serialize the full payload as the result, even if it contains an "error" key,
                # so the calling Python code can inspect it.
                try:
                    response_result_str = json.dumps(actual_tool_payload_dict)
                except TypeError as te:
                    err_detail = f"TypeError serializing tool payload for '{tool_name}': {str(te)}. Payload: {str(actual_tool_payload_dict)[:200]}"
                    print(f"MCP_SERVICE_LOG: {err_detail}")
                    if not response_error_str: response_error_str = err_detail
                    # Fallback to string representation if JSON dump fails for some reason
                    if not response_result_str: response_result_str = str(actual_tool_payload_dict)

            if response_error_str and not response_result_str:
                 # Ensure result is empty if only an error string was generated (no payload to serialize)
                 response_result_str = ""
            
            # Avoid printing large image data in logs
            log_result_str = response_result_str[:200] if response_result_str else ""
            if "data:image/" in log_result_str or '"b64_json"' in log_result_str:
                log_result_str = "[IMAGE_DATA_TRUNCATED_FOR_LOG]"
            print(f"MCP_SERVICE_LOG: Direct tool call '{tool_name}' completed. Result: '{log_result_str}...', Error: {response_error_str}")
            return QueryResponse(result=response_result_str, error=response_error_str)

        except Exception as e:
            
            error_full_traceback = traceback.format_exc()
            print(f"MCP_SERVICE_LOG: Error during direct tool call '{tool_name}' for user '{user_id}': {str(e)}\n{error_full_traceback}")
            return QueryResponse(result="", error=f"Error executing tool '{tool_name}': {str(e)}")
    
    elif request.query:
        # --- Handle Natural Language Query (existing logic) ---
        user_specific_mcp_tools_list, user_specific_mcp_tool_to_session_map = mcp_manager.get_tools_for_user_query(user_id)

        # --- NEW: Apply allowed_tools filtering if provided ---
        # if hasattr(request, 'allowed_tools') and request.allowed_tools is not None:
        #     allowed_set = set(request.allowed_tools)
        #     user_specific_mcp_tools_list = [t for t in user_specific_mcp_tools_list if t.name in allowed_set]
        #     user_specific_mcp_tool_to_session_map = {name: sess for name, sess in user_specific_mcp_tool_to_session_map.items() if name in allowed_set}
        #     print(f"handle_query: Filtering tools by allowed_tools. Allowed: {request.allowed_tools}. Tools after filter: {[t.name for t in user_specific_mcp_tools_list]}")

        if hasattr(request, 'allowed_tools') and request.allowed_tools is not None:
            if not request.allowed_tools:  # If allowed_tools is an EMPTY list
                user_specific_mcp_tools_list = []  # No tools allowed
                user_specific_mcp_tool_to_session_map = {}
                print(f"handle_query: allowed_tools is empty. No tools will be available to the AI.")
            else:  # allowed_tools is a non-empty list
                allowed_set = set(request.allowed_tools)
                user_specific_mcp_tools_list = [t for t in user_specific_mcp_tools_list if t.name in allowed_set]
                user_specific_mcp_tool_to_session_map = {name: sess for name, sess in user_specific_mcp_tool_to_session_map.items() if name in allowed_set}
                print(f"handle_query: Filtering tools by allowed_tools. Allowed: {request.allowed_tools}. Tools after filter: {[t.name for t in user_specific_mcp_tools_list]}")
        else:
            # If allowed_tools attribute is not present or is None (meaning client wants default behavior: all tools)
            print(f"handle_query: allowed_tools not provided or is None. All user tools will be available to the AI.")
            # No filtering needed, user_specific_mcp_tools_list already has all tools

        # --- End NEW ---

        final_response_schema = request.final_response_json_schema

        # NEW: Handle conversation_history parameter
        conversation_history_to_use = None
        if request.conversation_history is not None:
            # Convert dict history to StandardizedMessage objects if provided
            from llm_adapters import StandardizedMessage
            try:
                conversation_history_to_use = []
                for msg_dict in request.conversation_history:
                    conversation_history_to_use.append(StandardizedMessage.model_validate(msg_dict))
                print(f"MCP_SERVICE_LOG: Using provided conversation history for user {user_id} ({len(conversation_history_to_use)} messages)")
            except Exception as e:
                print(f"MCP_SERVICE_LOG: Error parsing provided conversation history for user {user_id}: {e}")
                conversation_history_to_use = None  # Fall back to loading from file
        else:
            # Legacy: Check if this is an artifact editor call and should use empty history
            is_artifact_editor_call = request.query.startswith("Edit the web app") or request.query.startswith("Create the web app")
            conversation_history_to_use = [] if is_artifact_editor_call else None
            
            if is_artifact_editor_call:
                print(f"MCP_SERVICE_LOG: Detected legacy artifact editor call for user {user_id}, using empty conversation history")

        # NEW: Handle special system_prompt flags
        system_prompt_override = None
        if request.system_prompt:
            if request.system_prompt == "artifact_editor":
                # Import and use the artifact system prompt function (web app)
                try:
                    from system_prompts import get_artifact_system_prompt
                    system_prompt_override = get_artifact_system_prompt("artifact_editor", "web_app")
                    print(f"MCP_SERVICE_LOG: Using web app artifact editor system prompt for user {user_id}")
                except ImportError as e:
                    print(f"MCP_SERVICE_LOG: Could not import get_artifact_system_prompt: {e}")
                    system_prompt_override = None
            elif request.system_prompt == "pdf_document":
                # Import and use the PDF system prompt function
                try:
                    from system_prompts import get_artifact_system_prompt
                    system_prompt_override = get_artifact_system_prompt("artifact_editor", "pdf_document")
                    print(f"MCP_SERVICE_LOG: Using PDF document system prompt for user {user_id}")
                except ImportError as e:
                    print(f"MCP_SERVICE_LOG: Could not import get_artifact_system_prompt: {e}")
                    system_prompt_override = None
            elif request.system_prompt == "mcp_server":
                try:
                    from system_prompts import get_mcp_server_system_prompt # Corrected function name
                    system_prompt_override = get_mcp_server_system_prompt(include_collaboration=True) # Use collaborative version for frontend
                    print(f"MCP_SERVICE_LOG: Using MCP server system prompt with collaboration for user {user_id}") # Updated log message
                except ImportError as e:
                    print(f"MCP_SERVICE_LOG: Could not import get_mcp_server_system_prompt: {e}") # Updated log message
                    system_prompt_override = None
            else:
                # Use the provided system prompt directly
                system_prompt_override = request.system_prompt
                print(f"MCP_SERVICE_LOG: Using custom system prompt for user {user_id} (length: {len(system_prompt_override)} chars)")

        query_model = request.model
        if request.stream: # If streaming, imply Gemini for now as it's the one we set up for streaming
            # The actual model selection happens inside function_calling_loop based on its internal logic for now
            # or could be passed if function_calling_loop is updated to accept model_name.
            print(f"Streaming requested for user {user_id}. Will use Gemini via adapter.")

        if request.stream:
            async def stream_generator():
                queue = asyncio.Queue()
                
                async def stream_chunk_handler_for_service(chunk: Dict[str, Any]):
                    # This handler is called by function_calling_loop (via LLM adapter) for each stream chunk
                    await queue.put(json.dumps(chunk) + "\n")
                    # Do NOT put None on the queue here or set finished_event.
                    # The function_calling_loop task will signal its completion.
                
                async def run_function_calling_and_signal_completion():
                    try:
                        await function_calling_loop(
                            user_input=request.query,
                            mcp_tools_list=user_specific_mcp_tools_list,
                            mcp_tool_to_session_map=user_specific_mcp_tool_to_session_map,
                            user_number=user_id,
                            conversation_history=conversation_history_to_use,  # Pass empty history for artifact editor calls
                            attachments=request.attachments,
                            attachment_urls=request.attachment_urls,  # NEW: Pass attachment URLs
                            stream_chunk_handler=stream_chunk_handler_for_service,
                            final_response_json_schema=final_response_schema, # Pass the schema
                            system_prompt=system_prompt_override,  # NEW: Pass system prompt override
                            conversation_id=request.conversation_id # Pass conversation_id
                        )
                    except Exception as e:
                        # If function_calling_loop itself raises an unhandled exception,
                        # try to send an error chunk before signaling completion.
                        print(f"ERROR in function_calling_loop task: {e}")
                        traceback.print_exc() # Log the full traceback
                        try:
                            error_chunk = {"type": "error", "content": f"Unhandled error in backend processing: {str(e)}"}
                            await queue.put(json.dumps(error_chunk) + "\n")
                        except Exception as e_cb:
                            print(f"Failed to send final error chunk to queue: {e_cb}")
                    finally:
                        # Signal that function_calling_loop (and thus all its streaming turns) is complete.
                        await queue.put(None) 
                
                # Run function_calling_loop in a background task
                loop_task = asyncio.create_task(run_function_calling_and_signal_completion())
                
                while True:
                    item = await queue.get()
                    if item is None: # End of stream signal from run_function_calling_and_signal_completion
                        break
                    yield item
                    queue.task_done()
                
                await loop_task # Ensure the background task is awaited/cleaned up if it hasn't finished

            return StreamingResponse(stream_generator(), media_type="application/x-ndjson")
        else: # Non-streaming case (original behavior)
            try:
                result, updated_history, error = await function_calling_loop(
                    user_input=request.query,
                    mcp_tools_list=user_specific_mcp_tools_list,
                    mcp_tool_to_session_map=user_specific_mcp_tool_to_session_map,
                    user_number=user_id, 
                    conversation_history=conversation_history_to_use,  # Pass empty history for artifact editor calls
                    attachments=request.attachments,
                    attachment_urls=request.attachment_urls,  # NEW: Pass attachment URLs
                    stream_chunk_handler=None, # Explicitly None for non-streaming
                    final_response_json_schema=final_response_schema, # Pass the schema
                    system_prompt=system_prompt_override,  # NEW: Pass system prompt override
                    conversation_id=request.conversation_id # Pass conversation_id
                )

                if request.final_response_json_schema and error is None and result:
                    extracted_json_string = None
                    # Try to parse the result directly as JSON first
                    try:
                        json.loads(result) # Validate if 'result' itself is a JSON string
                        extracted_json_string = result # It's already good JSON
                        print(f"MCP Service: Validated LLM response as direct JSON for user {user_id}.")
                    except json.JSONDecodeError:
                        # If direct parsing fails, try to extract from markdown
                        import re
                        match = re.search(r"```json\s*([\s\S]*?)\s*```", result, re.DOTALL)
                        if match:
                            potential_json = match.group(1).strip()
                            try:
                                json.loads(potential_json) # Validate
                                extracted_json_string = potential_json
                                print(f"MCP Service: Extracted and validated JSON from LLM response (markdown) for user {user_id}.")
                            except json.JSONDecodeError as je:
                                print(f"Warning: MCP Service: Extracted content (markdown) for user {user_id} was not valid JSON: {je}. Original LLM output will be used.")
                        # else: # No markdown found, and direct parse failed
                            # The original 'result' will be used, and a warning will be printed below if it's still not good.

                    if extracted_json_string is not None:
                        result = extracted_json_string
                    else:
                        # This warning means neither direct parse nor markdown extraction yielded valid JSON
                        # For natural language queries, the result might be plain text if no schema was enforced or if the LLM failed to adhere.
                        if request.final_response_json_schema: # Only print this warning if a schema was expected
                            print(f"Warning: MCP Service: final_response_json_schema was provided for user {user_id} (NL Query), but LLM output was not a direct JSON string nor a valid JSON markdown block. Passing original LLM output.")
            
                return QueryResponse(result=result, error=error)
            except Exception as e:
                print(f"Error processing non-streaming query for {user_id}: {str(e)}")
                
                print(f"Traceback: {traceback.format_exc()}")
                return QueryResponse(result="", error=f"Error processing query: {str(e)}")
    else:
        # This case should be caught by the Pydantic validator in QueryRequest
        return QueryResponse(result="", error="Invalid request: Neither query nor direct_tool_call was provided.")

@app.post("/clear/{user_id_path}") # Changed sender to user_id_path to avoid confusion
async def clear_user_history(user_id_path: str): # user_id_path is raw from URL
    global service_globally_initialized
    if not service_globally_initialized: 
        raise HTTPException(status_code=503, detail="MCP service not initialized")
    
    user_id = sanitize_user_id_for_key(user_id_path) # SANITIZE HERE
    try:
        if clear_conversation_history_for_user(user_id): 
            return {"status": "success", "message": f"Conversation history cleared for {user_id}"}
        else: # This path might not be reachable if clear_conversation_history_for_user raises error or always returns True
            return {"status": "warning", "message": f"Cleared in-memory history for {user_id}, but issue with file deletion."}
    except Exception as e:
        return {"status": "error", "message": f"Error clearing history for {user_id}: {str(e)}"}

# --- Admin Endpoints (Modified for User-Scoping where applicable) ---

@app.post("/admin/users/add_server") # Changed path for clarity
async def add_user_server(request: AddServerRequest):
    global mcp_manager, service_globally_initialized
    if not service_globally_initialized or not mcp_manager or not mcp_manager.initialized:
        raise HTTPException(status_code=503, detail="MCP service not initialized")
    
    user_id = sanitize_user_id_for_key(request.user_id) # SANITIZE HERE
    server_config = {
        "command": request.command,
        "args": request.args if request.args is not None else [],
        "env": request.env if request.env is not None else {}
    }
    config_key_to_check = _mcp_config_key(server_config)

    if config_key_to_check in mcp_manager.user_config_to_session.get(user_id, {}):
        return {"status": "warning", "message": f"Server configuration already running or known for user {user_id}."}

    try:
        # dynamic_servers_per_user_map = load_dynamic_servers_per_user() # REMOVED
        # user_specific_configs = dynamic_servers_per_user_map.get(user_id, []) # REMOVED
        
        # is_in_dynamic_json = any( # REMOVED
        #      _mcp_config_key(ds_conf) == config_key_to_check for ds_conf in user_specific_configs
        # )
        
        # if not is_in_dynamic_json: # REMOVED
        #     user_specific_configs.append(server_config) # REMOVED
        #     dynamic_servers_per_user_map[user_id] = user_specific_configs # REMOVED
        #     if not save_dynamic_servers_per_user(dynamic_servers_per_user_map): # REMOVED
        #         print(f"Warning: Failed to save new server config to dynamic_servers.json for user {user_id}: {server_config}")
        
        if await mcp_manager.start_single_server(server_config, user_id=user_id):
            # Message updated as config is not "saved" in JSON anymore, but started.
            # Persistence is achieved by the .py file existing for the next full service restart.
            return {"status": "success", "message": f"Server {request.command} {request.args} added and started for user {user_id}. It will restart with the main service if its .py file exists."}
    except Exception as e:
        print(f"Error in add_user_server endpoint: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/admin/servers/list_all_known", response_model=AvailableServersResponse) # New endpoint for global list
async def list_all_globally_known_servers():
    global mcp_manager, service_globally_initialized
    if not service_globally_initialized or not mcp_manager or not mcp_manager.initialized:
        raise HTTPException(status_code=503, detail="MCP service not initialized")
    
    all_configs_with_owner = mcp_manager.get_all_globally_known_server_configs([]) # Pass empty list for core_server_configs
    server_details_list = []
    for config_dict in all_configs_with_owner:
        config_key = _mcp_config_key(config_dict)
        owner_id = config_dict.get("_owner_user_id") # Present for dynamic user servers
        
        is_running = False
        tools_list = []
        session = None

        if owner_id: # User's dynamic server
            session = mcp_manager.user_config_to_session.get(owner_id, {}).get(config_key)
        else: # Core server
            session = mcp_manager.core_config_to_session.get(config_key)
        
        if session:
            is_running = True
            if owner_id:
                tools_list = mcp_manager.user_session_to_tools.get(owner_id, {}).get(session, [])
            else:
                tools_list = mcp_manager.core_session_to_tools.get(session, [])

        server_details_list.append(ServerDetail(
            config_key=config_key,
            command=config_dict.get("command", "N/A"),
            args=config_dict.get("args", []),
            env=config_dict.get("env"),
            is_running=is_running,
            tools_provided=tools_list,
            owner_user_id=owner_id
        ))
    return AvailableServersResponse(servers=server_details_list)


@app.post("/admin/users/remove_server") # Changed path
async def remove_server_for_user_or_core(request: RemoveServerRequest):
    global mcp_manager, service_globally_initialized
    if not service_globally_initialized or not mcp_manager or not mcp_manager.initialized:
        raise HTTPException(status_code=503, detail="MCP service not initialized")

    user_id_to_target = sanitize_user_id_for_key(request.user_id) if request.user_id else None # SANITIZE HERE
    server_config_to_remove = {
        "command": request.command,
        "args": request.args if request.args is not None else [],
        "env": request.env if request.env is not None else {}
    }
    config_key_to_remove = _mcp_config_key(server_config_to_remove)
    actions_taken = []

    try:
        if user_id_to_target: # Removing a user's dynamic server (This part is less relevant if all servers are from filesystem)
            # dynamic_servers_map = load_dynamic_servers_per_user() # No longer loading from JSON
            # user_configs = dynamic_servers_map.get(user_id_to_target, [])
            # original_len = len(user_configs)
            
            # Check if it was in this user's dynamic list (This concept changes)
            # is_in_user_dynamic_list = any(_mcp_config_key(conf) == config_key_to_remove for conf in user_configs)

            # if is_in_user_dynamic_list:
            #     user_configs = [conf for conf in user_configs if _mcp_config_key(conf) != config_key_to_remove]
            #     dynamic_servers_map[user_id_to_target] = user_configs
            #     if not user_configs: # Remove user entry if list becomes empty
            #         del dynamic_servers_map[user_id_to_target]
            
            #     if save_dynamic_servers_per_user(dynamic_servers_map):
            #         actions_taken.append(f"Removed from user {user_id_to_target}'s dynamic_servers.json.")
            #     else:
            #         actions_taken.append(f"Failed to save update to dynamic_servers.json for user {user_id_to_target}.")
            
            # For now, user-specific removal via this endpoint is less meaningful if all servers are directory-scanned.
            # This part of the logic might need to be removed or re-thought for the new model.
            # We can still de-register it from the *running* instance for the user.
            if await mcp_manager.remove_tools_for_server_by_config(server_config_to_remove, user_id=user_id_to_target):
                actions_taken.append(f"De-registered server from active service for user {user_id_to_target}. To prevent restart, delete the .py file.")
            else:
                raise HTTPException(status_code=404, detail=f"Server configuration not actively running for user {user_id_to_target}.")

        else: # Removing a "core" server (which are all now discovered servers)
            # is_core_config_defined = any(_mcp_config_key(cs_conf) == config_key_to_remove for cs_conf in CORE_SERVER_COMMANDS) # CORE_SERVER_COMMANDS gone
            # Check if it's a known running server based on discovery
            is_known_running_server = False
            for session_config_key in list(mcp_manager.core_config_to_session.keys()): # Iterate over copy
                if session_config_key == config_key_to_remove:
                    is_known_running_server = True
                    break
            
            if not is_known_running_server:
                 raise HTTPException(status_code=404, detail="Specified server configuration is not an actively running discovered server.")

            if await mcp_manager.remove_tools_for_server_by_config(server_config_to_remove, user_id=None):
                actions_taken.append("De-registered discovered server from active service. To prevent restart, delete the .py file.")
            else: 
                actions_taken.append("Discovered server was not actively running or already de-registered. To prevent restart, delete the .py file.")
        
        return {"status": "success", "message": "Server removal processed. " + " ".join(actions_taken)}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in remove_server_for_user_or_core endpoint: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


# --- User Preference Endpoints ---

@app.get("/users/{user_id_path}/servers/available", response_model=AvailableServersResponse)
async def list_available_servers_for_user(user_id_path: str): # user_id_path is raw from URL
    global mcp_manager, service_globally_initialized
    if not service_globally_initialized or not mcp_manager or not mcp_manager.initialized:
        raise HTTPException(status_code=503, detail="MCP service not initialized")

    user_id = sanitize_user_id_for_key(user_id_path) # SANITIZE HERE
    # These are configs the user *could* enable: their own + all core ones (now all discovered)
    user_plus_core_configs = mcp_manager.get_all_known_server_configs_for_user(user_id, []) # Pass empty for core_server_configs
    
    server_details_list = []
    for config_dict in user_plus_core_configs:
        config_key = _mcp_config_key(config_dict)
        is_running = False
        tools_list = []
        
        # Check if it's one of the user's own dynamic servers
        is_users_own_dynamic = False
        if user_id in mcp_manager.user_config_to_session and config_key in mcp_manager.user_config_to_session[user_id]:
            session = mcp_manager.user_config_to_session[user_id][config_key]
            is_running = True
            tools_list = mcp_manager.user_session_to_tools.get(user_id, {}).get(session, [])
            is_users_own_dynamic = True
        
        # Check if it's a core server (and not already processed as user's own if names clash, though unlikely with paths)
        if not is_users_own_dynamic and config_key in mcp_manager.core_config_to_session:
            session = mcp_manager.core_config_to_session[config_key]
            is_running = True # Core servers are either running or not, globally
            tools_list = mcp_manager.core_session_to_tools.get(session, [])

        server_details_list.append(ServerDetail(
            config_key=config_key,
            command=config_dict.get("command", "N/A"),
            args=config_dict.get("args", []),
            env=config_dict.get("env"),
            is_running=is_running,
            tools_provided=tools_list,
            owner_user_id=user_id if is_users_own_dynamic else None # Mark ownership
        ))
    return AvailableServersResponse(servers=server_details_list)

@app.get("/users/{user_id_path}/servers/active", response_model=AvailableServersResponse)
async def list_active_servers_for_user(user_id_path: str): # user_id_path is raw from URL
    global mcp_manager, service_globally_initialized
    if not service_globally_initialized or not mcp_manager or not mcp_manager.initialized:
        raise HTTPException(status_code=503, detail="MCP service not initialized")

    user_id = sanitize_user_id_for_key(user_id_path) # SANITIZE HERE
    active_tools_list_for_user, active_tool_to_session_map_for_user = mcp_manager.get_tools_for_user_query(user_id)
    
    # Map active sessions back to their configurations to build the response
    active_server_details_map: Dict[str, ServerDetail] = {} # config_key -> ServerDetail

    # Process user's own active servers
    user_sessions_active = {s for s in mcp_manager.user_sessions.get(user_id, []) if s in active_tool_to_session_map_for_user.values()}
    for session in user_sessions_active:
        for conf_key, conf_session in mcp_manager.user_config_to_session.get(user_id, {}).items():
            if conf_session == session:
                # Found the config for this active user session
                # Get the tools provided by this session
                tools_from_this_session = mcp_manager.user_session_to_tools.get(user_id, {}).get(session, [])
                
                # Re-fetch the original config dict to get command/args
                # all_dynamic_configs = load_dynamic_servers_per_user() # REMOVED
                # user_dynamic_list = all_dynamic_configs.get(user_id, []) # REMOVED
                # Instead, we need to find the config from the initial discovery if MCPManager doesn't store it.
                # This is a general challenge with removing CORE_SERVER_COMMANDS if full config details are needed later.

                # Let's try to get command/args from the config_key, similar to how it's done for core servers now
                try:
                    config_from_key = json.loads(conf_key)
                    cmd = config_from_key.get("command", "N/A")
                    args_list = config_from_key.get("args", [])
                    env_vars = config_from_key.get("env")
                except json.JSONDecodeError:
                    cmd = "Error decoding config from key"
                    args_list = []
                    env_vars = None

                if conf_key not in active_server_details_map:
                    active_server_details_map[conf_key] = ServerDetail(
                        config_key=conf_key,
                        command=cmd, # Use parsed from key
                        args=args_list, # Use parsed from key
                        env=env_vars, # Use parsed from key
                        is_running=True,
                        tools_provided=tools_from_this_session,
                        owner_user_id=user_id
                    )
                break
    
    # Process active core servers
    core_sessions_active = {s for s in mcp_manager.core_sessions if s in active_tool_to_session_map_for_user.values()}
    for session in core_sessions_active:
        for conf_key, conf_session in mcp_manager.core_config_to_session.items():
            if conf_session == session:
                # Found the config for this active core session
                # Get the tools provided by this session
                tools_from_this_session = mcp_manager.core_session_to_tools.get(session, [])
                
                # original_config_dict = next((cd for cd in CORE_SERVER_COMMANDS if _mcp_config_key(cd) == conf_key), None) # CORE_SERVER_COMMANDS gone
                # We need to reconstruct the original config from how it was discovered or stored if possible
                # This part is tricky as the original config dict might not be easily available just from the session
                # For now, let's assume we can get command/args if the session holds the config_key that matches a discovered one.
                # This requires mcp_manager.core_config_to_session's key to be the one from _mcp_config_key(original_config_dict_from_discovery)
                
                # A better way: iterate mcp_manager.core_config_to_session and for each, try to find matching original config dict if we stored it
                # For now, we'll rely on the fact that the key in core_config_to_session IS the mcp_config_key.
                # The ServerDetail requires command/args. We only have the key.
                # This part of the logic needs adjustment: how to get command/args from a config_key?
                # Simplified: We will assume the config_key is enough for identification and we don't have easy access to original command/args here for *active* core servers display
                # This is a limitation of not having CORE_SERVER_COMMANDS or a map of discovered_configs by key.
                # We can iterate the mcp_manager's internal structure that *should* hold the config.

                # Let's refine how we get original_config_dict for core servers
                # When servers are started, mcp_manager.core_config_to_session is populated.
                # The key is the _mcp_config_key. We need to find which *discovered* config matches this key.
                # This is inefficient here. MCPManager should ideally store the config dict with the session.

                # Temporary workaround: If it's a core session, we don't have an easy way to get back to the full config_dict here
                # without re-scanning or storing more info in MCPManager. For now, we'll show what we can.
                # This is a known simplification due to removing CORE_SERVER_COMMANDS.

                # Let's try to fetch the command/args from the config_key (which is a JSON string)
                try:
                    config_from_key = json.loads(conf_key)
                    cmd = config_from_key.get("command", "N/A")
                    args_list = config_from_key.get("args", [])
                    env_vars = config_from_key.get("env")
                except json.JSONDecodeError:
                    cmd = "Error decoding config from key"
                    args_list = []
                    env_vars = None

                if conf_key not in active_server_details_map:
                    active_server_details_map[conf_key] = ServerDetail(
                        config_key=conf_key,
                        command=cmd, # Use parsed from key
                        args=args_list, # Use parsed from key
                        env=env_vars, # Use parsed from key
                        is_running=True,
                        tools_provided=tools_from_this_session,
                        owner_user_id=user_id
                    )
                break
            
    return AvailableServersResponse(servers=list(active_server_details_map.values()))


# --- Internal MCP Tool Calling Endpoint ---
@app.post("/internal/call_mcp_tool", response_model=QueryResponse) # Using QueryResponse for now, can be more specific
async def route_internal_mcp_tool_call(
    request: InternalToolCallRequest
    # REMOVED: api_key: str = Depends(verify_internal_api_key) # Secure this endpoint
):
    global mcp_manager, service_globally_initialized
    if not service_globally_initialized or not mcp_manager or not mcp_manager.initialized:
        raise HTTPException(status_code=503, detail="MCP service not initialized for internal call")
        
    tool_name = request.tool_name
    arguments = request.arguments
    user_id_for_context = sanitize_user_id_for_key(request.user_id_context) if request.user_id_context else sanitize_user_id_for_key("+17145986105")

    target_session: Optional[Client] = None

    # 1. Check core tools
    if tool_name in mcp_manager.core_tool_to_session:
        target_session = mcp_manager.core_tool_to_session[tool_name]
        print(f"Internal Call: Found tool '{tool_name}' in core sessions.")
    
    # 2. If not in core, and user_id_context is provided, check user-specific tools
    elif user_id_for_context and user_id_for_context in mcp_manager.user_tool_to_session:
        if tool_name in mcp_manager.user_tool_to_session[user_id_for_context]:
            target_session = mcp_manager.user_tool_to_session[user_id_for_context][tool_name]
            print(f"Internal Call: Found tool '{tool_name}' in user '{user_id_for_context}' sessions.")

    if not target_session:
        error_msg = f"Tool '{tool_name}' not found for internal call (context user: {user_id_for_context})."
        print(f"Internal Call: {error_msg}")
        return QueryResponse(result="", error=error_msg)

    try:
        # NEW: Check if the tool actually accepts user_number before injecting it
        tool_accepts_user_number = False
        
        # Find the tool object to check its input schema
        tool_obj = None
        
        # Check in core tools
        for core_tool in mcp_manager.core_tools:
            if core_tool.name == tool_name:
                tool_obj = core_tool
                break
        
        # Check in user tools if not found in core
        if not tool_obj and user_id_for_context in mcp_manager.user_tools:
            for user_tool in mcp_manager.user_tools[user_id_for_context]:
                if user_tool.name == tool_name:
                    tool_obj = user_tool
                    break
        
        # Check if tool accepts user_number parameter
        if tool_obj and tool_obj.inputSchema:
            properties = tool_obj.inputSchema.get('properties', {})
            tool_accepts_user_number = 'user_number' in properties
            print(f"Internal Call: Tool '{tool_name}' {'accepts' if tool_accepts_user_number else 'does not accept'} user_number parameter")
        
        # Only inject user_number if the tool accepts it AND it's not already provided
        if tool_accepts_user_number and user_id_for_context and 'user_number' not in arguments:
            arguments['user_number'] = user_id_for_context
            print(f"Internal Call: Injected user_number for tool '{tool_name}': {user_id_for_context}")
        
        print(f"Internal Call: Executing tool '{tool_name}' with args: {arguments} for user context: {user_id_for_context}")

        # --- Test for Streaming Tool ---
        if tool_name == "test_streaming_tool":
            print(f"MCP_SERVICE_LOG: Detected call to test_streaming_tool. Attempting to stream results.")
            all_yielded_results_for_test = []
            is_async_iterator = False
            try:
                tool_call_result_or_iterator = await target_session.call_tool(tool_name, arguments=arguments)
                
                # Check if the result is an async iterator
                if hasattr(tool_call_result_or_iterator, '__aiter__') and hasattr(tool_call_result_or_iterator, '__anext__'):
                    is_async_iterator = True
                    print(f"MCP_SERVICE_LOG: test_streaming_tool call_tool returned an ASYNC ITERATOR.")
                    async for item in tool_call_result_or_iterator:
                        print(f"MCP_SERVICE_LOG: Yielded item from test_streaming_tool: {item}")
                        all_yielded_results_for_test.append(item)
                    print(f"MCP_SERVICE_LOG: Finished iterating over test_streaming_tool results.")
                else:
                    print(f"MCP_SERVICE_LOG: test_streaming_tool call_tool returned a SINGLE item (type: {type(tool_call_result_or_iterator)}): {tool_call_result_or_iterator}")
                    all_yielded_results_for_test.append(tool_call_result_or_iterator)

            except Exception as e_stream_test:
                print(f"MCP_SERVICE_LOG: EXCEPTION during test_streaming_tool iteration: {type(e_stream_test).__name__} - {e_stream_test}")
                print(f"MCP_SERVICE_LOG: Traceback for test_streaming_tool exception:\n{traceback.format_exc()}")
                return QueryResponse(result="", error=f"Exception during streaming test: {e_stream_test}")

            # For this test, just return a summary of what was collected
            final_payload_from_test = all_yielded_results_for_test[-1].get("final_payload") if all_yielded_results_for_test and isinstance(all_yielded_results_for_test[-1], dict) else None
            return QueryResponse(
                result=json.dumps({
                    "test_summary": "Streaming test for test_streaming_tool executed.", 
                    "was_iterator": is_async_iterator,
                    "items_received_count": len(all_yielded_results_for_test),
                    "first_item_type": str(type(all_yielded_results_for_test[0])) if all_yielded_results_for_test else None,
                    "last_item_final_payload": final_payload_from_test
                }), 
                error=None
            )
        # --- End Test for Streaming Tool ---

        # Original non-streaming logic for other tools:
        result_from_tool_call = await target_session.call_tool(tool_name, arguments=arguments)
        
        response_result_str = ""
        response_error_str: Optional[str] = None
        actual_tool_payload_dict: Optional[Dict[str, Any]] = None

        # Try to extract content from various possible response formats
        if hasattr(result_from_tool_call, 'content') and isinstance(result_from_tool_call.content, list):
            # Handle ToolResponse with content list
            for content_item in result_from_tool_call.content:
                if hasattr(content_item, 'text') and isinstance(content_item.text, str):
                    try:
                        actual_tool_payload_dict = json.loads(content_item.text)
                        print(f"Internal Call: Extracted payload from TextContent for tool '{tool_name}'.")
                        break
                    except json.JSONDecodeError as je:
                        response_result_str = content_item.text
                        # Avoid printing large image data in logs
                        log_str = response_result_str[:200] if response_result_str else ""
                        if "data:image/" in log_str or '"b64_json"' in log_str or '"results"' in log_str:
                            log_str = "[LARGE_DATA_TRUNCATED_FOR_LOG]"
                        print(f"Internal Call: Tool '{tool_name}' content text was not JSON: '{log_str}...'. Error: {je}")
                        break
                    except Exception as e:
                        response_error_str = f"Error processing TextContent from tool '{tool_name}': {str(e)}"
                        print(f"Internal Call: {response_error_str}")
                        break
        elif isinstance(result_from_tool_call, list):
            # Handle direct list response (FastMCP returns content list directly)
            for content_item in result_from_tool_call:
                if hasattr(content_item, 'text') and isinstance(content_item.text, str):
                    try:
                        actual_tool_payload_dict = json.loads(content_item.text)
                        print(f"Internal Call: Extracted payload from direct content list for tool '{tool_name}'.")
                        break
                    except json.JSONDecodeError as je:
                        response_result_str = content_item.text
                        # Avoid printing large image data in logs
                        log_str = response_result_str[:200] if response_result_str else ""
                        if "data:image/" in log_str or '"b64_json"' in log_str or '"results"' in log_str:
                            log_str = "[LARGE_DATA_TRUNCATED_FOR_LOG]"
                        print(f"Internal Call: Tool '{tool_name}' direct content text was not JSON: '{log_str}...'. Error: {je}")
                        break
                    except Exception as e:
                        response_error_str = f"Error processing direct content item from tool '{tool_name}': {str(e)}"
                        print(f"Internal Call: {response_error_str}")
                        break
        elif isinstance(result_from_tool_call, dict): 
            # Handle direct dictionary response
            actual_tool_payload_dict = result_from_tool_call
            print(f"Internal Call: Tool '{tool_name}' directly returned a dictionary.")
        elif hasattr(result_from_tool_call, 'text'):
            # Handle direct TextContent object
            try:
                actual_tool_payload_dict = json.loads(result_from_tool_call.text)
                print(f"Internal Call: Extracted payload from direct TextContent for tool '{tool_name}'.")
            except json.JSONDecodeError as je:
                response_result_str = result_from_tool_call.text
                # Avoid printing large image data in logs
                log_str = response_result_str[:200] if response_result_str else ""
                if "data:image/" in log_str or '"b64_json"' in log_str or '"results"' in log_str:
                    log_str = "[LARGE_DATA_TRUNCATED_FOR_LOG]"
                print(f"Internal Call: Tool '{tool_name}' direct text was not JSON: '{log_str}...'. Error: {je}")
            except Exception as e:
                response_error_str = f"Error processing direct TextContent from tool '{tool_name}': {str(e)}"
                print(f"Internal Call: {response_error_str}")
        else: 
            # Fallback: convert to string but log the type for debugging
            response_result_str = str(result_from_tool_call)
            # Avoid printing large image data in logs
            log_str = response_result_str[:200] if response_result_str else ""
            if "data:image/" in log_str or '"b64_json"' in log_str or '"results"' in log_str:
                log_str = "[LARGE_DATA_TRUNCATED_FOR_LOG]"
            print(f"Internal Call: Tool '{tool_name}' returned unexpected type {type(result_from_tool_call)}: '{log_str}...'")

        if actual_tool_payload_dict is not None:
            if "error" in actual_tool_payload_dict: 
                response_error_str = str(actual_tool_payload_dict["error"])
            try:
                response_result_str = json.dumps(actual_tool_payload_dict)
            except TypeError as te: 
                error_detail = f"TypeError when trying to serialize tool payload dictionary to JSON for '{tool_name}': {str(te)}"
                print(f"Internal Call: {error_detail}")
                if not response_error_str: 
                    response_error_str = error_detail
                if response_result_str == "" and actual_tool_payload_dict is not None: 
                     response_result_str = str(actual_tool_payload_dict) 
        
        # Avoid printing large image data in logs
        log_str = response_result_str[:200] if response_result_str else ""
        if "data:image/" in log_str or '"b64_json"' in log_str or '"results"' in log_str:
            log_str = "[LARGE_DATA_TRUNCATED_FOR_LOG]"
        print(f"Internal Call: Tool '{tool_name}' executed. Final result: '{log_str}...', Error: {response_error_str}")
        return QueryResponse(result=response_result_str, error=response_error_str)

    except Exception as e:
        error_msg = f"Error executing tool '{tool_name}' internally: {str(e)}"
        print(f"Internal Call: {error_msg}")
        print(f"Internal Call Traceback: {traceback.format_exc()}")
        return QueryResponse(result="", error=error_msg)


@app.post("/admin/servers/discover_new")
async def discover_new_servers(api_key: str = Depends(verify_internal_api_key)):
    """
    Scans for new MCP server files and starts any that aren't already running.
    """
    global mcp_manager, service_globally_initialized
    if not service_globally_initialized or not mcp_manager or not mcp_manager.initialized:
        raise HTTPException(status_code=503, detail="MCP service not initialized")
    
    try:
        result = await mcp_manager.discover_and_start_new_servers()
        return result
    except Exception as e:
        print(f"Error in discover_new_servers endpoint: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/admin/servers/reload")
async def reload_server(
    server_script_path: str = Body(..., description="Path to the server script (e.g., 'mcp_client/mcp_servers/my_server.py')"),
    api_key: str = Depends(verify_internal_api_key)
):
    """
    Reloads a specific MCP server by stopping and restarting it.
    """
    global mcp_manager, service_globally_initialized
    if not service_globally_initialized or not mcp_manager or not mcp_manager.initialized:
        raise HTTPException(status_code=503, detail="MCP service not initialized")
    
    try:
        result = await mcp_manager.reload_server(server_script_path)
        return result
    except Exception as e:
        print(f"Error in reload_server endpoint: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5001
    # Set reload to False for production or when dealing with complex async lifespans
    # uvicorn.run("mcp_service:app", host="0.0.0.0", port=port, reload=True) # For dev
    uvicorn.run(app, host="0.0.0.0", port=port)
