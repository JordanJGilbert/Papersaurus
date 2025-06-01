#!/usr/bin/env python3
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
from fastmcp import FastMCP, Context
import asyncio
import requests
import json
import uuid
import re
import traceback
from typing import List, Optional, Dict, Any, Annotated, Literal
import datetime

mcp = FastMCP("Server Creation Server")

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

# Get the internal API key for calling the MCP service
INTERNAL_API_KEY = os.getenv("MCP_INTERNAL_API_KEY", "your_secret_internal_api_key_here")

def sanitize_for_filename(name: str) -> str:
    """Sanitizes a string to be safe for use as a filename."""
    if not isinstance(name, str):
        name = str(name)
    
    # Remove or replace problematic characters
    name = re.sub(r'[^\w\-_.]', '_', name)
    name = re.sub(r'_+', '_', name)
    name = name.strip('_.- ')
    
    if not name:
        return f"server_{uuid.uuid4().hex[:8]}"
    return name

current_date = datetime.datetime.now().strftime("%Y-%m-%d")

SERVER_CREATION_SYSTEM_PROMPT = f"""You are an expert Python developer specializing in creating MCP (Model Context Protocol) servers using FastMCP.

Current date: {current_date}

# MCP Server Creation Instructions

You will create a complete, production-ready MCP server based on the user's requirements. The server should follow these patterns:

## Required Structure

1. **Imports and Setup**:
```python
#!/usr/bin/env python3
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
from fastmcp import FastMCP, Context
import asyncio
import json
import uuid
import re
import traceback
from typing import List, Optional, Dict, Any, Annotated, Literal
import logging
from pydantic import Field
import datetime
# Add other imports as needed

logging.basicConfig(stream=sys.stderr, level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

mcp = FastMCP("Your Server Name Here")
```

2. **Tool Definitions**:
Every tool MUST have complete output schema annotations following this exact pattern:

```python
@mcp.tool(
    annotations={{
        "outputSchema": {{
            "type": "object",
            "properties": {{
                "status": {{
                    "type": "string",
                    "enum": ["success", "error"],
                    "description": "Operation status"
                }},
                "message": {{
                    "type": "string", 
                    "description": "Human-readable result message"
                }},
                # Add other properties as needed for the specific tool
            }},
            "required": ["status", "message"],
            "description": "Response from the tool operation"
        }}
    }}
)
async def your_tool_name(
    ctx: Context,  # Required parameter (no default) - comes first
    required_param: Annotated[str, Field(description="Required parameter description")],  # Other required params
    user_number: Annotated[str, Field(
        description="The user's unique identifier, typically provided by the backend."
    )] = "+17145986105",  # Optional parameters with defaults come after required ones
    optional_param: Annotated[Optional[str], Field(
        description="Optional parameter description"
    )] = None
) -> dict:
    \"\"\"
    Tool description here.
    
    Args:
        ctx: Context for AI sampling capabilities
        required_param: Description of required parameter
        user_number: User identifier
        optional_param: Description of optional parameter
        
    Returns:
        dict: Status and results of the operation
    \"\"\"
    try:
        # Tool implementation here
        
        return {{
            "status": "success",
            "message": "Operation completed successfully",
            # Add other return fields
        }}
    except Exception as e:
        logger.error(f"Error in your_tool_name: {{str(e)}}")
        return {{
            "status": "error", 
            "message": f"Error: {{str(e)}}"
        }}
```

CRITICAL: Parameter Ordering Rules:
1. All required parameters (without defaults) MUST come first
2. All optional parameters (with defaults) MUST come after required parameters
3. The `ctx: Context` parameter should come first if the tool uses AI sampling
4. `user_number` typically has a default, so it comes after required parameters

## Parameter Validation

Always validate required parameters at the start of your tool functions:

```python
async def your_tool(
    ctx: Context,
    required_param: Annotated[str, Field(description="Required parameter")],
    user_number: str = "+17145986105",
    optional_param: Optional[str] = None
) -> dict:
    try:
        # Validate required parameters first
        if not required_param or not required_param.strip():
            return {{
                "status": "error",
                "message": "required_param is required and cannot be empty"
            }}
        
        # Tool implementation continues...
        
    except Exception as e:
        return {{"status": "error", "message": f"Error: {{str(e)}}"}}
```

## AI Sampling Integration (ctx.sample)

Your generated MCP servers can leverage powerful AI capabilities through `ctx.sample`. This allows tools to use AI for content generation, analysis, decision-making, and more.

### Basic AI Sampling Pattern:

```python
@mcp.tool(
    annotations={{
        "outputSchema": {{
            "type": "object",
            "properties": {{
                "status": {{"type": "string", "enum": ["success", "error"]}},
                "message": {{"type": "string"}},
                "ai_result": {{"type": "string", "description": "AI-generated content"}}
            }},
            "required": ["status", "message"]
        }}
    }}
)
async def ai_powered_tool(
    ctx: Context,
    prompt: Annotated[str, Field(description="Input prompt for AI processing")],
    user_number: Annotated[str, Field(description="User identifier")] = "+17145986105"
) -> dict:
    \"\"\"Tool that uses AI to process user input.\"\"\"
    try:
        # Use ctx.sample for AI generation
        response = await ctx.sample(
            messages=f"Process this request: {{prompt}}",
            system_prompt="You are a helpful assistant that processes user requests clearly and concisely.",
            model_preferences=["gemini-2.5-flash-preview-05-20"]
        )
        
        ai_text = response.text if hasattr(response, 'text') else str(response)
        
        return {{
            "status": "success",
            "message": "AI processing completed",
            "ai_result": ai_text
        }}
    except Exception as e:
        return {{"status": "error", "message": f"AI processing failed: {{str(e)}}"}}
```

### Advanced AI Sampling with Structured Output:

```python
# For structured JSON output, use model_preferences with smuggled schema
async def structured_ai_tool(
    ctx: Context,
    requirements: Annotated[str, Field(description="Requirements to analyze")],
    user_number: Annotated[str, Field(description="User identifier")] = "+17145986105"
) -> dict:
    try:
        # Define the JSON schema you want the AI to follow
        json_schema = {{
            "type": "object",
            "properties": {{
                "analysis": {{"type": "string"}},
                "recommendations": {{
                    "type": "array",
                    "items": {{"type": "string"}}
                }},
                "confidence": {{"type": "number", "minimum": 0, "maximum": 1}}
            }},
            "required": ["analysis", "recommendations", "confidence"]
        }}
        
        # Smuggle the schema in model_preferences as the second element
        response = await ctx.sample(
            messages=f"Analyze these requirements: {{requirements}}",
            system_prompt="You are an expert analyst. Provide structured analysis in the specified JSON format.",
            model_preferences=["gemini-2.5-flash-preview-05-20", json.dumps(json_schema)]
        )
        
        # The response should be structured according to your schema
        result = response.parsed if hasattr(response, 'parsed') else json.loads(response.text)
        
        return {{
            "status": "success",
            "message": "Structured analysis completed",
            "analysis_result": result
        }}
    except Exception as e:
        return {{"status": "error", "message": f"Analysis failed: {{str(e)}}"}}
```

### AI Sampling with Context and Attachments:

```python
# Process attachments or complex context with AI
async def ai_analysis_tool(
    ctx: Context,
    analysis_prompt: Annotated[str, Field(description="Prompt for analysis")],
    user_number: Annotated[str, Field(description="User identifier")] = "+17145986105",
    attachment_urls: Annotated[Optional[List[str]], Field(description="URLs to analyze")] = None
) -> dict:
    try:
        # Prepare messages with attachments
        messages = analysis_prompt
        
        # If you need to include attachment context, you can:
        # 1. Download and process attachments yourself
        # 2. Include attachment URLs in the prompt
        # 3. Use the smuggled attachments pattern
        
        if attachment_urls:
            # Smuggle attachments in messages
            messages = [
                {{"content": analysis_prompt, "_attachments": attachment_urls}}
            ]
        
        response = await ctx.sample(
            messages=messages,
            system_prompt="You are an expert content analyzer. Analyze the provided content and attachments thoroughly.",
            model_preferences=["gemini-2.5-flash-preview-05-20"]
        )
        
        return {{
            "status": "success", 
            "message": "Content analysis completed",
            "analysis": response.text if hasattr(response, 'text') else str(response)
        }}
    except Exception as e:
        return {{"status": "error", "message": f"Analysis failed: {{str(e)}}"}}
```

## AI Processing and Tool Integration Patterns

When your MCP server needs AI processing or to call other MCP tools, follow these patterns:

### AI Processing with ctx.sample:

```python
# Use ctx.sample for all AI processing needs
async def your_ai_tool(
    ctx: Context,
    prompt: Annotated[str, Field(description="Input for AI processing")],
    user_number: Annotated[str, Field(description="User identifier")] = "+17145986105"
) -> dict:
    try:
        # Define your JSON schema for structured output
        json_schema = {{
            "type": "object",
            "properties": {{
                "your_data": {{"type": "array", "items": {{"type": "string"}}}},
                "count": {{"type": "integer"}}
            }},
            "required": ["your_data", "count"]
        }}
        
        # Use ctx.sample with schema smuggling for structured output
        response = await ctx.sample(
            messages=f"Process this request: {{prompt}}",
            system_prompt="You are a helpful assistant. Return structured JSON as specified.",
            model_preferences=["gemini-2.5-flash-preview-05-20", json.dumps(json_schema)]
        )
        
        # Handle the response - it may be parsed or text
        if hasattr(response, 'parsed') and response.parsed:
            result_data = response.parsed
        else:
            # Parse from text if not already parsed
            response_text = response.text if hasattr(response, 'text') else str(response)
            try:
                result_data = json.loads(response_text)
            except json.JSONDecodeError:
                # Try to extract JSON from markdown if direct parsing fails
                import re
                match = re.search(r'```json\\s*([\\s\\S]*?)\\s*```', response_text, re.DOTALL)
                if match:
                    result_data = json.loads(match.group(1).strip())
                else:
                    return {{"status": "error", "message": "AI did not return valid JSON"}}
        
        return {{
            "status": "success",
            "message": "AI processing completed",
            "data": result_data
        }}
        
    except Exception as e:
        return {{"status": "error", "message": f"AI processing failed: {{str(e)}}"}}
```

### Calling Other MCP Tools:

```python
# When you need to call other MCP tools
import requests

# Get the internal API key
MCP_INTERNAL_API_KEY = os.getenv("MCP_INTERNAL_API_KEY")
headers = {{"X-Internal-API-Key": MCP_INTERNAL_API_KEY, "Content-Type": "application/json"}}

tool_payload = {{
    "tool_name": "your_tool_name",
    "arguments": {{
        "param1": "value1",
        "user_number": user_number
    }},
    "user_id_context": user_number
}}

response = requests.post("http://localhost:5001/internal/call_mcp_tool", headers=headers, json=tool_payload, timeout=120)
response.raise_for_status()
tool_response = response.json()

if tool_response.get("error"):
    return {{"status": "error", "message": f"Tool call failed: {{tool_response.get('error')}}"}}

# Parse the tool result
try:
    tool_result = json.loads(tool_response.get("result", "{{}}"))
except json.JSONDecodeError:
    # If it's not JSON, use the raw result
    tool_result = tool_response.get("result", "")
```

### Supported Models for AI Sampling:

Available models you can use in model_preferences:
- "gemini-2.5-flash-preview-05-20" (fast, good for most tasks)
- "gemini-2.5-pro-preview-05-06" (more capable, slower)
- "models/gemini-2.0-flash" 
- "gemini-2.0-flash"
- "claude-3-7-sonnet-latest"
- "gpt-4.1-2025-04-14"
- "o4-mini-2025-04-16"

### Common AI Sampling Use Cases:

1. **Content Generation**: Create articles, reports, documentation
2. **Data Analysis**: Analyze CSV data, logs, user feedback
3. **Code Generation**: Generate scripts, configurations, templates
4. **Content Transformation**: Translate, summarize, reformat content
5. **Decision Making**: Analyze options and provide recommendations
6. **Creative Tasks**: Generate ideas, stories, marketing copy
7. **Data Extraction**: Extract structured data from unstructured text
8. **Validation**: Check content quality, compliance, accuracy

### Best Practices for AI Sampling:

1. **Clear Prompts**: Be specific about what you want the AI to do
2. **System Prompts**: Use system prompts to set the AI's role and behavior
3. **Error Handling**: Always wrap ctx.sample in try/catch blocks
4. **Model Selection**: Choose appropriate models for the task complexity
5. **Structured Output**: Use JSON schemas when you need consistent data formats
6. **Context Management**: Include relevant context in prompts for better results
7. **Response Processing**: Handle both text and parsed responses appropriately

3. **Server Startup**:
```python
if __name__ == "__main__":
    # Check if we should use HTTP transport
    transport = os.getenv("FASTMCP_TRANSPORT", "stdio")
    
    if transport == "streamable-http":
        host = os.getenv("FASTMCP_HOST", "127.0.0.1")
        port = int(os.getenv("FASTMCP_PORT", "9000"))
        logger.info(f"Starting server with streamable-http transport on {{host}}:{{port}}")
        mcp.run(transport="streamable-http", host=host, port=port)
    else:
        logger.info("Starting server with stdio transport")
        mcp.run()
```

## Required Patterns

1. **Error Handling**: All tools must have comprehensive try/catch blocks
2. **Logging**: Use the logger for debugging and error tracking
3. **Type Annotations**: Use proper type hints with Annotated and Field
4. **Output Schemas**: Every tool MUST have a complete outputSchema annotation
5. **User Context**: Include user_number parameter when user context is relevant
6. **Async Operations**: Use async/await properly for any I/O operations
7. **AI Integration**: Include ctx parameter when tools need AI capabilities
8. **HTTP API Integration**: Use proper patterns for calling ctx.sample and /internal/call_mcp_tool endpoints

## Content Guidelines

1. **Functionality**: Create tools that are actually useful and solve real problems
2. **Documentation**: Include clear docstrings for all tools
3. **Validation**: Validate inputs and handle edge cases gracefully
4. **Security**: Don't expose sensitive operations without proper validation
5. **Performance**: Use efficient implementations and avoid blocking operations
6. **AI Enhancement**: Consider how AI can enhance tool capabilities

## Example Tools You Might Create

- **Content Generation Tools**: Blog writers, report generators, documentation creators
- **Data Analysis Tools**: CSV analyzers, log processors, trend analyzers  
- **Code Generation Tools**: Script generators, config creators, template builders
- **File Processing Tools**: Document converters, image processors, data transformers
- **API Integration Tools**: External service connectors, data synchronizers
- **Utility Tools**: Text processors, calculators, validators
- **Workflow Automation Tools**: Task orchestrators, notification systems
- **AI-Powered Tools**: Content analyzers, decision makers, creative assistants

## Important Notes

- The server will be dynamically loaded, so ensure it's self-contained
- Follow Python best practices and PEP 8 style guidelines
- Make tools that complement the existing ecosystem
- Ensure all imports are available or add installation notes in comments
- Test edge cases and error conditions
- Leverage AI sampling to create more intelligent and capable tools
- Consider how AI can solve complex problems that traditional code cannot
- When calling ctx.sample endpoint, always parse the JSON from the 'result' field
- When calling /internal/call_mcp_tool, handle both JSON and text responses appropriately

## Output Format

You must return ONLY the complete Python code for the MCP server. Do not include any explanations, comments outside the code, or markdown formatting. Just return the raw Python code that can be saved directly as a .py file.

The code should be production-ready and fully functional upon creation.

IMPORTANT: You must format the output as a complete Python file like this:

Output Format Example:
server_name.py
```
#!/usr/bin/env python3
# Complete server code here
```

You MUST return ONLY the complete Python code inside a single Markdown code block (triple backticks). Do NOT include any explanations, comments, or text outside the code block. The code block should start with ```python and contain the full server implementation.
"""

