# Project Design Document

## Overview

This document outlines the design for the MCP (Multi-Capability Platform) project, detailing its core modules and the schemas for the tools they provide.

## Modules

-   **AST CHAT**

-   **Web App/PDF Creator**
    -   *Purpose: Dynamically generate and manage web applications and PDF documents based on user requests.*
    -   Can create any arbitrary website/PDF that the user requests.
    -   Has access to all MCP tools; this is achieved by having the AI pass any needed tools to the creator/editor functions.

-   **Python Code Executer**
    -   *Purpose: Enable on-the-fly Python code generation, editing, and execution within a controlled environment.*
    -   Creates and executes Python code dynamically.
    -   Has access to calling the AI directly and invoking other MCP tools from within the executed code.

-   **MCP Server Creation**
    -   *Purpose: Streamline the development and deployment of new MCP servers and their associated tools.*
    -   Should be able to facilitate the creation of a new MCP server, including scaffolding for its tools.
    -   *Further details to be added.*

## Tool Schemas

This section provides a simplified JSON-like schema for each tool available in the MCP servers. A parameter is marked as `"required": true` if it does not have a default value in its Python signature.

`MODELS_LITERAL = Literal["gemini-2.5-flash-preview-05-20", "gemini-2.5-pro-preview-05-06", "models/gemini-2.0-flash", "gemini-2.0-flash", "claude-3-7-sonnet-latest", "gpt-4.1-2025-04-14", "o4-mini-2025-04-16"]`

### Document Generation Server Tools (`document_generation_server.py`)

