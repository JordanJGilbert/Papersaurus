import httpx
import os
import json
from typing import Dict, Any, Optional, Tuple

# --- Configuration for Internal MCP Calls ---
# These should ideally be configured via environment variables in a real deployment
MCP_SERVICE_BASE_URL = os.getenv("MCP_SERVICE_URL", "http://localhost:5001") # Assuming mcp_service is on 5001
INTERNAL_CALL_ENDPOINT = "/internal/call_mcp_tool"
# This API key is used BY THIS SERVER/CLIENT when it calls the central mcp_service's internal endpoint.
# It must match the INTERNAL_API_KEY expected by mcp_service.py.
INTERNAL_API_KEY_FOR_CALLING = os.getenv("MCP_INTERNAL_API_KEY", "your_secret_internal_api_key_here")

async def call_another_mcp_tool(
    tool_name: str,
    arguments: Dict[str, Any],
    user_id_context: Optional[str] = None,
    timeout: float = 500
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Helper function to call a tool on another MCP server via the central mcp_service.

    Args:
        tool_name (str): The name of the tool to call.
        arguments (Dict[str, Any]): Arguments for the target tool.
        user_id_context (Optional[str]): User ID for context if needed by the target tool.
                                        This will be sanitized by the mcp_service.
        timeout (float): Request timeout in seconds.

    Returns:
        Tuple[Optional[Dict[str, Any]], Optional[str]]: 
            A tuple containing the parsed JSON result from the tool (if successful and result was JSON), 
            and an error message string if an error occurred.
            If the tool's result was not valid JSON, the first element might be a dictionary
            like {"raw_result": "string_value"}, or None if parsing failed.
    """
    if not INTERNAL_API_KEY_FOR_CALLING:
        error_msg = "MCP_INTERNAL_API_KEY (for calling) is not set in this server's environment. Cannot make internal MCP calls."
        print(f"[InternalMCPCallHelper] ERROR: {error_msg}")
        return None, error_msg

    url = f"{MCP_SERVICE_BASE_URL}{INTERNAL_CALL_ENDPOINT}"
    payload = {
        "tool_name": tool_name,
        "arguments": arguments,
        "user_id_context": user_id_context # Pass the raw user_id; mcp_service will sanitize
    }
    headers = {
        "X-Internal-API-Key": INTERNAL_API_KEY_FOR_CALLING,
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient() as client:
        try:
            print(f"[InternalMCPCallHelper] Calling tool: '{tool_name}' for user_context: '{user_id_context}' at {url} with args: {str(arguments)[:200]}...")
            response = await client.post(url, json=payload, headers=headers, timeout=timeout)
            response.raise_for_status() # Raises HTTPStatusError for 4xx/5xx responses

            response_data = response.json() # Expects QueryResponse format from mcp_service
            
            service_error = response_data.get("error")
            if service_error:
                print(f"[InternalMCPCallHelper] Error from mcp_service for tool '{tool_name}': {service_error}")
                return None, str(service_error)

            tool_result_str = response_data.get("result")
            if tool_result_str:
                try:
                    parsed_tool_result = json.loads(tool_result_str)
                    print(f"[InternalMCPCallHelper] Successfully called tool '{tool_name}'. Parsed result: {str(parsed_tool_result)[:200]}...")
                    return parsed_tool_result, None
                except json.JSONDecodeError:
                    print(f"[InternalMCPCallHelper] Tool '{tool_name}' result was not valid JSON: {tool_result_str[:200]}...")
                    # Return the raw string if it's not JSON, wrapped in a dict for some consistency
                    return {"raw_result": tool_result_str}, None
            else:
                # This case means mcp_service returned a 200 OK, with a valid QueryResponse structure,
                # but the 'result' field was empty/null, and 'error' was also null.
                # This could be valid if a tool successfully does an action but returns no data.
                print(f"[InternalMCPCallHelper] Tool '{tool_name}' call to mcp_service returned no 'result' string and no 'error'. Raw response: {response_data}")
                return {}, None # Empty dict signifies success with no specific data payload

        except httpx.HTTPStatusError as e:
            error_message = f"HTTP error calling mcp_service for '{tool_name}': {e.response.status_code} - Body: {e.response.text[:500]}"
            print(f"[InternalMCPCallHelper] ERROR: {error_message}")
            return None, error_message
        except httpx.RequestError as e: # Covers network errors, timeouts, etc.
            error_message = f"Request error calling mcp_service for '{tool_name}': {str(e)}"
            print(f"[InternalMCPCallHelper] ERROR: {error_message}")
            return None, error_message
        except json.JSONDecodeError as e: # If mcp_service's response itself isn't valid JSON
            error_message = f"Failed to decode JSON response from mcp_service for '{tool_name}': {str(e)}. Response text: {response.text[:200]}..."
            print(f"[InternalMCPCallHelper] ERROR: {error_message}")
            return None, error_message
        except Exception as e:
            error_message = f"Unexpected error in InternalMCPCallHelper for '{tool_name}': {str(e)}"
            print(f"[InternalMCPCallHelper] ERROR: {error_message}")
            import traceback
            print(f"[InternalMCPCallHelper] Traceback: {traceback.format_exc()}")
            return None, error_message 