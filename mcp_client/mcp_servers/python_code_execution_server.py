import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
from fastmcp import FastMCP
import io
import contextlib
import re
from typing import Annotated, Literal, Optional, List, Dict, Any
from pydantic import BaseModel, Field
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
import ast # Added for robust code parsing
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

# --- Tool Schema Type Definition ---
# Using Dict instead of BaseModel to avoid JSON schema reference issues
ToolSchemaDict = Dict[str, Any]  # Expected keys: name, description, input_schema, output_schema

@mcp.tool()
async def execute_python_code(
    python_code: Annotated[str, Field(description="The Python code to execute. Can be any valid Python code including imports, function definitions, loops, etc.")],
    capture_output: Annotated[bool, Field(description="Whether to capture and return stdout/stderr output from the code execution.")] = True,
    timeout_seconds: Annotated[int, Field(description="Maximum time in seconds to allow the code to run before timing out.")] = 30,
    caller_user_id: Annotated[Optional[str], Field(description="Optional User ID for context. This ID will be available as an environment variable `CALLER_USER_ID` within the executed code and should be passed to internal tool/query calls if context is needed.")] = None
) -> dict:
    """
    Executes arbitrary Python code and returns the result.
    
    The executed code runs in an environment where it can make calls to other MCP services:
    1. General AI Queries:
       - Endpoint: `http://localhost:5001/query` (POST)
       - Headers: `{"X-Internal-API-Key": os.getenv("MCP_INTERNAL_API_KEY"), "Content-Type": "application/json"}`
       - Payload: Must include `query` (str), `user_id` (str, use `os.getenv("CALLER_USER_ID")`), and `final_response_json_schema` (dict).
       - Example:
         ```python
         # import os, json, requests
         # user_id = os.getenv("CALLER_USER_ID")
         # api_key = os.getenv("MCP_INTERNAL_API_KEY")
         # headers = {"X-Internal-API-Key": api_key, "Content-Type": "application/json"}
         # payload = {
         #   "query": "Summarize this text: ...",
         #   "user_id": user_id,
         #   "final_response_json_schema": {"type": "object", "properties": {"summary": {"type": "string"}}}
         # }
         # response = requests.post("http://localhost:5001/query", headers=headers, json=payload)
         # summary_data = response.json() # Process summary_data['response']
         ```

    2. Internal MCP Tool Calls:
       - Endpoint: `http://localhost:5001/internal/call_mcp_tool` (POST)
       - Headers: `{"X-Internal-API-Key": os.getenv("MCP_INTERNAL_API_KEY"), "Content-Type": "application/json"}`
       - Payload: Must include `tool_name` (str), `arguments` (dict), and `user_id_context` (str, use `os.getenv("CALLER_USER_ID")`).
       - Example:
         ```python
         # import os, json, requests
         # user_id = os.getenv("CALLER_USER_ID")
         # api_key = os.getenv("MCP_INTERNAL_API_KEY")
         # headers = {"X-Internal-API-Key": api_key, "Content-Type": "application/json"}
         # payload = {
         #   "tool_name": "generate_image_with_prompts",
         #   "arguments": {"prompt": "A blue cat", "width": 512, "height": 512},
         #   "user_id_context": user_id
         # }
         # response = requests.post("http://localhost:5001/internal/call_mcp_tool", headers=headers, json=payload)
         # image_data = response.json() # Process image_data['result']
         ```
    The environment variables `MCP_INTERNAL_API_KEY` and `CALLER_USER_ID` (if provided to this tool)
    will be available to the executed Python code via `os.getenv()`.

    This tool provides an environment to run Python code with captured output and timeout.
    The code runs in an isolated namespace but has access to common libraries.
    It attempts to return the result of the last expression in the script if applicable.
    
    Warning: This tool executes arbitrary code and is NOT sandboxed for security.
    It has the same permissions as the server process (filesystem, network, etc.).
    Use with extreme caution and only with trusted code.

    Returns:
        dict: A dictionary containing:
            - 'status' (str): 'success' or 'error'
            - 'output' (str): Captured stdout if capture_output=True
            - 'error_output' (str): Captured stderr if there were errors
            - 'result' (Any): The final expression result if the code ends with an expression, otherwise None
            - 'execution_time' (float): Time taken to execute in seconds
            - 'message' (str): Human-readable status message
    """
    import time
    import traceback
    import sys
    from io import StringIO
    import threading

    start_time = time.time()
    
    execution_globals = {
        '__builtins__': __builtins__,
        'os': os,
        'sys': sys,
        'json': json,
        'requests': requests,
        'datetime': datetime,
        'uuid': uuid,
        'asyncio': asyncio,
        'inspect': inspect,
        'Path': Path,
        're': re,
        'io': io,
        'contextlib': contextlib,
        'logging': logging,
        'time': time,
        'traceback': traceback
        # Note: For security, consider providing a more restricted __builtins__
    }
    # Make caller_user_id available as an environment variable within the exec context
    # This is a common pattern for passing contextual info to sub-processes/exec'd code.
    # The actual `os.environ` is not modified here for safety; instead, we simulate it
    # for the `exec` environment by updating `execution_globals['os'].environ` if needed,
    # or more simply, just ensure `os.getenv` within the exec'd code can see it.
    # A cleaner way is to inject it directly into globals if `os.getenv` is not strictly needed
    # and direct variable access is acceptable.
    # For now, the executed code should rely on `os.getenv("CALLER_USER_ID")` and `os.getenv("MCP_INTERNAL_API_KEY")`
    # which will be setup by the MCP system when the python_code_execution_server itself runs.
    # The `caller_user_id` parameter of this tool is passed to the internal MCP system,
    # which should make it available via `os.getenv("CALLER_USER_ID")`.

    execution_locals = {}
    
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    stdout_capture = StringIO()
    stderr_capture = StringIO()
    
    result = None
    error_occurred = False
    timeout_occurred = False
    
    # --- Timeout Handling ---
    timeout_event = threading.Event()
    def timeout_handler_func():
        nonlocal timeout_occurred
        timeout_occurred = True
        timeout_event.set() # Signal timeout

    timer = threading.Timer(timeout_seconds, timeout_handler_func)
    
    response_message = "Code execution initiated." # Default message

    try:
        timer.start() # Start the timeout timer

        if capture_output:
            sys.stdout = stdout_capture
            sys.stderr = stderr_capture

        # Initial strip for whitespace from the input python_code
        processed_code = python_code.strip()

        # Check for and remove leading/trailing triple quotes (single or double)
        # This handles cases where the entire script might be wrapped in a multi-line string.
        if processed_code.startswith("'''") and processed_code.endswith("'''") and len(processed_code) >= 6:
            processed_code = processed_code[3:-3].strip()
        elif processed_code.startswith('"""') and processed_code.endswith('"""') and len(processed_code) >= 6:
            processed_code = processed_code[3:-3].strip()

        if not processed_code: # Check if empty after all stripping
            response_message = "No code provided to execute."
            # result remains None
        else:
            # Attempt to compile as a single expression first (for simple cases like "2+2")
            try:
                if timeout_event.is_set(): # Check before potentially long compile
                    raise TimeoutError(f"Execution timed out before compilation after {timeout_seconds} seconds.")
                code_obj_eval = compile(processed_code, '<string>', 'eval')
                
                if timeout_event.is_set(): # Check before potentially long eval
                    raise TimeoutError(f"Execution timed out before eval after {timeout_seconds} seconds.")
                result = eval(code_obj_eval, execution_globals, execution_locals)
                response_message = "Code (as single expression) executed successfully."

            except SyntaxError:
                # Not a simple expression, or multi-line code. Use exec with AST modification.
                if timeout_event.is_set():
                     raise TimeoutError(f"Execution timed out before AST parsing after {timeout_seconds} seconds.")
                
                parsed_ast = ast.parse(processed_code) # Can raise SyntaxError for fundamentally broken code
                _temp_result_var_name = f"__EXEC_RESULT_{uuid.uuid4().hex}"

                if parsed_ast.body and isinstance(parsed_ast.body[-1], ast.Expr):
                    # The last statement is an expression. Modify AST to capture its result.
                    last_expr_statement_node = parsed_ast.body[-1]
                    assign_target = ast.Name(id=_temp_result_var_name, ctx=ast.Store())
                    assign_node = ast.Assign(targets=[assign_target], value=last_expr_statement_node.value)
                    ast.copy_location(assign_node, last_expr_statement_node)
                    ast.fix_missing_locations(assign_node)
                    parsed_ast.body[-1] = assign_node
                    
                    if timeout_event.is_set():
                        raise TimeoutError(f"Execution timed out before final exec (expr) after {timeout_seconds} seconds.")
                    code_obj_exec = compile(parsed_ast, '<string>', 'exec')
                    exec(code_obj_exec, execution_globals, execution_locals)
                    result = execution_locals.get(_temp_result_var_name)
                    response_message = "Code (script with final expression) executed successfully."
                else:
                    # Not ending with an expression or empty body, just exec normally
                    if timeout_event.is_set():
                         raise TimeoutError(f"Execution timed out before final exec (no expr) after {timeout_seconds} seconds.")
                    code_obj_exec = compile(parsed_ast, '<string>', 'exec')
                    exec(code_obj_exec, execution_globals, execution_locals)
                    # result remains None as there's no specific final expression to capture
                    response_message = "Code (script) executed successfully."
            
            if timeout_event.is_set(): # Final check after all execution paths
                raise TimeoutError(f"Execution timed out after {timeout_seconds} seconds during execution phase.")

    except TimeoutError as te:
        error_occurred = True
        # timeout_occurred is already true via handler or direct check
        timeout_occurred = True # Ensure it's set if exception came from direct check
        if capture_output:
            stderr_capture.write(f"TimeoutError: {str(te)}\n")
        # result might already hold an error dict if timeout happened within a sub-exception block
        if not (isinstance(result, dict) and "error" in result):
            result = {"error": str(te), "traceback": traceback.format_exc()}
        response_message = str(te)

    except SyntaxError as se:
        error_occurred = True
        if capture_output:
            stderr_capture.write(f"SyntaxError: {str(se)}\n")
            detailed_tb = traceback.format_exc()
            if str(se) not in detailed_tb:
                 stderr_capture.write(detailed_tb)
        result = {"error": str(se), "traceback": traceback.format_exc()}
        response_message = f"Syntax error in provided code: {str(se)}"
    except Exception as e:
        error_occurred = True
        # Check if it's a timeout that got wrapped as a general Exception
        if timeout_event.is_set() and not timeout_occurred: #If timeout flagged but not yet processed as TimeoutError
            timeout_occurred = True
            response_message = f"Execution likely timed out and raised: {str(e)}"
        else:
            response_message = f"Error during code execution: {str(e)}"

        if capture_output:
            stderr_capture.write(f"Error: {str(e)}\n")
            stderr_capture.write(traceback.format_exc())
        result = {"error": str(e), "traceback": traceback.format_exc()}
        
    finally:
        timer.cancel() # Always cancel the timer
        if capture_output:
            sys.stdout = old_stdout
            sys.stderr = old_stderr
    
    execution_time = time.time() - start_time
    
    final_status = "success"
    if error_occurred or timeout_occurred: # timeout_occurred flag is the most reliable
        final_status = "error"

    if timeout_occurred and not error_occurred : # If timeout was the primary reason and no other specific error was caught
        response_message = f"Code execution timed out after {timeout_seconds} seconds."
        # Ensure error output reflects timeout if not already detailed
        if capture_output and not stderr_capture.getvalue().strip() :
            stderr_capture.write(f"TimeoutError: Execution exceeded {timeout_seconds} seconds.\n")
    elif error_occurred and not response_message.startswith("Error") and not response_message.startswith("Syntax error") and not response_message.startswith("Execution timed out"):
        # Generic fallback if response_message wasn't set by a specific error handler
        response_message = "Code execution failed with an error."
    elif not error_occurred and not timeout_occurred and response_message == "Code execution initiated.":
        # If no errors, no timeout, and message is still default, means successful empty code or similar
        response_message = "Code executed (potentially no output or final expression)."


    final_response = {
        "status": final_status,
        "execution_time": round(execution_time, 6),
        "message": response_message
    }
    
    if capture_output:
        final_response["output"] = stdout_capture.getvalue()
        final_response["error_output"] = stderr_capture.getvalue()
    
    # Handle 'result' serialization and inclusion
    if final_status == "success":
        try:
            json.dumps(result) 
            final_response["result"] = result
        except (TypeError, OverflowError):
            final_response["result"] = str(result)
    elif isinstance(result, dict) and "error" in result: # If result is an error dict from an exception
        final_response["result"] = result
    else: # For other error cases or if result is None
        final_response["result"] = None if final_status == "success" else {"error": response_message}


    return final_response