```json
[
  {
    "tool_name": "create_web_app",
    "description": "Creates a custom web application based on user specifications and provided attachments. The tool generates HTML content and hosts it, returning a URL to the created web app. IMPORTANT: The LLM calling this tool does NOT need to specify web design, layout, or detailed implementation instructions. The underlying system prompt (WEB_APP_PROMPT) is highly capable and will handle all aspects of web app generation, including design, interactivity, and advanced features. The LLM should focus on conveying the user's core request, any relevant contextual information, and attachments. Avoid adding prescriptive instructions on *how* to build or style the web app, unless these are specific, explicit user requirements.",
    "parameters": [
      {
        "name": "user_number",
        "type": "str",
        "description": "The user's unique identifier (e.g., phone number), used for directory structuring. This is typically provided by the backend system and should not be solicited from the end-user by the LLM.",
        "required": false,
        "default": "+17145986105"
      },
      {
        "name": "app_name",
        "type": "Optional[str]",
        "description": "The desired name for the web application. If not provided, a relevant name will be automatically generated. Use underscores for spaces (e.g., 'my_cool_app'). The LLM should choose a short, concise name relevant to the request if one isn't given by the user.",
        "required": false,
        "default": null
      },
      {
        "name": "attachments",
        "type": "Optional[List[str]]",
        "description": "A list of attachment URLs. These will be processed and potentially included or referenced in the web application. Base64 encoded data is no longer supported.",
        "required": false,
        "default": null
      },
      {
        "name": "user_request",
        "type": "Optional[str]",
        "description": "The user's primary request detailing what the web app should do, its purpose, or content. This is the main input for generation.",
        "required": false,
        "default": null
      },
      {
        "name": "client_injected_context",
        "type": "str",
        "description": "Additional context, such as conversation history, injected by the client system. This is not meant for direct user input but for providing broader context to the generation process.",
        "required": false,
        "default": "No additional context provided"
      },
      {
        "name": "model",
        "type": "MODELS_LITERAL",
        "description": "The LLM model to use for HTML generation.",
        "required": false,
        "default": "gemini-2.5-pro-preview-05-06"
      }
    ],
    "returns": "dict"
  },
  {
    "tool_name": "create_pdf_document",
    "description": "Creates a custom PDF document based on the user's request and any provided attachments. This tool leverages a powerful AI to generate HTML, which is then converted to a PDF. It is highly flexible and can produce a wide range of documents, from simple pages to complex reports. The LLM should assume this tool can fulfill any PDF creation request by describing the desired content and structure.",
    "parameters": [
      {
        "name": "user_number",
        "type": "str",
        "description": "The user's unique identifier (e.g., phone number), used for directory structuring. This is typically provided by the backend.",
        "required": false,
        "default": "+17145986105"
      },
      {
        "name": "doc_name",
        "type": "Optional[str]",
        "description": "The desired name for the PDF document. If not provided, a name will be generated (e.g., 'financial_report'). Use underscores for spaces.",
        "required": false,
        "default": null
      },
      {
        "name": "attachments",
        "type": "Optional[List[str]]",
        "description": "A list of attachment URLs (e.g., for images) to be included or referenced in the PDF document. Base64 encoded data is no longer supported.",
        "required": false,
        "default": null
      },
      {
        "name": "client_injected_context",
        "type": "str",
        "description": "Conversation history or other contextual information provided by the client system to inform document generation.",
        "required": false,
        "default": "No additional context provided"
      },
      {
        "name": "model",
        "type": "MODELS_LITERAL",
        "description": "The LLM model to use for generating the HTML source of the PDF.",
        "required": false,
        "default": "gemini-2.5-pro-preview-05-06"
      }
    ],
    "returns": "dict"
  },
  {
    "tool_name": "edit_web_app",
    "description": "Edits an existing web application based on the user's request using a diff-fenced format. The user's request should describe the changes needed for the existing web app. Requires the app_name of a previously created web app.",
    "parameters": [
      {
        "name": "user_number",
        "type": "str",
        "description": "The user's unique identifier, used to locate their data. Typically provided by the backend.",
        "required": false,
        "default": "+17145986105"
      },
      {
        "name": "app_name",
        "type": "Optional[str]",
        "description": "The name of the existing web application to edit. This app must have been previously created.",
        "required": false,
        "default": null
      },
      {
        "name": "user_edit_request",
        "type": "Optional[str]",
        "description": "A clear description of the changes the user wants to make to the web app.",
        "required": false,
        "default": null
      },
      {
        "name": "client_injected_context",
        "type": "str",
        "description": "Additional context, like conversation history, relevant to the edit request.",
        "required": false,
        "default": "No additional context provided for edit"
      },
      {
        "name": "model",
        "type": "MODELS_LITERAL",
        "description": "The LLM model to use for generating the diff to edit the HTML content.",
        "required": false,
        "default": "gemini-2.5-pro-preview-05-06"
      }
    ],
    "returns": "dict"
  },
  {
    "tool_name": "edit_pdf_document",
    "description": "Edits an existing PDF document by modifying its underlying HTML source based on the user's request. The changes are described by the user and applied using a diff-fenced format. Requires the doc_name of a previously created PDF. The PDF is then regenerated from the modified HTML.",
    "parameters": [
      {
        "name": "user_number",
        "type": "str",
        "description": "The user's unique identifier, used to locate their data. Typically provided by the backend.",
        "required": false,
        "default": "+17145986105"
      },
      {
        "name": "doc_name",
        "type": "Optional[str]",
        "description": "The name of the existing PDF document to edit. This document must have been previously created.",
        "required": false,
        "default": null
      },
      {
        "name": "user_edit_request",
        "type": "Optional[str]",
        "description": "A clear description of the changes the user wants to make to the PDF's content.",
        "required": false,
        "default": null
      },
      {
        "name": "client_injected_context",
        "type": "str",
        "description": "Additional context, like conversation history, relevant to the PDF edit request.",
        "required": false,
        "default": "No additional context provided for edit"
      },
      {
        "name": "model",
        "type": "MODELS_LITERAL",
        "description": "The LLM model to use for generating the diff to edit the PDF's HTML source.",
        "required": false,
        "default": "gemini-2.5-pro-preview-05-06"
      }
    ],
    "returns": "dict"
  },
  {
    "tool_name": "list_web_apps",
    "description": "Lists web applications previously created by the specified user. Returns a list of web application details, each including 'app_name' and 'url'.",
    "parameters": [
      {
        "name": "user_number",
        "type": "str",
        "description": "The user's unique identifier, used to locate their web app data. Typically provided by the backend.",
        "required": false,
        "default": "+17145986105"
      },
      {
        "name": "limit",
        "type": "int",
        "description": "Maximum number of web apps to return in the list.",
        "required": false,
        "default": 10
      }
    ],
    "returns": "dict"
  }
]
```

