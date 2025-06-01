#!/usr/bin/env python3
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
from fastmcp import FastMCP, Context
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
from system_prompts import PDF_HTML_SYSTEM_PROMPT
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

# Import the new robust search/replace functionality
from utils.search_replace import (
    SearchReplaceBlockParser,
    SearchReplaceApplicator,
    apply_search_replace_blocks
)

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

You must provide your changes in the *SEARCH/REPLACE block* format as follows:

file.html
```html
<<<<<<< SEARCH
[Exact lines from the ORIGINAL HTML content that you want to replace or modify]
=======
[The new lines that should replace the content in the SEARCH block]
>>>>>>> REPLACE
```

Guidelines:
1. The content within the `<<<<<<< SEARCH` and `=======` part (the SEARCH block) MUST be an exact, contiguous segment from the ORIGINAL HTML provided to you.
2. The content within the `=======` and `>>>>>>> REPLACE` part (the REPLACE block) is the new content.
3. To insert content, identify a line or block to replace. Include the original line/block in SEARCH and the original line/block plus your new content in REPLACE. For example, to insert "NEW_LINE" after "EXISTING_LINE":
    file.html
    ```html
    <<<<<<< SEARCH
    EXISTING_LINE
    =======
    EXISTING_LINE
    NEW_LINE
    >>>>>>> REPLACE
    ```
4. To delete content, the REPLACE block should be empty (it may contain a newline if the original block ended with one and you want to preserve that structure, or be completely empty). Example of deleting "CONTENT_TO_DELETE":
    file.html
    ```html
    <<<<<<< SEARCH
    CONTENT_TO_DELETE
    =======
    >>>>>>> REPLACE
    ```
5. You can provide multiple *SEARCH/REPLACE blocks* one after another if multiple distinct changes are needed. Order them logically.
6. Ensure that your SEARCH blocks are precise and correctly reflect the parts of the original HTML you intend to change. If a text segment appears multiple times, make your SEARCH block specific enough to target only the intended instance (e.g., by including surrounding unique text).
7. ALWAYS include the filename before each block (e.g., "file.html" or whatever the actual filename is).
8. Output ONLY the *SEARCH/REPLACE blocks*. Do NOT include any other text, explanations, or markdown formatting beyond the blocks themselves.
9. If `additional_context` is provided, ensure your blocks reflect the information or requirements mentioned in it, in addition to the primary user's edit request.

Example format:
filename.html
```html
<<<<<<< SEARCH
<div class="old-content">
    <p>Old text</p>
</div>
=======
<div class="new-content">
    <p>New text</p>
    <p>Additional content</p>
</div>
>>>>>>> REPLACE
```
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
    
    NOTE: This function is still used by PDF editing but has been replaced by the robust 
    search/replace functionality (utils.search_replace) for web app editing which provides
    better error handling and multiple fallback strategies.
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
            print(f"Diff output provided but no valid diff blocks found. Diff output: {diff_output[:200]}...")
        else: # LLM intentionally returned no diffs, meaning no changes needed.
            print("LLM returned empty diff, indicating no changes.")
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
                print(error_msg)
                # Continue to try applying subsequent diffs.
        except Exception as e:
            print(f"Error applying diff block: {e}. Search block: '{search_block[:100]}...'")
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
                print(f"Skipping attachment item: '{item[:100]}...' as it is not a valid HTTP/HTTPS URL. Only URL attachments are supported.")
                continue
            else: # Not a string or not a URL
                print(f"Skipping non-string or invalid attachment item (type: {type(item)}): '{str(item)[:100]}...'. Only URL attachments are supported.")
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

