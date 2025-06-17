import sys
import os
import datetime
import uuid
import re
import json
import requests
import asyncio
import hashlib
import difflib # For compare_mcp_server_versions
import shutil
from typing import Annotated, Optional, List, Dict, Literal

# Ensure the server can import modules from the main project root
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from fastmcp import FastMCP, Context
from pydantic import Field

# Import the search/replace functionality
from utils.search_replace import (
    SearchReplaceBlockParser,
    flexible_search_and_replace,
    editblock_strategies
)

# Import the centralized MCP server system prompt
from system_prompts import get_mcp_server_system_prompt

# --- Initialize MCP Server ---
mcp = FastMCP("MCP Server Creation & Versioning Server")

# --- Supported LLM Models ---
MODELS_LITERAL = Literal[
    "gemini-2.5-flash-preview-05-20",
    "gemini-2.5-pro-preview-05-06",
    "models/gemini-2.0-flash",
    "gemini-2.0-flash",
    "claude-3-7-sonnet-latest",
    "gpt-4.1-2025-04-14",
    "o4-mini-2025-04-16"
]

# --- Output Format Templates ---
MCP_SERVER_CREATION_OUTPUT_FORMAT = """
# Output Format:
Provide ONLY the complete Python code in a single markdown block:
```python
# Complete Python code here
```
Ensure `sys.path.append` uses `../../../../`.
"""

MCP_SERVER_EDIT_OUTPUT_FORMAT = """

Once you understand the request:

1. Think step-by-step and explain the needed changes in a few short sentences.

2. Provide each change using SEARCH/REPLACE blocks in standard markdown format.

You can format your response naturally - the system will automatically parse and extract the search/replace blocks from your response, whether they're in ```python code blocks or plain text.

# Example conversations:

## USER: Add a tool 'subtract_numbers(a, b)'.

## ASSISTANT: I need to add a new tool `subtract_numbers` that takes two numbers and returns their difference.

Here are the *SEARCH/REPLACE* blocks:

```python
<<<<<<< SEARCH
@mcp.tool()
async def add_numbers(a: Annotated[int, Field(description="First number")], b: Annotated[int, Field(description="Second number")]) -> Dict[str, int]:
    \"\"\"Add two numbers together.\"\"\"
    return {"sum": a + b}

if __name__ == "__main__":
=======
@mcp.tool()
async def add_numbers(a: Annotated[int, Field(description="First number")], b: Annotated[int, Field(description="Second number")]) -> Dict[str, int]:
    \"\"\"Add two numbers together.\"\"\"
    return {"sum": a + b}

@mcp.tool()
async def subtract_numbers(a: Annotated[int, Field(description="First number")], b: Annotated[int, Field(description="Second number")]) -> Dict[str, int]:
    \"\"\"Subtract second number from first number.\"\"\"
    return {"difference": a - b}

if __name__ == "__main__":
>>>>>>> REPLACE
```

# *SEARCH/REPLACE block* Rules:

Every *SEARCH/REPLACE block* must use this format:
1. The opening fence and code language: ```python
2. The start of search block: <<<<<<< SEARCH
3. A contiguous chunk of lines to search for in the existing source code
4. The dividing line: =======
5. The lines to replace into the source code
6. The end of the replace block: >>>>>>> REPLACE
7. The closing fence: ```

Every *SEARCH* section must *EXACTLY MATCH* the existing file content, character for character, including all comments, docstrings, etc.
If the file contains code or other data wrapped/escaped in json/xml/quotes or other containers, you need to propose edits to the literal contents of the file, including the container markup.

*SEARCH/REPLACE* blocks will *only* replace the first match occurrence.
Include multiple unique *SEARCH/REPLACE* blocks if needed.
Include enough lines in each SEARCH section to uniquely match each set of lines that need to change.

Keep *SEARCH/REPLACE* blocks concise.
Break large *SEARCH/REPLACE* blocks into a series of smaller blocks that each change a small portion of the file.
Include just the changing lines, and a few surrounding lines if needed for uniqueness.
Do not include long runs of unchanging lines in *SEARCH/REPLACE* blocks.

To move code within a file, use 2 *SEARCH/REPLACE* blocks: 1 to delete it from its current location, 1 to insert it in the new location.

Pay careful attention to the scope of the user's request.
Do what they ask, but no more.

IMPORTANT EDITING GUIDELINES:
1. Use precise SEARCH/REPLACE blocks for targeted edits
2. Preserve all existing functionality unless explicitly asked to change it
3. Make minimal changes necessary to implement the request
4. Maintain code structure, styling, and architecture
5. Keep MCP server patterns and conventions intact
6. Preserve any tool integrations and helper functions
7. Follow Python and FastMCP best practices

CRITICAL: JSON Response Handling from Internal Tool Calls
When calling internal MCP tools (like ai_chat) that return JSON data, be aware that the 'response' field may be returned as either:
- A parsed Python dictionary: {"response": {"key": "value"}}
- A JSON string: {"response": '{"key": "value"}'}

Always handle both cases robustly:
```python
response_content = tool_result.get("response")
if isinstance(response_content, str):
    try:
        response_content = json.loads(response_content)
    except json.JSONDecodeError:
        # Handle parsing error
        pass
if isinstance(response_content, dict):
    # Now safely use response_content as a dictionary
    actual_data = response_content.get("key")
```

The system will automatically extract your search/replace blocks regardless of markdown formatting, so focus on providing clear, accurate edits.
"""

# --- Helper Functions ---
def sanitize_for_path(name_part: str) -> str:
    if not isinstance(name_part, str):
        name_part = str(name_part)
    if name_part.startswith('+'):
        # Remove leading '+' and then all other non-alphanumeric characters.
        temp_name_part = name_part[1:]
        name_part = re.sub(r'\W+', '', temp_name_part)
    else:
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

async def fetch_tool_schemas_for_tools(tool_names: List[str]) -> str:
    """
    Fetch and format tool schemas for the specified MCP tool names.
    Returns a formatted context string for the system prompt.
    """
    if not tool_names:
        return ""
    
    # Assuming the main MCP service is running on localhost:5001
    mcp_service_tools_url = "http://localhost:5001/tools/all"
    context_parts = ["\n\n# Available MCP System Tools for Integration\n"]
    context_parts.append("The following tools are available. The generated server can call them by making an HTTP POST request to `/internal/call_mcp_tool` as shown in the main system prompt example.\n")

    try:
        response = await asyncio.to_thread(requests.get, mcp_service_tools_url, timeout=10)
        response.raise_for_status()
        all_tools_data = response.json().get("tools", [])
        
        found_tools = {tool['name']: tool for tool in all_tools_data}
        
        for tool_name in set(tool_names):
            if tool_name in found_tools:
                tool_detail = found_tools[tool_name]
                context_parts.append(f"\n## Tool: {tool_detail.get('name')}\n")
                context_parts.append(f"   Description: {tool_detail.get('description')}\n")
                context_parts.append(f"   Input Schema: {json.dumps(tool_detail.get('input_schema', {}), indent=2)}\n")
                output_schema = tool_detail.get('output_schema')
                if output_schema:
                    context_parts.append(f"   Output Schema: {json.dumps(output_schema, indent=2)}\n")
                else:
                    context_parts.append("   Output Schema: Not defined.\n")
            else:
                context_parts.append(f"\n## Tool: {tool_name}\n   Note: Schema not found. Ensure this tool exists.\n")

    except Exception as e:
        context_parts.append(f"\n# Tool Schema Fetch Error\nCould not fetch tool schemas: {e}\n")
    
    return "".join(context_parts)