### Python Code Execution Server Tools (`python_code_execution_server.py`)

```json
[
  {
    "tool_name": "execute_python_code",
    "description": "Executes arbitrary Python code provided by the user in a restricted environment. The code runs with the full permissions of the user invoking this tool. It executes the entire code block, then attempts to call 'generated_function_name' if defined. Can call other MCP tools using 'await _call_mcp_tool(tool_name, arguments)'. Stdout, stderr, and function results are captured. IMPORTANT: Use '@@ref_<TOOL_CALL_ID>__<PATH_TO_VALUE>' for code from previous steps. Output schema: {\"status\": \"success/error\", \"stdout\": \"...\", \"stderr\": \"...\", \"function_called\": true/false, \"function_result\": \"...\", \"message\": \"...\"}",
    "parameters": [
      {
        "name": "code",
        "type": "str",
        "description": "The Python code to execute.",
        "required": true
      },
      {
        "name": "function_args",
        "type": "Optional[List[Any]]",
        "description": "Optional list of positional arguments to pass to 'generated_function_name'.",
        "required": false,
        "default": null
      },
      {
        "name": "function_kwargs",
        "type": "Optional[Dict[str, Any]]",
        "description": "Optional dictionary of keyword arguments to pass to 'generated_function_name'.",
        "required": false,
        "default": null
      },
      {
        "name": "timeout_seconds",
        "type": "Optional[int]",
        "description": "Optional timeout in seconds for the code execution (1-300).",
        "required": false,
        "default": 60
      },
      {
        "name": "caller_user_id",
        "type": "Optional[str]",
        "description": "User ID for context if the executed code calls other MCP tools (system-passed).",
        "required": false,
        "default": null
      }
    ],
    "returns": "dict"
  },
  {
    "tool_name": "create_python_code",
    "description": "Generates arbitrary Python code based on a user's natural language request using an LLM. The generated code can call other MCP tools. User is responsible for reviewing code before execution. Returns the generated Python code as a string. Use '@@ref_' syntax for user_request if applicable. Output schema: {\"status\": \"success/error/warning\", \"generated_code\": \"...\", \"message\": \"...\"}",
    "parameters": [
      {
        "name": "user_request",
        "type": "str",
        "description": "A natural language description of the Python code to be generated.",
        "required": true
      },
      {
        "name": "model",
        "type": "MODELS_LITERAL",
        "description": "The LLM model to use for code generation.",
        "required": false,
        "default": "gemini-2.5-pro-preview-05-06"
      },
      {
        "name": "available_tool_names_for_code_gen",
        "type": "Optional[List[str]]",
        "description": "Optional list of MCP tool names that the generated Python code can call using `_call_mcp_tool`.",
        "required": false,
        "default": null
      }
    ],
    "returns": "dict"
  },
  {
    "tool_name": "edit_python_code",
    "description": "Edits existing Python code by regenerating the entire code block based on the original and a user's natural language request. The LLM generates complete, new Python code, which can call other MCP tools. User is responsible for review. Returns the modified Python code. IMPORTANT: Use '@@ref_' for 'original_code' if from a previous step. Output schema: {\"status\": \"success/error/warning\", \"original_code\": \"...\", \"edited_code\": \"...\", \"message\": \"...\"}",
    "parameters": [
      {
        "name": "original_code",
        "type": "str",
        "description": "The original Python code to be edited.",
        "required": true
      },
      {
        "name": "edit_request",
        "type": "str",
        "description": "A natural language description of the changes to make to the Python code.",
        "required": true
      },
      {
        "name": "model",
        "type": "MODELS_LITERAL",
        "description": "The LLM model to use for code editing.",
        "required": false,
        "default": "gemini-2.5-pro-preview-05-06"
      },
      {
        "name": "available_tool_names_for_code_gen",
        "type": "Optional[List[str]]",
        "description": "Optional list of MCP tool names that the generated Python code can call using `_call_mcp_tool`.",
        "required": false,
        "default": null
      }
    ],
    "returns": "dict"
  }
]
```

