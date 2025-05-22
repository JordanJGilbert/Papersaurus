import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
from mcp.server.fastmcp import FastMCP
import uuid
import re
import json
import requests
import base64
import asyncio
import hashlib
from typing import List, Optional, Dict, Tuple, Any
import logging
import shutil  # For copying files in import_user_mcp_server

# LLM adapter imports (used in dynamic server creation/update)
from llm_adapters import (
    get_llm_adapter,
    StandardizedMessage,
    StandardizedLLMConfig,
    AttachmentPart
)

# Add this near the top, after imports but before any usage:
MCP_SERVICE_BASE_URL = "http://localhost:5001"

logging.basicConfig(stream=sys.stderr, level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

mcp = FastMCP("MCP Management Server")

# --- Helper: Sanitize for Path ---
def sanitize_for_path(name_part: str) -> str:
    """Sanitizes a string to be safe for use as part of a directory or file name."""
    if not isinstance(name_part, str):
        name_part = str(name_part)
    name_part = name_part.replace('+', '')
    if name_part.startswith('group_'):
        group_id_val = name_part[len('group_'):]
        hash_val = hashlib.md5(group_id_val.encode()).hexdigest()[:12]
        name_part = f"group_{hash_val}"
    name_part = re.sub(r'[^\w.-]', '_', name_part)
    name_part = re.sub(r'_+', '_', name_part)
    name_part = name_part.strip('_.- ')
    if not name_part:
        return f"sanitized_{uuid.uuid4().hex[:8]}"
    return name_part

# --- Helper: Get user server script path ---
def get_user_server_script_path(user_id_safe: str, script_filename_safe: str):
    """
    Constructs the absolute path for a user's server script and its path relative to project root.
    """
    # USER_GENERATED_DATA_BASE_DIR now points to /var/www/flask_app/user_data
    user_specific_servers_dir = os.path.join(USER_GENERATED_DATA_BASE_DIR, user_id_safe, "generated_mcp_servers")
    os.makedirs(user_specific_servers_dir, exist_ok=True)
    absolute_script_path = os.path.join(user_specific_servers_dir, script_filename_safe)
    
    # Path relative to project root (/var/www/flask_app)
    # This means it will be 'user_data/<user_id_safe>/generated_mcp_servers/<script_filename_safe>'
    script_path_relative_to_project_root = os.path.join(
        "user_data", user_id_safe, "generated_mcp_servers", script_filename_safe
    )
    return absolute_script_path, script_path_relative_to_project_root

# Base directory for all user-specific generated data.
# Configurable via environment variable, defaults to /var/www/flask_app/user_data
USER_GENERATED_DATA_BASE_DIR = os.getenv("USER_DATA_BASE_PATH", "/var/www/flask_app/user_data")
os.makedirs(USER_GENERATED_DATA_BASE_DIR, exist_ok=True)


CODE_GEN_SYSTEM_PROMPT_TEMPLATE = """You are an expert Python programmer specializing in creating MCP servers.
Your task is to generate the Python code for a new MCP server based on the user's request.
The server should be named '{server_instance_name}'.

The generated Python script MUST:
1.  Import `FastMCP` from `mcp.server.fastmcp`.
2.  Import any other necessary Python standard libraries.
3.  Define an instance of `FastMCP`: `mcp = FastMCP("{server_instance_name}")`.
4.  Define one or more asynchronous Python functions that will serve as tools.
5.  Decorate each tool function with `@mcp.tool()`.
6.  Tool functions MUST be `async def`.
7.  Tool functions MUST have clear docstrings explaining their purpose, arguments (with types), and what they return (typically a dict). This docstring is critical as it's used by the MCP client to understand and call the tool.
8.  Tool functions MUST have type hints for all arguments and for the return type. The return type should generally be `dict`.
9.  **CRITICAL FOR INTER-SERVER CALLS:** If your tool needs to call MCP tools from *other* servers, you MUST include the following boilerplate at the TOP of your script to correctly import the `call_another_mcp_tool` helper:
    ```python
    import sys
    import os
    # This allows the script to find the 'mcp_client.utils' module from the project root.
    # It assumes generated scripts are in a directory like 'user_data/users/USER_ID/generated_mcp_servers/'.
    # The path adjustment navigates three levels up to the project root.
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../'))
    if project_root not in sys.path:
        sys.path.append(project_root)
    from mcp_client.utils.internal_mcp_caller import call_another_mcp_tool
    ```
    Then, invoke other tools within your `async def` tool functions using (ensure `user_number` is passed to your tool if it is needed for context by the target tool or for saving its results):
    ```python
    # Example usage inside your async def my_tool(user_number: str, ...):
    # some_user_specific_id = user_number # Or derive from it as needed
    result_dict, error_str = await call_another_mcp_tool(
        tool_name="name_of_tool_on_another_server",
        arguments={{...}},  # Arguments for the target tool
        user_id_context=user_number # Pass user_number for context if the target tool needs it
    )
    if error_str:
        # Handle error (e.g., return an error dictionary)
        return {{"status": "error", "message": f"Error calling other tool: {{error_str}}"}}
    # Use result_dict for further logic
    ```
    {available_mcp_tools_list_str} # List of other available tools you can call.

10. The generated script MUST include the boilerplate `if __name__ == "__main__": mcp.run()` to make it executable.
11. The generated code should be self-contained in a single Python file.
12. Ensure the generated tools are practical, directly address the user's request, and make sense.
13. Avoid writing overly complex or unsafe code. Prioritize clarity, correctness, and security. Do not include functions that execute arbitrary shell commands or filesystem operations unless that is the explicit and safe core purpose requested.
14. If the user's request is ambiguous, try to create a sensible, simple version.

AVAILABLE LIBRARIES:
You can assume the following Python libraries are available and can be imported if needed:
- Standard Libraries: `json`, `csv`, `re`, `datetime`, `time`, `collections`, `math`, `random`, `itertools`, `functools`, `uuid`, `hashlib`, `base64`, `io`, `asyncio`, `xml.etree.ElementTree`, `os`, `pathlib`.
- Common Third-Party Libraries (these are pre-installed):
    - `requests`: For making HTTP requests.
    - `Pillow`: For image manipulation (from PIL import Image).
    - `bs4` (Beautiful Soup): For HTML/XML parsing (from bs4 import BeautifulSoup).
    - `numpy`: For numerical operations (import numpy as np).
    - `dateutil.parser`: For flexible date/time string parsing (from dateutil import parser).
- AI / LLM Adapters (pre-installed and available):
    - `llm_adapters`: You can use this module to interact with LLMs.
        - Key components: `get_llm_adapter`, `StandardizedMessage`, `StandardizedLLMConfig`, `StandardizedLLMResponse`.
        - To import this module from a generated script located in a user-specific subdirectory 
          (e.g., 'user_data/users/USER_ID/generated_mcp_servers/'),
          you MUST add the project's root directory (which is three levels up: '../../../') to sys.path.
          See the example below.

**You are encouraged to use these well-maintained third-party and AI libraries when they can provide powerful capabilities or significantly simplify the implementation of the requested functionality, rather than reimplementing complex logic from scratch. However, still prefer standard libraries for simple tasks where they are sufficient.**
Do NOT attempt to use other third-party libraries unless explicitly told they are available.

OUTPUT FORMAT - CRITICAL:
The output MUST be ONLY the Python code, enclosed in a single triple-backtick markdown code block with the language identifier `python`. Example:
    ```python
    # Python code for the MCP server
    import sys
    import os
    # This is CRUCIAL for generated servers to find the 'llm_adapters' module if it's in the project root:
    # Assumes generated scripts are in a directory like 'user_data/users/USER_ID/generated_mcp_servers/'
    # and 'llm_adapters.py' is in the project root (three levels up).
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../')))

    from mcp.server.fastmcp import FastMCP
    import asyncio # Example standard import
    from llm_adapters import get_llm_adapter, StandardizedMessage, StandardizedLLMConfig # Assuming llm_adapters is in project root

    mcp = FastMCP("{server_instance_name}")

    @mcp.tool()
    async def example_generative_tool(prompt_text: str, llm_model_name: str = "gemini-2.5-flash-preview-04-17") -> dict:
        \"\"\"
        An example tool that uses an LLM to generate text.
        Args:
            prompt_text (str): The prompt to send to the LLM.
            llm_model_name (str): The name of the LLM model to use.
        Returns:
            dict: A dictionary with the LLM's response or an error.
        \"\"\"
        try:
            adapter = get_llm_adapter(llm_model_name)
            history = [StandardizedMessage(role="user", content=prompt_text)]
            config = StandardizedLLMConfig() # Add system prompt or other configs if needed
            
            llm_response = await adapter.generate_content(
                model_name=llm_model_name,
                history=history,
                tools=None, # This tool itself likely won't define sub-tools for the LLM it calls
                config=config
            )
            if llm_response.error:
                return {{"status": "error", "message": f"LLM error: {{llm_response.error}}"}}
            return {{"status": "success", "generated_text": llm_response.text_content}}
        except Exception as e:
            return {{"status": "error", "message": str(e)}}

    if __name__ == "__main__":
        mcp.run()
    ```
Do NOT include any explanatory text, comments, or introductions before or after the Python code block.
Only the code block.
"""

CODE_UPDATE_SYSTEM_PROMPT_TEMPLATE = """You are an expert Python programmer specializing in modifying MCP servers.
Your task is to update the Python code for an existing MCP server based on the user's request.
You will be given the current code of the server.
The server instance name (used in `FastMCP("...")`) should generally be preserved unless the user explicitly asks to change it.

The updated Python script MUST:
1.  Maintain the core structure of an MCP server (`from mcp.server.fastmcp import FastMCP`, `mcp = FastMCP(...)`, `@mcp.tool()`, `if __name__ == "__main__": mcp.run()`).
2.  Incorporate the user's requested changes into the tool logic, arguments, or by adding/removing/modifying tools.
3.  Ensure all tool functions remain `async def`, have clear docstrings (updated as necessary), and type hints.
4.  The output MUST be the *complete, updated* Python code for the entire server script. Do not output only diffs or fragments.
5.  Adhere to the same safety and practicality guidelines as for new server creation.

AVAILABLE LIBRARIES:
You can assume the following Python libraries are available and can be imported if needed:
- Standard Libraries: `json`, `csv`, `re`, `datetime`, `time`, `collections`, `math`, `random`, `itertools`, `functools`, `uuid`, `hashlib`, `base64`, `io`, `asyncio`, `xml.etree.ElementTree`, `os`, `pathlib`.
- Common Third-Party Libraries (these are pre-installed):
    - `requests`: For making HTTP requests.
    - `Pillow`: For image manipulation (from PIL import Image).
    - `bs4` (Beautiful Soup): For HTML/XML parsing (from bs4 import BeautifulSoup).
    - `numpy`: For numerical operations (import numpy as np).
    - `dateutil.parser`: For flexible date/time string parsing (from dateutil import parser).
- AI / LLM Adapters (pre-installed and available):
    - `llm_adapters`: You can use this module to interact with LLMs.
        - Key components: `get_llm_adapter`, `StandardizedMessage`, `StandardizedLLMConfig`, `StandardizedLLMResponse`.
        - To import this module from a generated script located in a user-specific subdirectory
          (e.g., 'user_data/users/USER_ID/generated_mcp_servers/'),
          you MUST add the project's root directory (which is three levels up: '../../../') to sys.path if it's not already there.
          See the example below.

**You are encouraged to use these well-maintained third-party and AI libraries when they can provide powerful capabilities or significantly simplify the implementation of the requested functionality, rather than reimplementing complex logic from scratch. However, still prefer standard libraries for simple tasks where they are sufficient.**
Do NOT attempt to use other third-party libraries unless explicitly told they are available.

OUTPUT FORMAT - CRITICAL:
The output MUST be ONLY the Python code for the ENTIRE updated script, enclosed in a single triple-backtick markdown code block with the language identifier `python`.
Example:
    ```python
    # Complete updated Python code for the MCP server
    import sys
    import os
    # This is CRUCIAL for generated servers to find the 'llm_adapters' module if it's in the project root:
    # Assumes generated scripts are in a directory like 'user_data/users/USER_ID/generated_mcp_servers/'
    # and 'llm_adapters.py' is in the project root (three levels up).
    # Check if the path is already there to avoid duplicates if this script itself is re-run/re-generated
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../'))
    if project_root not in sys.path:
        sys.path.append(project_root)

    from mcp.server.fastmcp import FastMCP
    import asyncio
    from llm_adapters import get_llm_adapter, StandardizedMessage, StandardizedLLMConfig # Assuming llm_adapters is in project root


    mcp = FastMCP("PreservedServerName") # Or updated if requested

    @mcp.tool()
    async def existing_tool_modified_with_ai(param1: str, query_for_llm: str) -> dict: # Example modification
        \"\"\"
        Updated docstring for a tool that now uses an LLM.
        Args:
            param1 (str): An existing parameter.
            query_for_llm (str): A query to ask the LLM.
        Returns:
            dict: A dictionary with the result, including LLM's insight.
        \"\"\"
        # Updated tool logic here
        try:
            adapter = get_llm_adapter("gemini-2.5-flash-preview-04-17") # Or choose model dynamically
            history = [StandardizedMessage(role="user", content=query_for_llm)]
            config = StandardizedLLMConfig()
            llm_response = await adapter.generate_content(
                model_name="gemini-2.5-flash-preview-04-17",
                history=history,
                config=config
            )
            if llm_response.error:
                llm_insight = f"LLM error: {{llm_response.error}}"
            else:
                llm_insight = llm_response.text_content
            return {{"original_param": param1, "llm_insight": llm_insight}}
        except Exception as e:
            return {{"original_param": param1, "llm_error": str(e)}}

    if __name__ == "__main__":
        mcp.run()
    ```
Do NOT include any explanatory text, comments, or introductions before or after the Python code block.
Only the code block.
"""

@mcp.tool()
async def create_dynamic_mcp_server(
    user_number: str, # Now mandatory, acts as user_id
    user_request: str,
    server_name_suggestion: Optional[str] = None,
    llm_model: str = "gemini-2.5-pro-preview-05-06"
) -> dict:
    """
    Dynamically generates and deploys a new MCP server for the specified user based on a natural language request.
    Uses an LLM to write the server code, saves it to the user's dedicated directory, 
    and then registers it with the main MCP service under the user's scope.
    The LLM will be informed of other existing MCP tools, so it can generate a server that calls tools on other MCP servers if appropriate for the request.
    WARNING: This tool executes LLM-generated code. Use with extreme caution.

    Args:
        user_number (str): The user's unique identifier. This is critical for scoping the server.
        user_request (str): The natural language request describing the desired MCP server and its tools.
        server_name_suggestion (Optional[str]): A suggested name for the server instance and its file.
                                               Example: "UtilityToolsServer" or "DataProcessingServer".
        llm_model (str): The LLM model to use for code generation.
    Returns:
        dict: A dictionary containing the status, message, path to the generated script,
              the server instance name used in the script, and the response from the server registration attempt.
    """
    if not user_number or user_number == "--user_number_not_needed--":
        return {"status": "error", "message": "user_number (user_id) is required to create a dynamic server."}

    user_id_safe = sanitize_for_path(user_number)
    server_instance_name = server_name_suggestion or f"DynamicServer_{user_id_safe}_{uuid.uuid4().hex[:4]}"
    
    py_filename_suggestion = server_name_suggestion or f"{server_instance_name.split('_')[0]}_{uuid.uuid4().hex[:8]}"
    py_filename_safe = sanitize_for_path(py_filename_suggestion)
    if not py_filename_safe.endswith(".py"):
        py_filename_safe += ".py"

    script_absolute_path, script_path_relative_to_project_root = get_user_server_script_path(user_id_safe, py_filename_safe)

    # Fetch all available tools from mcp_service to inform the LLM
    all_tools_list_str = "An error occurred fetching the list of other available MCP tools, or none were found."
    try:
        list_all_servers_endpoint = f"{MCP_SERVICE_BASE_URL}/admin/servers/list_all_known"
        logger.debug(f"[DynamicServerCreation] Fetching all known tools from: {list_all_servers_endpoint}")
        response = await asyncio.to_thread(requests.get, list_all_servers_endpoint, timeout=15)
        response.raise_for_status()
        all_servers_data = response.json()
        
        available_tools_for_prompt = []
        if all_servers_data.get("servers"):
            unique_tools_map = {} # tool_name -> server_display_name
            for server_detail in all_servers_data["servers"]:
                if server_detail.get("is_running"): # Only consider tools from running servers
                    tools_provided = server_detail.get("tools_provided", [])
                    if tools_provided: # Ensure there are tools
                        cmd_part = server_detail.get("command", "unknown_cmd").split('/')[-1]
                        args_list = server_detail.get("args", [])
                        arg0 = args_list[0].split('/')[-1] if args_list else ""
                        server_name_display = f"{cmd_part} {arg0}".strip()
                        if not server_name_display: server_name_display = server_detail.get("config_key", "Unknown Server")

                        for tool_name in tools_provided:
                            # Avoid listing tools that manage dynamic server creation itself to prevent trivial recursion by the LLM
                            # Also avoid listing tools from a server that might be named like the one being created.
                            # The goal is for the new server to call *other* utility/service tools.
                            if tool_name not in [
                                "create_dynamic_mcp_server", "update_dynamic_mcp_server", 
                                "admin_add_mcp_server_process", "admin_remove_mcp_server_configuration",
                                "import_user_mcp_server", "view_dynamic_mcp_server_code",
                                "list_global_mcp_servers_status", "list_user_enabled_mcp_servers", # Less critical but also management-focused
                                "set_my_mcp_server_preferences" # This tool is also removed now
                            ] and (server_instance_name.lower() not in server_name_display.lower()): # Basic check to avoid self-reference
                                if tool_name not in unique_tools_map: # Add if new, prefer first encountered server name for simplicity
                                    unique_tools_map[tool_name] = server_name_display
            
            if unique_tools_map:
                formatted_tools_for_prompt = []
                for tool_name, server_display in unique_tools_map.items():
                    formatted_tools_for_prompt.append(f"    - `{tool_name}` (likely available on a server like '{server_display}')")
                if formatted_tools_for_prompt:
                    all_tools_list_str = "If your new server needs to perform tasks already handled by other specialized servers, consider calling their tools. You can use the `call_another_mcp_tool` helper for this. Here are some potentially callable tools from other active MCP servers:\n" + "\n".join(formatted_tools_for_prompt)
                else:
                    all_tools_list_str = "No other general-purpose MCP tools (excluding self-management tools) appear to be available for inter-server calls from different servers right now."
        logger.debug(f"[DynamicServerCreation] String of discoverable tools for prompt: {all_tools_list_str}")

    except Exception as e:
        logger.warning(f"[DynamicServerCreation] Could not fetch or parse list of all available tools: {str(e)}. The LLM will not be explicitly informed about them.", exc_info=True)
        # all_tools_list_str will retain its default error/empty message

    system_prompt = CODE_GEN_SYSTEM_PROMPT_TEMPLATE.format(
        server_instance_name=server_instance_name,
        available_mcp_tools_list_str=all_tools_list_str # Inject the discovered tools list
    )

    adapter = get_llm_adapter(model_name=llm_model)
    history_content = (
        f"User ID: '{user_id_safe}'\n"
        f"User request for new MCP server (to be named '{server_instance_name}' internally):\n{user_request}"
        f"\nThe filename will be '{py_filename_safe}' in the user's directory."
    )
    history = [StandardizedMessage(role="user", content=history_content)]
    config = StandardizedLLMConfig(system_prompt=system_prompt)

    try:
        logger.info(f"[DynamicServerCreation] User: {user_id_safe}, Request: '{user_request[:100]}...', ServerName: {server_instance_name}, Script: {py_filename_safe}, LLM: {llm_model}")

        logger.debug(f"[DynamicServerCreation] Calling LLM for code generation. History content: {history_content[:300]}...")
        llm_response = await adapter.generate_content(
            model_name=llm_model,
            history=history,
            tools=None,
            config=config
        )

        if llm_response.error:
            return {"status": "error", "message": f"LLM API error during code generation: {llm_response.error}"}
        
        response_text = llm_response.text_content
        logger.debug(f"[DynamicServerCreation] LLM raw response text (first 500 chars): {response_text[:500]}")

        if not response_text:
            logger.error("[DynamicServerCreation] LLM returned no content.")
            return {"status": "error", "message": "LLM returned no content for server code generation."}

        code_match = re.search(r'```python\s*([\s\S]+?)\s*```', response_text, re.DOTALL)
        if not code_match:
            code_match = re.search(r'```\s*([\s\S]+?)\s*```', response_text, re.DOTALL) # Fallback for no lang id
            if not code_match:
                 return {
                    "status": "error", 
                    "message": "Could not extract Python code from LLM response. Expected a markdown code block.",
                    "llm_response": response_text[:500] 
                }
        
        python_code = code_match.group(1).strip()
        logger.debug(f"[DynamicServerCreation] Extracted Python code (first 500 chars): {python_code[:500]}")

        if not ("from mcp.server.fastmcp import FastMCP" in python_code and 
                "@mcp.tool()" in python_code and 
                "mcp.run()" in python_code):
            logger.error(f"[DynamicServerCreation] Generated code for {py_filename_safe} does not appear to be a valid MCP server.")
            return {
                "status": "error", 
                "message": "Generated code does not appear to be a valid MCP server.",
                "generated_code_snippet": python_code[:500]
            }

        logger.debug(f"[DynamicServerCreation] Attempting to write generated code to {script_absolute_path}")
        with open(script_absolute_path, 'w', encoding='utf-8') as f:
            f.write(python_code)
        logger.info(f"[DynamicServerCreation] Generated MCP server code for user {user_id_safe} saved to: {script_absolute_path}")

        # Register the new server with the main MCP service under the user's scope
        add_server_payload = {
            "user_id": user_id_safe, # Critical: associate with this user
            "command": "python",
            # Path relative to mcp_service.py CWD (project root)
            "args": [script_path_relative_to_project_root], 
            "env": {} 
        }
        # Use the new user-scoped endpoint
        add_server_endpoint = f"{MCP_SERVICE_BASE_URL}/admin/users/add_server" 
        
        logger.info(f"[DynamicServerCreation] Attempting to register new server. User: {user_id_safe}, Endpoint: {add_server_endpoint}, Payload: {add_server_payload}")
        
        http_response = await asyncio.to_thread(
            requests.post, add_server_endpoint, json=add_server_payload, timeout=30
        )
        logger.debug(f"[DynamicServerCreation] Registration attempt response status: {http_response.status_code}, body: {http_response.text[:300]}")
        http_response.raise_for_status()
        admin_add_response = http_response.json()
        
        logger.info(f"[DynamicServerCreation] Registration response JSON for user {user_id_safe}: {admin_add_response}")

        if admin_add_response.get("status") == "success":
            logger.info(f"[DynamicServerCreation] Successfully generated and registered server '{server_instance_name}' for user {user_id_safe}.")
            return {
                "status": "success",
                "message": f"Successfully generated and registered MCP server '{server_instance_name}' (script: {py_filename_safe}) for user {user_id_safe}.",
                "user_id": user_id_safe,
                "server_script_filename": py_filename_safe,
                "server_instance_name": server_instance_name,
                "server_script_path_relative": script_path_relative_to_project_root,
                "registration_details": admin_add_response.get("message")
            }
        else:
            logger.error(f"[DynamicServerCreation] Server script generated for {user_id_safe}, but registration failed: {admin_add_response.get('message', 'Unknown error')}")
            return {
                "status": "error",
                "message": f"Generated server script '{py_filename_safe}' for user {user_id_safe}, but failed to register it: {admin_add_response.get('message', 'Unknown error')}",
                "user_id": user_id_safe,
                "server_script_filename": py_filename_safe,
                "server_instance_name": server_instance_name,
                "registration_response": admin_add_response
            }

    except requests.exceptions.HTTPError as e:
        error_detail = f"HTTP error calling admin endpoint: {e.response.status_code} - {e.response.text if e.response else 'No response body'}"
        logger.error(f"[DynamicServerCreation] {error_detail}", exc_info=True)
        return {"status": "error", "message": error_detail, "user_id": user_id_safe, "server_script_filename": py_filename_safe if 'py_filename_safe' in locals() else 'unknown'}
    except requests.exceptions.RequestException as e:
        error_detail = f"Network error trying to register server for user {user_id_safe}: {str(e)}"
        logger.error(f"[DynamicServerCreation] {error_detail}", exc_info=True)
        return {"status": "error", "message": error_detail, "user_id": user_id_safe, "server_script_filename": py_filename_safe if 'py_filename_safe' in locals() else 'unknown'}
    except Exception as e:
        import traceback
        logger.error(f"[DynamicServerCreation] Unexpected error for user {user_id_safe}: {str(e)}", exc_info=True)
        return {"status": "error", "message": f"An unexpected error occurred: {str(e)}"}

@mcp.tool()
async def update_dynamic_mcp_server(
    user_number: str, # Now mandatory
    server_script_filename: str,
    update_request: str,
    llm_model: str = "gemini-2.5-pro-preview-05-06"
) -> dict:
    """
    Updates an existing dynamically generated MCP server for the specified user.
    Reads the existing server code from the user's directory, uses an LLM to modify it, 
    overwrites the script, and then triggers a reload of the server in the main MCP service under the user's scope.
    WARNING: This tool executes LLM-generated code. Use with extreme caution.

    Args:
        user_number (str): The user's unique identifier who owns the server.
        server_script_filename (str): The filename of the MCP server script to update (e.g., 'my_utility_server.py').
                                      This file must exist in the user's 'generated_mcp_servers/' directory.
        update_request (str): The natural language request describing the desired changes to the server.
        llm_model (str): The LLM model to use for code generation.
    Returns:
        dict: A dictionary containing the status and message of the update operation.
    """
    if not user_number or user_number == "--user_number_not_needed--":
        return {"status": "error", "message": "user_number (user_id) is required to update a dynamic server."}
    if not server_script_filename.endswith(".py"):
        # Sanitize just in case, though it should already be a .py from creation
        server_script_filename = sanitize_for_path(server_script_filename)
        if not server_script_filename.endswith(".py"):
             server_script_filename += ".py"


    user_id_safe = sanitize_for_path(user_number)
    script_filename_safe = sanitize_for_path(server_script_filename) # Ensure filename is safe

    script_absolute_path, script_path_relative_to_project_root = get_user_server_script_path(user_id_safe, script_filename_safe)

    if not os.path.exists(script_absolute_path):
        return {"status": "error", "message": f"Server script '{script_filename_safe}' not found for user '{user_id_safe}' at '{script_absolute_path}'."}

    try:
        with open(script_absolute_path, 'r', encoding='utf-8') as f:
            existing_code = f.read()
    except Exception as e:
        return {"status": "error", "message": f"Failed to read existing server code for user {user_id_safe} from '{script_absolute_path}': {str(e)}"}

    extracted_instance_name = "UnknownServerName"
    name_match = re.search(r"""FastMCP\s*\(\s*['"](.*?)['"]\s*\)""", existing_code)
    if name_match:
        extracted_instance_name = name_match.group(1)

    system_prompt = CODE_UPDATE_SYSTEM_PROMPT_TEMPLATE 
    adapter = get_llm_adapter(model_name=llm_model)
    history_content = (
        f"You are updating the MCP server script '{script_filename_safe}' for user ID '{user_id_safe}'.\n"
        f"The current server instance name appears to be '{extracted_instance_name}'. Preserve or update it as appropriate.\n\n"
        f"User's update request:\n{update_request}\n\n"
        f"Current code of '{script_filename_safe}':\n"
        f"```python\n{existing_code}\n```\n\n"
        f"Please provide the complete, updated Python code for the entire script."
    )
    history = [StandardizedMessage(role="user", content=history_content)]
    config = StandardizedLLMConfig(system_prompt=system_prompt)

    try:
        logger.info(f"[DynamicServerUpdate] User: {user_id_safe}, Script: {script_filename_safe}, UpdateRequest: '{update_request[:100]}...', LLM: {llm_model}")
        logger.debug(f"[DynamicServerUpdate] Existing code (first 500 chars): {existing_code[:500]}")
        logger.debug(f"[DynamicServerUpdate] Calling LLM for code update. History content: {history_content[:300]}...")
        llm_response = await adapter.generate_content(
            model_name=llm_model,
            history=history,
            tools=None,
            config=config
        )

        if llm_response.error:
            return {"status": "error", "message": f"LLM API error during code update: {llm_response.error}"}

        response_text = llm_response.text_content
        logger.debug(f"[DynamicServerUpdate] LLM raw response text (first 500 chars): {response_text[:500]}")

        if not response_text:
            logger.error("[DynamicServerUpdate] LLM returned no content for server code update.")
            return {"status": "error", "message": "LLM returned no content for server code update."}

        code_match = re.search(r'```python\s*([\s\S]+?)\s*```', response_text, re.DOTALL)
        if not code_match:
            code_match = re.search(r'```\s*([\s\S]+?)\s*```', response_text, re.DOTALL)
            if not code_match:
                return {
                    "status": "error",
                    "message": "Could not extract updated Python code from LLM response.",
                    "llm_response": response_text[:500]
                }
        
        updated_python_code = code_match.group(1).strip()
        logger.debug(f"[DynamicServerUpdate] Extracted updated Python code (first 500 chars): {updated_python_code[:500]}")

        if not ("from mcp.server.fastmcp import FastMCP" in updated_python_code and
                "mcp.run()" in updated_python_code): # @mcp.tool() might be removed if user requests it
            return {
                "status": "error",
                "message": "Updated code does not appear to be a valid MCP server (missing key elements).",
                "generated_code_snippet": updated_python_code[:500]
            }

        # --- Reload Logic for User-Specific Server ---
        # 1. Remove old server configuration from mcp_service for this user.
        server_config_to_manage = {
            "command": "python",
            "args": [script_path_relative_to_project_root], # Relative path from project root
            "env": {} 
        }
        remove_server_payload = {
            "user_id": user_id_safe, # Specify the user
            **server_config_to_manage 
        }
        remove_server_endpoint = f"{MCP_SERVICE_BASE_URL}/admin/users/remove_server"
        logger.info(f"[DynamicServerUpdate] Attempting to remove old config. User: '{user_id_safe}', Script: '{script_filename_safe}', Endpoint: {remove_server_endpoint}, Payload: {remove_server_payload}")
        
        try:
            remove_http_response = await asyncio.to_thread(
                requests.post, remove_server_endpoint, json=remove_server_payload, timeout=20
            )
            logger.debug(f"[DynamicServerUpdate] Remove old config response status: {remove_http_response.status_code}, body: {remove_http_response.text[:300]}")
            if remove_http_response.status_code == 200:
                 logger.info(f"[DynamicServerUpdate] Removal response for old config of '{script_filename_safe}' (user {user_id_safe}): {remove_http_response.json()}")
            elif remove_http_response.status_code == 404:
                 logger.info(f"[DynamicServerUpdate] Old config for '{script_filename_safe}' (user {user_id_safe}) not found by admin service for removal. Proceeding.")
            else:
                 logger.warning(f"[DynamicServerUpdate] Problem removing old config for '{script_filename_safe}' (user {user_id_safe}), status: {remove_http_response.status_code}, response: {remove_http_response.text[:200]}. Attempting to proceed with update anyway.")
        except requests.exceptions.RequestException as e:
            logger.warning(f"[DynamicServerUpdate] Network error trying to remove old server config for '{script_filename_safe}' (user {user_id_safe}): {str(e)}. Attempting to proceed with update anyway.")


        # 2. Save (overwrite) the updated code
        logger.debug(f"[DynamicServerUpdate] Attempting to write updated code to {script_absolute_path}")
        with open(script_absolute_path, 'w', encoding='utf-8') as f:
            f.write(updated_python_code)
        logger.info(f"[DynamicServerUpdate] Updated MCP server code for user {user_id_safe} saved to: {script_absolute_path}")

        # 3. Add the (updated) server configuration back for this user
        add_server_payload = {
            "user_id": user_id_safe, # Specify the user
             **server_config_to_manage
        }
        add_server_endpoint = f"{MCP_SERVICE_BASE_URL}/admin/users/add_server"
        logger.info(f"[DynamicServerUpdate] Attempting to add updated config. User: '{user_id_safe}', Script: '{script_filename_safe}', Endpoint: {add_server_endpoint}, Payload: {add_server_payload}")
        
        add_http_response = await asyncio.to_thread(
            requests.post, add_server_endpoint, json=add_server_payload, timeout=30
        )
        logger.debug(f"[DynamicServerUpdate] Add updated config response status: {add_http_response.status_code}, body: {add_http_response.text[:300]}")
        add_http_response.raise_for_status() 
        admin_add_response = add_http_response.json()
        logger.info(f"[DynamicServerUpdate] Response from /admin/users/add_server for updated script (user {user_id_safe}): {admin_add_response}")

        if admin_add_response.get("status") == "success":
            logger.info(f"[DynamicServerUpdate] Successfully updated and re-registered server '{script_filename_safe}' for user {user_id_safe}.")
            return {
                "status": "success",
                "message": f"Successfully updated and re-registered MCP server script '{script_filename_safe}' for user {user_id_safe}.",
                "user_id": user_id_safe,
                "server_script_filename": script_filename_safe,
                "registration_details": admin_add_response.get("message")
            }
        else:
            logger.error(f"[DynamicServerUpdate] Server script '{script_filename_safe}' (user {user_id_safe}) updated on disk, but re-registration failed: {admin_add_response.get('message', 'Unknown error')}")
            return {
                "status": "partial_error",
                "message": f"Server script '{script_filename_safe}' (user {user_id_safe}) was updated on disk, but failed to re-register: {admin_add_response.get('message', 'Unknown error')}",
                "user_id": user_id_safe,
                "server_script_filename": script_filename_safe,
                "registration_response": admin_add_response
            }

    except requests.exceptions.HTTPError as e:
        error_detail = f"HTTP error during update for user {user_id_safe}, script {script_filename_safe}: {e.response.status_code} - {e.response.text if e.response else 'No body'}"
        logger.error(f"[DynamicServerUpdate] {error_detail}", exc_info=True)
        return {"status": "error", "message": error_detail, "user_id": user_id_safe, "server_script_filename": script_filename_safe}
    except requests.exceptions.RequestException as e:
        error_detail = f"Network error during server update for user {user_id_safe}, script {script_filename_safe}: {str(e)}"
        logger.error(f"[DynamicServerUpdate] {error_detail}", exc_info=True)
        return {"status": "error", "message": error_detail, "user_id": user_id_safe, "server_script_filename": script_filename_safe}
    except Exception as e:
        import traceback
        logger.error(f"[DynamicServerUpdate] Unexpected error for user {user_id_safe}: {str(e)}", exc_info=True)
        return {"status": "error", "message": f"An unexpected error occurred: {str(e)}"}


@mcp.tool()
async def admin_add_mcp_server_process(user_id: str, command: str, args: Optional[List[str]] = None, env: Optional[Dict[str, str]] = None) -> dict:
    """
    Adds a new MCP server process for a specific user to the main MCP service.
    This is an admin-level tool to manually register a server process for a user.
    The server script specified in 'args' should typically reside in the user's designated directory.
    Args:
        user_id (str): The identifier of the user for whom to add this server.
        command (str): The command to execute for the new server (e.g., 'python').
        args (list, optional): A list of arguments for the command (e.g., ['user_data/users/USER_ID/generated_mcp_servers/my_server.py']).
                               The path here MUST be relative to the project root where mcp_service.py runs.
        env (dict, optional): A dictionary of environment variables for the new server process.
    Returns:
        dict: The response from the MCP service's /admin/users/add_server endpoint.
    """
    if not user_id:
        return {"status": "error", "message": "user_id is required."}

    payload = {
        "user_id": sanitize_for_path(user_id), # Sanitize user_id before sending
        "command": command,
        "args": args if args is not None else [],
        "env": env if env is not None else {}
    }
    endpoint = f"{MCP_SERVICE_BASE_URL}/admin/users/add_server" # User-scoped endpoint
    try:
        response = await asyncio.to_thread(requests.post, endpoint, json=payload, timeout=30)
        response.raise_for_status() 
        return response.json()
    except requests.exceptions.HTTPError as e:
        error_detail = f"HTTP error calling {endpoint}: {e.response.status_code} - {e.response.text}"
        print(error_detail, file=sys.stderr)
        return {"status": "error", "message": error_detail}
    except requests.exceptions.RequestException as e:
        error_detail = f"Error calling {endpoint}: {str(e)}"
        print(error_detail, file=sys.stderr)
        return {"status": "error", "message": error_detail}
    except Exception as e:
        error_detail = f"Unexpected error in admin_add_mcp_server_process: {str(e)}"
        print(error_detail, file=sys.stderr)
        return {"status": "error", "message": error_detail}

@mcp.tool()
async def admin_remove_mcp_server_configuration(
    user_id: Optional[str], 
    server_identifier: str
) -> dict:
    """
    Removes an MCP server configuration. If user_id is provided, it targets that user's server. 
    If user_id is None, it attempts to de-register a core server configuration (does not remove definition).
    This tool attempts to find the exact server configuration based on the identifier provided.

    Args:
        user_id (str, optional): The user identifier. If None, targets a core server.
        server_identifier (str): A string to identify the server (e.g., filename like 'my_server.py', 
                                 part of the config key, or command/args).
    Returns:
        dict: The response from the MCP service's /admin/users/remove_server endpoint after finding the config.
    """
    sanitized_uid = sanitize_for_path(user_id) if user_id else None
    
    # Find the exact configuration details first
    print(f"Attempting to find configuration for identifier '{server_identifier}' (User: {sanitized_uid or 'core'})")
    exact_config = await _find_server_config_details(sanitized_uid, server_identifier)
    
    if not exact_config:
        return {
            "status": "error", 
            "message": f"Could not uniquely identify the server configuration for identifier '{server_identifier}' (User: {sanitized_uid or 'core'}). No removal action taken."
        }
        
    print(f"Found exact config: {exact_config}. Proceeding with removal.")

    # Now construct the payload with the exact details found
    payload = {
        "user_id": sanitized_uid, # Use sanitized or None
        "command": exact_config.get("command"),
        "args": exact_config.get("args", []),
        "env": exact_config.get("env", {}) 
    }
    
    endpoint = f"{MCP_SERVICE_BASE_URL}/admin/users/remove_server" # User-scoped endpoint still used
    try:
        print(f"Calling remove endpoint {endpoint} with payload: {payload}")
        response = await asyncio.to_thread(requests.post, endpoint, json=payload, timeout=20) # Increased timeout slightly
        response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
        print(f"Removal response status: {response.status_code}, content: {response.text[:200]}")
        return response.json()
    except requests.exceptions.HTTPError as e:
        # Provide more detail from the HTTP error if possible
        error_detail = f"HTTP error calling {endpoint}: {e.response.status_code}"
        try:
            # Attempt to parse JSON error detail from the response body
            error_json = e.response.json()
            error_detail += f" - {error_json.get('detail', e.response.text)}"
        except ValueError: # Handle cases where response body is not JSON
            error_detail += f" - {e.response.text}"
        print(error_detail, file=sys.stderr)
        return {"status": "error", "message": error_detail}
    except requests.exceptions.RequestException as e:
        error_detail = f"Network error calling {endpoint}: {str(e)}"
        print(error_detail, file=sys.stderr)
        return {"status": "error", "message": error_detail}
    except Exception as e:
        error_detail = f"Unexpected error in admin_remove_mcp_server_configuration after finding config: {str(e)}"
        import traceback
        print(f"{error_detail}\n{traceback.format_exc()}", file=sys.stderr)
        return {"status": "error", "message": error_detail}

@mcp.tool()
async def list_global_mcp_servers_status(user_number: str, client_injected_context: str = "") -> dict:
    """
    Lists all globally known MCP server configurations (core and dynamically registered by ALL users),
    along with their current running status and the tools they provide.
    This provides a complete overview of all defined servers in the system and their operational state.
    Args:
        user_number (str): The user's identifier (may not be strictly needed for this global list, but kept for API consistency if endpoint requires it).
        client_injected_context (str): Context from the conversation (optional).
    Returns:
        dict: A dictionary with the list of all known server configurations, their status, and tools, or an error message.
    """
    # This tool now calls the global listing endpoint.
    # user_number is not strictly needed by the /admin/servers/list_all_known endpoint itself.
    global_list_endpoint = f"{MCP_SERVICE_BASE_URL}/admin/servers/list_all_known"
    try:
        response = await asyncio.to_thread(requests.get, global_list_endpoint, timeout=15)
        response.raise_for_status()
        data = response.json() # Expects AvailableServersResponse model
        
        readable_servers = []
        if data.get("servers"):
            for server_detail in data["servers"]: # server_detail is ServerDetail model
                status = "running" if server_detail.get("is_running") else "not running"
                tools_summary = ", ".join(server_detail.get("tools_provided", [])) if server_detail.get("tools_provided") and server_detail.get("is_running") else "No tools listed (or server not running)"
                
                owner_info = f"(Owner: {server_detail.get('owner_user_id')})" if server_detail.get('owner_user_id') else "(Core Server)"
                
                # Construct a display name from command and first arg
                cmd_part = server_detail.get("command", "unknown_cmd").split('/')[-1]
                args_list = server_detail.get("args", [])
                arg0 = args_list[0].split('/')[-1] if args_list else ""
                server_name_display = f"{cmd_part} {arg0}".strip()
                if not server_name_display: server_name_display = server_detail.get("config_key", "Unknown Config")


                readable_servers.append(f"Server '{server_name_display}' {owner_info} (System Status: {status}, Tools if enabled & running: {tools_summary})")
            
        if not readable_servers:
            return {"status": "success", "message": "No MCP server configurations are known to the system globally."}
            
        return {"status": "success", "message": "The following MCP server configurations are known globally (showing current status, potential tools, and owner):\n" + "\n".join(readable_servers)}
    except requests.exceptions.RequestException as e:
        return {"status": "error", "message": f"Failed to contact MCP service at {global_list_endpoint}: {str(e)}"}
    except Exception as e:
        return {"status": "error", "message": f"An unexpected error occurred: {str(e)}"}

@mcp.tool()
async def list_user_enabled_mcp_servers(user_number: str, client_injected_context: str = "") -> dict:
    """
    Lists ONLY the MCP servers (and their tools) that are CURRENTLY ACTIVE AND ENABLED for the current user's LLM session.
    Use this tool if the user asks "what servers/tools can I use right now?", "what's enabled for me?", or similar.
    This reflects the actual set of tools the LLM can execute based on current user preferences.
    Args:
        user_number (str): The user's identifier (automatically injected).
        client_injected_context (str): Context from the conversation (optional).
    Returns:
        dict: A dictionary with the list of currently active servers for the user, or an error message.
    """
    if not user_number:
        return {"status": "error", "message": "User number is required."}
    
    user_id_safe = sanitize_for_path(user_number) # Ensure user_id is sanitized for URL path
    endpoint = f"{MCP_SERVICE_BASE_URL}/users/{user_id_safe}/servers/active"
    try:
        response = await asyncio.to_thread(requests.get, endpoint, timeout=10)
        response.raise_for_status() 
        data = response.json()
        
        readable_servers = []
        if data.get("servers"):
            for server in data["servers"]:
                # For this endpoint, 'is_running' effectively means 'active and enabled for user'
                status = "active and enabled" if server.get("is_running") else "ERROR: Expected active server was reported as not running"
                tools_summary = ", ".join(server.get("tools_provided", [])) if server.get("tools_provided") else "No tools listed"
                
                owner_info = f"(Owner: {server.get('owner_user_id')})" if server.get('owner_user_id') else "(Core Server)"
                if server.get('owner_user_id') == user_id_safe: # If it's user's own server
                    owner_info = "(Your Server)"
                
                server_name_display = server.get("config_key")
                try:
                    config_data = json.loads(server.get("config_key", "{}"))
                    cmd_part = config_data.get("command", "unknown_command").split('/')[-1]
                    args_part = config_data.get("args", [])
                    arg0 = args_part[0].split('/')[-1] if args_part else ""
                    temp_name = f"{cmd_part} {arg0}".strip()
                    if temp_name: server_name_display = temp_name
                except:
                    pass

                readable_servers.append(f"Server '{server_name_display}' {owner_info} (Status: {status}, Tools: {tools_summary})")
        
        if not readable_servers:
            return {"status": "success", "message": "No MCP servers are currently active or enabled for you. You might need to select/enable some via preferences."}
            
        return {"status": "success", "message": "Your currently active and enabled MCP servers are:\n" + "\n".join(readable_servers)}

    except requests.exceptions.HTTPError as e:
        error_detail = f"HTTP error calling {endpoint}: {e.response.status_code} - {e.response.text if e.response else 'No response body'}"
        print(error_detail, file=sys.stderr)
        return {"status": "error", "message": error_detail}
    except requests.exceptions.RequestException as e:
        error_detail = f"Error calling {endpoint}: {str(e)}"
        print(error_detail, file=sys.stderr)
        return {"status": "error", "message": error_detail}
    except Exception as e:
        error_detail = f"Unexpected error in list_user_enabled_mcp_servers: {str(e)}"
        print(error_detail, file=sys.stderr)
        return {"status": "error", "message": error_detail}

@mcp.tool()
async def set_my_mcp_server_preferences(user_number: str, servers_to_enable: List[str] = None, servers_to_disable: List[str] = None, client_injected_context: str = "") -> dict:
    """
    Allows the user to enable or disable specific MCP servers they have access to.
    Users should refer to servers by their name or a key part of their description/command.
    Args:
        user_number (str): The user's identifier (automatically injected).
        servers_to_enable (List[str], optional): A list of server names/keywords to enable.
        servers_to_disable (List[str], optional): A list of server names/keywords to disable.
        client_injected_context (str): Context from the conversation.
    Returns:
        dict: A dictionary with the status of the operation.
    """
    if not user_number:
        return {"status": "error", "message": "User number is required."}
    if not servers_to_enable and not servers_to_disable:
        return {"status": "info", "message": "No servers specified to enable or disable."}

    user_id_safe = sanitize_for_path(user_number)
    try:
        # 1. Get all servers available to this user (their own + core)
        available_resp = requests.get(f"{MCP_SERVICE_BASE_URL}/users/{user_id_safe}/servers/available", timeout=10)
        available_resp.raise_for_status()
        available_servers_data = available_resp.json().get("servers", []) # List of ServerDetail
        
        server_name_to_key_map = {}
        for s_data_dict in available_servers_data: # s_data_dict is a ServerDetail dict
            cmd_part = s_data_dict.get("command", "").split('/')[-1]
            arg_part = s_data_dict.get("args", [])[0].split('/')[-1] if s_data_dict.get("args") else ""
            friendly_name_candidate = f"{cmd_part} {arg_part}".strip().lower()
            config_key = s_data_dict.get("config_key")
            if config_key:
                server_name_to_key_map[friendly_name_candidate] = config_key
                server_name_to_key_map[config_key.lower()] = config_key # Allow direct key usage (case-insensitive for query)
                # Also try to match by just the script name if it's a python script
                if cmd_part == "python" and arg_part.endswith(".py"):
                    server_name_to_key_map[arg_part.lower()] = config_key


        # 2. Get current user's selection
        current_selection_resp = requests.get(f"{MCP_SERVICE_BASE_URL}/users/{user_id_safe}/servers/selected", timeout=10)
        current_selection_resp.raise_for_status()
        current_selected_keys = set(current_selection_resp.json().get("selected_config_keys", []))

        # 3. Process enable/disable requests
        keys_to_enable_found = set()
        keys_to_disable_found = set()
        not_found_servers = []

        if servers_to_enable:
            for name_query in servers_to_enable:
                found_key = None
                name_query_lower = name_query.lower()
                # Try exact match on config key first
                if name_query_lower in server_name_to_key_map:
                    found_key = server_name_to_key_map[name_query_lower]
                else:  # Try substring match on friendly names
                    for friendly_name, conf_key in server_name_to_key_map.items():
                        if name_query_lower in friendly_name: 
                            found_key = conf_key
                            break
                if found_key:
                    keys_to_enable_found.add(found_key)
                else:
                    not_found_servers.append(name_query)
        
        if servers_to_disable:
            for name_query in servers_to_disable:
                found_key = None
                name_query_lower = name_query.lower()
                if name_query_lower in server_name_to_key_map:
                    found_key = server_name_to_key_map[name_query_lower]
                else:
                    for friendly_name, conf_key in server_name_to_key_map.items():
                        if name_query_lower in friendly_name:
                            found_key = conf_key
                            break
                if found_key:
                    keys_to_disable_found.add(found_key)
                else:
                    not_found_servers.append(name_query)

        if not_found_servers:
            return {"status": "warning", "message": f"Could not find servers matching: {', '.join(list(set(not_found_servers)))}. Please check server names and try again."}


        # Update selection
        new_selected_keys = (current_selected_keys - keys_to_disable_found) | keys_to_enable_found
        
        # 4. POST the new selection
        payload = {"selected_config_keys": list(new_selected_keys)}
        update_resp = requests.post(f"{MCP_SERVICE_BASE_URL}/users/{user_id_safe}/servers/selected", json=payload, timeout=10)
        update_resp.raise_for_status()
        
        return {"status": "success", "message": "Server preferences updated."}
        
    except requests.exceptions.RequestException as e:
        return {"status": "error", "message": f"Failed to contact MCP service: {str(e)}"}
    except Exception as e:
        return {"status": "error", "message": f"An unexpected error occurred: {str(e)}"}

@mcp.tool()
async def view_dynamic_mcp_server_code(user_number: str, server_script_filename: str) -> dict:
    """
    Displays the Python code of a specified dynamically generated MCP server for the given user.

    Args:
        user_number (str): The user's unique identifier who owns the server.
        server_script_filename (str): The filename of the MCP server script to view (e.g., 'my_utility_server.py').
                                      This file must exist in the user's 'generated_mcp_servers/' directory.
    Returns:
        dict: A dictionary containing the status, the filename, and the code content if successful, or an error message.
    """
    if not user_number or user_number == "--user_number_not_needed--":
        return {"status": "error", "message": "user_number (user_id) is required to view a dynamic server's code."}
    if not server_script_filename.endswith(".py"):
        return {"status": "error", "message": "server_script_filename must be a .py file."}

    user_id_safe = sanitize_for_path(user_number)
    script_filename_safe = sanitize_for_path(server_script_filename)

    script_absolute_path, _ = get_user_server_script_path(user_id_safe, script_filename_safe)

    if not os.path.exists(script_absolute_path):
        return {
            "status": "error",
            "user_id": user_id_safe,
            "filename": script_filename_safe,
            "message": f"Server script '{script_filename_safe}' not found for user '{user_id_safe}' at '{script_absolute_path}'."
        }

    try:
        with open(script_absolute_path, 'r', encoding='utf-8') as f:
            code_content = f.read()
        return {
            "status": "success",
            "user_id": user_id_safe,
            "filename": script_filename_safe,
            "code": code_content
        }
    except Exception as e:
        return {
            "status": "error",
            "user_id": user_id_safe,
            "filename": script_filename_safe,
            "message": f"Failed to read server code for user '{user_id_safe}' from '{script_absolute_path}': {str(e)}"
        }

# --- Helper function to find server config details ---
async def _find_server_config_details(user_id_safe: Optional[str], server_identifier: str) -> Optional[Dict[str, Any]]:
    """
    Queries the MCP service to find the full configuration details (command, args, env) 
    for a server based on a user ID and an identifier string.
    
    Args:
        user_id_safe (Optional[str]): The sanitized user ID, or None to search core servers.
        server_identifier (str): A string to identify the server (e.g., filename, config_key fragment).
        
    Returns:
        Optional[Dict[str, Any]]: The matched server config dict or None if not found/ambiguous.
    """
    target_endpoint = ""
    if user_id_safe:
        target_endpoint = f"{MCP_SERVICE_BASE_URL}/users/{user_id_safe}/servers/available"
    else:
        target_endpoint = f"{MCP_SERVICE_BASE_URL}/admin/servers/list_all_known" # Search core servers within the global list

    try:
        response = await asyncio.to_thread(requests.get, target_endpoint, timeout=15)
        response.raise_for_status()
        data = response.json()
        available_servers = data.get("servers", []) # List of ServerDetail dicts
    except requests.exceptions.RequestException as e:
        print(f"Error contacting MCP service at {target_endpoint} to find server: {str(e)}", file=sys.stderr)
        return None
    except Exception as e:
         print(f"Error processing server list from {target_endpoint}: {str(e)}", file=sys.stderr)
         return None

    matched_configs = []
    search_term = server_identifier.lower()

    for server_detail in available_servers:
        # Filter for core servers if user_id_safe is None
        if user_id_safe is None and server_detail.get("owner_user_id") is not None:
            continue
        # Filter for the specific user's servers if user_id_safe is provided
        # Note: /users/{uid}/available includes relevant core servers already
        # So no explicit check needed here if user_id_safe is not None
        
        config_key = server_detail.get("config_key", "").lower()
        command = server_detail.get("command", "").lower()
        args = server_detail.get("args", [])
        
        # Matching priorities:
        # 1. Exact config key match (case-insensitive)
        if config_key == search_term:
            matched_configs.append(server_detail)
            break # Exact key match is definitive

        # 2. Base filename match in args (if python command)
        if command == "python":
            for arg in args:
                if isinstance(arg, str) and arg.lower().endswith(f"/{search_term}"):
                     matched_configs.append(server_detail)
                     break # Found a matching python script filename

        # 3. Search term contained within config key
        if search_term in config_key and server_detail not in matched_configs:
             matched_configs.append(server_detail)

        # 4. Search term contained within args list items
        if any(search_term in str(arg).lower() for arg in args) and server_detail not in matched_configs:
            matched_configs.append(server_detail)

    if len(matched_configs) == 1:
        # Found a unique match, return its essential config parts
        match = matched_configs[0]
        return {
            "command": match.get("command"),
            "args": match.get("args", []),
            "env": match.get("env", {}) # Assumes env is part of ServerDetail, might need adjustment if not
        }
    elif len(matched_configs) > 1:
        print(f"Ambiguous server identifier '{server_identifier}' for user '{user_id_safe or 'core'}'. Found {len(matched_configs)} matches.", file=sys.stderr)
        return None
    else:
        print(f"No server configuration found matching identifier '{server_identifier}' for user '{user_id_safe or 'core'}'.", file=sys.stderr)
        return None

@mcp.tool()
async def import_user_mcp_server(
    owner_user_id: str,
    server_script_filename: str,
    user_number: str # Automatically injected current user
) -> dict:
    """
    Copies another user's dynamic MCP server script and configuration to the current user's scope,
    creating a new, independent instance of that server for the current user.
    WARNING: This runs code created by another user under your user ID. Use with caution.

    Args:
        owner_user_id (str): The user ID of the user who owns the server to be copied.
        server_script_filename (str): The filename of the server script to copy (e.g., 'utility_server.py').
        user_number (str): The current user's ID (automatically provided).
    Returns:
        dict: Status message indicating success or failure of the import and registration.
    """
    if not owner_user_id or not server_script_filename or not user_number:
        return {"status": "error", "message": "Owner user ID, server script filename, and current user number are required."}
    if not server_script_filename.endswith(".py"):
        return {"status": "error", "message": "server_script_filename must end with .py"}

    owner_id_safe = sanitize_for_path(owner_user_id)
    current_user_id_safe = sanitize_for_path(user_number)
    script_filename_safe = sanitize_for_path(server_script_filename)

    if owner_id_safe == current_user_id_safe:
        return {"status": "info", "message": "Cannot import a server from yourself."}

    print(f"User '{current_user_id_safe}' attempting to import '{script_filename_safe}' from owner '{owner_id_safe}'.")

    # 1. Find the original server's exact configuration details using the owner's ID
    print(f"Looking up original config for '{script_filename_safe}' under owner '{owner_id_safe}'...")
    original_config = await _find_server_config_details(owner_id_safe, script_filename_safe)

    if not original_config:
        return {
            "status": "error",
            "message": f"Could not find or uniquely identify the server script '{script_filename_safe}' belonging to user '{owner_id_safe}'."
        }

    # Ensure command is python and args exist
    if original_config.get("command") != "python" or not original_config.get("args"):
         return {
             "status": "error",
             "message": f"Cannot import server '{script_filename_safe}' from user '{owner_id_safe}'. Only Python script-based servers are currently supported for import."
         }
    
    original_args = original_config["args"]
    original_env = original_config.get("env", {})

    # 2. Determine source and destination script paths
    # Assume the path is the first argument (common pattern from create_dynamic_mcp_server)
    original_relative_path = None
    expected_prefix = f"user_data/users/{owner_id_safe}/generated_mcp_servers/"
    for arg in original_args:
        if isinstance(arg, str) and arg.startswith(expected_prefix) and arg.endswith(script_filename_safe):
            original_relative_path = arg
            break
            
    if not original_relative_path:
         return {
            "status": "error",
            "message": f"Could not determine the script path for '{script_filename_safe}' in the original server configuration args: {original_args}."
        }

    # Construct absolute source path (relative to project root where test_server runs)
    # Project Root -> original_relative_path
    source_script_absolute_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../', original_relative_path))

    if not os.path.exists(source_script_absolute_path):
        return {
            "status": "error",
            "message": f"Source script file not found at calculated path: {source_script_absolute_path}"
        }

    # Construct destination path for the current user
    dest_script_absolute_path, dest_script_relative_path = get_user_server_script_path(current_user_id_safe, script_filename_safe)

    if os.path.exists(dest_script_absolute_path):
        # Simple approach: fail if script with same name already exists for the current user
        return {
            "status": "error",
            "message": f"A server script named '{script_filename_safe}' already exists for you. Cannot overwrite."
            # Future enhancement: Allow renaming on import.
        }

    # 3. Copy the script file
    try:
        print(f"Copying script from '{source_script_absolute_path}' to '{dest_script_absolute_path}'...")
        os.makedirs(os.path.dirname(dest_script_absolute_path), exist_ok=True)
        await asyncio.to_thread(shutil.copy2, source_script_absolute_path, dest_script_absolute_path)
        print("Script copied successfully.")
    except Exception as e:
        error_detail = f"Failed to copy script file: {str(e)}"
        print(error_detail, file=sys.stderr)
        return {"status": "error", "message": error_detail}

    # 4. Prepare the new configuration for the current user
    # Replace the old path in args with the new relative path
    new_args = [dest_script_relative_path if arg == original_relative_path else arg for arg in original_args]
    
    new_server_payload = {
        "user_id": current_user_id_safe,
        "command": "python", # Keep original command
        "args": new_args,   # Use adjusted args
        "env": original_env # Keep original env
    }

    # 5. Register the new server instance for the current user
    add_server_endpoint = f"{MCP_SERVICE_BASE_URL}/admin/users/add_server"
    try:
        print(f"Registering copied server for user '{current_user_id_safe}' via {add_server_endpoint} with payload: {new_server_payload}")
        response = await asyncio.to_thread(requests.post, add_server_endpoint, json=new_server_payload, timeout=30)
        response.raise_for_status()
        add_response_json = response.json()
        print(f"Registration response: {add_response_json}")

        if add_response_json.get("status") == "success":
            return {
                "status": "success",
                "message": f"Successfully imported server '{script_filename_safe}' from user '{owner_id_safe}' and started a new instance for you.",
                "details": add_response_json.get("message")
            }
        else:
            # Cleanup copied file if registration failed? Maybe not, user might want to debug.
            return {
                "status": "partial_error",
                "message": f"Copied script '{script_filename_safe}', but failed to register the new server instance for you: {add_response_json.get('message', 'Unknown error')}",
                "registration_response": add_response_json
            }
    except requests.exceptions.HTTPError as e:
        error_detail = f"HTTP error registering copied server: {e.response.status_code} - {e.response.text if e.response else 'No response body'}"
        print(error_detail, file=sys.stderr)
        return {"status": "error", "message": error_detail}
    except requests.exceptions.RequestException as e:
        error_detail = f"Network error registering copied server: {str(e)}"
        print(error_detail, file=sys.stderr)
        return {"status": "error", "message": error_detail}
    except Exception as e:
        import traceback
        error_detail = f"Unexpected error during registration of imported server: {str(e)}"
        print(f"{error_detail}\n{traceback.format_exc()}", file=sys.stderr)
        return {"status": "error", "message": error_detail}

if __name__ == "__main__":
    mcp.run() 