import datetime
current_date = datetime.datetime.now().strftime("%Y-%m-%d")
WEB_APP_PROMPT = """You're an expert web developer.
Current date: """ + current_date + """

In your code follow the principle of least surprise. Try to do things in the obvious way.
# Website Design Requirements
Inspired by Apple, Steve Jobs, Jony Ive, and Dieter Rams

## Implementation Philosophy
- Implement EXACTLY what the user requests - nothing more, nothing less
- Remember Jobs' philosophy: "Design is not just what it looks like and feels like. Design is how it works."

## Core Design Principles

1. Simplicity & Clarity
- Clean, uncluttered layout
- Intuitive navigation
- Minimal visual distractions
- Purpose-driven design elements

2. Visual Aesthetics
- Refined, neutral color palette
- Subtle accent colors
- Effective use of white space
- Clear, modern typography
- Glassmorphism and blur effects where appropriate

3. Functional Design
- Usability first approach
- Clear visual hierarchy
- Intuitive call-to-actions
- Self-explanatory UI elements

4. Attention to Detail
- Precise element placement
- Consistent spacing
- Thoughtful interactions
- Cohesive design language
- Polish in every aspect

## Dark Mode Implementation
- ALWAYS implement system-based dark mode support for all web apps
- Use Tailwind's built-in dark mode functionality that automatically detects system preferences
- Add the following to your HTML head to enable system preference detection:
  ```html
  <script>
    // On page load or when changing themes, best practice to add both dark class and colorScheme
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
  </script>
  ```
- Use Tailwind's dark mode variant for styling: 
  - Example: `<div class="bg-white text-gray-800 dark:bg-gray-900 dark:text-white">`
- Ensure sufficient contrast in both modes
- Test all interactive elements in both light and dark modes
- For Apple-inspired dark mode, use subtle dark backgrounds (not pure black) and softer whites
- Be thoughtful with shadows and borders which may need different treatment in dark mode

## Mobile-First Design Requirements
- ALWAYS design for mobile screens first, then scale up to larger screens. Ensure looks good on desktop as well, but mobile first.
- VERY IMPORTANT: Prevent horizontal scrolling at ALL costs - this is critical for user experience
- Implement proper viewport meta tag: <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
- Ensure touch targets are setup for mobile devices
- Stack elements vertically on mobile instead of using horizontal layouts
- Use appropriate spacing between interactive elements
- Implement collapsible navigation for mobile screens when necessary

## Production Reliability Guidelines
- ALWAYS choose the most reliable implementation approach
- These applications go directly to production - any bugs are catastrophic
- Prefer proven, well-tested methods over experimental techniques
- When faced with multiple implementation options, choose the one most likely to work across all environments

## Database Storage Guidelines
- For persistent data storage use local storage.

## Implementation Guidelines
- ALWAYS use Tailwind CSS CDN
- Maintain code simplicity and elegance
- Incorporate glassmorphism thoughtfully
- Focus on minimalist solutions
- ALWAYS implement responsive behavior with mobile-first approach
- ALWAYS include appropriate meta tags and Open Graph tags for social sharing
- NEVER use static image URLs, placeholder images, or third-party image services

## JavaScript Security and Escaping Guidelines
- Escape closing script tags inside template literals or string literals by using <\/script> instead of </script>
- Properly escape special characters in JavaScript strings and template literals:
  - Use \' for single quotes within single-quoted strings
  - Use \" for double quotes within double-quoted strings
  - Use \\ for backslashes

## SEO and Social Media Integration
1. ALWAYS include these essential meta tags and Open Graph tags in the head:
   ```html
   <!-- Essential Meta Tags -->
   <meta charset="UTF-8">
   <meta name="viewport" content="width=device-width, initial-scale=1.0">
   <meta name="description" content="Concise description of the page content">
   
   <!-- Open Graph Tags for Social Media Sharing -->
   <meta property="og:title" content="Page Title - Engaging and Descriptive">
   <meta property="og:description" content="Compelling description for social media sharing">
   <meta property="og:url" content="Canonical URL of this page">
   <meta property="og:type" content="website">
   ```
   

## Favicon Implementation
1. ALWAYS include a favicon using SVG with an emoji character:
   - The emoji should be contextually relevant to the web app's purpose

OPTIMIZE FOR MOBILE FIRST design unless otherwise specified.
1. Design for the smallest screen first, then progressively enhance for larger screens
2. Ensure NO horizontal scrolling occurs on any screen size
3. Use flexible layouts that adapt to different screen sizes
4. Implement appropriate touch targets and spacing for mobile users

# Calling Backend MCP Tools from JavaScript

If the web application needs to trigger backend MCP tools (from the tool information provided above, or other known tools), you can generate JavaScript to make an HTTP POST request to the `/internal/call_mcp_tool` endpoint on the main application server.

**Request Format:**
-   **URL:** `/internal/call_mcp_tool` (This is a relative path to an endpoint on the same server hosting the web app. The server will proxy this to the MCP service and handle authentication.)
-   **Method:** `POST`
-   **Headers:** `{'Content-Type': 'application/json'}` (Do NOT include `X-Internal-API-Key` here; the server handles it.)
-   **Body (JSON):**
    ```json
    {
        "tool_name": "ACTUAL_TOOL_NAME",
        "arguments": { "arg1": "value1", "arg2": 123 }, // The actual arguments object for the tool
    }
    ```
    -   Replace `ACTUAL_TOOL_NAME` with the exact name of the MCP tool you want to call.
    -   The `arguments` field should be a direct JSON object expected by the tool.

**Response Handling:**
-   The `/internal/call_mcp_tool` endpoint will respond with the direct JSON output from the MCP tool call:
    ```json
    {
        "result": "STRINGIFIED_JSON_OR_PLAIN_TEXT_RESULT_FROM_TOOL", // This is the primary payload from the tool
        "error": "OPTIONAL_ERROR_MESSAGE" // Check this for tool execution errors
    }
    ```
-   Your JavaScript should check for `response.error`.
-   If no error, `response.result` contains the tool's output. If this output is expected to be JSON (common for many tools), your JavaScript should parse `response.result` (e.g., `JSON.parse(response.result)`). If it's plain text, use it directly.
-   Remember these are asynchronous calls (`fetch().then(...)` or `async/await`). Update the DOM *after* receiving and processing the response.

**Example JavaScript Snippet (Conceptual):**
```javascript
// Super simple MCP tool calling - AI should use this pattern!
async function callTool(toolName, args = {}) {
    try {
        const response = await fetch('/internal/call_mcp_tool', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tool_name: toolName,
                arguments: args,
            })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        if (data.error && data.error !== "None" && data.error !== null) throw new Error(data.error);
        
        // Parse result if it's JSON, otherwise return as string
        try {
            return JSON.parse(data.result);
        } catch {
            return data.result;
        }
    } catch (error) {
        console.error(`Tool ${toolName} failed:`, error);
        throw error;
    }
}

// Usage examples:
// const images = await callTool('generate_images_with_prompts', {prompts: ['a cat', 'a dog']});
// const analysis = await callTool('analyze_images', {urls: ['http://...'], analysis_prompt: 'What is this?'});
// const webApp = await callTool('create_web_app', {description: 'A todo app', mcp_tool_names: ['save_file']});
```

Use this pattern to enable dynamic interactions with backend tools. Make sure your JavaScript handles the asynchronous nature of these calls and updates the web page appropriately.

ALWAYS BE SURE TO SUPPORT BOTH ANDROID AND APPLE PHONES EVERYTIME. THIS IS VERY IMPORTANT TO BE SURE THAT ANDROID COMPATIBILITY IS INCLUDED.

Create a complete implementation that captures the essence of the user's request. Make it beautiful and modern.

You must format the output as a complete HTML document like this:

Output Format Example:
webapp.html
```
<!DOCTYPE html>
<html>
<head>
    <title>Web App Title</title>
    <!-- CSS styling here -->
</head>
<body>
    <!-- Complete HTML content here -->
    <script>
    // JavaScript here
    </script>
</body>
</html>
```

VERY IMPORTANT: You MUST return ONLY the complete HTML code inside a single Markdown code block (triple backticks). Do NOT include any explanations, comments, or text outside the code block. The code block should start with ```html and contain the full HTML document.

# AI-Powered Structured Content Generation

The web application can leverage AI to generate arbitrary structured content using the `ai_sample` MCP tool with JSON schema validation. This enables creating dynamic, AI-generated content that follows specific formats.

## Using ai_sample Tool for Structured AI Content

When you need the AI to generate content in a specific structure, you can use the `ai_sample` tool with a JSON schema to enforce the output format:

**Basic Syntax:**
```javascript
// Method 1: Generate structured content with JSON schema
async function sampleAI(prompt, schema = null, systemPrompt = null, model = "gemini-2.5-flash-preview-05-20") {
    try {
        const result = await callTool('ai_sample', {
            messages: prompt,
            json_schema: schema,
            system_prompt: systemPrompt,
            model: model
        });
        
        if (result.status === 'error') {
            throw new Error(result.error);
        }
        
        return result.result;
    } catch (error) {
        console.error('AI sampling failed:', error);
        throw error;
    }
}

// Method 2: Simple text generation without schema
const simpleText = await callTool('ai_sample', {
    messages: "Write a creative story about a robot",
    model: "gemini-2.5-flash-preview-05-20"
});
```

## Practical Examples

**Example 1: Generate User Profiles**
```javascript
async function generateUserProfile() {
    const profileSchema = {
        "type": "object",
        "properties": {
            "name": {"type": "string"},
            "age": {"type": "number", "minimum": 18, "maximum": 65},
            "email": {"type": "string", "format": "email"},
            "skills": {"type": "array", "items": {"type": "string"}},
            "experience_years": {"type": "number"},
            "bio": {"type": "string"}
        },
        "required": ["name", "age", "email", "skills", "experience_years"]
    };
    
    const profile = await callTool('ai_sample', {
        messages: "Generate a realistic user profile for a tech professional",
        json_schema: profileSchema
    });
    
    if (profile.status === 'success') {
        // Use the structured result
        document.getElementById('profile-name').textContent = profile.result.name;
        document.getElementById('profile-email').textContent = profile.result.email;
        profile.result.skills.forEach(skill => {
            const skillElement = document.createElement('span');
            skillElement.textContent = skill;
            document.getElementById('skills-container').appendChild(skillElement);
        });
    }
}
```

**Example 2: Generate Product Listings**
```javascript
async function generateProducts(category) {
    const productsSchema = {
        "type": "object",
        "properties": {
            "products": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "price": {"type": "number"},
                        "description": {"type": "string"},
                        "rating": {"type": "number", "minimum": 1, "maximum": 5},
                        "inStock": {"type": "boolean"}
                    },
                    "required": ["name", "price", "description", "rating", "inStock"]
                }
            }
        },
        "required": ["products"]
    };
    
    const result = await callTool('ai_sample', {
        messages: `Generate 5 ${category} products with realistic details`,
        json_schema: productsSchema
    });
    
    if (result.status === 'success') {
        // Render products in the UI
        const container = document.getElementById('products-container');
        result.result.products.forEach(product => {
            const productElement = document.createElement('div');
            productElement.className = 'product-card p-4 border rounded-lg';
            productElement.innerHTML = `
                <h3 class="text-lg font-semibold">${product.name}</h3>
                <p class="text-xl text-green-600">$${product.price}</p>
                <p class="text-gray-600">${product.description}</p>
                <div class="flex justify-between items-center mt-2">
                    <div>Rating: ${product.rating}/5 ⭐</div>
                    <div class="${product.inStock ? 'text-green-600' : 'text-red-600'}">
                        ${product.inStock ? 'In Stock' : 'Out of Stock'}
                    </div>
                </div>
            `;
            container.appendChild(productElement);
        });
    }
}
```

**Example 3: Generate Dynamic Form Fields**
```javascript
async function generateFormData(formType) {
    const formSchema = {
        "type": "object",
        "properties": {
            "fields": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "label": {"type": "string"},
                        "type": {"type": "string", "enum": ["text", "email", "number", "select", "textarea"]},
                        "placeholder": {"type": "string"},
                        "required": {"type": "boolean"},
                        "options": {"type": "array", "items": {"type": "string"}}
                    },
                    "required": ["id", "label", "type", "required"]
                }
            }
        },
        "required": ["fields"]
    };
    
    const result = await callTool('ai_sample', {
        messages: `Generate realistic ${formType} form fields`,
        json_schema: formSchema
    });
    
    if (result.status === 'success') {
        // Dynamically create form
        const form = document.getElementById('dynamic-form');
        result.result.fields.forEach(field => {
            const fieldElement = createFormField(field);
            form.appendChild(fieldElement);
        });
    }
}

function createFormField(field) {
    const div = document.createElement('div');
    div.className = 'mb-4';
    
    const label = document.createElement('label');
    label.textContent = field.label;
    label.className = 'block text-sm font-medium mb-2';
    
    let input;
    if (field.type === 'select') {
        input = document.createElement('select');
        field.options?.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option;
            optionElement.textContent = option;
            input.appendChild(optionElement);
        });
    } else if (field.type === 'textarea') {
        input = document.createElement('textarea');
        input.rows = 4;
    } else {
        input = document.createElement('input');
        input.type = field.type;
    }
    
    input.id = field.id;
    input.name = field.id;
    input.placeholder = field.placeholder || '';
    input.required = field.required;
    input.className = 'w-full p-2 border border-gray-300 rounded-md';
    
    div.appendChild(label);
    div.appendChild(input);
    return div;
}
```

**Example 4: Generate Chart Data**
```javascript
async function generateChartData(chartType, topic) {
    const chartSchema = {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "labels": {"type": "array", "items": {"type": "string"}},
            "datasets": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "label": {"type": "string"},
                        "data": {"type": "array", "items": {"type": "number"}},
                        "backgroundColor": {"type": "string"},
                        "borderColor": {"type": "string"}
                    },
                    "required": ["label", "data"]
                }
            }
        },
        "required": ["title", "labels", "datasets"]
    };
    
    const result = await callTool('ai_sample', {
        messages: `Generate realistic ${chartType} chart data for ${topic}`,
        json_schema: chartSchema
    });
    
    if (result.status === 'success') {
        // Use with Chart.js or similar
        new Chart(document.getElementById('myChart'), {
            type: chartType,
            data: {
                labels: result.result.labels,
                datasets: result.result.datasets
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: result.result.title
                    }
                }
            }
        });
    }
}
```

**Example 5: Generate Creative Content**
```javascript
async function generateCreativeContent() {
    // Without schema - returns text
    const story = await callTool('ai_sample', {
        messages: "Write a short science fiction story about time travel",
        system_prompt: "You are a creative writer who specializes in engaging, plot-driven science fiction."
    });
    
    if (story.status === 'success') {
        document.getElementById('story-content').textContent = story.result;
    }
    
    // With schema - returns structured content
    const blogPost = await callTool('ai_sample', {
        messages: "Create a blog post about renewable energy",
        json_schema: {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "introduction": {"type": "string"},
                "sections": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "heading": {"type": "string"},
                            "content": {"type": "string"}
                        }
                    }
                },
                "conclusion": {"type": "string"},
                "tags": {"type": "array", "items": {"type": "string"}}
            }
        }
    });
    
    if (blogPost.status === 'success') {
        const post = blogPost.result;
        document.getElementById('blog-title').textContent = post.title;
        document.getElementById('blog-intro').textContent = post.introduction;
        
        const sectionsContainer = document.getElementById('blog-sections');
        post.sections.forEach(section => {
            const sectionDiv = document.createElement('div');
            sectionDiv.innerHTML = `
                <h3 class="text-lg font-semibold mb-2">${section.heading}</h3>
                <p class="mb-4">${section.content}</p>
            `;
            sectionsContainer.appendChild(sectionDiv);
        });
        
        document.getElementById('blog-conclusion').textContent = post.conclusion;
    }
}
```

## Advanced Schema Features

You can use advanced JSON Schema features for more sophisticated validation:

```javascript
// Complex nested structures
const complexSchema = {
    "type": "object",
    "properties": {
        "user": {
            "type": "object",
            "properties": {
                "profile": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "settings": {
                            "type": "object",
                            "properties": {
                                "theme": {"type": "string", "enum": ["light", "dark"]},
                                "notifications": {"type": "boolean"}
                            }
                        }
                    }
                }
            }
        },
        "data": {
            "type": "array",
            "items": {
                "anyOf": [
                    {"type": "string"},
                    {"type": "number"},
                    {"type": "object"}
                ]
            }
        }
    }
};

// String patterns and formats
const validationSchema = {
    "type": "object",
    "properties": {
        "email": {"type": "string", "format": "email"},
        "phone": {"type": "string", "pattern": "^\\+?[1-9]\\d{1,14}$"},
        "website": {"type": "string", "format": "uri"},
        "age": {"type": "number", "minimum": 0, "maximum": 120}
    }
};

// Use the complex schema
const complexData = await callTool('ai_sample', {
    messages: "Generate user data with settings",
    json_schema: complexSchema
});
```

## Integration Tips

1. **Error Handling**: Always check `result.status` and handle errors gracefully
2. **Loading States**: Show loading indicators while AI generates content
3. **Fallbacks**: Provide default content if AI generation fails
4. **Caching**: Cache generated content when appropriate to avoid re-generation
5. **User Feedback**: Allow users to regenerate content if not satisfied
6. **Progressive Enhancement**: Start with static content, then enhance with AI-generated content

```javascript
// Example with proper error handling and loading states
async function generateWithFeedback() {
    const loadingElement = document.getElementById('loading');
    const contentElement = document.getElementById('content');
    const errorElement = document.getElementById('error');
    
    try {
        loadingElement.style.display = 'block';
        errorElement.style.display = 'none';
        
        const result = await callTool('ai_sample', {
            messages: "Generate product recommendations",
            json_schema: {
                "type": "object",
                "properties": {
                    "recommendations": {
                        "type": "array",
                        "items": {"type": "string"}
                    }
                }
            }
        });
        
        if (result.status === 'success') {
            contentElement.innerHTML = result.result.recommendations
                .map(rec => `<li>${rec}</li>`)
                .join('');
        } else {
            throw new Error(result.error);
        }
        
    } catch (error) {
        errorElement.textContent = `Failed to generate content: ${error.message}`;
        errorElement.style.display = 'block';
    } finally {
        loadingElement.style.display = 'none';
    }
}
```

This structured approach enables creating highly dynamic web applications where AI can generate content in predictable, usable formats through the server-side `ai_sample` tool.

ALWAYS BE SURE TO SUPPORT BOTH ANDROID AND APPLE PHONES EVERYTIME. THIS IS VERY IMPORTANT TO BE SURE THAT ANDROID COMPATIBILITY IS INCLUDED.
"""