# --- Templates for the generated server file ---

SERVER_TEMPLATE = """\
import sys
import os

# Ensure the project root is in sys.path
# This assumes the server file is in mcp_client/mcp_servers/
# and the project root is two levels up from there.
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)

from fastmcp import FastMCP
from typing import Annotated, Optional # Add other common types like Literal, List, Dict if needed
from pydantic import Field
import logging
# import asyncio # Uncomment if your tools are async

# Configure basic logging for the new server
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

mcp = FastMCP(name={server_name_repr}, description={server_description_repr})

logger.info(f"MCP Server '{{mcp.name}}' initialized.")

# --- Tool Definitions ---
{example_tool_placeholder}
# Add your MCP tools here, for example:
# @mcp.tool()
# def my_custom_tool(param1: Annotated[str, Field(description="Description for param1")] = "default") -> dict:
#     logger.info(f"my_custom_tool called with param1: {{param1}}")
#     # Your tool logic here
#     return {{"result": f"Processed: {{param1}}"}}

# --- End Tool Definitions ---

if __name__ == "__main__":
    logger.info(f"Starting MCP Server '{{mcp.name}}'...")
    mcp.run()
"""

EXAMPLE_TOOL_TEMPLATE = """
@mcp.tool()
def example_tool(
    name: Annotated[str, Field(description="Your name to be included in the greeting.", default="World")]
) -> str:
    \"\"\"
    A simple example tool that returns a greeting.
    This tool is part of the '{server_name}' server.
    \"\"\"
    logger.info(f"example_tool called with name: {{name}}")
    greeting = f"Hello, {{name}}! This is an example tool from the '{server_name}' server."
    logger.info(f"example_tool returning: {{greeting}}")
    return greeting
"""

if __name__ == "__main__":
    # Check if we should use HTTP transport
    transport = os.getenv("FASTMCP_TRANSPORT", "stdio")
    
    if transport == "streamable-http":
        host = os.getenv("FASTMCP_HOST", "127.0.0.1")
        port = int(os.getenv("FASTMCP_PORT", "9000"))
        logger.info(f"Starting server with streamable-http transport on {host}:{port}")
        mcp.run(transport="streamable-http", host=host, port=port)
    else:
        logger.info("Starting server with stdio transport")
        mcp.run() 