def extract_mcp_tool_names_from_python(python_code: str) -> List[str]:
    """Extracts MCP tool names that are already being called in the Python code."""
    # This pattern looks for `_make_internal_tool_call("tool_name", ...)` or direct calls
    # It covers a common helper function pattern.
    return re.findall(r"""_make_internal_tool_call\s*\(\s*["']([^"']+)["']""", python_code)

async def load_server_metadata(metadata_path: str) -> dict:
    try:
        if os.path.exists(metadata_path):
            with open(metadata_path, 'r', encoding='utf-8') as f:
                return await asyncio.to_thread(json.load, f)
    except Exception as e:
        print(f"Error loading server metadata from {metadata_path}: {e}")
    return {}

async def save_server_metadata(metadata_path: str, metadata: dict) -> None:
    try:
        with open(metadata_path, 'w', encoding='utf-8') as f:
            await asyncio.to_thread(json.dump, metadata, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving server metadata to {metadata_path}: {e}")
        raise

async def generate_server_commit_summary(
    ctx: Context, request_for_summary: str, python_code_for_summary: str, 
    previous_code_for_summary: Optional[str] = None, 
    commit_history_for_summary: Optional[List[Dict]] = None,
    model: str = "gemini-2.5-flash-preview-05-20"
) -> str:
    try:
        history_context = ""
        if commit_history_for_summary:
            history_context = "\n\nPrevious Commits (most recent first):\n" + \
                              "\n".join([f"{i+1}. {c.get('commit_summary', 'N/A')}" 
                                         for i, c in enumerate(reversed(commit_history_for_summary[-3:]))])
        prompt_template = """Analyze the changes made to this Python MCP server and generate a concise commit summary.
User Request: {request}
{prev_len_info}New Version Length: {new_len} characters{history}
Please generate a commit summary (1-2 sentences, active voice, present tense, start with emoji ✨🐛⬆️📝⚙️🎯) summarizing key changes (new tools, logic, fixes).
Examples:
- ✨ Feat: Added 'calculate_area' tool.
- 🐛 Fix: Corrected 'process_data' arguments.
Generate only the commit summary."""
        
        prev_len_info = f"Previous Version Length: {len(previous_code_for_summary)} characters\n" if previous_code_for_summary else ""
        
        if not previous_code_for_summary: # Initial version
            prompt_template = """Generate a commit summary for the initial version of this Python MCP server.
User Request/Server Description: {request}
Server Code Length: {new_len} characters{history}
Summary should start with 🎯, briefly describe purpose/tools (1-2 sentences).
Generate only the commit summary."""
            
        prompt = prompt_template.format(
            request=request_for_summary, 
            prev_len_info=prev_len_info,
            new_len=len(python_code_for_summary), 
            history=history_context
        )
        response = await ctx.sample(messages=prompt, system_prompt="You write concise commit summaries for Python MCP servers.", model_preferences=[model])
        summary_text = response.text if hasattr(response, 'text') else (response.content if hasattr(response, 'content') else "")
        return summary_text.strip() or f"🔄 {'Initial' if not previous_code_for_summary else 'Updated'} version: {request_for_summary[:70]}..."
    except Exception as e:
        print(f"Error generating server commit summary: {e}")
        return f"🔄 {'Initial' if not previous_code_for_summary else 'Updated'}: {request_for_summary[:70]}..."

async def update_server_commit_summary_background(
    ctx: Context, metadata_path: str, version_number: int, request_for_summary: str,
    python_code_for_summary: str, previous_code_for_summary: Optional[str],
    commit_history_for_summary: List[Dict], model: str
):
    try:
        real_commit_summary = await generate_server_commit_summary(
            ctx, request_for_summary, python_code_for_summary, 
            previous_code_for_summary, commit_history_for_summary, model
        )
        metadata = await load_server_metadata(metadata_path)
        if metadata:
            for v_entry in metadata.get("versions", []):
                if v_entry.get("version") == version_number:
                    v_entry["commit_summary"] = real_commit_summary
                    v_entry.pop("generating_summary", None)
                    break
            await save_server_metadata(metadata_path, metadata)
            print(f"Background server commit summary updated for v{version_number}: {real_commit_summary}")
    except Exception as e:
        print(f"Warning: Failed to update server commit summary in background: {e}")
        # Fallback for safety
        metadata = await load_server_metadata(metadata_path)
        if metadata:
            for v_entry in metadata.get("versions", []):
                if v_entry.get("version") == version_number and v_entry.get("generating_summary"):
                    v_entry["commit_summary"] = f"🔄 {'Initial' if version_number == 1 else 'Updated'} version: {request_for_summary[:70]}..."
                    v_entry.pop("generating_summary", None)
                    await save_server_metadata(metadata_path, metadata)
                    break

@mcp.tool(
    annotations={
        "outputSchema": {
            "type": "object", "properties": {
                "status": {"type": "string", "enum": ["success", "error", "partial_success"]}, "message": {"type": "string"},
                "server_name": {"type": "string"}, "server_path": {"type": "string"}, 
                "server_url": {"type": "string"}, "commit_summary": {"type": "string"},
                "version": {"type": "integer"}, "reload_status": {"type": "string"}, "reload_message": {"type": "string"},
                "files_saved": {"type": "boolean", "description": "Whether the server files were successfully saved to disk"},
                "linting_report": {
                    "type": "object", 
                    "description": "Report from the lint_python_code tool.",
                    "properties": {
                        "status": {"type": "string"},
                        "message": {"type": "string"},
                        "issues_found": {"type": "boolean"},
                        "linting_issues": {"type": "array", "items": {"type": "object"}},
                        "raw_output": {"type": "string", "nullable": True}
                    }
                }
            }, "required": ["status", "message", "linting_report"]
        }
    }
)
async def create_mcp_server(
    ctx: Context,
    project_spec: Annotated[str, Field(description="Detailed specification of the new MCP server and its tools.")],
    user_number: Annotated[str, Field(description="User\'s unique identifier (e.g., phone number).")] = "+17145986105",
    server_name: Annotated[Optional[str], Field(description="Desired Python file name for the server (no .py). Auto-generated if None.")] = None,
    mcp_tool_names: Annotated[Optional[List[str]], Field(description="A list of existing MCP tool names that the new server should be able to call.")] = None,
    model: Annotated[MODELS_LITERAL, Field(description="LLM model for code generation.")] = "gemini-2.5-pro-preview-05-06",
    additional_context: Annotated[Optional[str], Field(description="Optional additional context.")] = None
) -> dict:
    """Creates a new Python MCP server with versioning, saves it, and triggers a reload."""
    user_id_safe = sanitize_for_path(user_number)
    server_name_safe = sanitize_for_path(server_name or re.sub(r'\s+', '_', project_spec[:30].strip()) or f"custom_mcp_server_{uuid.uuid4().hex[:8]}")

    tool_schemas_context = ""
    if mcp_tool_names:
        tool_schemas_context = await fetch_tool_schemas_for_tools(mcp_tool_names)

    try: # AI Code Generation
        # Build the prompt using the centralized system prompt
        base_system_prompt = get_mcp_server_system_prompt()
        
        # Add the user request context
        user_context = f"""
# User Request:
Project Specification: {project_spec}
Server Name (if provided): {server_name_safe}
{tool_schemas_context}
"""
        if additional_context:
            user_context += f"\nAdditional Context:\n{additional_context}"
        
        full_prompt = user_context
        full_system_prompt = base_system_prompt + MCP_SERVER_CREATION_OUTPUT_FORMAT
        
        response = await ctx.sample(messages=full_prompt, system_prompt=full_system_prompt, model_preferences=[model])
        python_code = (response.text if hasattr(response, 'text') else response.content if hasattr(response, 'content') else "")
        match = re.search(r'```python\s*(.*?)\s*```', python_code, re.DOTALL)
        python_code = match.group(1).strip() if match else python_code.strip()
        if not python_code: return {"status": "error", "message": "AI failed to generate Python code."}
    except Exception as e: return {"status": "error", "message": f"AI code generation failed: {e}"}

    # Lint the generated code
    linting_report_result = await lint_python_code(ctx, python_code=python_code)
    # We proceed with saving and metadata regardless of linting, report is for the agent

    # File and Metadata Operations - ALWAYS save the code, regardless of reload success
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
    server_dir = os.path.join(project_root, "user_data", user_id_safe, "mcp_servers", server_name_safe)
    versions_dir = os.path.join(server_dir, "versions")
    current_symlink_path = os.path.join(server_dir, "current.py")
    metadata_file_path = os.path.join(server_dir, "server_meta.json")
    
    try: # File Operations - Always save the generated code
        os.makedirs(versions_dir, exist_ok=True)

        new_version_number = 1
        version_file_name = f"v{new_version_number}.py"
        version_file_path_abs = os.path.join(versions_dir, version_file_name)
        
        # Save the generated code to disk FIRST
        with open(version_file_path_abs, 'w', encoding='utf-8') as f: 
            await asyncio.to_thread(f.write, python_code)
        print(f"✅ Server code saved to: {version_file_path_abs}")
        
        # Create symlink to current version
        relative_version_path = os.path.join("versions", version_file_name)
        if os.path.lexists(current_symlink_path): os.remove(current_symlink_path)
        os.symlink(relative_version_path, current_symlink_path)
        print(f"✅ Current symlink created: {current_symlink_path}")
        
        # Save metadata
        now_iso = datetime.datetime.now().isoformat()
        placeholder_summary = f"🎯 Initial version: {project_spec[:70]}..."
        metadata = {
            "server_name": server_name_safe, "created_at": now_iso, "last_updated": now_iso,
            "description": project_spec, "current_version": new_version_number,
            "versions": [{
                "version": new_version_number, "timestamp": now_iso, "file": relative_version_path,
                "user_request": project_spec, "commit_summary": placeholder_summary,
                "size": len(python_code), "line_count": len(python_code.splitlines()), "generating_summary": True
            }]
        }
        await save_server_metadata(metadata_file_path, metadata)
        print(f"✅ Metadata saved to: {metadata_file_path}")
        
        # Start background commit summary generation
        asyncio.create_task(update_server_commit_summary_background(
            ctx, metadata_file_path, new_version_number, project_spec, python_code, None, [], model
        ))
        
    except Exception as e: 
        # Even if file operations fail, we should still try to return useful info
        error_msg = f"File/metadata operations failed: {e}"
        print(f"❌ {error_msg}")
        return {"status": "error", "message": error_msg, "server_name": server_name_safe}

    # Reload Service - Separate from file operations, so reload failures don't affect file saving
    reload_status, reload_message = "skipped", "MCP_INTERNAL_API_KEY not set"
    internal_api_key = os.getenv("MCP_INTERNAL_API_KEY")
    if internal_api_key:
        try:
            print(f"🔄 Attempting to reload server: {current_symlink_path}")
            response = await asyncio.to_thread(requests.post, "http://localhost:5001/admin/servers/reload", 
                                               headers={"Content-Type": "application/json", "X-Internal-API-Key": internal_api_key}, 
                                               json=current_symlink_path, timeout=30)
            response.raise_for_status()
            r_data = response.json()
            reload_status, reload_message = r_data.get("status", "error"), r_data.get("message", "N/A")
            print(f"✅ Reload successful: {reload_status} - {reload_message}")
        except Exception as e: 
            reload_status, reload_message = "error", str(e)
            print(f"❌ Reload failed: {reload_message}")
            # Don't return error here - files are saved, reload failure is not critical
            
    # Determine overall status - files saved = success, reload is secondary
    if reload_status == "success":
        overall_status = "success"
        status_message = f"Server '{server_name_safe}' v{new_version_number} created and loaded successfully."
    elif reload_status == "skipped":
        overall_status = "success"  # Files saved successfully, reload just skipped
        status_message = f"Server '{server_name_safe}' v{new_version_number} created successfully. Reload skipped (no API key)."
    else:
        overall_status = "partial_success"  # Files saved, but reload failed
        status_message = f"Server '{server_name_safe}' v{new_version_number} created successfully, but reload failed: {reload_message}"
    
    return {
        "status": overall_status,
        "message": status_message,
        "server_name": server_name_safe, 
        "server_path": current_symlink_path, 
        "server_url": f"mcp://{user_id_safe}/{server_name_safe}", 
        "commit_summary": placeholder_summary,
        "version": new_version_number, 
        "reload_status": reload_status, 
        "reload_message": reload_message,
        "files_saved": True,  # Always true if we reach this point
        "linting_report": linting_report_result
    }

@mcp.tool(
    annotations={
        "outputSchema": {
            "type": "object", "properties": {
                "status": {"type": "string", "enum": ["success", "error", "partial_success"]}, "message": {"type": "string"},
                "server_name": {"type": "string"}, "server_path": {"type": "string"}, "version": {"type": "integer"},
                "commit_summary": {"type": "string"}, "search_replace_results": {"type": "object"},
                "reload_status": {"type": "string"}, "reload_message": {"type": "string"},
                "linting_report": {
                    "type": "object", 
                    "description": "Report from the lint_python_code tool.",
                    "properties": {
                        "status": {"type": "string"},
                        "message": {"type": "string"},
                        "issues_found": {"type": "boolean"},
                        "linting_issues": {"type": "array", "items": {"type": "object"}},
                        "raw_output": {"type": "string", "nullable": True}
                    }
                }
            }, "required": ["status", "message", "linting_report"]
        }
    }
)
async def edit_mcp_server(
    ctx: Context,
    server_name: Annotated[str, Field(description="Python file name of the server to edit (no .py).")],
    project_spec: Annotated[str, Field(description="Detailed description of changes.")],
    user_number: Annotated[str, Field(description="User\'s unique identifier.")] = "+17145986105",
    mcp_tool_names: Annotated[Optional[List[str]], Field(description="A list of existing MCP tool names that the server should be able to call.")] = None,
    model: Annotated[MODELS_LITERAL, Field(description="LLM for edit generation.")] = "gemini-2.5-pro-preview-05-06",
    additional_context: Annotated[Optional[str], Field(description="Optional additional context.")] = None
) -> dict:
    """Edits an MCP server using AI-generated search/replace blocks, creating a new version."""
    user_id_safe = sanitize_for_path(user_number)
    server_name_safe = sanitize_for_path(server_name)

    try: # File and Metadata Access
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
        server_dir = os.path.join(project_root, "user_data", user_id_safe, "mcp_servers", server_name_safe)
        versions_dir = os.path.join(server_dir, "versions")
        current_symlink_path = os.path.join(server_dir, "current.py")
        metadata_file_path = os.path.join(server_dir, "server_meta.json")

        if not os.path.exists(current_symlink_path) or not os.path.exists(metadata_file_path):
            return {"status": "error", "message": f"Server '{server_name_safe}' or its metadata not found."}

        current_code_path = os.path.normpath(os.path.join(server_dir, os.readlink(current_symlink_path)))
        if not os.path.exists(current_code_path):
             return {"status": "error", "message": f"Current version file {current_code_path} for '{server_name_safe}' missing."}
        with open(current_code_path, 'r', encoding='utf-8') as f: current_python_code = await asyncio.to_thread(f.read)
        metadata = await load_server_metadata(metadata_file_path)
        if not metadata: return {"status": "error", "message": f"Failed to load metadata for '{server_name_safe}'."}
    except Exception as e: return {"status": "error", "message": f"File/metadata access error: {e}"}

    # Combine existing tools with newly requested ones
    existing_tool_names = extract_mcp_tool_names_from_python(current_python_code)
    all_tool_names = list(set(existing_tool_names + (mcp_tool_names or [])))
    
    tool_schemas_context = ""
    if all_tool_names:
        tool_schemas_context = await fetch_tool_schemas_for_tools(all_tool_names)

    try: # AI Edit Generation
        # Build the prompt using the centralized system prompt
        base_system_prompt = get_mcp_server_system_prompt()
        
        # Add the edit-specific context
        edit_context = f"""
Current MCP server code (`{server_name_safe}/current.py`):

```python
{current_python_code}
```

Edit Request: {project_spec}
"""
        if tool_schemas_context:
            edit_context += f"\n{tool_schemas_context}"
        if additional_context:
            edit_context += f"\nAdditional Context:\n{additional_context}"
        
        full_system_prompt = base_system_prompt + MCP_SERVER_EDIT_OUTPUT_FORMAT
        
        response = await ctx.sample(messages=edit_context, system_prompt=full_system_prompt, model_preferences=[model])
        sr_output = (response.text if hasattr(response, 'text') else response.content if hasattr(response, 'content') else "")
        if not sr_output.strip().startswith(f"{server_name_safe}.py"): sr_output = f"{server_name_safe}.py\n{sr_output}"
        if not sr_output: return {"status": "error", "message": "AI failed to generate edits."}
    except Exception as e: return {"status": "error", "message": f"AI edit generation failed: {e}"}
    
    try: # Apply Edits
        modified_code = current_python_code
        parser = SearchReplaceBlockParser()
        blocks = parser.parse_blocks(sr_output)
        sr_results = {'total_blocks': len(blocks), 'successful': 0, 'failed': 0, 'failed_details': []}
        if not blocks and sr_output.strip(): # AI might return just code if no changes needed or error
            if "no changes needed" in sr_output.lower() or sr_output.lower().startswith("```python"): # Check if it's just python code
                 pass # No actual S/R blocks, means AI thinks no change or returned full code
            else: # No blocks but not just code -> likely an AI error message
                return {"status": "error", "message": f"AI did not provide valid edit blocks. Response: {sr_output[:200]}..."}
        
        for i, (label, search, replace) in enumerate(blocks):
            # Normalize newlines for search_text, replace_text and modified_code before comparison
            search_norm = search.replace('\r\n', '\n').replace('\r', '\n')
            replace_norm = replace.replace('\r\n', '\n').replace('\r', '\n')
            modified_code_norm = modified_code.replace('\r\n', '\n').replace('\r', '\n')

            temp_modified_code = flexible_search_and_replace((search_norm, replace_norm, modified_code_norm), editblock_strategies)
            if temp_modified_code is not None:
                modified_code = temp_modified_code # Persist the normalized version
                sr_results['successful'] += 1
            else:
                sr_results['failed'] += 1
                sr_results['failed_details'].append(f"Block {i+1} failed. Search: '{search_norm[:50]}...'")
        if sr_results['failed'] > 0 and sr_results['successful'] == 0 and blocks : # Only error if all blocks failed AND there were blocks
             return {"status": "error", "message": f"All {sr_results['total_blocks']} S/R blocks failed.", "search_replace_results": sr_results}
    except Exception as e: return {"status": "error", "message": f"Applying edits failed: {e}", "search_replace_results": sr_results}

    # Lint the modified code
    linting_report_result = await lint_python_code(ctx, python_code=modified_code)
    # We proceed with saving and metadata regardless of linting, report is for the agent

    try: # Save New Version & Metadata
        new_version_num = len(metadata.get("versions", [])) + 1
        new_filename = f"v{new_version_num}.py"
        new_filepath_abs = os.path.join(versions_dir, new_filename)
        with open(new_filepath_abs, 'w', encoding='utf-8') as f: await asyncio.to_thread(f.write, modified_code) # Save potentially normalized code
        
        rel_path = os.path.join("versions", new_filename)
        if os.path.lexists(current_symlink_path): os.remove(current_symlink_path)
        os.symlink(rel_path, current_symlink_path)
        
        now = datetime.datetime.now().isoformat()
        metadata["current_version"] = new_version_num
        metadata["last_updated"] = now
        placeholder_summary = f"⚙️ Updated: {project_spec[:70]}..."
        version_data = {
            "version": new_version_num, "timestamp": now, "file": rel_path, "user_request": project_spec,
            "commit_summary": placeholder_summary, "size": len(modified_code), 
            "line_count": len(modified_code.splitlines()), "search_replace_results": sr_results, "generating_summary": True
        }
        metadata.setdefault("versions", []).append(version_data)
        await save_server_metadata(metadata_file_path, metadata)
        asyncio.create_task(update_server_commit_summary_background(
            ctx, metadata_file_path, new_version_num, project_spec, modified_code, current_python_code, metadata["versions"], model
        ))
    except Exception as e: return {"status": "error", "message": f"Saving new version failed: {e}", "search_replace_results": sr_results}

    # Reload (omitting for brevity)
    reload_status, reload_message = "skipped", "MCP_INTERNAL_API_KEY not set"
    # ... (reload logic) ...
    if os.getenv("MCP_INTERNAL_API_KEY"):
        try:
            response = await asyncio.to_thread(requests.post, "http://localhost:5001/admin/servers/reload", 
                                               headers={"Content-Type": "application/json", "X-Internal-API-Key": os.getenv("MCP_INTERNAL_API_KEY")}, 
                                               json=current_symlink_path, timeout=30)
            response.raise_for_status()
            r_data = response.json()
            reload_status, reload_message = r_data.get("status", "error"), r_data.get("message", "N/A")
        except Exception as e: reload_status, reload_message = "error", str(e)

    return {
        "status": "success" if reload_status != "error" else "partial_success",
        "message": f"Server '{server_name_safe}' v{new_version_num} edited. SR: {sr_results['successful']}/{sr_results['total_blocks']}. Reload: {reload_status}. {reload_message}",
        "server_name": server_name_safe, "server_path": current_symlink_path, "version": new_version_num,
        "commit_summary": placeholder_summary, "search_replace_results": sr_results,
        "reload_status": reload_status, "reload_message": reload_message,
        "linting_report": linting_report_result
    }

@mcp.tool(
    annotations={
        "outputSchema": {
            "type": "object", "properties": {
                "status": {"type": "string", "enum": ["success", "error", "partial_success"]}, "message": {"type": "string"},
                "mcp_servers": {"type": "array", "items": {
                    "type": "object", "properties": {
                        "server_name": {"type": "string"}, "description": {"type": "string"},
                        "current_version": {"type": "integer"}, "total_versions": {"type": "integer"},
                        "created_at": {"type": "string"}, "last_updated": {"type": "string"},
                        "latest_commit_summary": {"type": "string"}, "server_url": {"type": "string"}
                    }
                }}
            }
        }
    }
)
async def list_mcp_servers(
    ctx: Context, user_number: Annotated[str, Field(description="User\'s unique identifier.")] = "+17145986105",
    limit: Annotated[int, Field(description="Max servers to return.", ge=1)] = 50
) -> dict:
    """Lists MCP servers for the user with metadata."""
    user_id_safe = sanitize_for_path(user_number)
    servers_root = os.path.join(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')), "user_data", user_id_safe, "mcp_servers")
    if not os.path.isdir(servers_root): return {"status": "success", "message": "No servers found.", "mcp_servers": []}
    
    servers_list = []
    try:
        for s_name in sorted(await asyncio.to_thread(os.listdir, servers_root), reverse=True):
            if len(servers_list) >= limit: break
            s_dir = os.path.join(servers_root, s_name)
            if not os.path.isdir(s_dir): continue
            
            meta_path = os.path.join(s_dir, "server_meta.json")
            metadata = await load_server_metadata(meta_path) if os.path.exists(meta_path) else {}
            
            latest_v_info = metadata.get("versions", [{}])[-1] if metadata.get("versions") else {}
            servers_list.append({
                "server_name": metadata.get("server_name", s_name),
                "description": metadata.get("description", "N/A"),
                "current_version": metadata.get("current_version", 0),
                "total_versions": len(metadata.get("versions", [])),
                "created_at": metadata.get("created_at", "N/A"),
                "last_updated": metadata.get("last_updated", "N/A"),
                "latest_commit_summary": latest_v_info.get("commit_summary", "N/A"),
                "server_url": f"mcp://{user_id_safe}/{metadata.get('server_name', s_name)}"
            })
        return {"status": "success", "message": f"Found {len(servers_list)} servers.", "mcp_servers": servers_list}
    except Exception as e: return {"status": "error", "message": f"Listing servers failed: {e}", "mcp_servers": []}

@mcp.tool(
    annotations={
        "outputSchema": {
            "type": "object", "properties": {
                "status": {"type": "string", "enum": ["success", "error"]}, "message": {"type": "string"},
                "server_name": {"type": "string"}, "current_version": {"type": "integer"}, "total_versions": {"type": "integer"},
                "created_at": {"type": "string"}, "last_updated": {"type": "string"}, "description": {"type": "string"},
                "versions": {"type": "array", "items": {"type": "object"}} # Define version item schema if needed
            }
        }
    }
)
async def get_mcp_server_versions(
    ctx: Context, server_name: Annotated[str, Field(description="Name of the MCP server.")],
    user_number: Annotated[str, Field(description="User\'s unique identifier.")] = "+17145986105"
) -> dict:
    """Gets version history for a specific MCP server."""
    user_id_safe = sanitize_for_path(user_number)
    server_name_safe = sanitize_for_path(server_name)
    meta_path = os.path.join(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')), 
                             "user_data", user_id_safe, "mcp_servers", server_name_safe, "server_meta.json")
    if not os.path.exists(meta_path): return {"status": "error", "message": f"Server '{server_name_safe}' or metadata not found."}
    try:
        metadata = await load_server_metadata(meta_path)
        if not metadata: return {"status": "error", "message": f"Failed to load metadata for '{server_name_safe}'."}
        return {
            "status": "success", "message": f"Version history for '{server_name_safe}' retrieved.",
            "server_name": metadata.get("server_name", server_name_safe),
            "current_version": metadata.get("current_version", 0),
            "total_versions": len(metadata.get("versions", [])),
            "created_at": metadata.get("created_at", "N/A"), "last_updated": metadata.get("last_updated", "N/A"),
            "description": metadata.get("description", ""), "versions": metadata.get("versions", [])
        }
    except Exception as e: return {"status": "error", "message": f"Loading version history failed: {e}"}

@mcp.tool(
    annotations={
        "outputSchema": {
            "type": "object", "properties": {
                "status": {"type": "string", "enum": ["success", "error", "partial_success"]}, "message": {"type": "string"},
                "server_name": {"type": "string"}, "previous_version": {"type": "integer"}, "new_current_version": {"type": "integer"},
                "reload_status": {"type": "string"}, "reload_message": {"type": "string"}
            }
        }
    }
)
async def switch_mcp_server_version(
    ctx: Context, server_name: Annotated[str, Field(description="Name of the MCP server.")],
    target_version: Annotated[int, Field(description="Version number to switch to.")],
    user_number: Annotated[str, Field(description="User\'s unique identifier.")] = "+17145986105"
) -> dict:
    """Switches the active version of an MCP server and reloads it."""
    user_id_safe = sanitize_for_path(user_number)
    server_name_safe = sanitize_for_path(server_name)
    server_dir = os.path.join(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')), 
                              "user_data", user_id_safe, "mcp_servers", server_name_safe)
    meta_path = os.path.join(server_dir, "server_meta.json")
    symlink_path = os.path.join(server_dir, "current.py")

    if not os.path.isdir(server_dir) or not os.path.exists(meta_path):
        return {"status": "error", "message": f"Server '{server_name_safe}' or metadata not found."}
    try:
        metadata = await load_server_metadata(meta_path)
        if not metadata: return {"status": "error", "message": "Failed to load metadata."}

        current_v = metadata.get("current_version", 0)
        all_v_meta = metadata.get("versions", [])
        total_v = len(all_v_meta)

        if not (0 < target_version <= total_v):
            return {"status": "error", "message": f"Target version {target_version} invalid. Available: 1-{total_v}."}
        if target_version == current_v:
            return {"status": "success", "message": f"Server '{server_name_safe}' already on v{target_version}.", "no_change_needed": True}

        target_meta = next((v for v in all_v_meta if v.get("version") == target_version), None)
        if not target_meta or not target_meta.get("file"):
            return {"status": "error", "message": f"Metadata for v{target_version} or its file missing."}

        target_file_rel = target_meta["file"]
        target_file_abs = os.path.normpath(os.path.join(server_dir, target_file_rel))
        if not os.path.exists(target_file_abs):
            return {"status": "error", "message": f"Target version file {target_file_abs} missing."}

        if os.path.lexists(symlink_path): os.remove(symlink_path)
        os.symlink(target_file_rel, symlink_path)

        prev_v = current_v
        metadata["current_version"] = target_version
        metadata["last_updated"] = datetime.datetime.now().isoformat()
        await save_server_metadata(meta_path, metadata)
        
        reload_status, reload_message = "skipped", "MCP_INTERNAL_API_KEY not set"
        if os.getenv("MCP_INTERNAL_API_KEY"):
            try:
                response = await asyncio.to_thread(requests.post, "http://localhost:5001/admin/servers/reload",
                                                   headers={"Content-Type": "application/json", "X-Internal-API-Key": os.getenv("MCP_INTERNAL_API_KEY")},
                                                   json=symlink_path, timeout=30)
                response.raise_for_status()
                r_data = response.json()
                reload_status, reload_message = r_data.get("status", "error"), r_data.get("message", "N/A")
            except Exception as e: reload_status, reload_message = "error", str(e)
        
        return {
            "status": "success" if reload_status != "error" else "partial_success",
            "message": f"Switched '{server_name_safe}' to v{target_version}. Reload: {reload_status}. {reload_message}",
            "server_name": server_name_safe, "previous_version": prev_v, "new_current_version": target_version,
            "reload_status": reload_status, "reload_message": reload_message
        }
    except Exception as e: return {"status": "error", "message": f"Switching version failed: {e}"}

@mcp.tool(
    annotations={
        "outputSchema": {
            "type": "object", "properties": {
                "status": {"type": "string", "enum": ["success", "error"]}, "message": {"type": "string"},
                "server_name": {"type": "string"}, "comparison": {"type": "object"}, 
                "statistics": {"type": "object"}, "diff": {"type": "object", "nullable": True}
            }
        }
    }
)
async def compare_mcp_server_versions(
    ctx: Context, server_name: Annotated[str, Field(description="Name of the MCP server.")],
    version_a: Annotated[int, Field(description="First version (older).")], 
    version_b: Annotated[int, Field(description="Second version (newer).")],
    user_number: Annotated[str, Field(description="User\'s unique identifier.")] = "+17145986105"
) -> dict:
    """Compares two versions of an MCP server to see code differences."""
    user_id_safe = sanitize_for_path(user_number)
    server_name_safe = sanitize_for_path(server_name)
    server_dir = os.path.join(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')),
                              "user_data", user_id_safe, "mcp_servers", server_name_safe)
    meta_path = os.path.join(server_dir, "server_meta.json")

    if not os.path.isdir(server_dir) or not os.path.exists(meta_path):
        return {"status": "error", "message": f"Server '{server_name_safe}' or metadata not found."}
    try:
        metadata = await load_server_metadata(meta_path)
        if not metadata: return {"status": "error", "message": "Failed to load metadata."}

        all_v_meta = metadata.get("versions", [])
        total_v = len(all_v_meta)
        if not (0 < version_a <= total_v and 0 < version_b <= total_v):
            return {"status": "error", "message": f"Invalid versions. Available: 1-{total_v}."}

        meta_a = next((v for v in all_v_meta if v.get("version") == version_a), None)
        meta_b = next((v for v in all_v_meta if v.get("version") == version_b), None)
        if not (meta_a and meta_b and meta_a.get("file") and meta_b.get("file")):
            return {"status": "error", "message": "Metadata or file path missing for versions."}

        file_a_abs = os.path.normpath(os.path.join(server_dir, meta_a["file"]))
        file_b_abs = os.path.normpath(os.path.join(server_dir, meta_b["file"]))
        if not (os.path.exists(file_a_abs) and os.path.exists(file_b_abs)):
            return {"status": "error", "message": "Code file for one or both versions missing."}

        with open(file_a_abs, 'r', encoding='utf-8') as f: code_a = await asyncio.to_thread(f.read)
        with open(file_b_abs, 'r', encoding='utf-8') as f: code_b = await asyncio.to_thread(f.read)
        
        lines_a = code_a.splitlines(keepends=True)
        lines_b = code_b.splitlines(keepends=True)
        diff_list = list(difflib.unified_diff(lines_a, lines_b, 
                                              fromfile=f"v{version_a}.py", tofile=f"v{version_b}.py", n=3))
        return {
            "status": "success", "message": f"Comparison for '{server_name_safe}' v{version_a} vs v{version_b} generated.",
            "server_name": server_name_safe,
            "comparison": {"from_version": version_a, "to_version": version_b, "from_info": meta_a, "to_info": meta_b},
            "statistics": {
                "size_change_bytes": len(code_b) - len(code_a),
                "lines_added": sum(1 for l in diff_list if l.startswith('+') and not l.startswith('+++')),
                "lines_removed": sum(1 for l in diff_list if l.startswith('-') and not l.startswith('--')),
                "identical": code_a == code_b
            },
            "diff": {"format": "unified", "lines": diff_list[:200], "truncated": len(diff_list) > 200, "total_diff_lines": len(diff_list)} if diff_list else None
        }
    except Exception as e: return {"status": "error", "message": f"Comparing versions failed: {e}"}

@mcp.tool(
    annotations={
        "outputSchema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["success", "error", "linter_not_found"]},
                "message": {"type": "string"},
                "issues_found": {"type": "boolean"},
                "linting_issues": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "file_path": {"type": "string", "description": "Usually '-' for stdin or the provided filename."},
                            "line_number": {"type": "integer"},
                            "column_number": {"type": "integer"},
                            "error_code": {"type": "string"},
                            "error_message": {"type": "string"}
                        },
                        "required": ["file_path", "line_number", "column_number", "error_code", "error_message"]
                    }
                },
                "raw_output": {"type": "string", "nullable": True, "description": "Raw output from the linter."}
            },
            "required": ["status", "message", "issues_found", "linting_issues"]
        }
    }
)
async def lint_python_code(
    ctx: Context, # Included for consistency, though not strictly used in this initial version
    python_code: Annotated[str, Field(description="The Python code string to be linted.")]
) -> dict:
    """
    Lints the provided Python code string using Flake8 and returns any issues found.
    Requires Flake8 to be installed in the environment.
    """
    issues = []
    raw_linter_output = ""
    issues_found_flag = False

    try:
        # Flake8 reads from stdin if '-' is given as a filename
        proc = await asyncio.create_subprocess_exec(
            'flake8', '--stdin-display-name', 'stdin_code', '-', # Use a display name for clarity in messages
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout_bytes, stderr_bytes = await proc.communicate(input=python_code.encode('utf-8'))

        stdout = stdout_bytes.decode('utf-8').strip()
        stderr = stderr_bytes.decode('utf-8').strip()
        
        raw_linter_output = f"STDOUT:\\n{stdout}\\n\\nSTDERR:\\n{stderr}"

        if proc.returncode is None: 
            return {"status": "error", "message": "Linter process did not terminate as expected.", "issues_found": False, "linting_issues": [], "raw_output": raw_linter_output}
        
        if stdout:
            lines = stdout.splitlines()
            for line in lines:
                # Example Flake8 line: stdin_code:2:1: F821 undefined name 'undefined_variable'
                match = re.match(r'([^:]+):(\d+):(\d+):\s([A-Z]\d{2,3})\s(.*)', line)
                if match:
                    issues_found_flag = True
                    issues.append({
                        "file_path": match.group(1), 
                        "line_number": int(match.group(2)),
                        "column_number": int(match.group(3)),
                        "error_code": match.group(4),
                        "error_message": match.group(5).strip()
                    })
        
        if stderr and not issues_found_flag and proc.returncode != 0 and not stdout:
             return {
                "status": "error", 
                "message": f"Linter execution possibly failed or has warnings: {stderr[:500]}", 
                "issues_found": False, 
                "linting_issues": [], 
                "raw_output": raw_linter_output
            }

        msg = f"Linting complete. Found {len(issues)} issue(s)." if issues_found_flag else "Linting complete. No issues found."
        if stderr and issues_found_flag: # If issues found but also stderr, mention stderr
            msg += f" (Linter also produced stderr output: {stderr[:100]}...)"


        return {
            "status": "success",
            "message": msg,
            "issues_found": issues_found_flag,
            "linting_issues": issues,
            "raw_output": raw_linter_output
        }

    except FileNotFoundError:
        return {
            "status": "linter_not_found",
            "message": "Flake8 linter not found. Please ensure it is installed and in the system PATH.",
            "issues_found": False,
            "linting_issues": [],
            "raw_output": "Flake8 command not found."
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"An unexpected error occurred during linting: {str(e)}",
            "issues_found": False,
            "linting_issues": [],
            "raw_output": str(e)
        }

@mcp.tool(
    annotations={
        "outputSchema": {
            "type": "object", "properties": {
                "status": {"type": "string", "enum": ["success", "error", "confirmation_required"]}, "message": {"type": "string"},
                "deleted_server_info": {"type": "object", "nullable": True}
            }
        }
    }
)
async def delete_mcp_server(
    ctx: Context, server_name: Annotated[str, Field(description="Name of the MCP server to delete.")],
    user_number: Annotated[str, Field(description="User\'s unique identifier.")] = "+17145986105",
    confirm: Annotated[bool, Field(description="Must be True to actually delete.")] = False
) -> dict:
    """Deletes an MCP server, its versions, and metadata after confirmation."""
    user_id_safe = sanitize_for_path(user_number)
    server_name_safe = sanitize_for_path(server_name)
    server_dir = os.path.join(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')),
                              "user_data", user_id_safe, "mcp_servers", server_name_safe)

    if not os.path.isdir(server_dir): return {"status": "error", "message": f"Server '{server_name_safe}' not found."}
    if not confirm: return {"status": "confirmation_required", "message": f"Confirm deletion of '{server_name_safe}' by setting confirm=True."}
    
    try:
        meta_path = os.path.join(server_dir, "server_meta.json")
        deleted_info = {"server_name": server_name_safe}
        if os.path.exists(meta_path):
            metadata = await load_server_metadata(meta_path)
            deleted_info.update({
                "versions_count": len(metadata.get("versions", [])),
                "created_at": metadata.get("created_at"), "last_updated": metadata.get("last_updated")})
        
        await asyncio.to_thread(shutil.rmtree, server_dir)
        
        # Notify mcp_service (best effort)
        if os.getenv("MCP_INTERNAL_API_KEY"):
            try:
                # Construct the correct path relative to project root
                relative_server_path = f"user_data/{user_id_safe}/mcp_servers/{server_name_safe}/current.py"
                await asyncio.to_thread(requests.post, "http://localhost:5001/admin/users/remove_server", timeout=5,
                                       headers={"Content-Type": "application/json", "X-Internal-API-Key": os.getenv("MCP_INTERNAL_API_KEY")},
                                       json={"user_id": user_id_safe, "command": "python", "args": [relative_server_path]})
            except Exception as e_notify: print(f"Warning: Failed to notify mcp_service of deletion: {e_notify}")
            
        return {"status": "success", "message": f"Server '{server_name_safe}' deleted.", "deleted_server_info": deleted_info}
    except Exception as e: return {"status": "error", "message": f"Deleting server failed: {e}"}

@mcp.tool(
    annotations={
        "outputSchema": {
            "type": "object", "properties": {
                "status": {"type": "string", "enum": ["success", "error", "partial_success"]}, "message": {"type": "string"},
                "new_server_name": {"type": "string"}, "new_server_path": {"type": "string"}, "new_server_url": {"type": "string"},
                "cloned_from": {"type": "object"}, "initial_version": {"type": "integer", "default": 1},
                "reload_status": {"type": "string"}, "reload_message": {"type": "string"}
            }
        }
    }
)
async def clone_mcp_server(
    ctx: Context, source_server_name: Annotated[str, Field(description="Name of the source MCP server.")],
    new_server_name: Annotated[str, Field(description="Name for the new cloned server.")],
    user_number: Annotated[str, Field(description="User\'s unique identifier.")] = "+17145986105",
    source_version: Annotated[Optional[int], Field(description="Version of source to clone. Defaults to current.")] = None,
    description_override: Annotated[Optional[str], Field(description="Custom description for clone.")] = None
) -> dict:
    """Clones an MCP server to a new server, optionally from a specific version."""
    user_id_safe = sanitize_for_path(user_number)
    source_name_safe = sanitize_for_path(source_server_name)
    new_name_safe = sanitize_for_path(new_server_name)
    
    base_dir = os.path.join(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')), "user_data", user_id_safe, "mcp_servers")
    source_dir = os.path.join(base_dir, source_name_safe)
    new_dir = os.path.join(base_dir, new_name_safe)
    source_meta_path = os.path.join(source_dir, "server_meta.json")

    if not os.path.exists(source_meta_path): return {"status": "error", "message": f"Source server '{source_server_name}' not found."}
    if os.path.exists(new_dir): return {"status": "error", "message": f"Server '{new_server_name}' already exists."}

    try:
        source_meta = await load_server_metadata(source_meta_path)
        if not source_meta: return {"status": "error", "message": f"Failed to load source metadata."}

        v_to_clone = source_version if source_version is not None else source_meta.get("current_version", 1)
        s_v_meta = next((v for v in source_meta.get("versions", []) if v.get("version") == v_to_clone), None)
        if not (s_v_meta and s_v_meta.get("file")): return {"status": "error", "message": f"Source v{v_to_clone} or file path not found."}

        s_code_path = os.path.normpath(os.path.join(source_dir, s_v_meta["file"]))
        if not os.path.exists(s_code_path): return {"status": "error", "message": f"Source code file {s_code_path} for v{v_to_clone} missing."}
        with open(s_code_path, 'r', encoding='utf-8') as f: cloned_code = await asyncio.to_thread(f.read)

        new_versions_dir = os.path.join(new_dir, "versions")
        os.makedirs(new_versions_dir, exist_ok=True)
        
        new_v1_file = "v1.py"
        new_v1_abs = os.path.join(new_versions_dir, new_v1_file)
        with open(new_v1_abs, 'w', encoding='utf-8') as f: await asyncio.to_thread(f.write, cloned_code)
        
        new_symlink = os.path.join(new_dir, "current.py")
        new_rel_v1 = os.path.join("versions", new_v1_file)
        if os.path.lexists(new_symlink): os.remove(new_symlink)
        os.symlink(new_rel_v1, new_symlink)

        now = datetime.datetime.now().isoformat()
        desc = description_override or f"Clone of '{source_server_name}' v{v_to_clone}: {s_v_meta.get('commit_summary', 'N/A')}"
        new_meta = {
            "server_name": new_name_safe, "created_at": now, "last_updated": now, "description": desc,
            "current_version": 1, "cloned_from": {"source_server_name": source_server_name, "source_version": v_to_clone},
            "versions": [{"version": 1, "timestamp": now, "file": new_rel_v1, 
                          "user_request": f"Clone from {source_server_name} v{v_to_clone}",
                          "commit_summary": f"🎯 Initial (cloned from '{source_server_name}' v{v_to_clone})",
                          "size": len(cloned_code), "line_count": len(cloned_code.splitlines()), "edit_type": "clone"}]
        }
        await save_server_metadata(os.path.join(new_dir, "server_meta.json"), new_meta)

        reload_status, reload_message = "skipped", "MCP_INTERNAL_API_KEY not set"
        if os.getenv("MCP_INTERNAL_API_KEY"):
            try:
                response = await asyncio.to_thread(requests.post, "http://localhost:5001/admin/servers/reload", timeout=30,
                                                   headers={"Content-Type": "application/json", "X-Internal-API-Key": os.getenv("MCP_INTERNAL_API_KEY")},
                                                   json=new_symlink)
                response.raise_for_status()
                r_data = response.json()
                reload_status, reload_message = r_data.get("status", "error"), r_data.get("message", "N/A")
            except Exception as e: reload_status, reload_message = "error", str(e)

        return {
            "status": "success" if reload_status != "error" else "partial_success",
            "message": f"Server '{new_server_name}' cloned from '{source_server_name}' v{v_to_clone}. Reload: {reload_status}. {reload_message}",
            "new_server_name": new_name_safe, "new_server_path": new_symlink, 
            "new_server_url": f"mcp://{user_id_safe}/{new_name_safe}",
            "cloned_from": {"source_server_name": source_server_name, "source_version": v_to_clone},
            "initial_version": 1, "reload_status": reload_status, "reload_message": reload_message
        }
    except Exception as e:
        if os.path.isdir(new_dir): # Cleanup
            try: await asyncio.to_thread(shutil.rmtree, new_dir) 
            except: pass
        return {"status": "error", "message": f"Cloning server failed: {e}"}

@mcp.tool(
    annotations={
        "outputSchema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["success", "error"]},
                "message": {"type": "string"},
                "server_name": {"type": "string"},
                "version_number": {"type": "integer"},
                "python_code": {"type": "string", "nullable": True},
                "content_length": {"type": "integer", "nullable": True},
                "version_info": {"type": "object", "nullable": True},
                "is_current_version": {"type": "boolean"}
            },
            "required": ["status", "message", "server_name", "version_number", "python_code", "content_length", "version_info", "is_current_version"]
        }
    }
)
async def view_mcp_server_version(
    ctx: Context, server_name: Annotated[str, Field(description="Name of the MCP server.")],
    version_number: Annotated[Optional[int], Field(description="Version to view. Defaults to current.")] = None,
    user_number: Annotated[str, Field(description="User's unique identifier.")] = "+17145986105",
    include_content: Annotated[bool, Field(description="Whether to include Python code.")] = True
) -> dict:
    """Views a specific version of an MCP server's Python code and metadata."""
    user_id_safe = sanitize_for_path(user_number)
    server_name_safe = sanitize_for_path(server_name)
    server_dir = os.path.join(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')),
                              "user_data", user_id_safe, "mcp_servers", server_name_safe)
    meta_path = os.path.join(server_dir, "server_meta.json")

    if not os.path.isdir(server_dir) or not os.path.exists(meta_path):
        return {"status": "error", "message": f"Server '{server_name_safe}' or metadata not found."}

    try:
        metadata = await load_server_metadata(meta_path)
        if not metadata: return {"status": "error", "message": "Failed to load metadata."}

        current_version = metadata.get("current_version", 1)
        versions_history = metadata.get("versions", [])
        
        view_version_num = version_number if version_number is not None else current_version
        
        target_v_info = next((v for v in versions_history if v.get("version") == view_version_num), None)
        if not target_v_info or not target_v_info.get("file"):
            return {"status": "error", "message": f"Version {view_version_num} or its file path not found in metadata."}

        version_file_path = os.path.normpath(os.path.join(server_dir, target_v_info["file"]))
        if not os.path.exists(version_file_path):
            return {"status": "error", "message": f"Code file for v{view_version_num} missing at {version_file_path}."}

        response_data = {
            "status": "success",
            "message": f"Details for '{server_name_safe}' v{view_version_num}.",
            "server_name": server_name_safe,
            "version_number": view_version_num,
            "is_current_version": view_version_num == current_version,
            "version_info": target_v_info,
            "python_code": None,
            "content_length": None
        }

        if include_content:
            with open(version_file_path, 'r', encoding='utf-8') as f:
                python_code = await asyncio.to_thread(f.read)
            response_data["python_code"] = python_code
            response_data["content_length"] = len(python_code)
        
        return response_data
    except Exception as e:
        return {"status": "error", "message": f"Viewing server version failed: {str(e)}"}

# --- Main Execution Block (for direct execution or if mcp_service starts it) ---
if __name__ == "__main__":
    transport = os.getenv("FASTMCP_TRANSPORT", "stdio")
    if transport == "streamable-http":
        host = os.getenv("FASTMCP_HOST", "127.0.0.1")
        port = int(os.getenv("FASTMCP_PORT", "9000"))
        print(f"Starting server 'MCP Server Creation & Versioning Server' with streamable-http transport on {host}:{port}")
        mcp.run(transport="streamable-http", host=host, port=port)
    else:
        print(f"Starting server 'MCP Server Creation & Versioning Server' with stdio transport")
        mcp.run()
