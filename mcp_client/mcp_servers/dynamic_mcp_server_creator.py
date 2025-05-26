import sys
import os
import json
import requests
import re
import asyncio

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
from mcp.server.fastmcp import FastMCP
from typing import Annotated, Optional, List, Dict, Any, Literal
from pydantic import Field

# --- LLM Adapter Imports ---
from llm_adapters import (
    get_llm_adapter,
    StandardizedMessage,
    StandardizedLLMConfig
)

# --- Supported LLM Models (copied from document_generation_server.py for now) ---
MODELS_LITERAL = Literal[
    "gemini-2.5-flash-preview-05-20",
    "gemini-2.5-pro-preview-05-06",
    "models/gemini-2.0-flash",
    "gemini-2.0-flash",
    "claude-3-7-sonnet-latest",
    "gpt-4.1-2025-04-14",
    "o4-mini-2025-04-16"
]
# SUPPORTED_MODELS_TUPLE could also be copied if needed for validation, but Literal is key for Field annotation.

# --- System Prompt for Tool Code Generation ---
NEW_SERVER_GENERATION_SYSTEM_PROMPT = """You are an expert Python programmer specializing in creating complete, functional MCP (Model Context Protocol) server files.
Your task is to generate the entire Python code for a new MCP server.

You will be given:
1.  The user's natural language request describing the server's overall purpose, the tools it should contain, their functionalities, inputs, and outputs.
2.  A description for the FastMCP instance (e.g., "My Custom Data Processing Server").

Your generated Python code MUST:
-   Be a single, complete Python file.
-   Include all necessary standard Python imports (e.g., `os`, `json`, `sys`, `typing`, `asyncio`).
-   Import `FastMCP` from `mcp.server.fastmcp`.
-   Import `Annotated`, `Field` from `typing` and `pydantic` respectively, if your tools use them.
-   Instantiate FastMCP using the provided description: `mcp = FastMCP("YOUR_MCP_SERVER_DESCRIPTION_HERE")`. The description you should use will be explicitly provided.
-   Define one or more asynchronous tool functions, each decorated with `@mcp.tool()`.
    -   Each tool function must accept `user_number: Annotated[str, Field(description="User identifier, typically a phone number, passed by the MCP system.")]` as its first parameter. You may add other parameters as needed.
    -   Tool parameters should be clearly defined using `Annotated` and `Field` for descriptions and default values if applicable.
    -   Tool return types should be clearly annotated (e.g., `-> Dict[str, Any]`, `-> str`, `-> List[Dict[str, Any]]`).
-   Implement the logic for each tool as described in the user's request. Tools should be robust and handle potential errors gracefully, returning informative error messages in their standard response structure (usually a dictionary with an "error" key).
-   Include the main execution block: `if __name__ == "__main__": mcp.run()`.
-   Ensure the generated code is runnable as a standalone MCP server.
-   Output the entire Python code file content enclosed in a single markdown code block formatted as ```python\n[your code here]\n```. Do NOT include any explanatory text outside this code block.
-   The first line of your Python code (after the ```python opening fence) should be an import statement (e.g., `import sys`), with no preceding comments or blank lines unless it's part of the Python code itself.
-   If a tool needs to access external libraries (e.g., `requests`, `beautifulsoup4`), assume they are available in the execution environment. You should include the import statements for these libraries at the top of the file.

**Streaming Intermediate Updates from Tools:**
-   If a tool's operation is long-running and can provide intermediate progress or data, it should be an `async def` function that `yields` a sequence of dictionaries.
-   **Intermediate Update Dictionaries:** Each dictionary yielded as an intermediate update MUST contain a special key-value pair: `"mcp_stream_intermediate_update": True`. It can also contain other keys like `"message": "Status update...", "percentage": 50, "details": {...}`. These updates will be streamed to the client.
-   **Final Result Dictionary:** The VERY LAST dictionary yielded by such a streaming tool MUST be its actual final result. This final dictionary should NOT contain the `"mcp_stream_intermediate_update": True` key. It should represent the complete and final output of the tool.
-   If a tool does not need to stream intermediate updates, it should simply `return` a single dictionary as its result (the standard behavior).
-   A_STANDARD_MCP_TOOL_RESPONSE_IS_A_DICTIONARY (e.g. `return {"status": "success", "data": "..."}` or `return {"error": "something went wrong"}`). Strive to make your tools return dictionaries for the final result.

Example of a tool that streams intermediate updates:
```python
@mcp.tool()
async def long_process_with_updates(
    user_number: Annotated[str, Field(description="User ID.")],
    iterations: Annotated[int, Field(description="Number of iterations.")]
) -> Dict[str, Any]: # Annotation is for the FINAL result
    \"\"\"
    A tool that performs a long task and yields progress updates.
    \"\"\"
    yield {"mcp_stream_intermediate_update": True, "message": "Starting process...", "percentage": 0}
    
    for i in range(iterations):
        await asyncio.sleep(0.5) # Simulate work
        percentage_done = ((i + 1) / iterations) * 100
        yield {
            "mcp_stream_intermediate_update": True,
            "message": f"Processed iteration {i+1}/{iterations}",
            "percentage": round(percentage_done, 2),
            "current_iteration": i + 1
        }
        
    # Final result (does NOT contain "mcp_stream_intermediate_update")
    yield {"status": "complete", "total_iterations_processed": iterations, "summary": "All iterations finished successfully."}

Example of a simple server structure (non-streaming tool):
```python
import sys
import os
from typing import Annotated, Dict, Any, Optional, List
from pydantic import Field
import requests # Example of an external library import
import asyncio # If any tool uses asyncio.sleep or other async operations
from mcp.server.fastmcp import FastMCP

# sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))) # Optional: if mcp is not installed site-wide

mcp = FastMCP("Example Server Description Provided by User")

@mcp.tool()
async def example_tool_one(
    user_number: Annotated[str, Field(description="User identifier, typically a phone number, passed by the MCP system.")],
    param1: Annotated[str, Field(description="First parameter for tool one")]
) -> Dict[str, Any]:
    \"\"\"
    Description of example_tool_one. This tool demonstrates parameter usage.
    \"\"\"
    # Tool logic here
    return {"status": "success", "message": f"Tool one executed with '{param1}' for user {user_number}."}

# ... (Potentially other tools, including streaming ones like the example above) ...

if __name__ == "__main__":
    mcp.run()

**Calling Other MCP Tools:**
- If a tool needs to call another tool hosted by the main MCP service, it should:
    1. Import `os` and `requests` (or `aiohttp` for async calls if the tool itself is async and needs non-blocking HTTP calls).
    2. Get the main service URL and internal API key from environment variables:
       `mcp_service_url = os.getenv("MCP_SERVICE_URL", "http://localhost:5001")`
       `mcp_internal_api_key = os.getenv("MCP_INTERNAL_API_KEY")`
       Check if `mcp_service_url` and `mcp_internal_api_key` are found, and if not, return an error from the tool.
    3. Construct a payload dictionary for the `InternalToolCallRequest` model used by the `/internal/call_mcp_tool` endpoint. This typically includes:
        `"tool_name": "name_of_the_tool_to_call"`,
        `"arguments": {"arg1": "value1", ...}`,
        `"user_id_context": user_number` (pass the `user_number` received by your tool here, if context is needed).
    4. Make an HTTP POST request to `f"{mcp_service_url}/internal/call_mcp_tool"`.
       - Include `headers={"X-Internal-API-Key": mcp_internal_api_key, "Content-Type": "application/json"}`.
       - Send the payload as JSON.
    5. Handle the response. The response structure will be similar to `QueryResponse` (e.g., `{"result": "...", "error": "..."}`).
       - If using `requests` (synchronous), check `response.status_code` and parse `response.json()`.
       - If using `aiohttp` (asynchronous), `await` the request and response processing.
- Always ensure that the arguments provided to the target tool match its defined schema.
- Propagate errors from the called tool or the calling process back to the user of your tool.
"""

