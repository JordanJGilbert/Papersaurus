import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
from mcp.server.fastmcp import FastMCP
import uuid
import re
import json
import requests
import base64
import filetype
import csv
import io
from googleapiclient.discovery import build
from google.oauth2 import service_account
from utils.constants import DOMAIN
from system_prompts import WEB_APP_PROMPT, PDF_HTML_SYSTEM_PROMPT
from utils.tools import write_data
import weasyprint
from google import genai
from google.genai import types
from PIL import Image
from io import BytesIO
import asyncio
import hashlib
from typing import List, Optional, Dict, Tuple, Any, Annotated, Literal
import logging
from email.mime.text import MIMEText
from googleapiclient.http import MediaIoBaseUpload
from llm_adapters import (
    get_llm_adapter,
    StandardizedMessage,
    StandardizedLLMConfig,
    AttachmentPart
)
from playwright.async_api import async_playwright
from pydantic import Field
import datetime

logging.basicConfig(stream=sys.stderr, level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

mcp = FastMCP("Document Generation Server")

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
SUPPORTED_MODELS_TUPLE = (
    "gemini-2.5-flash-preview-05-20",
    "gemini-2.5-pro-preview-05-06",
    "models/gemini-2.0-flash",
    "gemini-2.0-flash",
    "claude-3-7-sonnet-latest",
    "gpt-4.1-2025-04-14",
    "o4-mini-2025-04-16"
)

# --- System Prompts for Editing ---
EDIT_WEB_APP_SYSTEM_PROMPT = """You are an expert code editor. You will be given the complete original content of an HTML file and a user's request describing desired modifications.
You may also receive an `additional_context` string containing information from previous steps (e.g., search results, API documentation) that should inform your edits.

The "diff-fenced" format for each change is:
<<<<<<< SEARCH
[Exact lines from the ORIGINAL HTML content that you want to replace or modify]
=======
[The new lines that should replace the content in the SEARCH block]
>>>>>>> REPLACE

Guidelines:
1.  The content within the `<<<<<<< SEARCH` and `=======` part (the SEARCH block) MUST be an exact, contiguous segment from the ORIGINAL HTML provided to you.
2.  The content within the `=======` and `>>>>>>> REPLACE` part (the REPLACE block) is the new content.
3.  To insert content, identify a line or block to replace. Include the original line/block in SEARCH and the original line/block plus your new content in REPLACE. For example, to insert "NEW_LINE" after "EXISTING_LINE":
    <<<<<<< SEARCH
    EXISTING_LINE
    =======
    EXISTING_LINE
    NEW_LINE
    >>>>>>> REPLACE
4.  To delete content, the REPLACE block should be empty (it may contain a newline if the original block ended with one and you want to preserve that structure, or be completely empty). Example of deleting "CONTENT_TO_DELETE":
    <<<<<<< SEARCH
    CONTENT_TO_DELETE
    =======
    >>>>>>> REPLACE
5.  You can provide multiple diff blocks one after another if multiple distinct changes are needed. Order them logically.
6.  Ensure that your SEARCH blocks are precise and correctly reflect the parts of the original HTML you intend to change. If a text segment appears multiple times, make your SEARCH block specific enough to target only the intended instance (e.g., by including surrounding unique text).
7.  Output ONLY the diff blocks. Do NOT include any other text, explanations, the filename, or markdown formatting (like ```diff ... ```). Just the raw `<<<<<<< SEARCH ... >>>>>>> REPLACE` blocks, one after another.
8.  If `additional_context` is provided, ensure your diffs reflect the information or requirements mentioned in it, in addition to the primary user's edit request.
"""

EDIT_PDF_SYSTEM_PROMPT = """You are an expert at editing HTML documents that will be converted to PDFs. You will receive the original HTML content and a user's request for changes.
You may also receive an `additional_context` string containing information from previous steps (e.g., search results, API documentation) that should inform your edits.
Your task is to generate diffs in the "diff-fenced" format to apply these changes.

The "diff-fenced" format for each change:
<<<<<<< SEARCH
[Exact lines from the ORIGINAL HTML content to be replaced/modified]
=======
[New lines to replace the SEARCH block. Ensure HTML is valid and PDF-friendly.]
>>>>>>> REPLACE

Guidelines:
1.  SEARCH Block: Must be an exact segment from the ORIGINAL HTML.
2.  REPLACE Block: New HTML content. Remember this HTML will be rendered to a PDF, so maintain PDF compatibility (e.g., image sizing with `width` attribute, standard HTML/CSS).
3.  Insertions: To insert "NEW_CONTENT" after "EXISTING_LINE":
    <<<<<<< SEARCH
    EXISTING_LINE
    =======
    EXISTING_LINE
    NEW_CONTENT
    >>>>>>> REPLACE
4.  Deletions: To delete "CONTENT_TO_DELETE", make REPLACE block empty or contain just a newline if appropriate.
    <<<<<<< SEARCH
    CONTENT_TO_DELETE
    =======
    >>>>>>> REPLACE
5.  Multiple Diffs: Provide multiple blocks if needed, in logical order.
6.  Specificity: SEARCH blocks must be specific to target the correct HTML segment.
7.  Output: ONLY the raw `<<<<<<< SEARCH ... >>>>>>> REPLACE` diff blocks. No extra text, filenames, or markdown.
8.  PDF Context: Remember all images must still adhere to PDF sizing (max-width 600px via `width` attribute) and HTML should be well-structured for PDF conversion.
9.  If `additional_context` is provided, ensure your diffs reflect the information or requirements mentioned in it, in addition to the primary user's edit request.
"""

# --- Helper function to apply diffs ---
def apply_fenced_diffs(original_content: str, diff_output: str) -> str:
    """
    Applies a series of "diff-fenced" changes to the original content.
    Each SEARCH block is expected to be found in the content as modified by previous diffs.
    """
    current_content = original_content
    
    diff_pattern = re.compile(
        r"<<<<<<< SEARCH\s*?\n(.*?)\s*?\n=======\s*?\n(.*?)\s*?\n>>>>>>> REPLACE",
        re.DOTALL
    )
    
    processed_diff_indices = set()

    # Iterate multiple passes if necessary, though ideally one pass is enough if LLM orders correctly.
    # This is a simplified approach. True diff patching can be more complex.
    # For now, assume diffs apply sequentially.
    
    matches = list(diff_pattern.finditer(diff_output))
    if not matches:
        if diff_output.strip(): # If diff_output is not empty but no matches, it's a format error
            logger.warning(f"Diff output provided but no valid diff blocks found. Diff output: {diff_output[:200]}...")
        else: # LLM intentionally returned no diffs, meaning no changes needed.
            logger.info("LLM returned empty diff, indicating no changes.")
        return original_content # Return original content if no diffs or format error

    for i, match in enumerate(matches):
        search_block = match.group(1)
        # Normalize potential leading/trailing whitespace from LLM capture for replace_block
        # For search_block, exact match is more critical, including its original whitespace.
        replace_block = match.group(2) 

        # Attempt to replace the first occurrence of search_block in the current_content
        try:
            # A simple string replacement. If search_block is not unique, this might be an issue.
            # The prompt guides the LLM to make search_block specific.
            if search_block in current_content:
                current_content = current_content.replace(search_block, replace_block, 1)
            else:
                # This block was not found. It might have been altered by a previous replacement
                # in a way that makes this search_block no longer match, or it was never there.
                error_msg = f"Diff application warning: SEARCH block not found or already modified. Skipped. Block: '{search_block[:100]}...'"
                logger.warning(error_msg)
                # Continue to try applying subsequent diffs.
        except Exception as e:
            logger.error(f"Error applying diff block: {e}. Search block: '{search_block[:100]}...'")
            # Decide whether to raise or continue. For now, log and continue.
            # raise ValueError(f"Error during diff application for block: {search_block[:100]}...") from e
            
    return current_content

def sanitize_for_path(name_part: str) -> str:
    """Sanitizes a string to be safe for use as part of a directory or file name."""
    if not isinstance(name_part, str):
        name_part = str(name_part)

    # Check if it looks like a phone number (e.g., starts with '+')
    # to apply phone-specific sanitization for consistency with signal_bot.py
    is_phone_number_like = name_part.startswith('+')
    
    if is_phone_number_like:
        # Remove leading '+' and then all other non-alphanumeric characters.
        # This makes it consistent with re.sub(r'\\W+', '', sender_number) used elsewhere for phone numbers.
        temp_name_part = name_part[1:] # Remove leading '+'
        name_part = re.sub(r'\W+', '', temp_name_part) # \W matches any non-word character (letters, numbers, underscore)
                                                      # For a typical phone number string like "1 (714) 555-1212",
                                                      # this will become "17145551212"
    else:
        # Existing general sanitization for app_names, doc_names, group_ids etc.
        # Hash group IDs for consistent, short, safe names
        if name_part.startswith('group_'):
            group_id_val = name_part[len('group_'):]
            hash_val = hashlib.md5(group_id_val.encode()).hexdigest()[:12] # Slightly longer hash
            name_part = f"group_{hash_val}"
        
        name_part = re.sub(r'[^\w.-]', '_', name_part) # Allow word chars, dots, hyphens; replace others with underscore
        name_part = re.sub(r'_+', '_', name_part) # Collapse multiple underscores
        name_part = name_part.strip('_.- ') # Strip leading/trailing problematic chars

    if not name_part: # Fallback for empty string after sanitization (applies to both paths)
        return f"sanitized_{uuid.uuid4().hex[:8]}"
    return name_part

def download_and_encode_image(url):
    """
    Downloads an image from the given URL and returns (base64_data, media_type).
    Returns (None, None) if download or type detection fails.
    """
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        content_type = resp.headers.get('Content-Type', '')
        if not content_type.startswith('image/'):
            return None, None
        b64_data = base64.b64encode(resp.content).decode('utf-8')
        return b64_data, content_type
    except Exception:
        return None, None

def process_attachments(attachments):
    """
    Processes a list of attachments (URL strings or base64-encoded strings) and returns a list:
    processed_attachments: list of dicts with 'url' or 'base64', and 'content_type' (inferred via HEAD request or filetype)
    """
    processed_attachments = []
    if attachments and isinstance(attachments, list):
        for i, item in enumerate(attachments):
            content_type = ''
            # URL string
            if isinstance(item, str) and item.startswith(('http://', 'https://')):
                try:
                    resp = requests.head(item, allow_redirects=True, timeout=5)
                    content_type = resp.headers.get('Content-Type', '')
                except Exception:
                    content_type = '' # Keep content_type empty if HEAD request fails
                processed_attachments.append({'url': item, 'content_type': content_type})
            # If item is not a valid URL string, log a warning and skip it.
            elif isinstance(item, str): # It's a string, but not a http/https URL
                logger.warning(f"Skipping attachment item: '{item[:100]}...' as it is not a valid HTTP/HTTPS URL. Only URL attachments are supported.")
                continue
            else: # Not a string or not a URL
                logger.warning(f"Skipping non-string or invalid attachment item (type: {type(item)}): '{str(item)[:100]}...'. Only URL attachments are supported.")
                continue
    return processed_attachments

def prepare_standardized_attachments(processed_attachments: list) -> List[AttachmentPart]:
    attachment_parts = []
    for att in processed_attachments:
        data_bytes = None
        mime_type = att.get('content_type', '')
        name = att.get('url', None) # Use URL as name if available

        if 'url' in att:
            url = att['url']
            try:
                # Skip PDF download for LLM, URL is usually sufficient for context
                if mime_type == 'application/pdf':
                    # print(f"Skipping download of PDF attachment {url} for LLM, will pass URL if needed in prompt.")
                    # Optionally, you could still add a marker or basic info if PDFs are to be "mentioned"
                    continue 
                
                resp = requests.get(url, timeout=10)
                resp.raise_for_status()
                data_bytes = resp.content
                if not mime_type: # If HEAD request failed to get content_type
                    mime_type = resp.headers.get('Content-Type', '')
                
                # Guess mime_type if it's generic or missing
                if not mime_type or mime_type == 'application/octet-stream':
                    kind = filetype.guess(data_bytes)
                    if kind: mime_type = kind.mime
                    else: mime_type = 'application/octet-stream' # fallback
            
            except requests.exceptions.RequestException as e:
                print(f"Warning: Could not download attachment from {url} for LLM: {e}")
                continue
            except Exception as e:
                print(f"Warning: Error processing URL attachment {url} for LLM: {e}")
                continue
        # Since base64 attachments are no longer processed by `process_attachments`,
        # the following 'elif 'base64' in att:' block is no longer needed and can be removed.
        # elif 'base64' in att:
        #     try:
        #         data_bytes = base64.b64decode(att['base64'])
        #         if not mime_type or mime_type == 'application/octet-stream': # Re-guess if needed for base64
        #             kind = filetype.guess(data_bytes)
        #             if kind: mime_type = kind.mime
        #             else: mime_type = 'application/octet-stream' # fallback
        #         # Try to create a pseudo-name for base64 attachments
        #         if not name:
        #             name = f"base64_attachment_{mime_type.replace('/', '_')}"

        #     except Exception as e:
        #         print(f"Warning: Could not decode base64 attachment for LLM: {e}")
        #         continue
        
        if data_bytes and mime_type:
            # The adapter will handle images. PDFs are generally not sent as raw bytes to Gemini chat models.
            if mime_type.startswith('image/'):
                 attachment_parts.append(AttachmentPart(mime_type=mime_type, data=data_bytes, name=name))
            # else:
                # print(f"Skipping attachment with mime_type {mime_type} for LLM as it's not an image.")
        elif data_bytes and not mime_type:
             print(f"Warning: Could not determine mime_type for an attachment, skipping for LLM.")
             
    return attachment_parts

@mcp.tool()
async def create_web_app(
    user_number: Annotated[str, Field(
        description="The user's unique identifier (e.g., phone number), used for directory structuring. This is typically provided by the backend system and should not be solicited from the end-user by the LLM."
    )] = "+17145986105",
    app_name: Annotated[Optional[str], Field(
        description="The desired name for the web application. If not provided, a relevant name will be automatically generated. Use underscores for spaces (e.g., 'my_cool_app'). The LLM should choose a short, concise name relevant to the request if one isn't given by the user."
    )] = None,
    attachments: Annotated[Optional[List[str]], Field(
        description="A list of attachment URLs. These will be processed and potentially included or referenced in the web application. Base64 encoded data is no longer supported."
    )] = None,
    user_request: Annotated[Optional[str], Field(
        description="The user's primary request detailing what the web app should do, its purpose, or content. This is the main input for generation."
    )] = None,
    model: Annotated[MODELS_LITERAL, Field(
        description="The LLM model to use for HTML generation."
    )] = "gemini-2.5-pro-preview-05-06",
    mcp_tools: Annotated[Optional[List[str]], Field(
        description="Optional list of MCP tool names the generated web application can be aware of or designed to interact with (potentially via backend calls).",
        default=None
    )] = None,
    additional_context: Annotated[Optional[str], Field(
        description="Optional textual context to guide web app generation. This string should contain all necessary and relevant details from previous tool calls (e.g., search results, API documentation, user clarifications) to produce the optimal web app. The LLM is responsible for synthesizing this string to be as detailed as required for the task. Do not use @@ref_ to pass complex objects directly into this field; provide the synthesized string context yourself.",
        default=None
    )] = None
) -> dict:
    """
    Creates a custom web application based on user specifications and provided attachments.
    The tool generates HTML content and hosts it, returning a URL to the created web app.

    IMPORTANT: The LLM calling this tool does NOT need to specify web design, layout, or detailed implementation instructions.
    The underlying system prompt (WEB_APP_PROMPT) is highly capable and will handle all aspects of web app generation,
    including design, interactivity, and advanced features. The LLM should focus on conveying the user's core request,
    any relevant contextual information, and attachments. Avoid adding prescriptive instructions on *how* to build or
    style the web app, unless these are specific, explicit user requirements.
    """
    # Use default user number if empty
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105" # Default user_id

    # --- Sanitize inputs ---
    user_id_safe = sanitize_for_path(user_number)
    app_name = app_name or f"web-app-{str(uuid.uuid4())[:8]}"
    app_name_safe = sanitize_for_path(app_name)

    # --- Attachment Handling ---
    processed_attachments = await asyncio.to_thread(process_attachments, attachments)

    # --- Build attachment URL list for prompt ---
    attachment_info_for_prompt = []
    if processed_attachments:
        for att in processed_attachments:
            url = att.get('url')
            if url:
                mime_type = att.get('content_type', 'unknown')
                attachment_info_for_prompt.append({"url": url, "mime_type": mime_type})

    # --- Prepare LLM Call ---
    adapter = get_llm_adapter(model_name=model)

    # Use user_request as the main context
    main_request = user_request or ""

    # --- Dynamically construct the system prompt for web app generation ---
    # Start with the base WEB_APP_PROMPT
    current_web_app_system_prompt = WEB_APP_PROMPT # Assuming WEB_APP_PROMPT is globally available
    current_web_app_system_prompt += "\n\nNote: An `additional_context` field might be passed to you along with the user's primary request. This context MUST be a string that you (the LLM) have synthesized from relevant information (e.g., previous search results, or API documentation) to inform the web app's content and features. Do not expect this field to be auto-populated with complex objects via @@ref syntax; you are responsible for crafting this string context."

    # Append attachment information and instructions if attachments are present
    if attachment_info_for_prompt:
        current_web_app_system_prompt += "\n\n# Attached Files for Web App Inclusion\n"
        current_web_app_system_prompt += "The following files are provided. You MUST incorporate them into the web application as appropriate:\n"
        for idx, att_info in enumerate(attachment_info_for_prompt):
            current_web_app_system_prompt += f"- File {idx+1}: URL: {att_info['url']}, Type: {att_info['mime_type']}\n"
            if att_info['mime_type'].startswith('image/'):
                current_web_app_system_prompt += f"  Instruction: Embed this image using an `<img>` tag. Use its URL as the `src` attribute. You may add relevant alt text and captions.\n"
            elif att_info['mime_type'] == 'application/pdf':
                current_web_app_system_prompt += f"  Instruction: Provide a link to this PDF document. Do not attempt to embed its content directly.\n"
            else:
                current_web_app_system_prompt += f"  Instruction: Reference or link to this file as appropriate for its type.\n"
        current_web_app_system_prompt += "\nEnsure all referenced attachments are displayed or linked correctly in the final HTML."

    # Append available MCP tools information if provided
    if mcp_tools:
        current_web_app_system_prompt += "\n\n# Available MCP System Tools\n"
        current_web_app_system_prompt += "The broader system has access to the following tools. You can design the web application to conceptually leverage these capabilities (e.g., by describing features that would use them, or by including UI elements that imply their use via backend calls). Do not attempt to directly call these tools from the client-side HTML/JavaScript you generate unless you are also generating the backend infrastructure for such calls.\n"
        for tool_name in mcp_tools:
            current_web_app_system_prompt += f"- {tool_name}\n"

    current_web_app_system_prompt += """

# Calling Backend MCP Tools from JavaScript

If the web application needs to trigger backend MCP tools (from the `mcp_tools` list if provided, or other known tools), you can generate JavaScript to make an HTTP POST request to the `/query` endpoint.

**Request Format:**
-   **URL:** `/query` (make sure to use a relative path or one that correctly resolves to the MCP service backend)
-   **Method:** `POST`
-   **Headers:** `{'Content-Type': 'application/json'}`
-   **Body (JSON):**
    ```json
    {
        "query": "call_tool TOOL_NAME with arguments JSON_ARGUMENTS_STRING",
        "sender": "USER_ID_PLACEHOLDER", // This should ideally be set by a backend proxy based on the authenticated user.
                                       // If you cannot rely on a proxy, the frontend might need to manage a user identifier.
        "attachments": [], // Usually empty for direct tool calls, unless the tool itself needs them.
        "stream": false    // For simplicity, assume non-streaming calls from client-side JS.
    }
    ```
    -   Replace `TOOL_NAME` with the exact name of the MCP tool you want to call.
    -   Replace `JSON_ARGUMENTS_STRING` with a *stringified JSON object* containing the arguments for that tool. Example: `'{\\"param1\\":\\"value1\\",\\"param2\\":123}'`. Ensure correct escaping if this string is embedded within another JSON string or JavaScript string.

**Response Handling:**
-   The `/query` endpoint will respond with JSON:
    ```json
    {
        "result": "STRINGIFIED_JSON_OR_PLAIN_TEXT_RESULT_FROM_TOOL",
        "error": "OPTIONAL_ERROR_MESSAGE"
    }
    ```
-   Your JavaScript should parse `response.result`. If `response.result` is itself a stringified JSON, parse it again to get the tool's actual output object.
-   Handle potential errors by checking `response.error`.
-   Remember these are asynchronous calls (`fetch().then(...)` or `async/await`). Update the DOM *after* receiving the response.

**Example JavaScript Snippet (Conceptual):**
```javascript
async function callMcpTool(toolName, argsObject) {
    // USER_ID_PLACEHOLDER needs to be replaced with the actual user identifier.
    // This might come from a global JS variable set by the server, a cookie, or other context.
    const currentUserId = window.currentUser || "default_user"; // Example placeholder

    const queryPayload = {
        query: `call_tool ${toolName} with arguments ${JSON.stringify(JSON.stringify(argsObject))}`,
        sender: currentUserId, 
        stream: false
    };
    try {
        const response = await fetch('/query', { // Assuming /query is on the same host
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(queryPayload)
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.error) {
            console.error('Error calling tool:', data.error);
            // Consider displaying error to user in the web app's UI
            return null;
        }
        // Assuming data.result is a stringified JSON from the tool for many tools
        try {
            return JSON.parse(data.result);
        } catch (e) {
            // If data.result is not JSON, return it as is (e.g., plain text, or already an object if tool returns differently)
            return data.result; 
        }
    } catch (error) {
        console.error('Failed to call MCP tool:', error);
        // Consider displaying error to user in the web app's UI
        return null;
    }
}

// Example Usage in your web app's JS:
// callMcpTool('name_of_tool_from_mcp_tools_list', { arg1: 'value1', arg2: 100 })
//   .then(result => { 
//       if (result) { 
//           // Process the result and update the DOM
//           // For example: document.getElementById('someElement').textContent = result.someProperty;
//       } 
//   });
```
Use this pattern to enable dynamic interactions with backend tools. Make sure your JavaScript handles the asynchronous nature of these calls and updates the web page appropriately.
"""

    # Original prompt construction for the user message partx
    prompt_text = f"Create a web app titled '{app_name}'.\n\n**User Request:**\n{main_request}"
    
    if additional_context:
        prompt_text += f"\n\n**Additional Context to Consider:**\n{additional_context}"

    history = [
        StandardizedMessage(
            role="user",
            content=prompt_text,
        )
    ]
    llm_config = StandardizedLLMConfig(
        system_prompt=current_web_app_system_prompt, # Use the dynamically constructed system prompt
    )

    try:
        llm_response = await adapter.generate_content(
            model_name=model,
            history=history,
            tools=None,
            config=llm_config
        )
        if llm_response.error:
            return {"status": "error", "message": f"LLM API error: {llm_response.error}"}
        response_text = llm_response.text_content
        if not response_text:
            return {"status": "error", "message": "LLM returned no content for web app generation."}
    except Exception as e:
        return {"status": "error", "message": f"Error during LLM call for web app: {str(e)}"}

    # --- Extract HTML from LLM response ---
    html_content = ""
    code_block_match = re.search(r'```(?:html)?\s*([\s\S]*?)\s*```', response_text)
    if code_block_match:
        html_content = code_block_match.group(1)
    if not html_content:
        # Attempt to reconstruct from stream if direct extraction fails and logs were kept (now removed)
        # This fallback might be less relevant now without detailed streaming logs of html_fragments
        pass # Placeholder, as the original logic for this fallback relied on generation_log

    if not html_content: # Re-check after potential fallback
        return {"status": "error", "message": "LLM did not return HTML code in the expected format for saving."}

    # --- Save HTML to user directory ---
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    user_specific_data_dir = os.path.join(base_dir, user_id_safe)
    app_dir = os.path.join(user_specific_data_dir, "web_apps")
    os.makedirs(app_dir, exist_ok=True)

    html_filename = f"{app_name_safe}.html"
    html_path = os.path.join(app_dir, html_filename)

    try:
        with open(html_path, 'w', encoding='utf-8') as f:
            await asyncio.to_thread(f.write, html_content)
    except Exception as e:
        return {"status": "error", "message": f"Failed to save web app HTML: {str(e)}"}

    serve_url = f"{DOMAIN}/user_data/{user_id_safe}/web_apps/{app_name_safe}.html"

    return {
        "status": "success",
        "message": f"Web app '{app_name}' created successfully. Access it at {serve_url}",
        "url": serve_url
    }

@mcp.tool()
async def create_pdf_document(
    user_number: Annotated[str, Field(
        description="The user's unique identifier (e.g., phone number), used for directory structuring. This is typically provided by the backend."
    )] = "+17145986105",
    doc_name: Annotated[Optional[str], Field(
        description="The desired name for the PDF document. If not provided, a name will be generated (e.g., 'financial_report'). Use underscores for spaces."
    )] = None,
    attachments: Annotated[Optional[List[str]], Field(
        description="A list of attachment URLs (e.g., for images) to be included or referenced in the PDF document. Base64 encoded data is no longer supported."
    )] = None,
    model: Annotated[MODELS_LITERAL, Field(
        description="The LLM model to use for generating the HTML source of the PDF."
    )] = "gemini-2.5-pro-preview-05-06",
    mcp_tools: Annotated[Optional[List[str]], Field(
        description="Optional list of MCP tool names that can inform the content generation, making the LLM aware of other system capabilities.",
        default=None
    )] = None,
    additional_context: Annotated[Optional[str], Field(
        description="Optional textual context to guide PDF generation. This string should contain all necessary and relevant details from previous tool calls (e.g., search results, API documentation, user clarifications) to produce the optimal PDF. The LLM is responsible for synthesizing this string to be as detailed as required for the task. Do not use @@ref_ to pass complex objects directly into this field; provide the synthesized string context yourself.",
        default=None
    )] = None
) -> dict:
    """
    Creates a custom PDF document based on the user's request and any provided attachments.
    This tool leverages a powerful AI to generate HTML, which is then converted to a PDF.
    It is highly flexible and can produce a wide range of documents, from simple pages to complex reports.
    The LLM should assume this tool can fulfill any PDF creation request by describing the desired content and structure.
    """
    # Use default user number if empty
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105" # Default user_id
    
    # --- Sanitize inputs ---
    user_id_safe = sanitize_for_path(user_number)
    doc_name = doc_name or f"pdf-doc-{str(uuid.uuid4())[:8]}"
    doc_name_safe = sanitize_for_path(doc_name)

    # --- Attachment Handling ---
    processed_attachments = await asyncio.to_thread(process_attachments, attachments)

    # --- Build attachment URL list for prompt ---
    attachment_urls = []
    if processed_attachments:
        for att in processed_attachments:
            url = att.get('url')
            if url:
                mime_type = att.get('content_type', 'unknown')
                attachment_urls.append((url, mime_type))

    # --- LLM SYSTEM PROMPT (NEW) ---
    PDF_SYSTEM_PROMPT = f"""
You are an expert at generating HTML documents for PDF conversion.

# PDF Generation Instructions

- You will be given a list of URLs (images, PDFs, or other files) to include in the document.
- For each URL, analyze the file type and include it in the document in the most appropriate way:
    - For image URLs, embed them as <img> tags with descriptive alt text and captions.
    - For PDF URLs, summarize or reference them as appropriate (do not attempt to embed PDFs directly).
    - For other file types, provide a summary or link as appropriate.
- You have full flexibility in HTML/CSS layout and can use any features supported by modern browsers.
- The HTML you generate will be converted to PDF using Playwright.
- You DO NOT need to embed the actual file data; just use the URLs as sources in <img> tags or as links.
- You may add captions, context, or summaries for each attachment as appropriate.
- The rest of the document should follow the user's request and context.

**IMAGE SIZING REQUIREMENT (FOR PDF CONVERSION):**
- All images you include MUST be sized appropriately for a PDF document page.
- The **maximum width for any image is 600 pixels**. Do NOT exceed this width.
- You MAY use smaller widths if it makes sense for the specific image or layout (e.g., for a small icon or a thumbnail).
- Always set the image size using the `width` attribute in the `<img>` tag (e.g., `<img src=\"...\" width=\"450\">` or `<img src=\"...\" width=\"600\">`).
- Do NOT use CSS for image sizing—use the `width` attribute only.
- For best PDF rendering, ensure images are displayed as block elements and consider appropriate margins (e.g., `<img src=\"...\" width=\"600\" style=\"display: block; margin: 1em auto;\">`). You can include such basic inline styles for images if it aids PDF layout.

# Output Format

- Output a complete HTML document, suitable for PDF conversion.
- Do NOT include any explanations or comments outside the code block.
- The only output should be a single code block with the HTML.

# Attachments to include

{json.dumps(attachment_urls, indent=2)}

# User Request

{''}
"""
    # The {''} above is a placeholder for the actual user request that will be formatted into the history.
    # We add a note about additional_context to the system prompt here.
    PDF_SYSTEM_PROMPT += "\n\nNote: An `additional_context` field might be passed to you along with the user's primary request. This context MUST be a string that you (the LLM) have synthesized from relevant information (e.g., previous search results, or API documentation) to inform the PDF's content and structure. Do not expect this field to be auto-populated with complex objects via @@ref syntax; you are responsible for crafting this string context."

    # Append available MCP tools information to PDF_SYSTEM_PROMPT if provided
    if mcp_tools:
        PDF_SYSTEM_PROMPT += "\n\n# Aware System Capabilities (MCP Tools)\n"
        PDF_SYSTEM_PROMPT += "For your awareness, the broader system has access to the following tools. This information may be relevant for the content you generate (e.g., if the document should refer to these capabilities):\n"
        for tool_name in mcp_tools:
            PDF_SYSTEM_PROMPT += f"- {tool_name}\n"
    
    PDF_SYSTEM_PROMPT += f"""

# Dynamically Fetching Data with MCP Tools for PDF Content

If the PDF content requires data fetched dynamically from MCP tools (from the `mcp_tools` list or other known tools) at the time of generation, you can embed JavaScript in the HTML to achieve this. Playwright will execute this JavaScript before rendering the PDF.

**JavaScript API Call Mechanism:**
-   Your JavaScript should make an HTTP `POST` request to the `/query` endpoint.
-   **Request Format (same as for web apps):**
    -   **URL:** `/query` (this will be resolved by Playwright relative to the base URL of the loaded HTML content, or use an absolute URL if necessary)
    -   **Method:** `POST`
    -   **Headers:** `{{'Content-Type': 'application/json'}}`
    -   **Body (JSON):**
        ```json
        {{
            "query": "call_tool TOOL_NAME with arguments JSON_ARGUMENTS_STRING",
            "sender": "USER_ID_PLACEHOLDER_FOR_PDF_CONTEXT", // Context needs to be established for PDF generation run by the system.
            "attachments": [],
            "stream": false
        }}
        ```
        -   `TOOL_NAME` and `JSON_ARGUMENTS_STRING` as described for web apps. `JSON_ARGUMENTS_STRING` is a stringified JSON.
-   **Response Handling (same as for web apps):**
    -   The endpoint responds with `{{"result": "...", "error": "..."}}`.
    -   Parse `response.result` (potentially twice if it's stringified JSON from the tool).
-   **DOM Manipulation:** The JavaScript *must* take the fetched data and update the HTML DOM *before* Playwright generates the PDF. Ensure all data is present and rendered.
-   **Asynchronous Nature:** Remember these calls are asynchronous. Use `async/await` or Promises carefully. The `wait_until="networkidle"` setting in Playwright helps, but your script should ensure all content is settled.

**Example (Conceptual JavaScript within the HTML for PDF):**
```html
<script>
    async function fetchAndInjectPdfData(toolName, argsObject, elementIdToUpdate) {{
        // USER_ID_PLACEHOLDER_FOR_PDF_CONTEXT needs to be resolved by the system generating the PDF.
        // For PDF generation, this 'sender' might be a generic context or a specific user if the PDF is user-centric.
        const pdfContextUserId = "pdf_generator_service_user"; // Example

        const queryPayload = {{
            query: `call_tool ${{toolName}} with arguments ${{JSON.stringify(JSON.stringify(argsObject))}}`,
            sender: pdfContextUserId, 
            stream: false
        }};
        try {{
            const response = await fetch('/query', {{ // Playwright will make this call
                method: 'POST',
                headers: {{ 'Content-Type': 'application/json' }},
                body: JSON.stringify(queryPayload)
            }});
            if (!response.ok) {{
                throw new Error(`HTTP error! status: ${{response.status}}`);
            }}
            const data = await response.json();
            const targetElement = document.getElementById(elementIdToUpdate);
            if (!targetElement) return;

            if (data.error) {{
                console.error('Error calling tool for PDF:', data.error);
                targetElement.textContent = 'Error loading dynamic content.';
                return;
            }}
            
            let finalData = data.result;
            try {{
                finalData = JSON.parse(data.result); // If tool result is stringified JSON
            }} catch (e) {{ /* Keep as is if not JSON */ }}

            // Example: Update the DOM. This needs to be specific to the data structure.
            if (typeof finalData === 'object' && finalData !== null && finalData.content) {{
                targetElement.innerHTML = finalData.content; // Or textContent, etc.
            }} else {{
                targetElement.textContent = String(finalData);
            }}

        }} catch (error) {{
            console.error('Failed to call MCP tool for PDF:', error);
            const targetElement = document.getElementById(elementIdToUpdate);
            if (targetElement) {{
                targetElement.textContent = 'Failed to load dynamic content.';
            }}
        }}
    }}

    // Example of how you might invoke this in your HTML:
    // Ensure the element with ID 'dynamicReportData' exists.
    // document.addEventListener('DOMContentLoaded', () => {{
    //     fetchAndInjectPdfData('get_financial_summary', {{'quarter': 'Q4'}}, 'dynamicReportData');
    // }});
    // Or, if the script is at the end of the body, DOMContentLoaded might not be strictly needed
    // if elements are already parsed.
</script>
"""

    PDF_SYSTEM_PROMPT += f"""
VERY IMPORTANT FORMATTING INSTRUCTIONS:
You must present your HTML output exactly as follows:
1. Output "document.html" on a line by itself (no quotes or other characters)
2. On the next line, output three backticks (```) to start a code fence
3. Output the complete HTML document, including DOCTYPE, html, head, and body tags
4. End with three backticks (```) on a line by itself
5. NEVER skip, omit or abbreviate any part of the HTML content
6. Do not include placeholder comments like "<!-- Content will be generated here -->"
7. DO NOT include any explanatory text before or after the HTML content

Output Format Example:
document.html
```
<!DOCTYPE html>
<html>
<head>
    <title>Document Title</title>
    <!-- CSS styling here -->
</head>
<body>
    <!-- Complete HTML content here -->
</body>
</html>
```
"""

    # --- LLM API Call using Adapter ---
    adapter = get_llm_adapter(model_name=model)
    
    # The user request for PDF generation is usually general, like "create a PDF based on the system prompt instructions".
    # The actual content generation is driven by the system prompt which now includes attachment details and potentially MCP tool info.
    # If user_request was also a parameter to create_pdf_document (it's not currently in the signature but could be added),
    # it would be incorporated here. For now, the prompt is generic.
    
    user_facing_prompt = "Please generate a PDF-ready HTML document as described in the system prompt."
    if additional_context: # Append additional_context to the user-facing part of the prompt
        user_facing_prompt += f"\n\n**Additional Context to Consider:**\n{additional_context}"
    
    history = [
        StandardizedMessage(
            role="user",
            content=user_facing_prompt
        )
    ]
    
    llm_config = StandardizedLLMConfig(
        system_prompt=PDF_SYSTEM_PROMPT,
    )

    try:
        llm_response = await adapter.generate_content(
            model_name=model,
            history=history,
            tools=None,
            config=llm_config
        )
        if llm_response.error:
            return {"status": "error", "message": f"LLM API error: {llm_response.error}"}
        response_text = llm_response.text_content
        if not response_text:
            return {"status": "error", "message": "LLM returned no content for PDF generation."}
    except Exception as e:
        import traceback
        logger.debug("DEBUG: Exception during LLM call for PDF:")
        traceback.print_exc()
        return {"status": "error", "message": f"Error during LLM call for PDF: {str(e)}"}

    # --- Extract HTML from LLM response ---
    html_content = ""
    code_block_match = re.search(r'```(?:html)?\s*([\s\S]*?)\s*```', response_text)
    if code_block_match:
        html_content = code_block_match.group(1)
    if not html_content:
        # Attempt to reconstruct from stream if direct extraction fails and logs were kept (now removed)
        # This fallback might be less relevant now without detailed streaming logs of html_fragments
        pass # Placeholder, as the original logic for this fallback relied on generation_log

    if not html_content: # Re-check after potential fallback
        return {"status": "error", "message": "LLM did not return HTML code in the expected format for saving."}

    # --- Save HTML and Convert to PDF with Playwright ---
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    user_specific_data_dir = os.path.join(base_dir, user_id_safe)
    doc_dir = os.path.join(user_specific_data_dir, "pdfs")
    os.makedirs(doc_dir, exist_ok=True)

    html_filename = f"{doc_name_safe}.html"
    pdf_filename = f"{doc_name_safe}.pdf"
    html_path = os.path.join(doc_dir, html_filename)
    pdf_path = os.path.join(doc_dir, pdf_filename)

    try:
        with open(html_path, 'w', encoding='utf-8') as f:
            await asyncio.to_thread(f.write, html_content)

        # --- Playwright PDF generation ---
        # Requires: pip install playwright && playwright install chromium
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()
            # Load HTML from file
            with open(html_path, 'r', encoding='utf-8') as f:
                html_for_pdf = f.read()
            await page.set_content(html_for_pdf, wait_until="networkidle")
            await page.pdf(path=pdf_path, format="A4")
            await browser.close()
    except Exception as e:
        return {"status": "error", "message": f"Failed to save or convert PDF: {str(e)}"}

    serve_url = f"{DOMAIN}/user_data/{user_id_safe}/pdfs/{doc_name_safe}.pdf"

    return {
        "status": "success",
        "message": f"PDF document '{doc_name}' created successfully. Access it at {serve_url}",
        "url": serve_url
    }

#
# Any constants or prompts used by these tools (e.g., DOMAIN, WEB_APP_PROMPT, PDF_HTML_SYSTEM_PROMPT, etc.)
#
# Make sure to also include any required imports for Google APIs, Playwright, etc.

# --- End of copy list ---

# --- Start of new edit tools ---

@mcp.tool()
async def edit_web_app(
    user_number: Annotated[str, Field(
        description="The user's unique identifier, used to locate their data. Typically provided by the backend."
    )] = "+17145986105",
    app_name: Annotated[Optional[str], Field(
        description="The name of the existing web application to edit. This app must have been previously created."
    )] = None,
    user_edit_request: Annotated[Optional[str], Field(
        description="A clear description of the changes the user wants to make to the web app."
    )] = None,
    model: Annotated[MODELS_LITERAL, Field(
        description="The LLM model to use for generating the diff to edit the HTML content."
    )] = "gemini-2.5-pro-preview-05-06",
    additional_context: Annotated[Optional[str], Field(
        description="Optional textual context to guide web app editing. This string should contain all necessary and relevant details from previous steps (e.g., search results, API documentation, user clarifications) to perform the optimal edit. The LLM should synthesize this string to be as detailed as required. For this edit tool, using @@ref_ to point to a string field within a previous output is also acceptable for this parameter.",
        default=None
    )] = None
) -> dict:
    """
    Edits an existing web application based on the user's request using a diff-fenced format.
    The user's request should describe the changes needed for the existing web app.
    Requires the app_name of a previously created web app.
    """
    if not app_name:
        return {"status": "error", "message": "app_name must be provided to edit an existing web app."}
    if not user_edit_request:
        return {"status": "error", "message": "user_edit_request must be provided to describe the changes."}

    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"

    user_id_safe = sanitize_for_path(user_number)
    app_name_safe = sanitize_for_path(app_name)

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    user_specific_data_dir = os.path.join(base_dir, user_id_safe)
    app_dir = os.path.join(user_specific_data_dir, "web_apps")
    html_filename = f"{app_name_safe}.html"
    html_path = os.path.join(app_dir, html_filename)

    if not await asyncio.to_thread(os.path.exists, html_path):
        return {"status": "error", "message": f"Web app '{app_name}' (path: {html_path}) not found for editing."}

    try:
        with open(html_path, 'r', encoding='utf-8') as f:
            original_html_content = await asyncio.to_thread(f.read)
    except Exception as e:
        return {"status": "error", "message": f"Failed to read existing web app HTML: {str(e)}"}

    # --- Prepare LLM Call ---
    adapter = get_llm_adapter(model_name=model)
    
    # Construct prompt for the LLM
    prompt_to_llm = f"""Original HTML Content of `{html_filename}`:
```html
{original_html_content}
```

User's request for changes:
"{user_edit_request}"

Please provide the necessary changes ONLY in the \"diff-fenced\" format as per system instructions.
"""

    if additional_context:
        prompt_to_llm += f"\n\n**Additional Context to Consider for this edit:**\n{additional_context}"

    history = [StandardizedMessage(role="user", content=prompt_to_llm)]
    llm_config = StandardizedLLMConfig(system_prompt=EDIT_WEB_APP_SYSTEM_PROMPT)

    try:
        logger.debug(f"Calling LLM for web app edit. App: {app_name_safe}. Model: {model}.")
        llm_response = await adapter.generate_content(
            model_name=model, history=history, tools=None, config=llm_config
        )
        if llm_response.error:
            return {"status": "error", "message": f"LLM API error during edit: {llm_response.error}"}
        
        diff_output = llm_response.text_content
        if not diff_output: # Check if LLM returned empty string, meaning no changes.
             logger.info(f"LLM returned no diff for {app_name_safe}, assuming no changes needed or content was empty.")
             # If no diff, we assume no changes, so the original content is "final".
             # No need to write the file again if it's identical.
             serve_url = f"{DOMAIN}/user_data/{user_id_safe}/web_apps/{app_name_safe}.html"
             return {
                "status": "success",
                "message": f"Web app '{app_name}' was reviewed. No changes applied as per LLM output. Current version at {serve_url}",
                "url": serve_url
            }

    except Exception as e:
        return {"status": "error", "message": f"Error during LLM call for web app edit: {str(e)}"}

    # --- Apply Diffs ---
    try:
        logger.debug(f"Applying diffs to {app_name_safe}. Diff output from LLM:\n{diff_output[:500]}...")
        modified_html_content = await asyncio.to_thread(apply_fenced_diffs, original_html_content, diff_output)
    except ValueError as e: # Catch errors from apply_fenced_diffs if a SEARCH block isn't found
        return {"status": "error", "message": f"Failed to apply generated diffs: {str(e)}"}
    except Exception as e:
        return {"status": "error", "message": f"Unexpected error applying diffs: {str(e)}"}

    # --- Save Modified HTML ---
    try:
        with open(html_path, 'w', encoding='utf-8') as f:
            await asyncio.to_thread(f.write, modified_html_content)
    except Exception as e:
        return {"status": "error", "message": f"Failed to save modified web app HTML: {str(e)}"}

    serve_url = f"{DOMAIN}/user_data/{user_id_safe}/web_apps/{app_name_safe}.html"
    return {
        "status": "success",
        "message": f"Web app '{app_name}' edited successfully. Access it at {serve_url}",
        "url": serve_url
    }

@mcp.tool()
async def edit_pdf_document(
    user_number: Annotated[str, Field(
        description="The user's unique identifier, used to locate their data. Typically provided by the backend."
    )] = "+17145986105",
    doc_name: Annotated[Optional[str], Field(
        description="The name of the existing PDF document to edit. This document must have been previously created."
    )] = None,
    user_edit_request: Annotated[Optional[str], Field(
        description="A clear description of the changes the user wants to make to the PDF's content."
    )] = None,
    model: Annotated[MODELS_LITERAL, Field(
        description="The LLM model to use for generating the diff to edit the PDF's HTML source."
    )] = "gemini-2.5-pro-preview-05-06",
    additional_context: Annotated[Optional[str], Field(
        description="Optional textual context to guide PDF editing. This string should contain all necessary and relevant details from previous steps (e.g., search results, API documentation, user clarifications) to perform the optimal edit. The LLM should synthesize this string to be as detailed as required. For this edit tool, using @@ref_ to point to a string field within a previous output is also acceptable for this parameter.",
        default=None
    )] = None
) -> dict:
    """
    Edits an existing PDF document by modifying its underlying HTML source based on the user's request.
    The changes are described by the user and applied using a diff-fenced format.
    Requires the doc_name of a previously created PDF. The PDF is then regenerated from the modified HTML.
    """
    if not doc_name:
        return {"status": "error", "message": "doc_name must be provided to edit an existing PDF."}
    if not user_edit_request:
        return {"status": "error", "message": "user_edit_request must be provided to describe the changes."}

    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"

    user_id_safe = sanitize_for_path(user_number)
    doc_name_safe = sanitize_for_path(doc_name)

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    user_specific_data_dir = os.path.join(base_dir, user_id_safe)
    doc_dir = os.path.join(user_specific_data_dir, "pdfs")
    
    html_filename = f"{doc_name_safe}.html"
    pdf_filename = f"{doc_name_safe}.pdf"
    html_path = os.path.join(doc_dir, html_filename)
    pdf_path = os.path.join(doc_dir, pdf_filename)

    if not await asyncio.to_thread(os.path.exists, html_path):
        return {"status": "error", "message": f"PDF source HTML '{html_filename}' (path: {html_path}) not found for editing."}

    try:
        with open(html_path, 'r', encoding='utf-8') as f:
            original_html_content = await asyncio.to_thread(f.read)
    except Exception as e:
        return {"status": "error", "message": f"Failed to read existing PDF source HTML: {str(e)}"}

    # --- Prepare LLM Call for Diffs ---
    adapter = get_llm_adapter(model_name=model)
    prompt_to_llm = f"""Original HTML Content of `{html_filename}` (source for PDF '{doc_name_safe}.pdf'):
```html
{original_html_content}
```

User's request for changes to the PDF content:
"{user_edit_request}"

Please provide the necessary changes ONLY in the \"diff-fenced\" format as per system instructions.
Ensure the edited HTML remains suitable for PDF conversion.
"""

    if additional_context:
        prompt_to_llm += f"\n\n**Additional Context to Consider for this edit:**\n{additional_context}"

    history = [StandardizedMessage(role="user", content=prompt_to_llm)]
    llm_config = StandardizedLLMConfig(system_prompt=EDIT_PDF_SYSTEM_PROMPT)

    try:
        logger.debug(f"Calling LLM for PDF edit. Doc: {doc_name_safe}. Model: {model}.")
        llm_response = await adapter.generate_content(
            model_name=model, history=history, tools=None, config=llm_config
        )
        if llm_response.error:
            return {"status": "error", "message": f"LLM API error during PDF edit: {llm_response.error}"}

        diff_output = llm_response.text_content
        if not diff_output: # Check if LLM returned empty string, meaning no changes.
            logger.info(f"LLM returned no diff for PDF source {html_filename}, assuming no changes needed.")
            serve_url = f"{DOMAIN}/user_data/{user_id_safe}/pdfs/{pdf_filename}"
            # No need to re-write HTML or re-render PDF if no changes.
            return {
                "status": "success",
                "message": f"PDF document '{doc_name}' was reviewed. No changes applied as per LLM output. Current version at {serve_url}",
                "url": serve_url
            }
            
    except Exception as e:
        return {"status": "error", "message": f"Error during LLM call for PDF edit: {str(e)}"}

    # --- Apply Diffs ---
    try:
        logger.debug(f"Applying diffs to PDF source {html_filename}. Diff output:\n{diff_output[:500]}...")
        modified_html_content = await asyncio.to_thread(apply_fenced_diffs, original_html_content, diff_output)
    except ValueError as e: 
        return {"status": "error", "message": f"Failed to apply generated diffs for PDF: {str(e)}"}
    except Exception as e:
        return {"status": "error", "message": f"Unexpected error applying diffs for PDF: {str(e)}"}

    # --- Save Modified HTML and Regenerate PDF ---
    try:
        with open(html_path, 'w', encoding='utf-8') as f:
            await asyncio.to_thread(f.write, modified_html_content)

        # Regenerate PDF using Playwright
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()
            # Load HTML from file (the modified version)
            # No need to read again, use modified_html_content directly
            await page.set_content(modified_html_content, wait_until="networkidle")
            await page.pdf(path=pdf_path, format="A4") # Ensure pdf_path is correct
            await browser.close()
            
    except Exception as e:
        return {"status": "error", "message": f"Failed to save modified HTML or regenerate PDF: {str(e)}"}

    serve_url = f"{DOMAIN}/user_data/{user_id_safe}/pdfs/{pdf_filename}"
    return {
        "status": "success",
        "message": f"PDF document '{doc_name}' edited and regenerated successfully. Access it at {serve_url}",
        "url": serve_url
    }

@mcp.tool()
async def list_web_apps(
    user_number: Annotated[str, Field(
        description="The user's unique identifier, used to locate their web app data. Typically provided by the backend."
    )] = "+17145986105",
    limit: Annotated[int, Field(
        description="Maximum number of web apps to return in the list.",
        ge=1 
    )] = 10
) -> dict:
    """
    Lists web applications previously created by the specified user.

    Returns a list of web application details, each including 'app_name' and 'url'.
    """
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105" # Default user_id

    user_id_safe = sanitize_for_path(user_number) # Assuming sanitize_for_path is available in this file

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    app_dir = os.path.join(base_dir, user_id_safe, "web_apps")

    if not await asyncio.to_thread(os.path.exists, app_dir) or not await asyncio.to_thread(os.path.isdir, app_dir):
        logger.info(f"Web app directory not found for user {user_id_safe} at {app_dir}. Returning empty list.")
        return {"web_apps": []}

    web_apps_list = []
    try:
        filenames = await asyncio.to_thread(os.listdir, app_dir)
        html_files = sorted([f for f in filenames if f.endswith(".html")], reverse=True) # Sort by name, newest typically if names are timestamped or sequential

        for html_filename in html_files:
            if len(web_apps_list) >= limit:
                break
            
            app_name = html_filename[:-5] # Remove .html extension
            serve_url = f"{DOMAIN}/user_data/{user_id_safe}/web_apps/{html_filename}" # DOMAIN should be accessible
            
            web_apps_list.append({
                "app_name": app_name,
                "url": serve_url
            })
        
        return {"web_apps": web_apps_list}

    except Exception as e:
        logger.error(f"Error listing web apps for user {user_id_safe}: {e}")
        return {"status": "error", "message": f"Failed to list web apps: {str(e)}"}

# --- End of new edit tools ---

if __name__ == "__main__":
    mcp.run() 