@mcp.tool()
async def create_web_app(
    ctx: Context,
    user_number: Annotated[str, Field(
        description="The user's unique identifier (e.g., phone number), used for directory structuring. This is typically provided by the backend system and should not be solicited from the end-user by the LLM."
    )] = "+17145986105",
    app_name: Annotated[Optional[str], Field(
        description="The desired name for the web application. If not provided, a relevant name will be automatically generated. Use underscores for spaces (e.g., 'my_cool_app'). The LLM should choose a short, concise name relevant to the request if one isn't given by the user."
    )] = None,
    attachments: Annotated[Optional[List[str]], Field(
        description="A list of attachment URLs. These will be processed and potentially included or referenced in the web application. Provide the full URLS here."
    )] = None,
    user_request: Annotated[Optional[str], Field(
        description="The user's exact request as they stated it, without any technical details or modifications. The powerful AI will handle all technical implementation."
    )] = None,
    model: Annotated[MODELS_LITERAL, Field(
        description="The LLM model to use for HTML generation. If user does not specify, use gemini-2.5-flash-preview-05-20"
    )] = "gemini-2.5-flash-preview-05-20",
    mcp_tool_names: Annotated[Optional[List[str]], Field(
        description="Pass a list of relevant MCP tool names that the generated web application should use. The system will fetch their schemas.",
        default=None
    )] = None,
    additional_context: Annotated[Optional[str], Field(
        description="Optional additional context, like previous tool call summaries if relevant.",
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
    
    Caller of this tool is simply routing the user's request to this MCP service. If user requests a web app just route the request to this tool.

    Returns:
        dict: A dictionary with the following structure:
        {
            "status": str,      # "success" or "error"
            "message": str,     # Human-readable description of the result
            "url": str          # URL to access the created web app (only on success)
        }
        
        On success:
        - status: "success"
        - message: Confirmation message with app name and URL
        - url: Direct URL to access the web application
        
        On error:
        - status: "error"
        - message: Description of the error that occurred
        - url: Not present
    """
    # Use default user number if empty
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105" # Default user_id

    # --- Sanitize inputs ---
    user_id_safe = sanitize_for_path(user_number)
    app_name = app_name or f"web-app-{str(uuid.uuid4())[:8]}"
    app_name_safe = sanitize_for_path(app_name)

    # --- Attachment Handling ---
    # Simplified: just use URLs directly instead of processing them
    attachment_info_for_prompt = []
    if attachments and isinstance(attachments, list):
        for url in attachments:
            if isinstance(url, str) and url.startswith(('http://', 'https://')):
                # Infer type from file extension or assume image
                if url.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg')):
                    mime_type = 'image/*'
                elif url.lower().endswith('.pdf'):
                    mime_type = 'application/pdf'
                else:
                    mime_type = 'unknown'
                attachment_info_for_prompt.append({"url": url, "mime_type": mime_type})
            else:
                print(f"Skipping invalid URL: {url}")

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
            if att_info['mime_type'].startswith('image'):
                current_web_app_system_prompt += f"  Instruction: Embed this image using an `<img>` tag. Use its URL as the `src` attribute. You may add relevant alt text and captions.\n"
            elif att_info['mime_type'] == 'application/pdf':
                current_web_app_system_prompt += f"  Instruction: Provide a link to this PDF document. Do not attempt to embed its content directly.\n"
            else:
                current_web_app_system_prompt += f"  Instruction: Reference or link to this file as appropriate for its type.\n"
        current_web_app_system_prompt += "\nEnsure all referenced attachments are displayed or linked correctly in the final HTML."

    # --- Fetch and Append available MCP tools information if mcp_tool_names are provided ---
    if mcp_tool_names:
        tool_schemas_context = ""
        try:
            # Use the new comprehensive tools endpoint that includes output_schema
            mcp_service_tools_url = f"http://localhost:5001/tools/all"
            
            # Using requests synchronously for simplicity within this async function.
            # Consider using an async HTTP client like aiohttp if this becomes a bottleneck.
            response = await asyncio.to_thread(requests.get, mcp_service_tools_url, timeout=10)
            response.raise_for_status() # Raise an exception for HTTP errors
            all_tools_data = response.json() # Expects JSON like {"tools": [...], "count": ...}
            
            available_tools_details = all_tools_data.get("tools", [])
            
            if available_tools_details:
                tool_schemas_context += "\n\n# Available MCP System Tools\n"
                tool_schemas_context += "The broader system has access to the following tools. You can design the web application to leverage these capabilities by making HTTP POST requests to `/internal/call_mcp_tool` as described in the system prompt. Each tool below includes its complete input and output schemas:\n"
                
                matched_tools_count = 0
                for tool_detail in available_tools_details:
                    if tool_detail.get("name") in mcp_tool_names:
                        tool_schemas_context += f"\n## Tool: {tool_detail.get('name')}\n"
                        tool_schemas_context += f"   Description: {tool_detail.get('description')}\n"
                        tool_schemas_context += f"   Input Schema: {json.dumps(tool_detail.get('input_schema', {}), indent=2)}\n"
                        
                        # Include output schema if available
                        output_schema = tool_detail.get('output_schema')
                        if output_schema:
                            tool_schemas_context += f"   Output Schema: {json.dumps(output_schema, indent=2)}\n"
                            tool_schemas_context += f"   Note: This tool returns structured data matching the output schema above.\n"
                        else:
                            tool_schemas_context += f"   Output Schema: Not defined (tool may return plain text or unstructured data)\n"
                        
                        # Add usage example for calling this tool
                        tool_schemas_context += f"   JavaScript Usage Example:\n"
                        tool_schemas_context += f"   ```javascript\n"
                        tool_schemas_context += f"   // Call {tool_detail.get('name')} tool\n"
                        tool_schemas_context += f"   const result = await callTool(\n"
                        tool_schemas_context += f"       '{tool_detail.get('name')}',\n"
                        tool_schemas_context += f"       {{ /* your arguments matching input schema */ }}\n"
                        tool_schemas_context += f"   );\n"
                        if output_schema:
                            tool_schemas_context += f"   // result will be a parsed object matching the output schema above\n"
                            if 'properties' in output_schema:
                                example_props = list(output_schema['properties'].keys())[:3]  # Show first 3 properties
                                for prop in example_props:
                                    prop_desc = output_schema['properties'][prop].get('description', 'see schema above')
                                    tool_schemas_context += f"   // result.{prop} - {prop_desc}\n"
                            tool_schemas_context += f"   console.log('Tool result:', result);\n"
                        else:
                            tool_schemas_context += f"   // result will be the tool's output (format not specified)\n"
                            tool_schemas_context += f"   console.log('Tool result:', result);\n"
                        tool_schemas_context += f"   ```\n"
                        
                        matched_tools_count += 1
                        
                if matched_tools_count == 0:
                    tool_schemas_context += "No specific tools from the provided list were found available. General tool interaction patterns can still be used if applicable tools are known by other means.\n"
            else:
                tool_schemas_context += "\n\n# Available MCP System Tools\nNo tools were found available via the MCP service tool listing.\n"
        except requests.exceptions.RequestException as e:
            tool_schemas_context += f"\n\n# Available MCP System Tools\nError fetching tool schemas: {str(e)}. Proceeding without specific tool context.\n"
        except json.JSONDecodeError as e:
            tool_schemas_context += f"\n\n# Available MCP System Tools\nError parsing tool schemas from MCP service: {str(e)}. Proceeding without specific tool context.\n"
        except Exception as e: # Catch any other unexpected error during schema fetching
            tool_schemas_context += f"\n\n# Available MCP System Tools\nAn unexpected error occurred while fetching tool schemas: {str(e)}. Proceeding without specific tool context.\n"

        current_web_app_system_prompt += tool_schemas_context


    # Original prompt construction for the user message partx
    prompt_text = f"Create a web app titled '{app_name}'.\n\n**User Request:**\n{main_request}"
    
    if additional_context:
        prompt_text += f"\n\n**Additional Context to Consider:**\n{additional_context}"

    try:
        print(f"Starting LLM call for web app '{app_name_safe}'. Model: {model}. Prompt length: {len(prompt_text)} characters. System prompt length: {len(current_web_app_system_prompt)} characters.")
        
        # Add a timeout wrapper around the ctx.sample call
        import asyncio
        
        async def sample_with_timeout():
            return await ctx.sample(
                messages=prompt_text,
                system_prompt=current_web_app_system_prompt,
                model_preferences=[model]
            )
        
        # 120 second timeout for complex web app generation
        llm_response_content = await asyncio.wait_for(sample_with_timeout(), timeout=120.0)
        
        print(f"LLM call completed successfully for web app '{app_name_safe}'.")
        
        # Extract text from the response content
        if hasattr(llm_response_content, 'text'):
            response_text = llm_response_content.text
        else:
            print(f"LLM response for '{app_name_safe}' missing text attribute. Response type: {type(llm_response_content)}")
            return {"status": "error", "message": "LLM sampling returned unexpected response format."}
            
        if not response_text:
            print(f"LLM returned empty response text for web app '{app_name_safe}'.")
            return {"status": "error", "message": "LLM returned no content for web app generation."}
            
        print(f"LLM response received for '{app_name_safe}'. Response length: {len(response_text)} characters.")
            
    except asyncio.TimeoutError:
        print(f"LLM call timed out after 120 seconds for web app '{app_name_safe}'.")
        return {"status": "error", "message": "Web app generation timed out. The request may be too complex. Please try simplifying your request or try again."}
    except Exception as e:
        print(f"Error during LLM sampling for web app '{app_name_safe}': {str(e)}")
        return {"status": "error", "message": f"Error during LLM sampling for web app: {str(e)}"}

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
        "url": serve_url,
        "html_content": html_content,
        "app_name": app_name
    }

@mcp.tool()
async def create_pdf_document(
    user_number: Annotated[str, Field(
        description="The user's unique identifier (e.g., phone number), used for directory structuring. This is typically provided by the backend."
    )] = "+17145986105",
    doc_name: Annotated[Optional[str], Field(
        description="The desired name for the PDF document. If not provided, a name will be generated (e.g., 'financial_report'). Use underscores for spaces."
    )] = None,
    user_request: Annotated[Optional[str], Field(
        description="The user's exact request as they stated it, without any technical details or modifications. The powerful AI will handle all technical implementation."
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
    # Remove .pdf extension if it already exists to prevent double extension
    if doc_name.endswith('.pdf'):
        doc_name = doc_name[:-4]
    doc_name_safe = sanitize_for_path(doc_name)

    # --- Attachment Handling ---
    # Simplified: just use URLs directly instead of processing them
    attachment_urls = []
    if attachments and isinstance(attachments, list):
        for url in attachments:
            if isinstance(url, str) and url.startswith(('http://', 'https://')):
                # Infer type from file extension
                if url.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg')):
                    mime_type = 'image/*'
                elif url.lower().endswith('.pdf'):
                    mime_type = 'application/pdf'
                else:
                    mime_type = 'unknown'
                attachment_urls.append((url, mime_type))
            else:
                print(f"Skipping invalid URL: {url}")

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
    
    # Use user_request as the main context for PDF generation
    main_request = user_request or "Please generate a PDF-ready HTML document as described in the system prompt."
    
    user_facing_prompt = f"**User Request:**\n{main_request}"
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
    ctx: Context,
    user_number: Annotated[str, Field(
        description="The user's unique identifier, used to locate their data. Typically provided by the backend."
    )] = "+17145986105",
    app_name: Annotated[Optional[str], Field(
        description="The name of the existing web application to edit. This app must have been previously created."
    )] = None,
    user_request: Annotated[Optional[str], Field(
        description="The user's exact request as they stated it, without any technical details or modifications. The powerful AI will handle all technical implementation."
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
    Edits an existing web application based on the user's request using robust SEARCH/REPLACE blocks.
    The user's request should describe the changes needed for the existing web app.
    Requires the app_name of a previously created web app.
    """
    if not app_name:
        return {"status": "error", "message": "app_name must be provided to edit an existing web app."}
    if not user_request:
        return {"status": "error", "message": "user_request must be provided to describe the changes."}

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
    prompt_to_llm = f"""Original HTML Content of `{html_filename}`:
```html
{original_html_content}
```

User's request for changes:
"{user_request}"

Please provide the necessary changes using the *SEARCH/REPLACE block* format as per system instructions.
"""

    if additional_context:
        prompt_to_llm += f"\n\n**Additional Context to Consider for this edit:**\n{additional_context}"

    try:
        print(f"Calling LLM for web app edit. App: {app_name_safe}. Model: {model}.")
        llm_response = await ctx.sample(
            messages=prompt_to_llm,
            system_prompt=EDIT_WEB_APP_SYSTEM_PROMPT,
            model_preferences=[model]
        )
        if hasattr(llm_response, 'text'):
            ai_output = llm_response.text
        else:
            ai_output = str(llm_response)
        if not ai_output:
            print(f"LLM returned empty response for {app_name_safe}, assuming no changes needed.")
            serve_url = f"{DOMAIN}/user_data/{user_id_safe}/web_apps/{app_name_safe}.html"
            return {
                "status": "success",
                "message": f"Web app '{app_name}' was reviewed. No changes applied as per LLM output. Current version at {serve_url}",
                "url": serve_url
            }

    except Exception as e:
        return {"status": "error", "message": f"Error during LLM call for web app edit: {str(e)}"}

    # --- Parse and Apply SEARCH/REPLACE Blocks ---
    try:
        print(f"Parsing and applying SEARCH/REPLACE blocks for {app_name_safe}...")
        import tempfile
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_html_path = os.path.join(temp_dir, html_filename)
            with open(temp_html_path, 'w', encoding='utf-8') as f:
                f.write(original_html_content)
            results = apply_search_replace_blocks(
                ai_output=ai_output,
                base_dir=temp_dir,
                backup=False,
                dry_run=False,
                strategies=None
            )
            if results['successful'] == 0 and results['total_blocks'] > 0:
                return {"status": "error", "message": f"Failed to apply any of the {results['total_blocks']} SEARCH/REPLACE blocks. The search text may not match the original content exactly."}
            if results['failed'] > 0:
                failed_details = [detail for detail in results['details'] if detail['status'] == 'failed']
                error_messages = [detail['message'] for detail in failed_details]
                return {"status": "error", "message": f"Some SEARCH/REPLACE blocks failed to apply: {'; '.join(error_messages)}"}
            if results['successful'] > 0:
                with open(temp_html_path, 'r', encoding='utf-8') as f:
                    modified_html_content = f.read()
            else:
                modified_html_content = original_html_content
    except Exception as e:
        return {"status": "error", "message": f"Error applying SEARCH/REPLACE blocks: {str(e)}"}

    # --- Save Modified HTML ---
    try:
        backup_path = html_path + '.bak'
        with open(backup_path, 'w', encoding='utf-8') as f:
            await asyncio.to_thread(f.write, original_html_content)
        with open(html_path, 'w', encoding='utf-8') as f:
            await asyncio.to_thread(f.write, modified_html_content)
    except Exception as e:
        return {"status": "error", "message": f"Failed to save modified web app HTML: {str(e)}"}

    serve_url = f"{DOMAIN}/user_data/{user_id_safe}/web_apps/{app_name_safe}.html"
    if results['total_blocks'] > 0:
        success_message = f"Web app '{app_name}' edited successfully. Applied {results['successful']} SEARCH/REPLACE blocks. Access it at {serve_url}"
        if results['skipped'] > 0:
            success_message += f" (Note: {results['skipped']} blocks were skipped)"
    else:
        success_message = f"Web app '{app_name}' reviewed. No SEARCH/REPLACE blocks found in AI response. Current version at {serve_url}"
    return {
        "status": "success",
        "message": success_message,
        "url": serve_url,
        "backup_created": backup_path,
        "original_html": original_html_content,
        "modified_html": modified_html_content,
        "app_name": app_name
    }

@mcp.tool()
async def edit_pdf_document(
    user_number: Annotated[str, Field(
        description="The user's unique identifier, used to locate their data. Typically provided by the backend."
    )] = "+17145986105",
    doc_name: Annotated[Optional[str], Field(
        description="The name of the existing PDF document to edit. This document must have been previously created."
    )] = None,
    user_request: Annotated[Optional[str], Field(
        description="The user's exact request as they stated it, without any technical details or modifications. The powerful AI will handle all technical implementation."
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
    if not user_request:
        return {"status": "error", "message": "user_request must be provided to describe the changes."}

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
"{user_request}"

Please provide the necessary changes ONLY in the \"diff-fenced\" format as per system instructions.
Ensure the edited HTML remains suitable for PDF conversion.
"""

    if additional_context:
        prompt_to_llm += f"\n\n**Additional Context to Consider for this edit:**\n{additional_context}"

    history = [StandardizedMessage(role="user", content=prompt_to_llm)]
    llm_config = StandardizedLLMConfig(system_prompt=EDIT_PDF_SYSTEM_PROMPT)

    try:
        print(f"Calling LLM for PDF edit. Doc: {doc_name_safe}. Model: {model}.")
        llm_response = await adapter.generate_content(
            model_name=model, history=history, tools=None, config=llm_config
        )
        if llm_response.error:
            return {"status": "error", "message": f"LLM API error during PDF edit: {llm_response.error}"}

        diff_output = llm_response.text_content
        if not diff_output: # Check if LLM returned empty string, meaning no changes.
            print(f"LLM returned no diff for PDF source {html_filename}, assuming no changes needed.")
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
        print(f"Applying diffs to PDF source {html_filename}. Diff output:\n{diff_output[:500]}...")
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
        print(f"Web app directory not found for user {user_id_safe} at {app_dir}. Returning empty list.")
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
        print(f"Error listing web apps for user {user_id_safe}: {e}")
        return {"status": "error", "message": f"Failed to list web apps: {str(e)}"}

@mcp.tool(
    annotations={
        "outputSchema": {
            "type": "object",
            "properties": {
                "error": {
                    "type": ["string", "null"],
                    "description": "Error message from MCP call, or null/None if successful"
                },
                "result": {
                    "type": "string",
                    "description": "Stringified JSON containing the ai_sample tool response with format: {\"status\": \"success|error\", \"result\": <generated_content>, \"error\": <error_message|null>}. Parse this JSON to access the actual AI-generated content."
                }
            },
            "required": ["error", "result"],
            "description": "MCP response containing stringified ai_sample tool output. Parse result field as JSON to access the actual AI-generated content."
        }
    }
)
async def ai_sample(
    ctx: Context,
    messages: Annotated[str, Field(
        description="The prompt/messages to send to the AI for sampling. This should be a clear, specific prompt describing what you want the AI to generate."
    )],
    json_schema: Annotated[Optional[Dict[str, Any]], Field(
        description="Optional JSON schema to enforce structured output format. The AI will be forced to respond in this exact structure.",
        default=None
    )] = None,
    system_prompt: Annotated[Optional[str], Field(
        description="Optional system prompt to guide the AI's behavior and response style.",
        default=None
    )] = None,
    model: Annotated[MODELS_LITERAL, Field(
        description="The LLM model to use for sampling."
    )] = "gemini-2.5-flash-preview-05-20"
) -> dict:
    """
    Enables web applications to leverage AI for generating structured content using ctx.sample().
    This tool acts as a bridge between browser-side JavaScript and the server-side MCP sampling capabilities.
    
    The tool can generate arbitrary content in specific formats when provided with a JSON schema,
    making it perfect for creating dynamic, AI-generated content in web applications.
    
    Returns:
        dict: A dictionary containing:
        {
            "status": str,           # "success" or "error"  
            "result": Any,           # The generated content (structured if json_schema provided)
            "error": str             # Error message if status is "error"
        }
    """
    try:
        # Prepare model preferences with smuggled json_schema if provided
        if json_schema:
            # Serialize the JSON schema to a string for smuggling
            model_preferences = [model, json.dumps(json_schema)]
        else:
            model_preferences = [model]
        
        # Call ctx.sample with the provided parameters
        sample_result = await ctx.sample(
            messages=messages,
            system_prompt=system_prompt,
            model_preferences=model_preferences
        )
        
        # Extract the actual content from the sample result
        if hasattr(sample_result, 'text'):
            result_text = sample_result.text
        elif isinstance(sample_result, str):
            result_text = sample_result
        else:
            result_text = str(sample_result)
        
        # If json_schema was provided, try to parse the result as JSON
        if json_schema:
            # First check if the LLM adapter already parsed the response (Gemini native structured output)
            if hasattr(sample_result, 'parsed') and sample_result.parsed is not None:
                # Gemini's structured output provides parsed content directly
                return {
                    "status": "success",
                    "result": sample_result.parsed,
                    "error": None
                }
            
            # Fallback to text parsing if parsed content not available
            try:
                # First try to parse directly as JSON
                parsed_result = json.loads(result_text)
                return {
                    "status": "success",
                    "result": parsed_result,
                    "error": None
                }
            except json.JSONDecodeError:
                # If direct parsing fails, try to extract from markdown code fences
                import re
                json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', result_text, re.DOTALL)
                if json_match:
                    json_content = json_match.group(1).strip()
                    try:
                        parsed_result = json.loads(json_content)
                        return {
                            "status": "success",
                            "result": parsed_result,
                            "error": None
                        }
                    except json.JSONDecodeError as je:
                        return {
                            "status": "error",
                            "result": None,
                            "error": f"AI generated invalid JSON in markdown block: {str(je)}"
                        }
                else:
                    return {
                        "status": "error", 
                        "result": None,
                        "error": f"AI did not return valid JSON despite schema constraint. Response: {result_text[:200]}..."
                    }
        else:
            # Return as text if no schema was specified
            return {
                "status": "success",
                "result": result_text,
                "error": None
            }
            
    except Exception as e:
        print(f"Error in ai_sample tool: {str(e)}")
        return {
            "status": "error",
            "result": None, 
            "error": f"AI sampling failed: {str(e)}"
        }

# --- End of new edit tools ---

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