# Configuration for talking to the main MCP Service
MCP_SERVICE_URL = os.getenv("MCP_SERVICE_URL", "http://localhost:5001")
MCP_INTERNAL_API_KEY = os.getenv("MCP_INTERNAL_API_KEY")

mcp = FastMCP("Dynamic MCP Server Creator")

def sanitize_filename(filename: str) -> str:
    """Basic filename sanitization."""
    filename = re.sub(r'[^a-zA-Z0-9_.-]', '_', filename)
    if not filename.endswith(".py"):
        filename += ".py"
    return filename

@mcp.tool()
async def create_and_register_new_mcp_server(
    user_id_for_new_server_registration: Annotated[str, Field(
        description="User ID to register the new server under in mcp_service.py. Use a system/admin ID or specific user."
    )] = "system_admin_user_for_dynamic_servers",
    new_server_filename: Annotated[str, Field(
        description="Filename for the new MCP server (e.g., 'my_custom_tool_server.py'). Will be sanitized."
    )] = "custom_tool_server.py",
    new_server_mcp_description: Annotated[str, Field(
        description="Description for the FastMCP instance in the new server (e.g., 'My Custom Tool Server'). This will be embedded in the generated code."
    )] = "Custom Tool Server",
    tool_generation_request: Annotated[str, Field(
        description="A natural language request describing the server's overall purpose, the tools it should contain (potentially multiple), their functionalities, inputs, and expected outputs. This will be used to generate the entire server's Python code."
    )] = "Create a server with a single tool that returns a simple success message.",
    code_generation_model: Annotated[MODELS_LITERAL, Field(
        description="The LLM model to use for generating the Python code for the new server file."
    )] = "gemini-2.5-pro-preview-05-06",
    user_number: Annotated[str, Field(description="Caller's identifier, not used directly by this tool but passed by MCP.")] = None
) -> Dict[str, Any]:
    """
    Creates a new MCP server Python file with one or more tools (entire file code generated by an LLM),
    saves it, and attempts to register it with the main MCP service.
    """
    if not MCP_INTERNAL_API_KEY:
        return {
            "status": "error",
            "message": "MCP_INTERNAL_API_KEY is not set in the environment. Cannot register the new server."
        }

    # --- Generate Tool Code Body using LLM ---
    llm_adapter = get_llm_adapter(code_generation_model)
    code_gen_prompt_to_llm = f"""User's request for the new MCP server:
{tool_generation_request}

Description for the FastMCP instance to be used in `mcp = FastMCP("your description here")`:
"{new_server_mcp_description}"

Please generate ONLY the Python code for the entire server file, adhering to all system prompt instructions.
Ensure the FastMCP instance uses the exact description provided above.
"""

    history_for_code_gen = [StandardizedMessage(role="user", content=code_gen_prompt_to_llm)]
    llm_config_for_code_gen = StandardizedLLMConfig(system_prompt=NEW_SERVER_GENERATION_SYSTEM_PROMPT)
    generated_server_file_content = ""
    try:
        llm_response = await llm_adapter.generate_content(
            model_name=code_generation_model,
            history=history_for_code_gen,
            tools=None, # No tools needed for this specific LLM call
            config=llm_config_for_code_gen
        )
        if llm_response.error:
            return {"status": "error", "message": f"LLM API error during code generation: {llm_response.error}"}
        
        generated_server_file_content = llm_response.text_content
        if not generated_server_file_content:
            return {"status": "error", "message": "LLM returned no code for the server file."}
        
        # Strip potential markdown fences if LLM adds them
        if generated_server_file_content.startswith("```python"):
            generated_server_file_content = generated_server_file_content[len("```python"):].strip()
        elif generated_server_file_content.startswith("```"):
             generated_server_file_content = generated_server_file_content[len("```"):].strip()
        if generated_server_file_content.endswith("```"):
            generated_server_file_content = generated_server_file_content[:-len("```")].strip()
            
    except Exception as e:
        return {"status": "error", "message": f"Error during LLM call for tool code generation: {str(e)}"}

    # --- End of LLM Code Generation ---

    safe_filename = sanitize_filename(new_server_filename)
    new_server_file_path = os.path.join(os.path.dirname(__file__), safe_filename)
    
    # The LLM now generates the entire file content.
    final_server_code = generated_server_file_content

    try:
        with open(new_server_file_path, 'w', encoding='utf-8') as f:
            f.write(final_server_code)
        creation_message = f"Successfully created new MCP server file: {new_server_file_path}"
    except Exception as e:
        return {"status": "error", "message": f"Failed to write new server file: {str(e)}"}

    # Attempt to register the new server with the main MCP service
    registration_payload = {
        "user_id": user_id_for_new_server_registration,
        "command": "python",
        "args": [f"mcp_client/mcp_servers/{safe_filename}"] # Path relative to mcp_service.py
    }
    
    headers = {
        "X-Internal-API-Key": MCP_INTERNAL_API_KEY,
        "Content-Type": "application/json"
    }
    
    registration_response_data = {}
    try:
        response = requests.post(
            f"{MCP_SERVICE_URL}/admin/users/add_server",
            json=registration_payload,
            headers=headers,
            timeout=10 # 10 seconds timeout
        )
        response.raise_for_status() # Raise an exception for HTTP errors (4xx or 5xx)
        registration_response_data = response.json()
        reg_status = "success"
        reg_message = f"Server '{safe_filename}' registration attempt returned: {registration_response_data.get('message', 'No message')}"
    except requests.exceptions.HTTPError as http_err:
        reg_status = "error"
        error_content = "No error content"
        try:
            error_content = http_err.response.json()
        except json.JSONDecodeError:
            error_content = http_err.response.text
        reg_message = f"HTTP error during server registration: {http_err}. Response: {error_content}"
        registration_response_data = {"error_details": error_content, "status_code": http_err.response.status_code}
    except Exception as e:
        reg_status = "error"
        reg_message = f"Failed to register new server with MCP service: {str(e)}"
        registration_response_data = {"error_details": str(e)}

    return {
        "status": "success" if reg_status == "success" else "partial_success", # partial if file created but registration failed
        "message": creation_message + " | " + reg_message,
        "new_server_file_path": new_server_file_path,
        "registration_response": registration_response_data,
        "generated_code_preview": final_server_code[:500] + "..." # Preview of the generated code
    }

if __name__ == "__main__":
    if not MCP_INTERNAL_API_KEY:
        print("CRITICAL ERROR: MCP_INTERNAL_API_KEY environment variable is not set.")
        print("This server needs it to communicate with the main MCP service for server registration.")
        sys.exit(1)
    mcp.run() 