@mcp.tool(
    annotations={
        "outputSchema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["success", "error"],
                    "description": "Server creation status"
                },
                "message": {
                    "type": "string",
                    "description": "Human-readable status message"
                },
                "server_name": {
                    "type": "string",
                    "description": "Name of the created server file"
                },
                "server_path": {
                    "type": "string", 
                    "description": "Full path to the created server file"
                },
                "tools_created": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of tool names created in the server"
                },
                "discovery_result": {
                    "type": "object",
                    "properties": {
                        "status": {"type": "string"},
                        "message": {"type": "string"},
                        "new_servers_count": {"type": "integer"}
                    },
                    "description": "Result from the dynamic server discovery process"
                }
            },
            "required": ["status", "message"],
            "description": "Result of MCP server creation and integration"
        }
    }
)
async def create_mcp_server(
    ctx: Context,
    requirements: Annotated[str, Field(
        description="Detailed description of what the MCP server should do, what tools it should provide, and any specific functionality needed."
    )],
    user_number: Annotated[str, Field(
        description="The user's unique identifier, typically provided by the backend."
    )] = "+17145986105",
    server_name: Annotated[Optional[str], Field(
        description="Name for the new server (will be sanitized for filename). If not provided, will be generated based on requirements."
    )] = None,
    model: Annotated[MODELS_LITERAL, Field(
        description="The LLM model to use for generating the server code. Use gemini-2.5-flash-preview-05-20 unless user requests otherwise."
    )] = "gemini-2.5-flash-preview-05-20",
    additional_context: Annotated[Optional[str], Field(
        description="Additional context or constraints for the server creation (e.g., specific libraries to use, integration requirements)."
    )] = None
) -> dict:
    """
    Creates a new MCP server based on requirements using AI code generation.
    The server will be automatically integrated into the system without requiring restarts.
    
    "gemini-2.5-flash-preview-05-20" is the default model.
    
    Args:
        ctx: Context for AI sampling capabilities
        requirements: Description of what the server should do
        user_number: User identifier
        server_name: Desired name for the server
        model: LLM model for code generation
        additional_context: Additional requirements or constraints
        
    Returns:
        dict: Status, server details, and integration result
    """
    try:
        if not requirements or not requirements.strip():
            return {
                "status": "error",
                "message": "requirements parameter is required and cannot be empty"
            }
        
        # Generate server name if not provided
        if not server_name:
            # Extract a name from requirements
            words = re.findall(r'\b\w+\b', requirements.lower())
            if len(words) >= 2:
                server_name = f"{words[0]}_{words[1]}_server"
            else:
                server_name = f"custom_server_{uuid.uuid4().hex[:8]}"
        
        # Sanitize server name
        server_name_safe = sanitize_for_filename(server_name)
        if not server_name_safe.endswith('_server'):
            server_name_safe += '_server'
        
        # Prepare the prompt for AI
        prompt_text = f"Create an MCP server with the following requirements:\n\n{requirements}"
        
        if additional_context:
            prompt_text += f"\n\nAdditional Context:\n{additional_context}"
        
        prompt_text += f"\n\nServer Name: {server_name_safe}"
        
        print(f"Generating MCP server '{server_name_safe}' using model {model}")
        
        # Use ctx.sample to generate the server code
        try:
            llm_response = await ctx.sample(
                messages=prompt_text,
                system_prompt=SERVER_CREATION_SYSTEM_PROMPT,
                model_preferences=[model]
            )
            
            if hasattr(llm_response, 'text'):
                response_text = llm_response.text
            else:
                response_text = str(llm_response)
                
        except Exception as e:
            print(f"Error during AI code generation: {str(e)}")
            return {
                "status": "error",
                "message": f"Failed to generate server code: {str(e)}"
            }
        
        if not response_text:
            return {
                "status": "error", 
                "message": "AI returned empty response for server code generation"
            }
        
        # Extract Python code from response
        server_code = ""
        code_block_match = re.search(r'```(?:python)?\s*([\s\S]*?)\s*```', response_text)
        if code_block_match:
            server_code = code_block_match.group(1)
        
        if not server_code:
            # Fallback: try to use the entire response if no code blocks found
            server_code = response_text
        
        if not server_code.strip():
            return {
                "status": "error",
                "message": "No valid Python code generated by AI"
            }
        
        # Save the server file
        servers_dir = "/var/www/flask_app/mcp_client/mcp_servers"
        server_filename = f"{server_name_safe}.py"
        server_path = os.path.join(servers_dir, server_filename)
        
        # Ensure the directory exists
        os.makedirs(servers_dir, exist_ok=True)
        
        try:
            with open(server_path, 'w', encoding='utf-8') as f:
                f.write(server_code)
            print(f"Server code saved to {server_path}")
        except Exception as e:
            print(f"Failed to save server file: {str(e)}")
            return {
                "status": "error",
                "message": f"Failed to save server file: {str(e)}"
            }
        
        # Extract tool names from the generated code (basic parsing)
        tools_created = []
        tool_matches = re.findall(r'@mcp\.tool\(.*?\)\s*(?:async\s+)?def\s+(\w+)', server_code, re.DOTALL)
        tools_created = tool_matches
        
        # Call the MCP service discovery endpoint to integrate the new server
        discovery_result = {"status": "not_attempted", "message": "Discovery not attempted"}
        
        try:
            discovery_url = "http://localhost:5001/admin/servers/discover_new"
            headers = {
                "Content-Type": "application/json",
                "X-Internal-API-Key": INTERNAL_API_KEY
            }
            
            response = requests.post(discovery_url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                discovery_result = response.json()
                print(f"Server discovery completed: {discovery_result}")
            else:
                discovery_result = {
                    "status": "error",
                    "message": f"Discovery endpoint returned status {response.status_code}: {response.text}"
                }
                print(f"Discovery endpoint error: {discovery_result['message']}")
                
        except Exception as e:
            discovery_result = {
                "status": "error", 
                "message": f"Failed to call discovery endpoint: {str(e)}"
            }
            print(f"Error calling discovery endpoint: {str(e)}")
        
        # Determine overall status
        overall_status = "success"
        message_parts = [f"Server '{server_name_safe}' created successfully"]
        
        if tools_created:
            message_parts.append(f"with {len(tools_created)} tools: {', '.join(tools_created)}")
        
        # Check if discovery was successful AND if the new server actually started
        discovery_success = False
        if discovery_result.get("status") == "success":
            successful_starts = discovery_result.get("successful_starts", 0)
            failed_starts = discovery_result.get("failed_starts", 0)
            new_servers = discovery_result.get("new_servers", [])
            
            # Check if our specific server was in the new servers and started successfully
            our_server_started = False
            for server_info in new_servers:
                if server_info.get("script_path") == f"mcp_client/mcp_servers/{server_name_safe}.py":
                    our_server_started = server_info.get("started_successfully", False)
                    break
            
            if our_server_started and successful_starts > 0:
                discovery_success = True
                message_parts.append("and integrated into the system")
            else:
                overall_status = "partial_success"
                if failed_starts > 0:
                    message_parts.append("but failed to start automatically - check server logs for syntax errors or dependency issues")
                else:
                    message_parts.append("but integration status unclear - you may need to restart the MCP service")
        elif discovery_result.get("status") == "error":
            overall_status = "partial_success"
            discovery_error = discovery_result.get("message", "Unknown discovery error")
            message_parts.append(f"but failed to integrate automatically: {discovery_error}")
        else:
            overall_status = "partial_success"
            message_parts.append("but discovery was not attempted - manual restart may be required")
        
        # Add additional guidance for partial success
        if overall_status == "partial_success":
            message_parts.append("The server file was created successfully, but you may need to manually restart the MCP service for the tools to become available.")
        
        return {
            "status": overall_status,
            "message": ". ".join(message_parts) + ".",
            "server_name": server_name_safe,
            "server_path": server_path,
            "tools_created": tools_created,
            "discovery_result": discovery_result
        }
        
    except Exception as e:
        print(f"Error in create_mcp_server: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        return {
            "status": "error",
            "message": f"Error creating MCP server: {str(e)}"
        }

@mcp.tool(
    annotations={
        "outputSchema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["success", "error"],
                    "description": "Listing operation status"
                },
                "message": {
                    "type": "string",
                    "description": "Human-readable status message"
                },
                "servers": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "path": {"type": "string"},
                            "size_bytes": {"type": "integer"},
                            "modified_time": {"type": "string"},
                            "estimated_tools": {"type": "integer"}
                        }
                    },
                    "description": "List of existing MCP server files"
                },
                "total_servers": {
                    "type": "integer",
                    "description": "Total number of server files found"
                }
            },
            "required": ["status", "message", "servers", "total_servers"],
            "description": "List of existing MCP servers in the system"
        }
    }
)
async def list_mcp_servers(
    user_number: Annotated[str, Field(
        description="The user's unique identifier, typically provided by the backend."
    )] = "+17145986105"
) -> dict:
    """
    Lists all existing MCP server files in the system.
    
    Args:
        user_number: User identifier
        
    Returns:
        dict: List of server files with metadata
    """
    try:
        servers_dir = "/var/www/flask_app/mcp_client/mcp_servers"
        
        if not os.path.exists(servers_dir):
            return {
                "status": "error",
                "message": f"Servers directory not found: {servers_dir}",
                "servers": [],
                "total_servers": 0
            }
        
        servers = []
        
        for filename in os.listdir(servers_dir):
            if filename.endswith('.py') and filename != '__init__.py':
                file_path = os.path.join(servers_dir, filename)
                
                try:
                    stat_info = os.stat(file_path)
                    
                    # Read file to estimate number of tools
                    estimated_tools = 0
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                            estimated_tools = len(re.findall(r'@mcp\.tool\(', content))
                    except Exception:
                        estimated_tools = 0
                    
                    servers.append({
                        "name": filename[:-3],  # Remove .py extension
                        "path": file_path,
                        "size_bytes": stat_info.st_size,
                        "modified_time": datetime.datetime.fromtimestamp(stat_info.st_mtime).isoformat(),
                        "estimated_tools": estimated_tools
                    })
                except Exception as e:
                    print(f"Error reading server file {filename}: {str(e)}")
        
        # Sort by modification time (newest first)
        servers.sort(key=lambda x: x['modified_time'], reverse=True)
        
        return {
            "status": "success",
            "message": f"Found {len(servers)} MCP server files",
            "servers": servers,
            "total_servers": len(servers)
        }
        
    except Exception as e:
        print(f"Error in list_mcp_servers: {str(e)}")
        return {
            "status": "error",
            "message": f"Error listing servers: {str(e)}",
            "servers": [],
            "total_servers": 0
        }

@mcp.tool(
    annotations={
        "outputSchema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string", 
                    "enum": ["success", "error"],
                    "description": "Reload operation status"
                },
                "message": {
                    "type": "string",
                    "description": "Human-readable status message"
                },
                "server_name": {
                    "type": "string",
                    "description": "Name of the reloaded server"
                },
                "reload_result": {
                    "type": "object",
                    "properties": {
                        "status": {"type": "string"},
                        "message": {"type": "string"},
                        "was_running": {"type": "boolean"},
                        "started_successfully": {"type": "boolean"}
                    },
                    "description": "Detailed result from the reload operation"
                }
            },
            "required": ["status", "message"],
            "description": "Result of MCP server reload operation"
        }
    }
)
async def reload_mcp_server(
    server_name: Annotated[str, Field(
        description="Name of the server to reload (without .py extension)"
    )],
    user_number: Annotated[str, Field(
        description="The user's unique identifier, typically provided by the backend."
    )] = "+17145986105"
) -> dict:
    """
    Reloads a specific MCP server to pick up any code changes.
    
    Args:
        server_name: Name of the server to reload
        user_number: User identifier
        
    Returns:
        dict: Status and result of the reload operation
    """
    try:
        if not server_name:
            return {
                "status": "error",
                "message": "server_name is required for reload operation"
            }
        
        # Sanitize server name
        server_name_safe = sanitize_for_filename(server_name)
        if not server_name_safe.endswith('_server'):
            if not server_name_safe.endswith('.py'):
                server_name_safe += '_server'
        
        # Remove .py if present
        if server_name_safe.endswith('.py'):
            server_name_safe = server_name_safe[:-3]
        
        server_filename = f"{server_name_safe}.py"
        server_path = f"/var/www/flask_app/mcp_client/mcp_servers/{server_filename}"
        
        # Check if server file exists
        if not os.path.exists(server_path):
            return {
                "status": "error",
                "message": f"Server file not found: {server_path}"
            }
        
        # Call the MCP service reload endpoint
        try:
            reload_url = "http://localhost:5001/admin/servers/reload"
            headers = {
                "X-Internal-API-Key": INTERNAL_API_KEY,
                "Content-Type": "application/json"
            }
            server_script_path = f"mcp_client/mcp_servers/{server_filename}"
            
            # Send server_script_path as raw JSON data, not as json parameter
            response = requests.post(
                reload_url, 
                headers=headers, 
                data=json.dumps(server_script_path), 
                timeout=45  # Increased timeout for reload process
            )
            
            if response.status_code == 200:
                reload_result = response.json()
                print(f"Server reload completed: {reload_result}")
                
                return {
                    "status": "success",
                    "message": f"Server '{server_name_safe}' reloaded successfully",
                    "server_name": server_name_safe,
                    "reload_result": reload_result
                }
            else:
                error_msg = f"Reload endpoint returned status {response.status_code}: {response.text}"
                print(error_msg)
                return {
                    "status": "error",
                    "message": error_msg,
                    "server_name": server_name_safe
                }
                
        except requests.exceptions.Timeout:
            error_msg = f"Reload request timed out after 45 seconds"
            print(error_msg)
            return {
                "status": "error",
                "message": error_msg,
                "server_name": server_name_safe
            }
        except Exception as e:
            error_msg = f"Failed to call reload endpoint: {str(e)}"
            print(error_msg)
            return {
                "status": "error",
                "message": error_msg,
                "server_name": server_name_safe
            }
        
    except Exception as e:
        print(f"Error in reload_mcp_server: {str(e)}")
        return {
            "status": "error",
            "message": f"Error reloading server: {str(e)}"
        }

@mcp.tool(
    annotations={
        "outputSchema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["success", "error"],
                    "description": "Check operation status"
                },
                "message": {
                    "type": "string",
                    "description": "Human-readable status message"
                },
                "server_name": {
                    "type": "string",
                    "description": "Name of the checked server"
                },
                "server_exists": {
                    "type": "boolean",
                    "description": "Whether the server file exists"
                },
                "server_running": {
                    "type": "boolean",
                    "description": "Whether the server is currently running"
                },
                "tools_available": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of tools available from this server"
                },
                "diagnostic_info": {
                    "type": "object",
                    "properties": {
                        "file_path": {"type": "string"},
                        "file_size": {"type": "integer"},
                        "modified_time": {"type": "string"},
                        "syntax_check": {"type": "string"}
                    },
                    "description": "Additional diagnostic information"
                }
            },
            "required": ["status", "message"],
            "description": "Diagnostic information about an MCP server"
        }
    }
)
async def check_mcp_server_status(
    server_name: Annotated[str, Field(
        description="Name of the server to check (without .py extension)"
    )],
    user_number: Annotated[str, Field(
        description="The user's unique identifier, typically provided by the backend."
    )] = "+17145986105"
) -> dict:
    """
    Checks the status of a specific MCP server - whether it exists, is running, and what tools it provides.
    
    Args:
        server_name: Name of the server to check
        user_number: User identifier
        
    Returns:
        dict: Comprehensive status and diagnostic information
    """
    try:
        if not server_name:
            return {
                "status": "error",
                "message": "server_name is required for status check"
            }
        
        # Sanitize server name
        server_name_safe = sanitize_for_filename(server_name)
        if not server_name_safe.endswith('_server'):
            if not server_name_safe.endswith('.py'):
                server_name_safe += '_server'
        
        # Remove .py if present
        if server_name_safe.endswith('.py'):
            server_name_safe = server_name_safe[:-3]
        
        server_filename = f"{server_name_safe}.py"
        server_path = f"/var/www/flask_app/mcp_client/mcp_servers/{server_filename}"
        
        # Check if file exists
        server_exists = os.path.exists(server_path)
        
        diagnostic_info = {}
        if server_exists:
            try:
                stat_info = os.stat(server_path)
                diagnostic_info = {
                    "file_path": server_path,
                    "file_size": stat_info.st_size,
                    "modified_time": datetime.datetime.fromtimestamp(stat_info.st_mtime).isoformat()
                }
                
                # Basic syntax check
                try:
                    with open(server_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    compile(content, server_path, 'exec')
                    diagnostic_info["syntax_check"] = "PASS"
                except SyntaxError as se:
                    diagnostic_info["syntax_check"] = f"SYNTAX ERROR: {str(se)}"
                except Exception as e:
                    diagnostic_info["syntax_check"] = f"COMPILE ERROR: {str(e)}"
                    
            except Exception as e:
                diagnostic_info["syntax_check"] = f"FILE READ ERROR: {str(e)}"
        
        # Check if server is running by calling the MCP service tools endpoint
        server_running = False
        tools_available = []
        
        try:
            tools_url = "http://localhost:5001/tools/all"
            headers = {"Content-Type": "application/json"}
            
            response = requests.get(tools_url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                tools_data = response.json()
                all_tools = tools_data.get("tools", [])
                
                # Look for tools that might be from our server
                # This is a heuristic since we don't have perfect server attribution
                if server_exists:
                    try:
                        with open(server_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                        # Extract tool names from the file
                        expected_tools = re.findall(r'@mcp\.tool\(.*?\)\s*(?:async\s+)?def\s+(\w+)', content, re.DOTALL)
                        
                        # Check if these tools are available in the system
                        available_tool_names = [tool["name"] for tool in all_tools]
                        tools_available = [tool for tool in expected_tools if tool in available_tool_names]
                        
                        # Server is considered running if at least some of its tools are available
                        server_running = len(tools_available) > 0
                        
                    except Exception as e:
                        print(f"Error checking tools from server file: {str(e)}")
                        
        except Exception as e:
            print(f"Error checking server status via tools endpoint: {str(e)}")
        
        # Determine overall status
        if not server_exists:
            status_message = f"Server '{server_name_safe}' does not exist"
        elif not server_running:
            if diagnostic_info.get("syntax_check", "").startswith("SYNTAX ERROR") or diagnostic_info.get("syntax_check", "").startswith("COMPILE ERROR"):
                status_message = f"Server '{server_name_safe}' exists but has syntax/compile errors preventing it from running"
            else:
                status_message = f"Server '{server_name_safe}' exists but is not running - may need MCP service restart"
        else:
            status_message = f"Server '{server_name_safe}' is running with {len(tools_available)} tools available"
        
        return {
            "status": "success",
            "message": status_message,
            "server_name": server_name_safe,
            "server_exists": server_exists,
            "server_running": server_running,
            "tools_available": tools_available,
            "diagnostic_info": diagnostic_info
        }
        
    except Exception as e:
        print(f"Error in check_mcp_server_status: {str(e)}")
        return {
            "status": "error",
            "message": f"Error checking server status: {str(e)}"
        }

# --- System Prompt for MCP Server Editing ---
EDIT_MCP_SERVER_SYSTEM_PROMPT = f"""You are an expert Python developer specializing in editing MCP (Model Context Protocol) servers using FastMCP.

Current date: {current_date}

You will be given the complete original content of an MCP server Python file and a user's request describing desired modifications.
You may also receive an `additional_context` string containing information from previous steps that should inform your edits.

Your task is to return the COMPLETE MODIFIED Python file content that incorporates the requested changes.

## Guidelines:

1. **Complete File**: Return the entire Python file with all requested modifications applied.

2. **MCP Server Compliance**: Ensure all changes maintain proper MCP server structure:
   - Keep proper imports and FastMCP setup
   - Maintain tool decorations with output schemas
   - Follow parameter ordering rules (required before optional)
   - Include proper error handling and logging
   - Maintain the server startup block at the end

3. **Parameter Ordering**: Remember that required parameters (without defaults) must come before optional parameters (with defaults).

4. **Output Schema Compliance**: All tools must have complete `outputSchema` annotations.

5. **Preserve Existing**: Keep all existing functionality unless specifically asked to remove or modify it.

## Output Format:

You must return ONLY the complete Python code for the modified MCP server. Do not include any explanations, comments outside the code, or markdown formatting. Just return the raw Python code that can be saved directly as a .py file.

The code should be production-ready and fully functional upon creation.

IMPORTANT: You must format the output as a complete Python file like this:

```python
#!/usr/bin/env python3
# Complete server code here
```

You MUST return ONLY the complete Python code inside a single Markdown code block (triple backticks with python). Do NOT include any explanations, comments, or text outside the code block.
"""

@mcp.tool(
    annotations={
        "outputSchema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["success", "partial_success", "error"],
                    "description": "Edit operation status"
                },
                "message": {
                    "type": "string",
                    "description": "Human-readable status message"
                },
                "server_name": {
                    "type": "string",
                    "description": "Name of the edited server"
                },
                "server_path": {
                    "type": "string",
                    "description": "Path to the edited server file"
                },
                "changes_applied": {
                    "type": "integer",
                    "description": "Number of SEARCH/REPLACE blocks successfully applied"
                },
                "original_code": {
                    "type": "string",
                    "description": "The original server code before modifications"
                },
                "modified_code": {
                    "type": "string", 
                    "description": "The modified server code after applying changes"
                },
                "reload_result": {
                    "type": "object",
                    "properties": {
                        "status": {"type": "string"},
                        "message": {"type": "string"},
                        "was_running": {"type": "boolean"},
                        "started_successfully": {"type": "boolean"}
                    },
                    "description": "Result from automatic server reload (if attempted)"
                }
            },
            "required": ["status", "message"],
            "description": "Result of MCP server editing operation"
        }
    }
)
async def edit_mcp_server(
    ctx: Context,
    server_name: Annotated[str, Field(
        description="Name of the existing MCP server to edit (without .py extension)"
    )],
    edit_request: Annotated[str, Field(
        description="Description of the changes to make to the server code"
    )],
    user_number: Annotated[str, Field(
        description="The user's unique identifier, typically provided by the backend."
    )] = "+17145986105",
    model: Annotated[MODELS_LITERAL, Field(
        description="The LLM model to use for generating the edit instructions. Use gemini-2.5-flash-preview-05-20 unless user requests otherwise."
    )] = "gemini-2.5-flash-preview-05-20",
    additional_context: Annotated[Optional[str], Field(
        description="Additional context or constraints for the edit (e.g., specific requirements, integration needs)."
    )] = None,
    auto_reload: Annotated[bool, Field(
        description="Whether to automatically reload the server after editing"
    )] = True
) -> dict:
    """
    Edits an existing MCP server file based on user requests using AI-generated search/replace blocks.

    "gemini-2.5-flash-preview-05-20" is the default model.
    
    Args:
        ctx: Context for AI sampling capabilities
        server_name: Name of the server to edit
        edit_request: Description of changes to make
        user_number: User identifier
        model: LLM model for generating edits
        additional_context: Additional context for the edit
        auto_reload: Whether to reload the server after editing
        
    Returns:
        dict: Status, changes applied, and reload result
    """
    try:
        if not server_name:
            return {
                "status": "error",
                "message": "server_name is required for edit operation"
            }
        
        if not edit_request or not edit_request.strip():
            return {
                "status": "error", 
                "message": "edit_request is required and cannot be empty"
            }
        
        # Sanitize server name
        server_name_safe = sanitize_for_filename(server_name)
        if not server_name_safe.endswith('_server'):
            if not server_name_safe.endswith('.py'):
                server_name_safe += '_server'
        
        # Remove .py if present
        if server_name_safe.endswith('.py'):
            server_name_safe = server_name_safe[:-3]
        
        server_filename = f"{server_name_safe}.py"
        server_path = f"/var/www/flask_app/mcp_client/mcp_servers/{server_filename}"
        
        # Check if server file exists
        if not os.path.exists(server_path):
            return {
                "status": "error",
                "message": f"Server file not found: {server_filename}. Use create_mcp_server to create a new server first."
            }
        
        # Read the original server code
        try:
            with open(server_path, 'r', encoding='utf-8') as f:
                original_code = f.read()
        except Exception as e:
            return {
                "status": "error",
                "message": f"Failed to read server file: {str(e)}"
            }
        
        # Prepare the prompt for AI
        prompt_text = f"""Original MCP Server Code ({server_filename}):
```python
{original_code}
```

User's edit request:
"{edit_request}"

Please return the complete modified Python file that incorporates these changes.
"""
        
        if additional_context:
            prompt_text += f"\n\nAdditional Context to Consider:\n{additional_context}"
        
        print(f"Generating modified server code for '{server_name_safe}' using model {model}")
        
        # Use ctx.sample to generate the complete modified file
        try:
            llm_response = await ctx.sample(
                messages=prompt_text,
                system_prompt=EDIT_MCP_SERVER_SYSTEM_PROMPT,
                model_preferences=[model]
            )
            
            if hasattr(llm_response, 'text'):
                response_text = llm_response.text
            else:
                response_text = str(llm_response)
                
        except Exception as e:
            print(f"Error during AI code generation: {str(e)}")
            return {
                "status": "error",
                "message": f"Failed to generate modified server code: {str(e)}"
            }
        
        if not response_text:
            return {
                "status": "error",
                "message": "AI returned empty response for code generation"
            }
        
        # Extract Python code from response
        modified_code = ""
        code_block_match = re.search(r'```(?:python)?\s*([\s\S]*?)\s*```', response_text)
        if code_block_match:
            modified_code = code_block_match.group(1)
        
        if not modified_code:
            # Fallback: try to use the entire response if no code blocks found
            modified_code = response_text
        
        if not modified_code.strip():
            return {
                "status": "error",
                "message": "No valid Python code generated by AI"
            }
        
        # Simple validation - check if it's different from original
        if modified_code.strip() == original_code.strip():
            return {
                "status": "partial_success",
                "message": f"No changes were made to '{server_name_safe}'. The generated code is identical to the original.",
                "server_name": server_name_safe,
                "server_path": server_path,
                "changes_applied": 0,
                "original_code": original_code,
                "modified_code": original_code,
                "reload_result": {
                    "status": "not_attempted",
                    "message": "Reload not attempted"
                }
            }
        
        # Save the modified code
        try:
            with open(server_path, 'w', encoding='utf-8') as f:
                f.write(modified_code)
            print(f"Modified server code saved to {server_path}")
        except Exception as e:
            return {
                "status": "error",
                "message": f"Failed to save modified server file: {str(e)}"
            }
        
        # Prepare response
        result = {
            "status": "success",
            "message": f"Successfully applied edits to server '{server_name_safe}'",
            "server_name": server_name_safe,
            "server_path": server_path,
            "changes_applied": 1,  # File was modified
            "original_code": original_code,
            "modified_code": modified_code
        }
        
        # Auto-reload the server if requested
        if auto_reload:
            try:
                reload_url = "http://localhost:5001/admin/servers/reload"
                headers = {
                    "X-Internal-API-Key": INTERNAL_API_KEY,
                    "Content-Type": "application/json"
                }
                server_script_path = f"mcp_client/mcp_servers/{server_filename}"
                
                # Send server_script_path as raw JSON data, not as json parameter
                response = requests.post(
                    reload_url, 
                    headers=headers, 
                    data=json.dumps(server_script_path), 
                    timeout=45  # Increased timeout for reload process
                )
                
                if response.status_code == 200:
                    reload_result = response.json()
                    result["reload_result"] = reload_result
                    result["message"] += " and reloaded successfully"
                    print(f"Server {server_name_safe} reloaded successfully after edit")
                else:
                    reload_result = {
                        "status": "error",
                        "message": f"Reload failed with status {response.status_code}: {response.text}",
                        "was_running": False,
                        "started_successfully": False
                    }
                    result["reload_result"] = reload_result
                    result["status"] = "partial_success"
                    result["message"] += " but failed to reload - manual restart may be required"
                    
            except requests.exceptions.Timeout:
                reload_result = {
                    "status": "error",
                    "message": "Reload request timed out after 45 seconds",
                    "was_running": False,
                    "started_successfully": False
                }
                result["reload_result"] = reload_result
                result["status"] = "partial_success"
                result["message"] += " but reload timed out - check server logs"
            except Exception as e:
                reload_result = {
                    "status": "error",
                    "message": f"Reload attempt failed: {str(e)}",
                    "was_running": False,
                    "started_successfully": False
                }
                result["reload_result"] = reload_result
                result["status"] = "partial_success"
                result["message"] += " but reload failed - manual restart may be required"
        else:
            # If auto_reload is False, still add a reload_result for consistency
            result["reload_result"] = {
                "status": "not_attempted",
                "message": "Auto-reload was disabled"
            }
        
        return result
        
    except Exception as e:
        print(f"Error in edit_mcp_server: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        return {
            "status": "error",
            "message": f"Error editing MCP server: {str(e)}"
        }

if __name__ == "__main__":
    # Check if we should use HTTP transport
    transport = os.getenv("FASTMCP_TRANSPORT", "stdio")
    
    if transport == "streamable-http":
        host = os.getenv("FASTMCP_HOST", "127.0.0.1")
        port = int(os.getenv("FASTMCP_PORT", "9000"))
        print(f"Starting server with streamable-http transport on {host}:{port}")
        mcp.run(transport="streamable-http", host=host, port=port)
    else:
        print("Starting server with stdio transport")
        mcp.run() 