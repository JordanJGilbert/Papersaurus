import sys
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
from mcp.server.fastmcp import FastMCP
import uuid
from datetime import datetime, timezone
import os
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
from system_prompts import WEB_APP_PROMPT, PDF_HTML_SYSTEM_PROMPT, IIFENOUI_VARS_PROMPT
from utils.tools import write_data
import weasyprint
from google import genai
from google.genai import types
from PIL import Image
from io import BytesIO
import asyncio
import hashlib
from typing import List, Optional, Dict, Tuple, Any
from llm_adapters import (
    get_llm_adapter,
    StandardizedMessage,
    StandardizedLLMConfig,
    AttachmentPart
)
import concurrent.futures # Add this import
import shutil # Needed for copying files
import logging # Add this import
from email.mime.text import MIMEText # <<<< Ensure this import is present or add it
from googleapiclient.http import MediaIoBaseUpload # Add this import

# --- Configure basic logging for the server ---
# This will send log messages to stderr by default.
# If mcp_service.py's stdio_client is configured to log stderr from this subprocess,
# it might pick them up.
logging.basicConfig(stream=sys.stderr, level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__) # Create a logger for this module


# Create an MCP server with a clear name
mcp = FastMCP("Simple Demo Server")

# Load environment variables from your .env file at startup
# load_dotenv()

# --- Configure the default ThreadPoolExecutor for asyncio.to_thread ---
# This should be done before the event loop is effectively started by mcp.run().
try:
    # Attempt to get the current event loop to set its default executor.
    # This might not always be the loop FastMCP ends up using if it creates its own
    # later, but it's the standard way to try and set a default.
    loop = asyncio.get_event_loop_policy().get_event_loop()

    # Calculate a potentially larger number of threads for I/O-bound tasks.
    # Default is min(32, os.cpu_count() + 4).
    # For many I/O-bound tasks (like network requests), a higher number can be beneficial.
    # Let's set it to os.cpu_count() * 5, with a minimum of 10 and a maximum of 64.
    # You can experiment with this value.
    num_threads = max(10, min(os.cpu_count() * 5 if os.cpu_count() else 10, 64)) # Added check for os.cpu_count() returning None

    print(f"Attempting to configure default asyncio ThreadPoolExecutor with max_workers={num_threads}")
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=num_threads)
    loop.set_default_executor(executor)
    print(f"Successfully configured default ThreadPoolExecutor with max_workers={num_threads}")
except Exception as e:
    # This might happen if an event loop is already running in a way that prevents
    # setting the default executor, or if get_event_loop() fails.
    print(f"Warning: Could not set default ThreadPoolExecutor: {e}. Using asyncio's default.", file=sys.stderr)


# --- Helper: Sanitize for Path ---
def sanitize_for_path(name_part: str) -> str:
    """Sanitizes a string to be safe for use as part of a directory or file name."""
    if not isinstance(name_part, str):
        name_part = str(name_part)
    # Remove or replace potentially problematic characters
    name_part = name_part.replace('+', '') # Common in user_numbers
    # Hash group IDs for consistent, short, safe names
    if name_part.startswith('group_'):
        group_id_val = name_part[len('group_'):]
        hash_val = hashlib.md5(group_id_val.encode()).hexdigest()[:12] # Slightly longer hash
        name_part = f"group_{hash_val}"
    
    name_part = re.sub(r'[^\w.-]', '_', name_part) # Allow word chars, dots, hyphens; replace others with underscore
    name_part = re.sub(r'_+', '_', name_part) # Collapse multiple underscores
    name_part = name_part.strip('_.- ') # Strip leading/trailing problematic chars
    if not name_part: # Handle empty string after sanitization
        return f"sanitized_{uuid.uuid4().hex[:8]}"
    return name_part


# --- Helper: Process Attachments ---
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
                    content_type = ''
                processed_attachments.append({'url': item, 'content_type': content_type})
            # base64 string (simple heuristic: long string, valid base64)
            elif isinstance(item, str) and len(item) > 100:
                try:
                    file_bytes = base64.b64decode(item, validate=True)
                    kind = filetype.guess(file_bytes)
                    if kind:
                        content_type = kind.mime
                    else:
                        content_type = 'application/octet-stream'
                    processed_attachments.append({'base64': item, 'content_type': content_type})
                except Exception:
                    continue  # skip invalid base64
            else:
                continue  # skip non-url, non-base64 entries
    return processed_attachments


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


# Helper function to prepare attachments for StandardizedMessage
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

        elif 'base64' in att:
            try:
                data_bytes = base64.b64decode(att['base64'])
                if not mime_type or mime_type == 'application/octet-stream': # Re-guess if needed for base64
                    kind = filetype.guess(data_bytes)
                    if kind: mime_type = kind.mime
                    else: mime_type = 'application/octet-stream' # fallback
                # Try to create a pseudo-name for base64 attachments
                if not name:
                    name = f"base64_attachment_{mime_type.replace('/', '_')}"

            except Exception as e:
                print(f"Warning: Could not decode base64 attachment for LLM: {e}")
                continue
        
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
    user_number: str = "+17145986105", 
    app_name: str = None, 
    attachments: list = None, 
    client_injected_context: str = "No additional context provided",
    display_only_attachments: bool = True,
    model: str = "gemini-2.5-pro-preview-05-06"
) -> dict:
    """
    Create a custom web application based on the user's request. Generates and hosts the HTML.
    You should ALWAYS use this tool whenever a user requests a web app. This tool contains a powerful AI web app generator.
    Assume it can create a web app based on any user input; it is extremely flexible and has no limitations in terms of functionality,
    data storage, or interactivity that it can implement.

    Args:
        user_number (str): The user's unique identifier (used for directory structure). 
            This is always provided automatically by the backend; the model does not need to ask the user for it.
        app_name (str): The name of the web application. If the user does not explicitly pass a name, you should choose a name that is relevant to the user's request in the format like 'hello_world_app'. Be sure to keep it short and concise with underscores like the example.
        attachments (list): A list of URL strings to include in the web application. Each item must be a valid URL (e.g., 'https://example.com/image.png'). The content type will be inferred automatically.
        client_injected_context (str): This is conversation history between the user and the AI model, we manually inject this, you do not need to pass it.
        display_only_attachments (bool): If True, skip downloading/base64-encoding images and inject <img> tags for each image URL. This should be True unless user explicitly requests otherwise. This passes the attachment to the model so should be True unless user explicitly requests otherwise.
    Returns:
        dict: A dictionary containing the status, message, and web application URL.
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

    # --- Prepare LLM Call ---
    adapter = get_llm_adapter(model_name=model)
    
    prompt_text = f"Create a web app titled '{app_name}'. \n\n**User Request and Full Context:**\n{client_injected_context}"
    
    current_attachment_parts: List[AttachmentPart] = []
    if not display_only_attachments and processed_attachments:
        current_attachment_parts = await asyncio.to_thread(prepare_standardized_attachments, processed_attachments)
        if current_attachment_parts:
            prompt_text += "\n\nThe following files are attached for your reference (if applicable to the request):"
            for idx, att_part in enumerate(current_attachment_parts):
                name = att_part.name or f"attachment_{idx+1}"
                prompt_text += f"\n- {name} ({att_part.mime_type})"

    history = [
        StandardizedMessage(
            role="user",
            content=prompt_text,
            attachments=current_attachment_parts
        )
    ]
    llm_config = StandardizedLLMConfig(
        system_prompt=WEB_APP_PROMPT,
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

# Define the path to the Gmail service account JSON file
GMAIL_SERVICE_ACCOUNT_FILE = os.path.join(os.path.dirname(__file__), '../../utils/google_service_account.json')
DELEGATED_ACCOUNT = 'f@ast.engineer'  # <-- CHANGE THIS to a real user in your domain
SCOPES = ['https://www.googleapis.com/auth/gmail.send']

@mcp.tool()
async def send_google_service_email(
    to_email: str,
    subject: str,
    body_text: str,
) -> dict:
    """
    Sends an email using a Google Service Account via the Gmail API, impersonating a real user.
    The email will be sent FROM the delegated user's email address.

    Args:
        to_email (str): The recipient's email address.
        subject (str): The subject of the email.
        body_text (str): The plain text body of the email.
    Returns:
        dict: {"status": "success", "message": "Email sent successfully."} or {"status": "error", "message": "Error details"}
    """
    try:
        # Use domain-wide delegation to impersonate a real user
        creds = await asyncio.to_thread(
            service_account.Credentials.from_service_account_file,
            GMAIL_SERVICE_ACCOUNT_FILE,
            scopes=SCOPES,
            subject=DELEGATED_ACCOUNT
        )
        gmail_service = build('gmail', 'v1', credentials=creds)

        from email.mime.text import MIMEText
        import base64

        message = MIMEText(body_text)
        message['to'] = to_email
        message['from'] = DELEGATED_ACCOUNT
        message['subject'] = subject

        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
        email_body_payload = {'raw': raw_message}

        await asyncio.to_thread(
            gmail_service.users().messages().send(userId='me', body=email_body_payload).execute
        )

        logger.info(f"Email successfully sent from {DELEGATED_ACCOUNT} to {to_email} via service account.")
        return {"status": "success", "message": f"Email sent successfully from {DELEGATED_ACCOUNT} to {to_email}."}

    except Exception as e:
        import traceback
        logger.error(f"Error sending email via Google Service Account: {str(e)}\n{traceback.format_exc()}")
        return {"status": "error", "message": f"Failed to send email: {str(e)}"}

@mcp.tool()
async def create_google_sheet(
    file_name: str,
    table: list = None,
    csv_string: str = None,
    style_instructions: str = None
) -> dict:
    """
    Create a Google Spreadsheet from a table or CSV string, and apply styles based on natural language instructions.
    Args:
        file_name (str): Name for the new spreadsheet.
        table (list): List of dicts representing rows (optional if csv_string is provided).
        csv_string (str): CSV content as a string (optional if table is provided).
        style_instructions (str): Natural language style instructions (e.g., 'set background of velociraptor row to green').
                                  Can be very flexible, e.g. 'make the header bold, center align all cells, and add a border around the table'
    Returns:
        dict: {"status": ..., "message": ..., "url": ...}
    """
    SCOPES_SHEETS = [ # Renamed to avoid conflict
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive' # Drive scope for permissions
    ]
    # Consistently use the main service account file
    SERVICE_ACCOUNT_FILE = os.path.join(os.path.dirname(__file__), '../../utils/google_service_account.json')

    # Convert table to CSV string if needed
    if table and not csv_string:
        if isinstance(table, list) and table and isinstance(table[0], dict):
            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=table[0].keys())
            writer.writeheader()
            writer.writerows(table)
            csv_string = output.getvalue()
        else:
            return {"status": "error", "message": "Table must be a list of dicts."}
    if not csv_string:
        return {"status": "error", "message": "No table or csv_string provided."}

    # Parse CSV string to values
    reader = csv.reader(io.StringIO(csv_string))
    values = list(reader)

    try:
        creds = await asyncio.to_thread(
            service_account.Credentials.from_service_account_file,
            SERVICE_ACCOUNT_FILE, scopes=SCOPES_SHEETS # Use specific scopes
        )
        sheets_service = build('sheets', 'v4', credentials=creds)
        drive_service = build('drive', 'v3', credentials=creds)

        # Create spreadsheet
        spreadsheet_body = {'properties': {'title': file_name}}
        result = await asyncio.to_thread(
            sheets_service.spreadsheets().create(body=spreadsheet_body, fields='spreadsheetId').execute
        )
        spreadsheet_id = result['spreadsheetId']

        # Write CSV content
        await asyncio.to_thread(
            sheets_service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range='Sheet1!A1',
                valueInputOption='RAW',
                body={'values': values}
            ).execute
        )

        # If there are style instructions, use Claude to generate appropriate batchUpdate requests
        if style_instructions:
            # Get spreadsheet metadata
            spreadsheet_info = await asyncio.to_thread(
                sheets_service.spreadsheets().get(
                    spreadsheetId=spreadsheet_id,
                    includeGridData=False
                ).execute
            )
            
            adapter = get_llm_adapter("gemini-2.5-pro-preview-05-06")
            
            # Create system prompt for Claude to generate Google Sheets API batchUpdate requests
            # This system prompt is specific to Claude's JSON generation.
            # Gemini might need a different prompt structure for reliable JSON array output.
            # For now, we'll use the existing one and see.
            system_prompt_for_sheets_api = """You are an expert in the Google Sheets API, especially the spreadsheets.batchUpdate endpoint.

# IMPORTANT MULTI-ARTIFACT INSTRUCTION
If the user requests multiple artifacts (such as a web app, PDF, and/or spreadsheet), ONLY generate the spreadsheet. Do NOT attempt to generate or include the content of the web app or PDF—other tools will handle those artifacts. However, if the user explicitly requests that the spreadsheet include links to a web app or PDF, you may include links (using the provided URLs).

Your job is to convert natural language spreadsheet styling and manipulation instructions into a valid JSON array of Google Sheets API batchUpdate requests.

**STRICT REQUIREMENTS:**

1. **Only Use Official API Fields and Enum Values:**  
   - Every request object must match the [official Google Sheets API batchUpdate documentation](https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/request).
   - For any enum fields (such as `condition.type` in conditional formatting), only use values listed in the official documentation.  
   - For example, valid values for `condition.type` in a `booleanRule` are:  
     `NUMBER_GREATER`, `NUMBER_GREATER_THAN_EQ`, `NUMBER_LESS`, `NUMBER_LESS_THAN_EQ`, `NUMBER_EQ`, `NUMBER_NOT_EQ`, `TEXT_CONTAINS`, `TEXT_NOT_CONTAINS`, `TEXT_STARTS_WITH`, `TEXT_ENDS_WITH`, `TEXT_EQ`, `TEXT_IS_EMAIL`, `TEXT_IS_URL`, `DATE_EQ`, `DATE_BEFORE`, `DATE_AFTER`, `DATE_ON_OR_BEFORE`, `DATE_ON_OR_AFTER`, `DATE_BETWEEN`, `DATE_NOT_BETWEEN`, `CUSTOM_FORMULA`, `BLANK`, `NOT_BLANK`.  
     **Do not use `"ONE_OF"` or any other value not in this list.**
   - Do **not** invent fields, enums, or structures.  
   - If you are unsure, leave it out.

2. **Supported Request Types:**  
   - You may use any of the request types documented in the [Google Sheets API batchUpdate reference](https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/request).
   - Do not invent new request types.

3. **Conditional Formatting:**  
   - For `addConditionalFormatRule`, the `rule` object must use only valid fields.
   - The `booleanRule` must use a valid `condition.type` (see above).
   - Do NOT use `"AND"` or `"OR"` as a type.  
   - Do NOT use a `"conditions"` array; use only the documented fields.
   - The `index` for rules must not exceed the number of existing rules.

4. **Ranges:**  
   - All ranges must use the `GridRange` object with valid fields: `sheetId`, `startRowIndex`, `endRowIndex`, `startColumnIndex`, `endColumnIndex`.
   - Indices are zero-based and `end*` indices are exclusive. Double-check all ranges for off-by-one errors.
   - The default sheet is usually `sheetId: 0` unless otherwise specified. Always use the correct `sheetId` for all range-based requests.

5. **Colors:**  
   - Colors must be specified as objects with `red`, `green`, `blue` (and optionally `alpha`), each as a float between 0.0 and 1.0.

6. **Fields Masks:**  
   - For requests like `repeatCell`, `updateSheetProperties`, etc., always specify the `fields` string to indicate which properties are being updated.

7. **Output Format - CRITICAL:**
   - Your response MUST be a valid JSON array, and it MUST be inside a triple backtick code block (```) with the `json` language identifier, like this:
   ```json
   [ ... ]
   ```
   - Do NOT include any explanation, comments, or text before or after the code block. The ONLY output should be the code block with the JSON array.
   - Do not include comments or explanations inside the JSON, even as fields or values.

8. **Example Format:**
   ```json
   [
     {
       "repeatCell": {
         "range": {
           "sheetId": 0,
           "startRowIndex": 0,
           "endRowIndex": 1
         },
         "cell": {
           "userEnteredFormat": {
             "textFormat": {
               "bold": true
             },
             "horizontalAlignment": "CENTER"
           }
         },
         "fields": "userEnteredFormat(textFormat,horizontalAlignment)"
       }
     }
   ]
   ```

9. **If you are unsure about a field, OMIT IT.**  
   - Do not guess or invent fields or enum values.
   - If a field is optional and not required for the user's request, omit it.

10. **If the user's request cannot be mapped to a valid batchUpdate request, return an empty array:**
    ```json
    []
    ```

11. **Error Handling:**
    - If you are unsure how to implement a part of the user's request, leave it out and return only what you are certain is valid.
    - If the user's request cannot be mapped to a valid batchUpdate request, return an empty array as above.

12. **Minimalism:**
    - If a field is optional and not required for the user's request, omit it.
    - Only include what is necessary to fulfill the user's instructions.

13. **Explicitly Forbid Explanations in JSON:**
    - Do not include comments or explanations inside the JSON, even as fields or values.

14. **Clarify Indexing:**
    - All row and column indices are zero-based and end indices are exclusive. Double-check all ranges for off-by-one errors.

---

**You must follow these rules exactly. If you break any, the request will fail.**

---

**User's Table Data (first 10 rows):**
```
{table_data_display}
```
Total rows: {row_count}
Total columns: {col_count} 

**User's Style Instructions:**  
{style_instructions}

---

**Convert these instructions into a valid Google Sheets API batchUpdate requests array, following all rules above.**"""

            # Prepare Claude message content
            table_data_display = '\n'.join([','.join(row) for row in values[:10]])
            if len(values) > 10:
                table_data_display += f"\n... and {len(values) - 10} more rows"
            
            prompt = f"""I need to style a Google Spreadsheet with this data:

Table Data (first 10 rows):
```
{table_data_display}
```

Total rows: {len(values)}
Total columns: {len(values[0]) if values else 0}

Style Instructions: {style_instructions}

Convert these natural language instructions into Google Sheets API batchUpdate requests.
Remember to check row and column contents when styling specific data rows or columns.
Return ONLY the array of request objects in valid JSON format."""

            llm_config = StandardizedLLMConfig(
                system_prompt=system_prompt_for_sheets_api,
            )
            
            styling_error = None
            try:
                llm_response = await adapter.generate_content(
                    model_name="gemini-2.5-pro-preview-05-06",
                    history=[{"role": "user", "content": prompt}],
                    tools=None,
                    config=llm_config
                )

                if llm_response.error:
                    styling_error = f"LLM API error during styling: {llm_response.error}"
                    print(f"Error generating styles: {styling_error}", file=sys.stderr)
                    response_text = "" # No text to parse
                else:
                    response_text = llm_response.text_content or ""
                
                # Extract JSON from LLM's response
                extracted_requests = []
                if response_text:
                    try:
                        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', response_text)
                        if json_match:
                            extracted_requests = json.loads(json_match.group(1))
                        else:
                            # If no code block found, try parsing the response directly
                            # This might be risky if LLM adds explanations outside a code block
                            extracted_requests = json.loads(response_text)
                    except json.JSONDecodeError as json_err:
                        print(f"Error parsing JSON from LLM for sheets: {str(json_err)}", file=sys.stderr)
                        styling_error = f"Could not parse styling instructions from LLM: {str(json_err)}"
                
                # Apply the styling to the spreadsheet
                if extracted_requests:
                    await asyncio.to_thread(
                        sheets_service.spreadsheets().batchUpdate(
                            spreadsheetId=spreadsheet_id,
                            body={"requests": extracted_requests}
                        ).execute
                    )
                elif not styling_error and style_instructions: # If no requests but also no error yet, and we expected styles
                    styling_error = "LLM did not return valid styling instructions."
                    print(styling_error, file=sys.stderr)

            except Exception as e:
                styling_error = f"Error applying styles: {str(e)}"
                print(styling_error, file=sys.stderr)

        # Make spreadsheet public with write access
        await asyncio.to_thread(
            drive_service.permissions().create(
                fileId=spreadsheet_id,
                body={'type': 'anyone', 'role': 'writer'},
                fields='id',
                sendNotificationEmail=False
            ).execute
        )

        url = f'https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit'
        
        # Return result with styling status
        msg = f"Spreadsheet '{file_name}' created successfully."
        if style_instructions and 'styling_error' in locals():
            msg += f" Note: Some styling could not be applied due to an error: {styling_error}"
            
        return {
            "status": "success", 
            "message": msg,
            "url": url
        }

    except Exception as e:
        return {"status": "error", "message": str(e)}
    
@mcp.tool()
async def create_pdf_document(
    user_number: str = "+17145986105",
    doc_name: str = None,
    attachments: list = None,
    client_injected_context: str = "No additional context provided",
    display_only_attachments: bool = True,
    model: str = "gemini-2.5-flash-preview-04-17"
) -> dict:
    """
    Create a custom PDF document based on the user's request. Generates and hosts the PDF.
    You should ALWAYS use this tool whenever a user requests a PDF document. This tool contains a powerful AI PDF generator.
    Assume it can create a PDF based on any user input; it is extremely flexible and has no limitations in terms of content,
    formatting, or length it can produce. For example, it can be used to create long PDF documents or research reports,
    such as a 100-page PhD level book on AI.

    Args:
        user_number (str): The user's unique identifier (used for directory structure).
        doc_name (str): The name of the PDF document. If not provided, generate a short name.
        attachments (list): A list of URL strings or base64-encoded images to include in the document.
                                To use images previously generated by 'generate_images_with_prompts',
                                you can set this argument to the string:
                                "__TOOL_OUTPUT_REFERENCE__:generate_images_with_prompts"
                                (to use the most recent set of images) or
                                "__TOOL_OUTPUT_REFERENCE__:generate_images_with_prompts#TOOL_CALL_ID"
                                (to use images from a specific 'generate_images_with_prompts' call).
                                Otherwise, provide a direct list of URLs or base64 strings.
        client_injected_context (str): Conversation history/context.
        display_only_attachments (bool): If True, skip downloading/base64-encoding images and inject <img> tags for each image URL. This should be True unless user explicitly requests otherwise. This passes the attachment to the model so should be True unless user explicitly requests otherwise.
        model (str): The LLM model to use for HTML generation. Default: ""gemini-2.5-flash-preview-04-17"".
    Returns:
        dict: A dictionary containing the status, message, and PDF document URL.
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
                attachment_urls.append(url)

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
- Always set the image size using the `width` attribute in the `<img>` tag (e.g., `<img src="..." width="450">` or `<img src="..." width="600">`).
- Do NOT use CSS for image sizing—use the `width` attribute only.
- For best PDF rendering, ensure images are displayed as block elements and consider appropriate margins (e.g., `<img src="..." width="600" style="display: block; margin: 1em auto;">`). You can include such basic inline styles for images if it aids PDF layout.

# Output Format

- Output a complete HTML document, suitable for PDF conversion.
- Do NOT include any explanations or comments outside the code block.
- The only output should be a single code block with the HTML.

# Attachments to include

{json.dumps(attachment_urls, indent=2)}

# User Request and Context

{client_injected_context}

VERY IMPORTANT FORMATTING INSTRUCTIONS:
You must present your HTML output exactly as follows:
1. Output \"document.html\" on a line by itself (no quotes or other characters)
2. On the next line, output three backticks (```) to start a code fence
3. Output the complete HTML document, including DOCTYPE, html, head, and body tags
4. End with three backticks (```) on a line by itself
5. NEVER skip, omit or abbreviate any part of the HTML content
6. Do not include placeholder comments like \"<!-- Content will be generated here -->\"
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
    try:
        adapter = get_llm_adapter(model_name=model)
        
        history = [
            StandardizedMessage(
                role="user",
                content="Please generate a PDF-ready HTML document as described in the system prompt."
            )
        ]
        
        llm_config = StandardizedLLMConfig(
            system_prompt=PDF_SYSTEM_PROMPT,
        )

        # --- DEBUG: Log the LLM call parameters ---
        logger.debug("DEBUG: Calling LLM with the following parameters:")
        logger.debug(f"  model_name: {model}")
        logger.debug(f"  system_prompt (truncated): {PDF_SYSTEM_PROMPT[:500]}...")  # Truncate for readability
        logger.debug(f"  history: {history}")
        logger.debug(f"  tools: None")
        logger.debug(f"  config: {llm_config}")

        llm_response = await adapter.generate_content(
            model_name=model,
            history=history,
            tools=None,
            config=llm_config
        )

        # --- DEBUG: Log the raw LLM response object ---
        logger.debug("DEBUG: LLM response object:", llm_response)

        if llm_response.error:
            logger.debug("DEBUG: LLM API error encountered:", llm_response.error)
            return {"status": "error", "message": f"LLM API error: {llm_response.error}"}
        
        response_text = llm_response.text_content
        if not response_text:
            logger.debug("DEBUG: LLM returned no content for PDF generation.")
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
        return {"status": "error", "message": "Gemini did not return HTML code in the expected format."}

    # --- Save HTML and Convert to PDF with Playwright ---
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    user_specific_data_dir = os.path.join(base_dir, "users", user_id_safe)
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
        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()
            # Load HTML from file
            with open(html_path, 'r', encoding='utf-8') as f:
                html_for_pdf = f.read()
            await page.set_content(html_for_pdf, wait_until="load")
            await page.pdf(path=pdf_path, format="A4")
            await browser.close()
    except Exception as e:
        return {"status": "error", "message": f"Failed to save or convert PDF: {str(e)}"}

    serve_url = f"{DOMAIN}/user_data/users/{user_id_safe}/pdfs/{doc_name_safe}.pdf"

    return {
        "status": "success",
        "message": f"PDF document '{doc_name}' created successfully. Access it at {serve_url}",
        "url": serve_url
    }

IMAGE_OUTPUT_DIR = os.path.join(os.getcwd(), 'generated_images')
os.makedirs(IMAGE_OUTPUT_DIR, exist_ok=True)

@mcp.tool()
async def generate_images_with_prompts(
    user_number: str = "+17145986105",
    prompts: list = None
) -> dict:
    """
    Generate one image for each prompt using Google's Imagen 3 model (`imagen-3.0-generate-002`).
    This tool is best when image quality, photorealism, artistic detail, or specific styles are top priorities.
    All generated images include a SynthID watermark.

    Args:
        user_number (str): The user's unique identifier (used for directory structure).
        prompts (list): List of text prompts. Each prompt will generate one image.

    Returns:
        dict: {"status": "success", "results": [ [url], ... ]} or {"status": "error", "message": ...}

    **Prompting Guidelines for Imagen 3:**
    - **Max Prompt Length:** 480 tokens.
    - **Core Structure:** Start with `subject`, `context/background`, and `style`.
        - *Example Basic:* "A vintage bicycle (subject) leaning against a brick wall (context) in a sunny alley (background), impressionist painting (style)."
    - **Refine with Details:** Add descriptive adjectives, adverbs, and specifics. The more detail, the better.
        - *Example Refined:* "A highly detailed, photorealistic close-up photo of a classic red Vespa scooter parked on a cobblestone street in Rome. The background shows a quaint cafe with outdoor seating, slightly blurred (bokeh). The lighting is warm, late afternoon sun, casting soft shadows."
    - **Photography Modifiers:**
        - Start with: "A photo of..."
        - Camera: "close-up photo," "aerial shot," "taken from a low angle."
        - Lighting: "studio lighting," "dramatic lighting," "golden hour," "moonlit."
        - Lens/Effects: "35mm lens photo," "macro photo," "soft focus," "motion blur."
        - Film Type: "black and white photograph," "polaroid style."
        - *Example:* "A photo of a steaming cup of coffee on a rustic wooden table, captured with a macro lens, soft morning light filtering through a window."
    - **Artistic Styles:**
        - "A pencil sketch of...", "A watercolor painting of...", "A digital art illustration of...", "In the style of [famous artist/movement, e.g., Van Gogh, Art Deco]."
        - *Example:* "An Art Nouveau poster design featuring a woman with flowing hair, surrounded by floral patterns, with the text 'Spring Bloom' elegantly integrated."
    - **Shapes and Materials:**
        - "A sculpture made of recycled metal," "a futuristic building in the shape of a crystal."
    - **Image Quality Modifiers:**
        - "high-quality," "beautiful," "stylized," "4K," "HDR," "studio photo," "professionally shot," "intricately detailed."
    - **Text in Images (Experimental):**
        - Keep text short (under 25 chars). Limit to 1-3 phrases. Guide placement (e.g., "text at the top"). Specify general font style ("bold," "script").
        - *Example:* "A logo for a coffee shop named 'The Daily Grind', featuring a coffee bean icon. Text 'The Daily Grind' in a clean, modern font."
    - **Iteration is Key:** If the first result isn't perfect, refine your prompt and try again.

    **Current Tool Limitations (vs. full Imagen 3 API):**
    - Generates 1 image per prompt.
    - Aspect ratio defaults to 1:1 (square); cannot be changed via this tool.
    - `personGeneration` defaults to allowing adults; cannot be changed via this tool.
    """
    # Use default user number if empty
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"
    
    return await _generate_images_with_prompts_concurrent(user_number, prompts)

async def _generate_images_with_prompts_concurrent(user_number, prompts):
    import re
    import hashlib
    
    # Use default user number if empty
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"
    
    def sanitize(s):
        s = str(s).replace('+', '')
        # Always hash group IDs for shortness
        if s.startswith('group_'):
            group_id = s[len('group_'):]
            hash_val = hashlib.md5(group_id.encode()).hexdigest()[:8]
            s = f"group_{hash_val}"
        s = re.sub(r'[^a-zA-Z0-9]', '_', s)
        s = re.sub(r'_+', '_', s)
        return s.strip('_')

    user_number_safe = sanitize(user_number)
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    image_dir = os.path.join(base_dir, user_number_safe, "images")
    os.makedirs(image_dir, exist_ok=True)

    # --- API Key Management ---
    primary_api_key = os.environ.get("GEMINI_API_KEY")
    backup_api_key = os.environ.get("GEMINI_API_KEY_2")
    backup_api_key_3 = os.environ.get("GEMINI_API_KEY_3")
    backup_api_key_4 = os.environ.get("GEMINI_API_KEY_4")
    backup_api_key_5 = os.environ.get("GEMINI_API_KEY_5")
    backup_api_key_6 = os.environ.get("GEMINI_API_KEY_6")

    api_keys = [key for key in [primary_api_key, backup_api_key, backup_api_key_3, backup_api_key_4, backup_api_key_5, backup_api_key_6] if key]

    if not api_keys:
        print("Error: No Gemini API keys found in environment variables (GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3, GEMINI_API_KEY_4, GEMINI_API_KEY_5, GEMINI_API_KEY_6).", file=sys.stderr)
        return {"status": "error", "message": "No Gemini API keys configured."}

    # --- Instantiate multiple clients ---
    clients = [genai.Client(api_key=key) for key in api_keys]
    num_clients = len(clients)
    print(f"Initialized image generation with {num_clients} clients.")


    # --- Helper Functions ---
    async def process_image_response(response, prompt, prompt_idx):
        """Processes images from a prompt response concurrently."""
        os.makedirs(image_dir, exist_ok=True)

        async def _save_and_process_single_image(generated_image, index):
            """Handles saving the PNG image and returning its URL."""
            try:
                image = Image.open(BytesIO(generated_image.image.image_bytes))
                # Filename now uses only a prefix and a portion of UUID.
                # Using 8 hex characters from UUID for good collision resistance.
                filename = f"img_{uuid.uuid4().hex[:8]}.png"
                local_path = os.path.join(image_dir, filename)

                # Save the original PNG image to disk non-blockingly
                await asyncio.to_thread(image.save, local_path)

                # Construct the URL using the original PNG filename saved to disk
                image_url = f"{DOMAIN}/user_data/{user_number_safe}/images/{filename}"
                return image_url
            except Exception as e:
                print(f"Error processing image {index} for prompt {prompt_idx} ('{prompt[:30]}...'): {e}", file=sys.stderr)
                return None # Return None on error for this specific image

        # Create and run tasks concurrently for all images from this single prompt response
        save_tasks = [
            _save_and_process_single_image(img, i)
            for i, img in enumerate(response.generated_images)
        ]
        
        image_url_results = await asyncio.gather(*save_tasks)

        # Filter out None results (errors during saving/processing)
        successful_urls = [url for url in image_url_results if url is not None]
        
        # Return only the successfully processed URLs
        return successful_urls

    async def generate_for_prompt(prompt, idx, client):
        n = 1  # Always generate one image per prompt
        client_index = clients.index(client) # For logging purposes

        try:
            logger.debug(f"Attempting prompt '{prompt}' (idx: {idx}) with client index {client_index}.")
            response = await asyncio.to_thread(
                client.models.generate_images,
                model='imagen-3.0-generate-002',
                prompt=prompt,
                config=types.GenerateImagesConfig(number_of_images=n)
            )
            urls = await process_image_response(response, prompt, idx)
            
            if not urls and response.generated_images:
                 logger.warning(f"Warning: API generated images for prompt '{prompt}' (idx: {idx}) with client {client_index}, but processing/saving failed for all of them.")
                 return {"error": f"Image generation API succeeded for prompt '{prompt}' with client {client_index}, but processing/saving failed for all images."}
            
            logger.info(f"Success for prompt '{prompt}' (idx: {idx}) with client index {client_index}. Generated {len(urls)} URLs.")
            return urls

        except Exception as e:
            error_str = str(e)
            logger.error(f"Error on prompt '{prompt}' (idx: {idx}) with client index {client_index}: {error_str}", file=sys.stderr)
            # Check if it's a rate limit/quota error for logging purposes, but don't retry
            is_rate_limit = False
            try:
                from google.api_core import exceptions as google_exceptions
                if isinstance(e, google_exceptions.ResourceExhausted): is_rate_limit = True
                elif isinstance(e, google_exceptions.GoogleAPIError) and e.code == 429: is_rate_limit = True
            except ImportError: pass
            if not is_rate_limit and hasattr(e, 'code') and e.code == 429: is_rate_limit = True
            elif not is_rate_limit and ("rate limit" in error_str.lower() or "quota" in error_str.lower() or "429" in error_str): is_rate_limit = True

            if is_rate_limit:
                 error_message = f"Rate limit hit on client index {client_index} for prompt '{prompt}'."
            else:
                 error_message = f"Image generation failed on client index {client_index} for prompt '{prompt}': {error_str}"

            logger.debug(f"DEBUG: Failing prompt '{prompt}' due to error: {error_message}", file=sys.stderr)
            return {"error": error_message}


    # --- Run Concurrent Tasks ---
    tasks = [generate_for_prompt(prompt, idx, clients[idx % num_clients]) for idx, prompt in enumerate(prompts)]
    results = await asyncio.gather(*tasks, return_exceptions=False) # Errors handled within generate_for_prompt

    # --- Process Results ---
    final_results = []
    any_errors = False
    error_message = "Multiple errors occurred during image generation."

    for i, r in enumerate(results):
        if isinstance(r, dict) and "error" in r:
            any_errors = True
            # Use the specific error message from the result
            error_message = r["error"]
            logger.error(f"Error reported for prompt index {i}: {r['error']}")
            final_results.append({"error": r["error"]}) # Keep error info per prompt
        elif isinstance(r, list):
             final_results.append(r)
        else:
            any_errors = True
            error_message = f"Unexpected result type for prompt index {i}: {type(r)}"
            logger.error(error_message)
            final_results.append({"error": "Unexpected result type."})


    if any_errors:
         # Return partial success with errors marked per prompt
         return {"status": "partial_error", "message": "Some images failed to generate. Check results for details.", "results": final_results}


    # If no errors found in results
    return {"status": "success", "results": final_results}

@mcp.tool()
async def analyze_images(urls: list, analysis_prompt: str = "Describe this image in detail.") -> dict:
    """
    Analyzes a list of images by downloading each from its URL and using Gemini to interpret its contents.
    Args:
        urls (list): List of image URLs to analyze.
        analysis_prompt (str): Instructions for how Gemini should analyze the images.
    Returns:
        dict: {"status": "success", "results": [ ... ]} or {"status": "error", "message": ...}
    """
    from llm_adapters import get_llm_adapter, StandardizedMessage, StandardizedLLMConfig, AttachmentPart

    async def analyze_single_image(url):
        try:
            response = await asyncio.to_thread(requests.get, url, timeout=10)
            response.raise_for_status()
            content_type = response.headers.get('Content-Type', '')
            if not content_type.startswith('image/'):
                return {"status": "error", "message": f"URL does not point to an image (content type: {content_type})", "url": url}
            image_bytes_io = BytesIO(response.content)
            image = await asyncio.to_thread(Image.open, image_bytes_io)
            img_bytes_for_gemini = BytesIO()
            img_format = image.format if image.format and image.format.upper() in Image.SAVE.keys() else "PNG"
            await asyncio.to_thread(image.save, img_bytes_for_gemini, format=img_format)
            img_bytes_for_gemini.seek(0)

            # Use the adapter for Gemini LLM call
            adapter = get_llm_adapter("gemini-2.5-flash-preview-04-17")  # Will be forced to Flash in the adapter
            attachment = AttachmentPart(mime_type=content_type, data=img_bytes_for_gemini.getvalue(), name=url)
            history = [
                StandardizedMessage(
                    role="user",
                    content=analysis_prompt,
                    attachments=[attachment]
                )
            ]
            llm_config = StandardizedLLMConfig()
            llm_response = await adapter.generate_content(
                history=history,
                tools=None,
                config=llm_config
            )
            analysis = llm_response.text_content
            if llm_response.error:
                return {"status": "error", "message": f"LLM error: {llm_response.error}", "url": url}
            return {"status": "success", "analysis": analysis, "url": url}
        except requests.exceptions.RequestException as e:
            return {"status": "error", "message": f"Error downloading image: {str(e)}", "url": url}
        except Exception as e:
            return {"status": "error", "message": f"Error analyzing image: {str(e)}", "url": url}

    if not isinstance(urls, list):
        return {"status": "error", "message": "urls must be a list of image URLs."}
    tasks = [analyze_single_image(url) for url in urls]
    results = await asyncio.gather(*tasks)
    return {"status": "success", "results": results}

# Backward compatibility: single image analysis
@mcp.tool()
async def analyze_image(url: str, analysis_prompt: str = "Describe this image in detail.") -> dict:
    """
    Analyzes a single image by delegating to analyze_images.
    """
    result = await analyze_images([url], analysis_prompt)
    # Return the first result for compatibility
    if result["status"] == "success" and result["results"]:
        return result["results"][0]
    return result

@mcp.tool()
async def fetch_url_content(url: str) -> dict:
    """
    Fetches the text content of a given URL.
    Args:
        url (str): The URL to fetch content from.
    Returns:
        dict: {"status": "success", "content": "..."} or {"status": "error", "message": "..."}
    """
    try:
        # Send a GET request to the URL with a timeout
        response = await asyncio.to_thread(requests.get, url, timeout=10, headers={'User-Agent': 'MCP-Client/1.0'})
        response.raise_for_status()  # Raise an exception for HTTP errors (4xx or 5xx)
        
        # We'll primarily be interested in text content for summarization
        # Check if content type is text-based, otherwise it might be an image or binary file
        content_type = response.headers.get('Content-Type', '').lower()
        if 'text' not in content_type and 'html' not in content_type and 'xml' not in content_type and 'json' not in content_type:
            return {"status": "error", "message": f"URL content type ({content_type}) does not appear to be text-based."}
            
        # Return the text content
        return {"status": "success", "content": response.text}
        
    except requests.exceptions.Timeout:
        return {"status": "error", "message": f"Request to {url} timed out."}
    except requests.exceptions.HTTPError as e:
        return {"status": "error", "message": f"HTTP error fetching {url}: {str(e)}"}
    except requests.exceptions.RequestException as e:
        return {"status": "error", "message": f"Error fetching {url}: {str(e)}"}
    except Exception as e:
        return {"status": "error", "message": f"An unexpected error occurred: {str(e)}"}

@mcp.tool()
async def edit_image_with_gemini(
    image: str,
    edit_prompt: str,
    user_number: str = "+17145986105"
) -> dict:
    """
    Edits an image using `gemini-2.0-flash-preview-image-generation` based on a text prompt.
    This model is good for conversational image editing, leveraging context, and blending text with images.
    All generated images include a SynthID watermark.

    Args:
        image (str): URL or base64-encoded image to be edited.
                     **IMPORTANT**: If the user provided an image directly with their request (e.g., as an attachment in a chat),
                     its URL might be mentioned in the prompt context (e.g., "[Context: The following files were attached... Attachment 0 (Name: user_img.jpg, URL: https://...)]").
                     If so, you SHOULD use that specific URL for this 'image' argument when the edit request pertains to that user-provided image.
        edit_prompt (str): Text describing the desired edit.
        user_number (str): User identifier for saving the result.

    Returns:
        dict: {"status": ..., "message": ..., "url": ...}

    **Prompting Guidelines for Gemini Image Editing:**
    - **Conversational Edits:** You can make sequential requests.
        - *Example (after providing an image of a cat):*
            - Prompt 1: "Add a small party hat to the cat."
            - Prompt 2 (after seeing the result): "Okay, now change the hat color to blue and add some confetti in the background."
    - **Be Specific and Clear:** Describe the change you want precisely.
        - *Instead of:* "Make it better."
        - *Try:* "Change the background to a sunny beach scene." or "Make the cat look happier by giving it a slight smile."
    - **Explicitly Request Image Updates:** If Gemini responds with only text, you can ask it to show the image.
        - *Example:* "Generate an image showing that change." or "Update the image with that edit."
    - **Combining Text and Image Edits:**
        - *Example:* "Add a speech bubble above the dog saying 'Woof!' and make the dog's eyes sparkle."
    - **Context is Maintained:** The model remembers previous edits in a conversation.
    - **Best Languages:** Performs best with English, Spanish (Mexico), Japanese, Chinese (Simplified), and Hindi.
    - **Retry if Needed:** If the first edit isn't perfect or if the model doesn't generate an image, try rephrasing your prompt or asking again.

    **Example Workflow:**
    1. Call tool with `image="URL_to_cat_photo.jpg"`, `edit_prompt="Add a red collar to this cat."`
    2. If satisfied, stop. If not, call again with the *newly generated image URL* (from step 1's output) and a new `edit_prompt`:
       `image="URL_to_cat_with_collar.jpg"`, `edit_prompt="Now, make the cat wear a tiny crown."`
    """
    import tempfile
    from google import genai
    from google.genai import types
    from PIL import Image
    from io import BytesIO
    import base64
    import requests
    import os
    import hashlib
    import re

    # --- Download or decode the image ---
    try:
        if image.startswith("http://") or image.startswith("https://"):
            resp = requests.get(image, timeout=10)
            resp.raise_for_status()
            img_bytes = resp.content
        else:
            img_bytes = base64.b64decode(image)
        img = Image.open(BytesIO(img_bytes))
    except Exception as e:
        return {"status": "error", "message": f"Could not load image: {e}"}

    # --- Prepare Gemini client ---
    client = genai.Client()
    # Gemini expects a PIL Image object as input

    # --- Call Gemini for image editing ---
    try:
        response = await asyncio.to_thread(
            client.models.generate_content,
            model="gemini-2.0-flash-preview-image-generation",
            contents=[edit_prompt, img],
            config=types.GenerateContentConfig(
                response_modalities=['TEXT', 'IMAGE']
            )
        )
    except Exception as e:
        return {"status": "error", "message": f"Gemini API error: {e}"}

    # --- Extract the edited image from the response ---
    edited_image = None
    for part in response.candidates[0].content.parts:
        if part.inline_data is not None:
            edited_image = Image.open(BytesIO(part.inline_data.data))
            break
    if edited_image is None:
        return {"status": "error", "message": "No image returned by Gemini."}

    # --- Save the edited image ---
    def sanitize(s):
        s = str(s).replace('+', '')
        # Always hash group IDs for shortness
        if s.startswith('group_'):
            group_id = s[len('group_'):]
            hash_val = hashlib.md5(group_id.encode()).hexdigest()[:8]
            s = f"group_{hash_val}"
        s = re.sub(r'[^a-zA-Z0-9]', '_', s)
        s = re.sub(r'_+', '_', s)
        return s.strip('_')

    user_number_safe = sanitize(user_number)
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    image_dir = os.path.join(base_dir, user_number_safe, "edited_images")
    os.makedirs(image_dir, exist_ok=True)
    filename = f"gemini_edit_{uuid.uuid4().hex[:8]}.png"
    file_path = os.path.join(image_dir, filename)
    await asyncio.to_thread(edited_image.save, file_path)

    url = f"{DOMAIN}/user_data/{user_number_safe}/edited_images/{filename}"
    return {
        "status": "success",
        "message": "Image edited successfully.",
        "url": url
    }

# --- MCP Service Admin Tools ---
# These tools assume mcp_service.py is running on localhost:5001 by default.
# You might want to make the base URL configurable if it can change.
MCP_SERVICE_BASE_URL = os.getenv("MCP_SERVICE_ADMIN_URL", "http://localhost:5001")

# --- Dynamic MCP Server Generation ---
# Base directory for all user-generated MCP server data
USER_GENERATED_DATA_BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data/users'))
os.makedirs(USER_GENERATED_DATA_BASE_DIR, exist_ok=True)


CODE_GEN_SYSTEM_PROMPT_TEMPLATE = """You are an expert Python programmer specializing in creating MCP (Multi-Capability Platform) servers.
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
9.  The generated script MUST include the boilerplate `if __name__ == "__main__": mcp.run()` to make it executable.
10. The generated code should be self-contained in a single Python file.
11. Ensure the generated tools are practical, directly address the user's request, and make sense.
12. Avoid writing overly complex or unsafe code. Prioritize clarity, correctness, and security. Do not include functions that execute arbitrary shell commands or filesystem operations unless that is the explicit and safe core purpose requested.
13. If the user's request is ambiguous, try to create a sensible, simple version.

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

CODE_UPDATE_SYSTEM_PROMPT_TEMPLATE = """You are an expert Python programmer specializing in modifying MCP (Multi-Capability Platform) servers.
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

def get_user_server_script_path(user_id_safe: str, script_filename_safe: str) -> Tuple[str, str]:
    """
    Constructs the absolute path for a user's server script and its path relative to project root.
    Args:
        user_id_safe (str): The sanitized user identifier.
        script_filename_safe (str): The sanitized script filename (e.g., 'my_server.py').
    Returns:
        Tuple[str, str]: (absolute_script_path, script_path_relative_to_project_root)
    """
    user_specific_servers_dir = os.path.join(USER_GENERATED_DATA_BASE_DIR, user_id_safe, "generated_mcp_servers")
    os.makedirs(user_specific_servers_dir, exist_ok=True)
    
    absolute_script_path = os.path.join(user_specific_servers_dir, script_filename_safe)
    
    # Path relative to the project root (where mcp_service.py is assumed to run from)
    # user_data/users/{user_id_safe}/generated_mcp_servers/{script_filename_safe}
    script_path_relative_to_project_root = os.path.join(
        "user_data", "users", user_id_safe, "generated_mcp_servers", script_filename_safe
    )
    return absolute_script_path, script_path_relative_to_project_root

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

    system_prompt = CODE_GEN_SYSTEM_PROMPT_TEMPLATE.format(server_instance_name=server_instance_name)

    adapter = get_llm_adapter(model_name=llm_model)
    history_content = (
        f"User ID: '{user_id_safe}'\n"
        f"User request for new MCP server (to be named '{server_instance_name}' internally):\n{user_request}"
        f"\nThe filename will be '{py_filename_safe}' in the user's directory."
    )
    history = [StandardizedMessage(role="user", content=history_content)]
    config = StandardizedLLMConfig(system_prompt=system_prompt)

    try:
        logger.info(f"Generating MCP server code for user: {user_id_safe}, instance: {server_instance_name}, filename: {py_filename_safe}")
        llm_response = await adapter.generate_content(
            model_name=llm_model,
            history=history,
            tools=None,
            config=config
        )

        if llm_response.error:
            return {"status": "error", "message": f"LLM API error during code generation: {llm_response.error}"}
        
        response_text = llm_response.text_content
        if not response_text:
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

        if not ("from mcp.server.fastmcp import FastMCP" in python_code and 
                "@mcp.tool()" in python_code and 
                "mcp.run()" in python_code):
            return {
                "status": "error", 
                "message": "Generated code does not appear to be a valid MCP server.",
                "generated_code_snippet": python_code[:500]
            }

        with open(script_absolute_path, 'w', encoding='utf-8') as f:
            f.write(python_code)
        logger.info(f"Generated MCP server code for user {user_id_safe} saved to: {script_absolute_path}")

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
        
        logger.info(f"Attempting to register new server for user {user_id_safe} via endpoint: {add_server_endpoint} with payload: {add_server_payload}")
        
        http_response = await asyncio.to_thread(
            requests.post, add_server_endpoint, json=add_server_payload, timeout=30
        )
        http_response.raise_for_status()
        admin_add_response = http_response.json()
        
        logger.info(f"Response from {add_server_endpoint} for user {user_id_safe}: {admin_add_response}")

        if admin_add_response.get("status") == "success":
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
        logger.error(error_detail, file=sys.stderr)
        return {"status": "error", "message": error_detail, "user_id": user_id_safe, "server_script_filename": py_filename_safe if 'py_filename_safe' in locals() else 'unknown'}
    except requests.exceptions.RequestException as e:
        error_detail = f"Network error trying to register server for user {user_id_safe}: {str(e)}"
        logger.error(error_detail, file=sys.stderr)
        return {"status": "error", "message": error_detail, "user_id": user_id_safe, "server_script_filename": py_filename_safe if 'py_filename_safe' in locals() else 'unknown'}
    except Exception as e:
        import traceback
        logger.error(f"Unexpected error in create_dynamic_mcp_server for user {user_id_safe}: {str(e)}\n{traceback.format_exc()}", file=sys.stderr)
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
        logger.info(f"Updating MCP server code for user: {user_id_safe}, script: {script_filename_safe}")
        llm_response = await adapter.generate_content(
            model_name=llm_model,
            history=history,
            tools=None,
            config=config
        )

        if llm_response.error:
            return {"status": "error", "message": f"LLM API error during code update: {llm_response.error}"}

        response_text = llm_response.text_content
        if not response_text:
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
        logger.info(f"Attempting to remove old config for user '{user_id_safe}', script '{script_filename_safe}' via: {remove_server_endpoint}")
        
        try:
            remove_http_response = await asyncio.to_thread(
                requests.post, remove_server_endpoint, json=remove_server_payload, timeout=20
            )
            if remove_http_response.status_code == 200:
                 logger.info(f"Removal response for old config of '{script_filename_safe}' (user {user_id_safe}): {remove_http_response.json()}")
                 print(f"Removal response for old config of '{script_filename_safe}' (user {user_id_safe}): {remove_http_response.json()}")
            elif remove_http_response.status_code == 404:
                 print(f"Old config for '{script_filename_safe}' (user {user_id_safe}) not found by admin service for removal. Proceeding.")
            else:
                 print(f"Warning: Problem removing old config for '{script_filename_safe}' (user {user_id_safe}), status: {remove_http_response.status_code}, response: {remove_http_response.text[:200]}.")
        except requests.exceptions.RequestException as e:
            print(f"Warning: Network error trying to remove old server config for '{script_filename_safe}' (user {user_id_safe}): {str(e)}.")


        # 2. Save (overwrite) the updated code
        with open(script_absolute_path, 'w', encoding='utf-8') as f:
            f.write(updated_python_code)
        print(f"Updated MCP server code for user {user_id_safe} saved to: {script_absolute_path}")

        # 3. Add the (updated) server configuration back for this user
        add_server_payload = {
            "user_id": user_id_safe, # Specify the user
             **server_config_to_manage
        }
        add_server_endpoint = f"{MCP_SERVICE_BASE_URL}/admin/users/add_server"
        print(f"Attempting to add updated config for user '{user_id_safe}', script '{script_filename_safe}' via: {add_server_endpoint}")
        
        add_http_response = await asyncio.to_thread(
            requests.post, add_server_endpoint, json=add_server_payload, timeout=30
        )
        add_http_response.raise_for_status() 
        admin_add_response = add_http_response.json()
        print(f"Response from /admin/users/add_server for updated script (user {user_id_safe}): {admin_add_response}")

        if admin_add_response.get("status") == "success":
            return {
                "status": "success",
                "message": f"Successfully updated and re-registered MCP server script '{script_filename_safe}' for user {user_id_safe}.",
                "user_id": user_id_safe,
                "server_script_filename": script_filename_safe,
                "registration_details": admin_add_response.get("message")
            }
        else:
            return {
                "status": "partial_error",
                "message": f"Server script '{script_filename_safe}' (user {user_id_safe}) was updated on disk, but failed to re-register: {admin_add_response.get('message', 'Unknown error')}",
                "user_id": user_id_safe,
                "server_script_filename": script_filename_safe,
                "registration_response": admin_add_response
            }

    except requests.exceptions.HTTPError as e:
        error_detail = f"HTTP error during update for user {user_id_safe}, script {script_filename_safe}: {e.response.status_code} - {e.response.text if e.response else 'No body'}"
        print(error_detail, file=sys.stderr)
        return {"status": "error", "message": error_detail, "user_id": user_id_safe, "server_script_filename": script_filename_safe}
    except requests.exceptions.RequestException as e:
        error_detail = f"Network error during server update for user {user_id_safe}, script {script_filename_safe}: {str(e)}"
        print(error_detail, file=sys.stderr)
        return {"status": "error", "message": error_detail, "user_id": user_id_safe, "server_script_filename": script_filename_safe}
    except Exception as e:
        import traceback
        print(f"Unexpected error in update_dynamic_mcp_server for user {user_id_safe}: {str(e)}\n{traceback.format_exc()}", file=sys.stderr)
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

@mcp.tool()
async def run_python_task(
    task_description: str,
    model: str = "gpt-4.1-2025-04-14", # Defaulting to GPT-4.1
    user_number: str = "+17145986105"
) -> dict:
    """
    Uses an LLM to generate a Python script from a task description,
    executes it, returns the output. This is a powerful tool that contains many powers in the system prompt. you should just pass teh user request directly into task_description and let the systme prompt handle the rest. You should always use this tool if user requests it.

    Args:
        task_description (str): The description of the Python task to generate and run.
        model (str): The LLM model to use for code generation. Defaults to GPT-4.1.
        user_number (str): The user's phone number, used for path generation if specified in prompt.
    Returns:
        dict: Contains the generated Python code, stdout, stderr, execution status, and any errors.
    """
    logger.debug(f"Running run_python_task with task_description: {task_description}")
    import tempfile
    import subprocess
    import os
    import shutil
    import re
    import sys # To get the current python executable
    # load_dotenv() # Remove this call inside the function

    # Get a copy of the current environment variables to pass to the subprocess
    env_vars = dict(os.environ)
    logger.debug(f"Environment variables will be passed to the subprocess: {list(env_vars.keys())}")
    
    # Define available libraries and API keys for the Python script generation prompt
    # Only include environment variables if they are set; do not use hardcoded defaults
    prompt_env_keys = [
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "GROQ_API_KEY",
        "DEEPSEEK_API_KEY",
        "GEMINI_API_KEY",
        "GEMINI_API_KEY_2",
        "GEMINI_API_KEY_3",
        "GEMINI_API_KEY_4",
        "GEMINI_API_KEY_5",
        "GEMINI_API_KEY_6",
        "SIGNAL_NUMBER", # Assuming this is the user's signal number for Digital Humani etc.
        "GOOGLE_API_KEY", # General Google API key
        "GOOGLE_MAPS_API_KEY",
        "BRAVE_API_KEY",
        "BRAVE_AUTOSUGGEST_API_KEY",
        "OPENROUTER_API_KEY",
        "RADAR_PUBLISHABLE_KEY",
        "RADAR_TEST_PUBLISHABLE_KEY",
        "NPS_API_KEY",
        "PEXELS_API_KEY",
        "STRIPE_PUBLISHABLE_KEY",
        "OPENWEATHERMAP_API_KEY", # Primary OpenWeatherMap key
        "OPENWEATHERMAP_API_KEY_2", # Secondary/alternative OpenWeatherMap key for "Current Data APIs"
        "ALPHAVANTAGE_API_KEY",
        "NYTIMES_API_KEY",
        "SYNTHESIA_API_KEY",
        "EMAIL_CRAIG",
        "EMAIL_JORDAN",
        "EMAIL_CRAIGW",
        "PHONE_CRAIG",
        "PHONE_JORDAN",
        "LOB_API_KEY",
        "DIGITAL_HUMANI_ENTERPRISE_ID",
        "DIGITAL_HUMANI_API_KEY",
        "BOX_CLIENT_ID",
        "BOX_OAUTH_TOKEN",
        "HTTPSMS_API_KEY",
        "HTTPSMS_FROM_NUMBER",
        "USER_PHONE_NUMBER", # This will be formatted and used by the script
        "CLOUDFLARE_API",
        "DUMMY_NAME", # If used by any API
    ]
    prompt_values = {k: os.environ[k] for k in prompt_env_keys if k in os.environ}
    prompt_values["user_prompt"] = task_description
    # Ensure USER_PHONE_NUMBER is available, even if not in env, it's passed as arg
    if "USER_PHONE_NUMBER" not in prompt_values and user_number:
        prompt_values["USER_PHONE_NUMBER"] = user_number
    if "SIGNAL_NUMBER" not in prompt_values and user_number: # Fallback for SIGNAL_NUMBER
        prompt_values["SIGNAL_NUMBER"] = user_number


    # Log which values are coming from environment variables vs hardcoded defaults
    env_provided_keys = [key for key in prompt_values.keys() if key != "user_prompt" and key in os.environ]
    if env_provided_keys:
        logger.debug(f"Using environment variables for: {env_provided_keys}")
    else:
        logger.debug("No API keys found in environment variables for prompt, using defaults if any or expecting them in prompt_values")

    adapter = get_llm_adapter(model_name=model)
    logger.debug(f"Prompt values being sent to template: {list(prompt_values.keys())}")

    # --- Python Code Generation Prompt ---
    python_prompt_template = """
You are an expert Python developer. Write a complete, self-contained Python script based on the following user request.
The script will be executed directly using the Python interpreter.
Output ONLY the Python code, enclosed in a single markdown code block (```python ... ```).
Do NOT include any explanations, comments (unless non-obvious), or any other text outside this code block.
The script should be elegant and as simple as possible while fulfilling the request.
Never use contractions in any user-facing output generated by the script (e.g., Signal messages, file content).
The script must trap all errors, including import errors. Before exiting on error, it should print a Signal-formatted message with the error details.

Assume the script runs in an environment where the following libraries are available:
- Standard Libraries: `os`, `sys`, `json`, `csv`, `re`, `datetime`, `time`, `uuid`, `hashlib`, `base64`, `io`, `asyncio`, `subprocess`, `tempfile`, `shutil`, `math`, `random`, `collections`.
- Third-Party Libraries: `requests`, `PIL` (Pillow), `google-api-python-client`, `google-auth-oauthlib`, `google-auth-httplib2`, `weasyprint`, `pdfkit`, `numpy`, `pandas`, `beautifulsoup4` (bs4), `lxml`, `python-dotenv`, `python-docx`.
- You can use helper functions for interacting with external APIs as defined below.

The user's phone number for file paths and some API calls is: {USER_PHONE_NUMBER}
The user's Signal number for API calls (e.g. Digital Humani) is: {SIGNAL_NUMBER}

AVAILABLE PYTHON LIBRARIES AND APIS:
---
# --- RSS Feeds ---
# The script has access to the following RSS feeds if needed for a task. Use `requests` and `xml.etree.ElementTree` or `feedparser` (if assumed available or simple enough to implement parsing) to fetch and parse.
# - nature.com/nature.rss
# - science.org/rss/news_current.xml
# - rss.sciam.com/ScientificAmerican-Global
# - nasa.gov/rss/dyn/breaking_news.rss
# - newscientist.com/feed/home
# - pnas.org/action/showFeed?type=etoc&feed=rss
# - sciencedaily.com/rss/all.xml
# - feeds.arstechnica.com/arstechnica/science
# - livescience.com/feeds/all
# - physicsworld.com/feed
# - chronicle.com/rss-article-feed
# - edsurge.com/feeds/articles
# - insidehighered.com/rss.xml
# - edweek.org/rss/ew_rss.xml
# - blog.ed.ted.com/feed
# - hechingerreport.org/feed
# - edutopia.org/rss.xml
# - ocw.mit.edu/rss/new/mit-newcourses.xml
# - ww2.kqed.org/mindshift/feed
# - blog.khanacademy.org/rss
# - feeds.reuters.com/reuters/topNews
# - rsshub.app/apnews/topics/ap-top-news
# - feeds.bbci.co.uk/news/rss.xml
# - feeds.npr.org/1001/rss.xml
# - rss.nytimes.com/services/xml/rss/nyt/HomePage.xml
# - feeds.washingtonpost.com/rss/world
# - theguardian.com/international/rss
# - economist.com/rss
# - feeds.a.dj.com/rss/RSSWorldNews.xml
# - aljazeera.com/xml/rss/all.xml
# - whitehouse.gov/feed
# - congress.gov/rss/most-viewed-bills.xml
# - supremecourt.gov/rss/slipopinion.aspx
# - fbi.gov/feeds/national-press-releases/rss.xml
# - tools.cdc.gov/api/v2/resources/media/132608.rss
# - state.gov/rss-feed/press-releases/feed
# - ec.europa.eu/commission/presscorner/api/rss/press-releases
# - news.un.org/feed/subscribe/en/news/all/rss.xml
# - parliament.uk/business/news/feed
# - who.int/rss-feeds/news-english.xml
# - technologyreview.com/feed
# - wired.com/feed/category/science/latest/rss
# - cnet.com/rss/news
# - techcrunch.com/feed
# - theverge.com/rss/index.xml
# - engadget.com/rss.xml
# - arxiv.org/rss/physics
# - phys.org/rss-feed
# - space.com/feeds/all
# - eurekalert.org/rss/technology_engineering.xml
# - nejm.org/action/showFeed?jc=nejm&type=etoc&feed=rss
# - thelancet.com/rssfeed/lancet_current.xml
# - nature.com/nclimate.rss
# - cell.com/cell/current.rss

# --- Wayfound API ---
# Base URL: https://app.wayfound.ai/api/v1
# Authentication: `Authorization: Bearer 5b231efe-c2a1-42bf-a43a-1c7e0a6d7407` on all calls.
# - List Agents: `GET /agents`. Optional query param `detail=full`. Returns JSON array of agents.
# - Create Agent: `POST /agents` with JSON body: `{{'name': '...', 'role': '...', 'goal': '...'}}`. Returns `{{'id': '...', 'createdAt': '...'}}`.
# - Get Agent Recordings: `GET /agents/{{ID}}/recordings`. Optional query params: `startDate`, `endDate` (ISO 8601).
# - Create Recordings: `POST /recordings/completed` with JSON body: `{{'agentId': '...', 'firstMessageAt': 'ISO8601', 'lastMessageAt': 'ISO8601', 'messages': [{{'role': 'assistant'|'user'|'debug', 'type': null|'user.rating', 'content': '...', 'data': null|{{'value': ..., 'detail': '...'}} }}] }}` (at least 2 messages).

# --- External APIs ---
# 1. Radar.io (Maps): Use key {RADAR_PUBLISHABLE_KEY} or {RADAR_TEST_PUBLISHABLE_KEY}. Example: `img_url = f"https://api.radar.io/maps/static?width=910&height=320&center=40.73430,-73.99110&zoom=15&style=radar-dark-v1&scale=2&markers=color:0x000257|40.73430,-73.99110&publishableKey={RADAR_TEST_PUBLISHABLE_KEY}"`.
# 2. NPS (National Park Service): Use key {NPS_API_KEY}. Use `requests` to call endpoints at `https://developer.nps.gov/api/v1/`. Append `?api_key={NPS_API_KEY}` to URLs.
# 3. Pexels (Stock Photos): Use key {PEXELS_API_KEY}. Use `requests` with `Authorization: {PEXELS_API_KEY}` header.
# 4. Stripe Checkout: Use `requests.post('https://promptwerk.com/create-checkout-session', json={{'productName': '...', 'amount': ...}})`. Amount should be in cents, integer. Do not include currency symbols/fields in `amount`. Returns JSON with `id`. Use publishable key {STRIPE_PUBLISHABLE_KEY} if embedding Stripe elements directly (less common in backend scripts). Set darkmode for UI if applicable.
# 5. OpenWeatherMap (Current/Forecast): Use key {OPENWEATHERMAP_API_KEY}. Call `api.openweathermap.org/data/2.5/weather` etc. Append `&appid={OPENWEATHERMAP_API_KEY}`.
# 5b. OpenWeatherMap (Historical Day Summary): Use key {OPENWEATHERMAP_API_KEY}. Call `https://api.openweathermap.org/data/3.0/onecall/day_summary?lat={{lat}}&lon={{lon}}&date={{YYYY-MM-DD}}&appid={OPENWEATHERMAP_API_KEY}`.
# 6. Alpha Vantage (Stock Quotes): Use key {ALPHAVANTAGE_API_KEY}. For realtime, call `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=IBM&apikey={ALPHAVANTAGE_API_KEY}`.
# 7. NYTimes API: Use key {NYTIMES_API_KEY}. Call `https://api.nytimes.com/svc/search/v2/` endpoints with `api-key={NYTIMES_API_KEY}` parameter.
# 8. Gutenberg (Book Text): Make `GET` request to `https://gutendex.com/books/?search=book_title_or_author`. Parse JSON response for `results[0]['id']` (the book_id). Then fetch text from `https://www.gutenberg.org/cache/epub/{{book_id}}/pg{{book_id}}.txt`. Break large texts into ~800,000 word chunks for parallel processing if needed.
# 9. Nager.Date (Holidays): Use `requests.get('https://date.nager.at/api/v3/PublicHolidays/{{year}}/{{country_code}}')`.
# 10. Lob (Postcards): Use key {LOB_API_KEY}. Use `requests.post('https://api.lob.com/v1/postcards', auth=('{LOB_API_KEY}', ''), data={{...}})`.
#     - `to` address dict: `{{'name': '', 'address_line1': '...', 'address_line2': 'apt/suite', 'address_city': '', 'address_state': '', 'address_zip': '', 'address_country': 'US'}}`.
#     - FRONT HTML: 6x4 inches, 0.25in margin, dark mode, no emojis, no em-dashes, content scaled to fit and be visible. Use AI to generate content.
#     - BACK HTML: 1.5x4 inches (max dimensions for content area), 0.25in margin, dark mode, centered creative text, no emojis, no em-dashes, content fit, no overflow. Do not use or reference images. Use AI to generate content.
#     - Set `use_type='operational'`.
#     - Read addresses from `uppers/{USER_PHONE_NUMBER}/myAddressBook.txt`. Use AI to find the best match if multiple or ambiguous.
#     - On success, append the returned Lob postcard ID to `uppers/{USER_PHONE_NUMBER}/cards.txt` (one ID per line).
#     - Handle cancel requests: read `uppers/{USER_PHONE_NUMBER}/cards.txt`, call Lob cancel API for each ID, report to user via Signal print, then clear the file.
#     - Always show preview URL from Lob response to user via Signal print.
# 11. Digital Humani (Plant Trees): Use key {DIGITAL_HUMANI_API_KEY} and enterprise ID {DIGITAL_HUMANI_ENTERPRISE_ID}. Headers: `{{'X-Api-Key': '{DIGITAL_HUMANI_API_KEY}'}}`.
#     - List projects: `GET https://api.digitalhumani.com/v1/projects`. Store full JSON response in `uppers/{USER_PHONE_NUMBER}/trees.txt`.
#     - Plant tree: `POST https://api.digitalhumani.com/v1/tree` with JSON `{{'enterpriseId': '{DIGITAL_HUMANI_ENTERPRISE_ID}', 'projectId': '...', 'user': '{SIGNAL_NUMBER}', 'treeCount': 1}}`. If user doesn't specify `projectId`, use AI to pick one from the stored list, matching country/region if specified by user. Returns `uuid` and `created` fields.
# 12. Google Maps Directions: Use key {GOOGLE_MAPS_API_KEY}. Call `https://maps.googleapis.com/maps/api/directions/json?origin=...&destination=...&key={GOOGLE_MAPS_API_KEY}`. (Note: Key {GOOGLE_API_KEY} may also be used if it's a general purpose key).
# 13. HttpSMS (Send SMS): Use key {HTTPSMS_API_KEY}. Call `requests.post('https://api.httpsms.com/v1/messages/send', headers={{'x-api-key': '{HTTPSMS_API_KEY}'}}, json={{'from': '{HTTPSMS_FROM_NUMBER}', 'to': '...', 'content': '...'}})`.
# 14. Box.com API: Use `requests` with `Authorization: Bearer {BOX_OAUTH_TOKEN}` header. Client ID {BOX_CLIENT_ID} might be needed for specific flows.
# 8. Gutenberg (Book Text): Use `requests.get('https://gutendex.com/books/', params={{'search': 'book title'}})`. Parse JSON response for `results[0]['id']` (the book_id). Then fetch text from `https://www.gutenberg.org/cache/epub/{{book_id}}/pg{{book_id}}.txt`. Break large texts into ~800k word chunks for parallel processing if needed.
# 30. Nager.Date (Holidays): Use `requests.get('https://date.nager.at/api/v3/PublicHolidays/{{year}}/{{country_code}}')`.
# Lob (Postcards): Use key {LOB_API_KEY}. Use `requests.post('https://api.lob.com/v1/postcards', auth=('{LOB_API_KEY}', ''), data={{...}})`. Construct `to` address dict. Generate FRONT HTML (6x4 in, 0.25in margin, dark mode, no emojis/em-dashes, fit content) and BACK HTML (1.5x4 in, 0.25in margin, dark mode, centered, no emojis/em-dashes, fit content). Set `use_type='operational'`. Read addresses from `uppers/{USER_PHONE_NUMBER}/myAddressBook.txt` (use AI to match if needed). Return preview URL. Handle cancel requests by reading `uppers/{USER_PHONE_NUMBER}/cards.txt`, calling Lob cancel API, and clearing file.
# Digital Humani (Plant Trees): Use key {DIGITAL_HUMANI_API_KEY} and enterprise ID {DIGITAL_HUMANI_ENTERPRISE_ID}. List projects: `requests.get('https://api.digitalhumani.com/v1/projects', headers={{'X-Api-Key': '{DIGITAL_HUMANI_API_KEY}'}})`. Plant tree: `requests.post('https://api.digitalhumani.com/v1/tree', headers={{'X-Api-Key': '{DIGITAL_HUMANI_API_KEY}'}}, json={{'enterpriseId': '{DIGITAL_HUMANI_ENTERPRISE_ID}', 'projectId': '...', 'user': '{USER_PHONE_NUMBER}', 'treeCount': 1}})`. Store project list in `uppers/{USER_PHONE_NUMBER}/trees.txt`. Use AI to pick project if needed.
# Google Maps Directions: Use key {GOOGLE_MAPS_API_KEY}. Call `https://maps.googleapis.com/maps/api/directions/json?origin=...&destination=...&key={GOOGLE_MAPS_API_KEY}`.
# HttpSMS (Send SMS): Use key {HTTPSMS_API_KEY}. Call `requests.post('https://api.httpsms.com/v1/messages/send', headers={{'x-api-key': '{HTTPSMS_API_KEY}'}}, json={{'from': '{HTTPSMS_FROM_NUMBER}', 'to': '...', 'content': '...'}})`.
# Box.com API: Use `requests` with `Authorization: Bearer {BOX_OAUTH_TOKEN}` header. Client ID {BOX_CLIENT_ID} might be needed for specific flows.
# Cloudflare API: Use key {CLOUDFLARE_API}. Use `requests` with appropriate headers (`Authorization: Bearer {CLOUDFLARE_API}` or `X-Auth-Email`/`X-Auth-Key`). Account ID `0a3bba0640b8f14c6817ec25f695d095`, Zone ID `c3eacb91f777749db2480a2ffd88be82`. Domain `astapp.engineer`.
# Futurehouse API: Call `requests.post('https://api.platform.futurehouse.org/v0.1/crows', headers={{'Authorization': 'Bearer <LONG_TOKEN_STRING>', 'Content-Type': 'application/json'}}, json={{'name': 'job-futurehouse-paperqa2-deep', 'query': '...', 'runtime_config': None}})`. Then call `requests.get('https://api.platform.futurehouse.org/v0.1/trajectories?limit=6&user=craigwarner@alumni.stanford.edu', headers={{...}})`. For each result object, call `requests.get(f'https://api.platform.futurehouse.org/v0.1/trajectories/{{obj["id"]}}', headers={{...}})`. Save output to `future{{obj['id']}}.json`. (Note: Token is hardcoded in the prompt).
# Synthesia Video API: Use key {SYNTHESIA_API_KEY}. Call `requests.post('https://api.synthesia.io/v2/videos', headers={{'Authorization': '{SYNTHESIA_API_KEY}', 'Content-Type': 'application/json'}}, json={{'test': True, 'visibility': 'public', 'title': '...', 'input': [...]}})`. Poll `https://api.synthesia.io/v2/videos/{{id}}` with auth header. Download from `download` field URL when ready.
# Google Service Account: Use service account file `utils/sheets.json` with `googleapiclient.discovery.build` and `google.oauth2.service_account.Credentials`. Delegate to `f@ast.engineer`. Use `googleapiclient` for Forms, Docs, Drive APIs. Create Form: `forms.forms().create(body={{'info': {{'title': '...'}}}}).execute()`. Update Form: `forms.forms().batchUpdate(formId=..., body={{'requests': [...]}}).execute()`. Make Public: `drive.permissions().create(fileId=form_id, body={{'role': 'reader', 'type': 'anyone'}}).execute()`. Create Doc: `docs.documents().create(body={{'title': '...'}}).execute()`. Update Doc: `docs.documents().batchUpdate(documentId=..., body={{'requests': [...]}}).execute()`.

# --- Internal APIs ---
# Authentication: Assume internal APIs are accessible from the execution environment unless specific headers (e.g., API keys) are mentioned below.
# 2.1. AI Image Modification: Submit image via URL or Base64. `requests.post('https://timast.link/run_prompt', json={{'alias': 'imageMod', 'params': {{'prompt': '...', 'image_url': 'URL_HERE' OR 'image_base64': 'BASE64_DATA_HERE'}}}})` -> Response JSON `{'data': 'base64...'}`. Then save result: `requests.post('https://timast.link/write', json={{'key': f'image-{uuid.uuid4()}', 'value': base64_data}})` -> Served at `https://timast.link/serve_image?key=image-uuid`.
# 2. AI Image Generation: `requests.post('https://timast.link/run_prompt', json={{'alias': 'imageGen', 'params': {{'prompt': '...'}}}})` -> Response JSON `{'data': 'base64...'}`. Then save result: `requests.post('https://timast.link/write', json={{'key': f'image-{uuid.uuid4()}', 'value': base64_data}})` -> Served at `https://timast.link/serve_image?key=image-uuid`. Run in parallel if multiple.
# 3. AI Audio Generation: `requests.post('https://myaitools.link/text_to_speech', json={{'text': '...', 'model': 'tts-1-hd', 'voice': 'alloy'}})` -> Response JSON `{'audio': 'base64...'}`.
# 4. AI Image Info Extraction: `requests.post('https://promptwerk.com/api/w2wImageDescription/json', json={{'gptimage': 'base64_image_string', 'prompt': 'Specify JSON format...'}})` -> Response is JSON. Requires input image as base64.
# 5. AI PDF Analysis: `requests.post('https://myaitools.link/process_pdf', json={{'pdf': 'base64_pdf_string', 'query': '...'}})` -> Response JSON `{'content': '...'}`. Requires input PDF as base64.
# 6. Read Website Content: `requests.get('https://promptwerk.com/oproxy', params={{'url': '...'}})`. Fetches and returns website text content.
# 7. Generic AI Task: `requests.post('https://timast.link/run_prompt', json={{'alias': 'genericAI', 'params': {{'prompt': 'Detailed prompt specifying exact JSON output format...'}}}})`. Retry 3 times on error. Reformat errors. Track token usage. Specify JSON output clearly in 'prompt'.
# Send Email API: `requests.post('https://timast.link/send_email', json={{...}})` (See detailed JSON structure in original prompt).

# --- Database ---
# Use `requests` for the key-value store. Assumes keys are unique UUIDs unless reading a specific known key.
# Write: `requests.post('https://timast.link/write', json={{'key': f'database-{uuid.uuid4()}', 'value': json.dumps(your_data_dict)}})`. Returns status.
# Read: `response = requests.get('https://timast.link/read', params={{'key': 'database-uuid'}})`. Check status. Data is in `response.json()['value']`.

# --- Current Data APIs ---
# Use `requests` library. Refer to the numbered list in the original prompt for endpoints and access rules (keys: {OPENWEATHERMAP_API_KEY_2}, {ALPHAVANTAGE_API_KEY}).

# --- File Handling ---
# IMPORTANT: Scripts run in a temporary directory. They CANNOT access arbitrary host file paths directly.
# Relative paths are relative to this temporary directory. Use absolute paths only if writing to predictable locations specified below.
# Base output directory for user-specific data: `base_dir = f'uppers/{USER_PHONE_NUMBER}'`. Create subdirs as needed.
# Ensure directories exist before writing: `os.makedirs(os.path.dirname(path), exist_ok=True)`.
# Example write: `output_path = os.path.join(base_dir, 'results', 'output.txt')`.
# Reading fixed paths: User info `os.path.join(base_dir, 'aboutme.txt')`. Address book `os.path.join(base_dir, 'myAddressBook.txt')`.
# Data downloaded via `requests` should be processed in memory or saved to the temporary directory if needed for subsequent steps within the script itself.

# --- Design Patterns ---
# a2a: AI step 1 (list) -> AI step 2 (process list items in parallel). Specify JSON format. Use `asyncio.gather` if suitable.
# a3a: AI step 1 (items) -> AI step 2 (lists per item) -> AI step 3 (process all items in parallel). Use `asyncio.gather` if suitable.
# ffs: Format output text for Signal (use markdown like *, _, ```). Escape markdown characters in user-generated content if necessary.
# aaf: Track AI call input/output char lengths for debugging/optimization.

# --- Special Tasks ---
# Coloring Book: Generate cover (AI full color) + 3 B&W line drawings (AI prompts -> AI image gen using Internal API #2). Add text, small bee, 'fairypaint.com' URL to images (use `PIL`). Use `pdfkit` or `weasyprint` to build PDF (1 image/page, 0.5in margin, centered). Save PDF to `os.path.join(base_dir, 'coloring_books', 'BookName.pdf')`. Save cover to `os.path.join(base_dir, 'coloring_books', 'BookNameCover.png')`.
# Kids Book: Cover (AI color) + 10 story images (AI prompts -> AI image gen). Add text, small bee to images (use `PIL`). Build PDF (`pdfkit`/`weasyprint`). Add final page with 'fairypaint.com' invite. Save similarly.
# Montage: AI image gen -> Generate HTML+CSS overlay -> Use `PIL` (Pillow) to composite text onto image intelligently -> Save final image (e.g., to `os.path.join(base_dir, 'montages', 'output.png')`). Sophisticated text styling.
# Home Services: Provide genz tips, avoid ad clicks, estimate click value. Query BBB API. Show 1 provider, Signal links, map (use Radar.io API).
# Quick/Slow/Deep Teach/Read: Use AI (Generic AI Task API #7) + timing (`time.sleep`). Print intent for Signal messages. Handle `os.path.join(base_dir, 'pause')` file check for quick read pauses. Get books via Gutenberg API.
# Find Books: Use `pandas` or `csv` to read `titles.csv` (assume accessible, perhaps copy to temp dir first). Chunk data. Use AI (Generic AI Task API #7) in parallel. Dedup results. Include Text#.
# Speed Read: Get book text (Gutenberg). Chunk (~800k words). Process chunks in parallel with AI (Generic AI Task API #7). Print intent for Signal progress messages.

# --- General Rules ---
# - Use `requests` for all HTTP calls. Handle potential `requests.exceptions.RequestException` errors gracefully (e.g., print error details to stderr, return error status). Check `response.raise_for_status()` within a try/except block.
# - Handle JSON: `response.json()` inside try/except block for potential `JSONDecodeError`.
# - Base64: `import base64; base64.b64encode(bytes_data).decode('utf-8'); base64.b64decode(str_data)`. Handle potential `binascii.Error` on decode.
# - File I/O: Use `with open(...)` and `os.path`, `os.makedirs`. Use UTF-8 encoding unless specified otherwise.
# - UUIDs: `import uuid; str(uuid.uuid4())`. Do not use external 'uuid' package if mentioned.
# - If user asks for debug: `print()` detailed logs (timing, data sizes, API params on error) to stderr.
# - If code requirements are empty/blank: `print('No-op task.')`.
# - Dark Mode UI for HTML, unless printable (then add print button, format for letter size).
# - Signal Messages: Script cannot send Signal messages directly. `print()` any messages intended for Signal, clearly marked (e.g., `print("SIGNAL_CONFIRM: Task started.")`, `print("SIGNAL_RESULT: Here is the output...")`).
---

User request:
{user_prompt}

REMEMBER: Output ONLY the raw Python code within a single ```python code block.
"""

    # Helper to safely format the prompt template
    def escape_curly_braces(template, keys):
        template = template.replace('{', '{{').replace('}', '}}')
        for key in keys:
            # Replace placeholders like {{PEXELS_API_KEY}} back to {PEXELS_API_KEY}
            template = template.replace('{{' + key + '}}', '{' + key + '}')
        return template

    # Prepare the final prompt
    prompt_keys = list(prompt_values.keys())
    safe_prompt_template = escape_curly_braces(python_prompt_template, prompt_keys)

    # Generate the list of environment variables for the prompt
    env_vars_list = ', '.join([key for key in prompt_values.keys() if key != 'user_prompt'])
    safe_prompt_template = safe_prompt_template.replace("{', '.join(list(key for key in prompt_values.keys() if key != 'user_prompt'))}", env_vars_list)

    final_prompt_text = safe_prompt_template.format_map(prompt_values)

    # --- Generate Python Code ---
    llm_config = StandardizedLLMConfig() # Add temperature etc. if needed
    raw_llm_response_text_for_debugging = "LLM_RESPONSE_NOT_CAPTURED"
    python_code = ""
    run_stdout, run_stderr = "", ""
    temp_dir = ""
    script_path = ""

    try:
        logger.debug(f"Generating Python code for task: {task_description[:100]}...")
        llm_response = await adapter.generate_content(
            model_name=model,
            history=[StandardizedMessage(role="user", content=final_prompt_text)],
            tools=None, # No tools needed for simple script generation
            config=llm_config
        )
        if llm_response.error:
            return {"status": "error", "message": f"LLM_API_ERROR: {llm_response.error}"}

        response_text = llm_response.text_content or ""
        raw_llm_response_text_for_debugging = response_text

        if not response_text.strip():
            return {"status": "error", "message": "LLM_EMPTY_RESPONSE: LLM returned no text content."}

        # Extract Python code block
        code_match = re.search(r'```python\s*([\s\S]*?)\s*```', response_text)
        if not code_match:
            # Fallback if language identifier is missing
            code_match = re.search(r'```\s*([\s\S]*?)\s*```', response_text)

        if not code_match:
            logger.debug(f"run_python_task - Code extraction failed. LLM response was:\n{raw_llm_response_text_for_debugging}")
            return {
                "status": "error",
                "message": "LLM_CODE_EXTRACTION_FAILED: Could not extract Python code block.",
                "details": f"LLM response snippet: {raw_llm_response_text_for_debugging[:1000]}"
            }

        python_code = code_match.group(1).strip()
        if not python_code:
            logger.debug(f"run_python_task - Extracted Python code block was empty. LLM response was:\n{raw_llm_response_text_for_debugging}")
            return {
                "status": "error",
                "message": "LLM_EMPTY_CODE_BLOCK: Extracted Python code block was empty.",
                "details": f"LLM response snippet: {raw_llm_response_text_for_debugging[:1000]}"
            }
        logger.debug(f"Python code generated successfully.")

    except Exception as e:
        import traceback
        error_stack = traceback.format_exc()
        logger.debug(f"run_python_task - Exception in LLM/Extraction phase: {str(e)}\n{error_stack}")
        details_text = raw_llm_response_text_for_debugging if raw_llm_response_text_for_debugging != "LLM_RESPONSE_NOT_CAPTURED" else "LLM response was not captured before exception."
        return {
            "status": "error",
            "message": f"LLM_PHASE_EXCEPTION: {str(e)}",
            "details": f"Exception: {str(e)}. LLM response snippet: {details_text[:1000]}"
        }

    # --- Execute Python Code ---
    temp_dir = tempfile.mkdtemp(prefix="py_run_")
    script_path = os.path.join(temp_dir, "main.py")

    try:
        # Write Python code to a temp file
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(python_code)

        # Execute the script using the same Python interpreter that runs this server
        python_executable = sys.executable
        if not python_executable or not os.path.exists(python_executable):
             # Fallback if sys.executable is weird, though unlikely
             python_executable = shutil.which("python") or shutil.which("python3")
             if not python_executable:
                 raise Exception("SETUP_ERROR: Python interpreter not found.")

        logger.debug(f"Executing Python script: {script_path} using interpreter: {python_executable}")
        run_proc = await asyncio.create_subprocess_exec(
            python_executable, script_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env_vars,  # Pass the environment variables to the subprocess
            cwd=temp_dir # Run script with temp dir as current working directory
        )
        run_stdout_bytes, run_stderr_bytes = await run_proc.communicate()
        run_stdout = run_stdout_bytes.decode("utf-8", errors="replace")
        run_stderr = run_stderr_bytes.decode("utf-8", errors="replace")

        if run_proc.returncode != 0:
            logger.debug(f"Python script execution failed. Exit Code: {run_proc.returncode}\nStdout:\n{run_stdout}\nStderr:\n{run_stderr}")
            return {
                "status": "error",
                "message": "PYTHON_EXECUTION_ERROR: Script exited with non-zero code.",
                "python_code": python_code,
                "stdout": run_stdout,
                "stderr": run_stderr,
                "exit_code": run_proc.returncode
            }
        logger.debug(f"Python script executed successfully.")

    except Exception as e:
        import traceback
        error_stack = traceback.format_exc()
        logger.debug(f"run_python_task - Exception during execution phase: {str(e)}\n{error_stack}")
        return {
            "status": "error",
            "message": f"EXECUTION_PHASE_EXCEPTION: {str(e)}",
            "python_code": python_code,
            "stdout": run_stdout, # May contain partial output before error
            "stderr": run_stderr  # May contain partial error before exception
        }
    finally:
        # Clean up the temporary directory
        if temp_dir and os.path.exists(temp_dir):
            try:
                # Use asyncio.to_thread for shutil.rmtree if it might block
                await asyncio.to_thread(shutil.rmtree, temp_dir)
                logger.debug(f"Cleaned up temp directory {temp_dir}")
            except Exception as e_clean:
                logger.debug(f"ERROR: Failed to clean up temp directory {temp_dir}: {str(e_clean)}")

    # --- Return Success ---
    return {
        "status": "success",
        "python_code": python_code,
        "stdout": run_stdout,
        "stderr": run_stderr,
    }

@mcp.tool()
async def generate_javascript_iife(
    user_number: str,
    spec: str,
    current_code: Optional[str] = None,
    llm_model: str = "gpt-4.1-2025-04-14" # Or your preferred model for this
) -> dict:
    """
    Generates and executes a Javascript IIFE (Immediately Invoked Function Expression)
    based on a user's specification.
    The IIFE is designed to run on a Node.js server, with no DOM access.
    It uses the IIFENOUI_VARS_PROMPT which includes various API keys and guidelines.

    Args:
        user_number (str): The user's unique identifier (e.g., phone number), used for context if the script needs user-specific paths.
        spec (str): The user's detailed specification for the Javascript IIFE to be generated.
        current_code (Optional[str]): If updating an existing IIFE, this is the current Javascript code.
        llm_model (str): The LLM model to use for Javascript code generation. Default is "gpt-4.1-2025-04-14".
    Returns:
        dict: A dictionary containing:
              - "status": "success" or "error"
              - "javascript_code": The generated Javascript IIFE string (if successful).
              - "message": An error message or success message.
              - "llm_response_raw": The raw text response from the LLM for debugging.
              - "execution_stdout": The standard output from executing the Javascript code (if successful).
              - "execution_stderr": The standard error from executing the Javascript code (if successful).
              - "execution_exit_code": The exit code from the Javascript execution.
    """
    logger.debug(f"Generating Javascript IIFE for user {user_number} with spec: {spec[:100]}...")

    # Initialize execution results for consistent return structure
    execution_results = {
        "execution_stdout": None,
        "execution_stderr": None,
        "execution_exit_code": None,
    }

    # Format the system prompt
    # The IIFENOU_VARS_PROMPT expects placeholders like {{USER_PHONE_NUMBER}} and [[spec]]
    
    # Prepare prompt values from environment and arguments
    # Similar to run_python_task, gather available API keys and user number
    prompt_env_keys = [
        "RADAR_PUBLISHABLE_KEY", "RADAR_TEST_PUBLISHABLE_KEY", "NPS_API_KEY", "PEXELS_API_KEY",
        "STRIPE_PUBLISHABLE_KEY", "OPENWEATHERMAP_API_KEY", "OPENWEATHERMAP_API_KEY_2",
        "ALPHAVANTAGE_API_KEY", "NYTIMES_API_KEY", "SYNTHESIA_API_KEY", "LOB_API_KEY",
        "DIGITAL_HUMANI_ENTERPRISE_ID", "DIGITAL_HUMANI_API_KEY", "GOOGLE_MAPS_API_KEY",
        "HTTPSMS_API_KEY", "HTTPSMS_FROM_NUMBER", "BOX_CLIENT_ID", "BOX_OAUTH_TOKEN",
        "CLOUDFLARE_API"
        # Add any other keys specifically referenced in IIFENOU_VARS_PROMPT's {{KEY_NAME}} format
    ]
    prompt_values = {k: os.environ.get(k, f"{{{{{k}}}}}") for k in prompt_env_keys} # Default to placeholder if not found
    prompt_values["USER_PHONE_NUMBER"] = user_number # Ensure user_number is correctly passed
    prompt_values["SIGNAL_NUMBER"] = user_number # Assuming user_number can be used as SIGNAL_NUMBER
    
    # The main spec from the user
    # The prompt template uses **[[spec]]** for the main user request for the IIFE
    
    # Replace placeholders in the IIFENOU_VARS_PROMPT
    # First, replace the specific {{KEY_NAME}} placeholders
    formatted_system_prompt = IIFENOUI_VARS_PROMPT
    for key, value in prompt_values.items():
        formatted_system_prompt = formatted_system_prompt.replace(f"{{{{{key}}}}}", str(value))
    
    # Then, replace the main [[spec]] placeholder
    formatted_system_prompt = formatted_system_prompt.replace("**[[spec]]**", spec)

    # If current_code is provided, add it to the prompt context as well
    # The IIFENOU_VARS_PROMPT has an "optional current_code" mention.
    # We can make this more explicit for the LLM if needed.
    # For now, the prompt implies it will look for it in the "spec" or context.
    # Let's adjust the prompt slightly if current_code is present.

    final_user_content_for_llm = f"Generate the Javascript IIFE."
    if current_code:
        # The IIFENOU_VARS_PROMPT structure has "based on the optional "current_code", and the users app "spec" below"
        # So, we need to ensure the system prompt itself contains current_code if provided.
        # This is a bit tricky as the prompt is already formatted.
        # A robust way would be to modify IIFENOU_VARS_PROMPT to have a more direct current_code placeholder.
        # For now, let's try injecting it into the spec part or as a preamble to the user request.
        # The current structure is "code requirements/spec is: **[[spec]]**"
        # Let's make the system prompt itself include current_code when available.
        
        temp_spec_with_current_code = spec
        if current_code:
            temp_spec_with_current_code = f"The current code to be updated is:\n```javascript\n{current_code}\n```\n\nThe new requirements or changes are:\n{spec}"
        
        formatted_system_prompt_with_current_code = IIFENOUI_VARS_PROMPT
        for key, value in prompt_values.items():
            formatted_system_prompt_with_current_code = formatted_system_prompt_with_current_code.replace(f"{{{{{key}}}}}", str(value))
        formatted_system_prompt_with_current_code = formatted_system_prompt_with_current_code.replace("**[[spec]]**", temp_spec_with_current_code)
        
        system_prompt_to_use = formatted_system_prompt_with_current_code
    else:
        system_prompt_to_use = formatted_system_prompt


    adapter = get_llm_adapter(model_name=llm_model)
    history = [StandardizedMessage(role="user", content=final_user_content_for_llm)] # User message is simple, bulk is in system
    config = StandardizedLLMConfig(system_prompt=system_prompt_to_use)

    raw_llm_response_text = "LLM_RESPONSE_NOT_CAPTURED"

    try:
        logger.debug(f"Calling LLM ({llm_model}) for Javascript IIFE generation.")
        llm_response = await adapter.generate_content(
            model_name=llm_model,
            history=history,
            tools=None,
            config=config
        )

        if llm_response.error:
            logger.error(f"LLM API error for IIFE generation: {llm_response.error}")
            return {
                "status": "error",
                "message": f"LLM_API_ERROR: {llm_response.error}",
                "javascript_code": None,
                "llm_response_raw": None,
                **execution_results
            }

        raw_llm_response_text = llm_response.text_content or ""
        if not raw_llm_response_text.strip():
            logger.warn("LLM returned empty content for IIFE generation.")
            return {
                "status": "error",
                "message": "LLM_EMPTY_RESPONSE: LLM returned no text content.",
                "javascript_code": None,
                "llm_response_raw": raw_llm_response_text,
                **execution_results
            }

        # The IIFENOU_VARS_PROMPT specifies: "output in json format without using markdown syntax for code blocks."
        # and "output format: json object with one field "code": string."
        # So, we expect the raw_llm_response_text to be a JSON string.
        generated_javascript_code: Optional[str] = None
        generation_message = "Javascript IIFE generation failed."

        try:
            parsed_json = json.loads(raw_llm_response_text)
            generated_javascript_code = parsed_json.get("code")

            if generated_javascript_code is None: # Check for None, not just falsy, as empty string could be valid if requested
                logger.error(f"LLM response JSON did not contain 'code' field. Response: {raw_llm_response_text[:500]}")
                return {
                    "status": "error",
                    "message": "LLM_INVALID_JSON_STRUCTURE: Response JSON missing 'code' field.",
                    "javascript_code": None,
                    "llm_response_raw": raw_llm_response_text,
                    **execution_results
                }
            generation_message = "Javascript IIFE generated successfully."
            logger.info(f"Successfully generated Javascript IIFE. Code length: {len(generated_javascript_code)}")

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM JSON response for IIFE: {str(e)}. Response: {raw_llm_response_text[:1000]}")
            code_match_md = re.search(r'```(?:javascript|js|json)?\s*(\{[\s\S]*?\})\s*```', raw_llm_response_text, re.DOTALL)
            if not code_match_md: # If primary JSON fails, try to find ```json { "code": "..." } ```
                code_match_md = re.search(r'```json\s*(\{[\s\S]*?\})\s*```', raw_llm_response_text, re.DOTALL)

            if code_match_md:
                try:
                    logger.info("Attempting fallback JSON parsing from markdown block.")
                    parsed_json_md = json.loads(code_match_md.group(1))
                    generated_javascript_code_md = parsed_json_md.get("code")
                    if generated_javascript_code_md is not None:
                        generated_javascript_code = generated_javascript_code_md
                        generation_message = "Javascript IIFE generated successfully (from MD fallback)."
                        logger.info(f"Successfully generated Javascript IIFE (from MD fallback). Code length: {len(generated_javascript_code)}")
                    else:
                        logger.error("Fallback JSON parsing from markdown successful, but 'code' field missing.")
                        return {
                            "status": "error",
                            "message": f"LLM_JSON_PARSE_ERROR: Failed to parse LLM response as JSON. Fallback MD parse missing 'code'. Error: {str(e)}",
                            "javascript_code": None,
                            "llm_response_raw": raw_llm_response_text,
                            **execution_results
                        }

                except Exception as md_e:
                    logger.error(f"Fallback JSON parsing from markdown also failed: {str(md_e)}")
                    return {
                        "status": "error",
                        "message": f"LLM_JSON_PARSE_ERROR: Failed to parse LLM response as JSON. Error: {str(e)}",
                        "javascript_code": None,
                        "llm_response_raw": raw_llm_response_text,
                        **execution_results
                    }
            else: # No markdown block found either
                return {
                    "status": "error",
                    "message": f"LLM_JSON_PARSE_ERROR: Failed to parse LLM response as JSON and no fallback markdown block found. Error: {str(e)}",
                    "javascript_code": None,
                    "llm_response_raw": raw_llm_response_text,
                    **execution_results
                }
        
        # If we have javascript code, try to execute it
        if generated_javascript_code is not None:
            logger.info("Attempting to execute generated Javascript IIFE.")
            # WARNING: Executing arbitrary code from an LLM is a security risk.
            # Ensure Node.js is installed and in PATH.
            try:
                # We need to pass the code as a string to `node -e`
                # Ensure the IIFE is properly formatted to be executed by `node -e`
                # Often, IIFEs are self-contained, but ensure it doesn't rely on being in a <script> tag.
                # (async () => { ... })(); is a common pattern that works well with `node -e`
                
                process = await asyncio.create_subprocess_exec(
                    'node', '-e', generated_javascript_code,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                stdout, stderr = await process.communicate() # Wait for the process to terminate

                execution_results["execution_stdout"] = stdout.decode('utf-8', errors='replace').strip()
                execution_results["execution_stderr"] = stderr.decode('utf-8', errors='replace').strip()
                execution_results["execution_exit_code"] = process.returncode

                if process.returncode == 0:
                    logger.info(f"Javascript IIFE executed successfully. Exit code: {process.returncode}")
                    logger.debug(f"IIFE STDOUT: {execution_results['execution_stdout']}")
                    if execution_results['execution_stderr']: # Log stderr even on success, as it might contain warnings
                        logger.warn(f"IIFE STDERR (on success): {execution_results['execution_stderr']}")
                    return {
                        "status": "success",
                        "javascript_code": generated_javascript_code,
                        "message": f"{generation_message} Javascript IIFE executed successfully.",
                        "llm_response_raw": raw_llm_response_text,
                        **execution_results
                    }
                else:
                    logger.error(f"Javascript IIFE execution failed. Exit code: {process.returncode}")
                    logger.error(f"IIFE STDOUT: {execution_results['execution_stdout']}")
                    logger.error(f"IIFE STDERR: {execution_results['execution_stderr']}")
                    return {
                        "status": "error",
                        "javascript_code": generated_javascript_code, # Return code even if execution fails
                        "message": f"{generation_message} But Javascript IIFE execution failed with exit code {process.returncode}.",
                        "llm_response_raw": raw_llm_response_text,
                        **execution_results
                    }

            except FileNotFoundError:
                logger.error("Node.js not found. Please ensure it is installed and in your PATH.")
                return {
                    "status": "error",
                    "javascript_code": generated_javascript_code,
                    "message": f"{generation_message} But Node.js execution failed: Node.js not found.",
                    "llm_response_raw": raw_llm_response_text,
                    **execution_results # exit_code will be None here
                }
            except Exception as exec_e:
                import traceback
                exec_error_stack = traceback.format_exc()
                logger.error(f"Unexpected error during Javascript IIFE execution: {str(exec_e)}\n{exec_error_stack}")
                return {
                    "status": "error",
                    "javascript_code": generated_javascript_code,
                    "message": f"{generation_message} But an unexpected error occurred during Javascript execution: {str(exec_e)}",
                    "llm_response_raw": raw_llm_response_text,
                    **execution_results # Potentially partial results before error
                }
        else:
            # This case should ideally be caught by earlier checks if generated_javascript_code is None after parsing.
            logger.error("Generated Javascript code was None before execution attempt.")
            return {
                "status": "error",
                "message": "Failed to obtain Javascript code from LLM response for execution.",
                "javascript_code": None,
                "llm_response_raw": raw_llm_response_text,
                **execution_results
            }

    except Exception as e:
        import traceback
        error_stack = traceback.format_exc()
        logger.error(f"Unexpected error in generate_javascript_iife: {str(e)}\n{error_stack}")
        return {
            "status": "error",
            "message": f"UNEXPECTED_ERROR: {str(e)}",
            "javascript_code": None, # Code might not have been generated at this point
            "llm_response_raw": raw_llm_response_text if 'raw_llm_response_text' in locals() else "LLM_RESPONSE_NOT_CAPTURED",
            **execution_results
        }

@mcp.tool()
async def create_google_doc(
    doc_name: str,
    initial_content_prompt: Optional[str] = None,
    user_number: str = "+17145986105",
    attachments: Optional[list] = None,
    client_injected_context: str = "No additional context provided",
    model_for_content: str = "gemini-2.5-flash-preview-04-17"
) -> dict:
    """
    Creates a new Google Document. Content is generated by an LLM based on initial_content_prompt
    and client_injected_context, formatted as HTML, then imported by Google Drive.
    The document is made publicly writable.

    Args:
        doc_name (str): The name for the new Google Document.
        initial_content_prompt (Optional[str]): Specific instructions for the document's content.
                                                If None, client_injected_context will be the primary source.
        user_number (str): The user's unique identifier.
        attachments (Optional[list]): A list of URL strings or base64-encoded images.
                                      LLM will be made aware of these for content generation.
        client_injected_context (str): Broader conversation history or context.
        model_for_content (str): The LLM model to use for generating HTML content.
    Returns:
        dict: {"status": "success", "message": "Document created...", "url": "...", "html_content": "..."} or
              {"status": "error", "message": "Error details", "html_content": "..."}
    """
    import re # Ensure re is imported
    SCOPES_DRIVE = [
        'https://www.googleapis.com/auth/drive'
    ]
    SERVICE_ACCOUNT_FILE = os.path.join(os.path.dirname(__file__), '../../utils/google_service_account.json')

    # --- Attachment Handling (similar to create_pdf_document) ---
    processed_attachments = await asyncio.to_thread(process_attachments, attachments)
    attachment_urls_for_prompt = []
    if processed_attachments:
        for att in processed_attachments:
            url = att.get('url')
            if url:
                attachment_urls_for_prompt.append(url)
            # For base64, we can't directly embed into HTML for Drive import easily without saving them first.
            # So, for now, we'll primarily pass URLs to the LLM.

    # --- Construct the main content generation directive for the LLM ---
    full_content_directive = client_injected_context
    if initial_content_prompt:
        full_content_directive = f"Specific Request: {initial_content_prompt}\n\nFull Context:\n{client_injected_context}"

    SYSTEM_PROMPT_FOR_HTML_DOC_CONTENT = f"""You are an expert HTML generator. Your task is to generate a complete HTML document based on the user's request.
**Important: The HTML you generate will be imported and converted into a Google Document.** Therefore, the HTML should be structured in a way that translates well into a document format. Focus on clear, semantic HTML.

**Available Attachments for Reference:**
The user has provided the following attachments (as URLs). If relevant, you should incorporate them as images (`<img src="URL">`) or reference their content. **You MUST include all provided image URLs as <img> tags in the document, unless the user requests otherwise.**

**IMAGE SIZING REQUIREMENT:**
- All images you include MUST be sized appropriately for a document.
- The **maximum width for any image is 600 pixels**. Do NOT exceed this width.
- You MAY use smaller widths if it makes sense for the specific image or layout (e.g., for a small icon or a thumbnail).
- Always set the image size using the `width` attribute in the `<img>` tag (e.g., `<img src="..." width="450">` or `<img src="..." width="600">`).
- Do NOT use CSS for image sizing—use the `width` attribute only.

**HTML REQUIREMENTS:**
- Output a full HTML document, including `<!DOCTYPE html>`, `<html>`, `<head>`, `<title>`, and `<body>` tags. The `<title>` should be "{doc_name}".
- Use standard HTML tags for structure (e.g., headings, paragraphs, lists, tables) and formatting (e.g., bold, italic).
- Ensure the HTML is well-formed.

**OUTPUT FORMAT - CRITICAL:**
- Your response MUST be ONLY the HTML code, enclosed in a single triple-backtick markdown code block with the `html` language identifier.
  Example:
  ```html
  <!DOCTYPE html>
  <html>
  <head>
    <title>{doc_name}</title>
    <style>
      body {{ font-family: sans-serif; margin: 2em; }}
    </style>
  </head>
  <body>
    <h1>Document Title</h1>
    <p>Content goes here...</p>
    <!-- Example of a large image (max width): -->
    <img src="IMAGE_URL_HERE" width="600">
    <!-- Example of an intentionally smaller image: -->
    <img src="SMALLER_IMAGE_URL_HERE" width="300">
  </body>
  </html>
  ```
- Do NOT include any other text, explanations, or comments before or after the code block.
- If you cannot generate content based on the prompt, return a minimal valid HTML document with a message like "Content could not be generated."

**USER'S DOCUMENT CONTENT REQUEST:**
{full_content_directive}
"""

    try:
        creds = await asyncio.to_thread(
            service_account.Credentials.from_service_account_file,
            SERVICE_ACCOUNT_FILE, scopes=SCOPES_DRIVE
        )
        drive_service = build('drive', 'v3', credentials=creds)

        document_id = None
        html_content_for_import = None # Initialize here
        content_generation_error = None

        # Always attempt to generate HTML if there's any directive (initial_content_prompt or client_injected_context)
        # If both are essentially empty, we might fall back to a truly blank doc,
        # but usually client_injected_context will have something.
        if initial_content_prompt or client_injected_context.strip() != "No additional context provided":
            adapter = get_llm_adapter(model_for_content)
            # The main directive is now part of the system prompt
            llm_user_message = "Please generate the HTML document content as specified in the system prompt."
            llm_history = [StandardizedMessage(role="user", content=llm_user_message)]
            llm_config_html = StandardizedLLMConfig(system_prompt=SYSTEM_PROMPT_FOR_HTML_DOC_CONTENT)

            try:
                llm_response = await adapter.generate_content(
                    model_name=model_for_content,
                    history=llm_history,
                    config=llm_config_html
                )
                if llm_response.error:
                    content_generation_error = f"LLM error generating HTML content: {llm_response.error}"
                else:
                    response_text = llm_response.text_content or ""
                    # Extract HTML from LLM response (assuming it's in a ```html ... ``` block)
                    code_block_match = re.search(r'```(?:html)?\s*([\s\S]*?)\s*```', response_text, re.DOTALL)
                    if code_block_match:
                        html_content_for_import = code_block_match.group(1).strip()
                        if not html_content_for_import:
                            content_generation_error = "LLM returned an empty HTML code block."
                    else:
                        # Check if the response itself is HTML (if LLM didn't use backticks)
                        if response_text.strip().lower().startswith("<!doctype html") or response_text.strip().lower().startswith("<html"):
                            html_content_for_import = response_text.strip()
                            logger.info("LLM returned HTML without code block, attempting to use directly.")
                        else:
                            content_generation_error = "LLM did not return HTML in the expected format."
                            logger.warning(f"LLM response for HTML was not in a code block and didn't look like HTML: {response_text[:200]}")
            except Exception as e:
                content_generation_error = f"Exception during LLM call for HTML content: {str(e)}"

            if content_generation_error:
                logger.error(content_generation_error)
                # Fallback: create an empty doc or a doc with an error message
                html_content_for_import = f"<!DOCTYPE html><html><head><title>{doc_name}</title></head><body><h1>Error Generating Content</h1><p>{content_generation_error}</p></body></html>"

            if html_content_for_import:
                # --- REMOVE ALL CSS/IMG INJECTION LOGIC ---
                # (No CSS or width injection here anymore)
                logger.info(f"Attempting to create Google Doc '{doc_name}' by importing HTML...")
                file_metadata = {
                    'name': doc_name,
                    'mimeType': 'application/vnd.google-apps.document'
                }
                media = MediaIoBaseUpload(
                    io.BytesIO(html_content_for_import.encode('utf-8')),
                    mimetype='text/html',
                    resumable=True
                )
                created_file = await asyncio.to_thread(
                    drive_service.files().create(
                        body=file_metadata,
                        media_body=media,
                        fields='id'
                    ).execute
                )
                document_id = created_file.get('id')
                logger.info(f"Google Doc '{doc_name}' created from HTML with ID: {document_id}")

        else: # No initial content prompt, create a blank document
            logger.info(f"No initial content prompt. Creating a blank Google Doc named '{doc_name}'.")
            html_content_for_import = f"<!DOCTYPE html><html><head><title>{doc_name}</title></head><body></body></html>" # Capture blank HTML
            minimal_html = html_content_for_import # Use the captured html
            file_metadata = {
                'name': doc_name,
                'mimeType': 'application/vnd.google-apps.document'
            }
            media = MediaIoBaseUpload(
                io.BytesIO(minimal_html.encode('utf-8')),
                mimetype='text/html',
                resumable=True
            )
            created_file = await asyncio.to_thread(
                drive_service.files().create(
                    body=file_metadata,
                    media_body=media,
                    fields='id'
                ).execute
            )
            document_id = created_file.get('id')
            logger.info(f"Blank Google Doc '{doc_name}' created with ID: {document_id}")


        if not document_id:
            final_message = f"Failed to create Google Document '{doc_name}'."
            if content_generation_error:
                final_message += f" Reason: {content_generation_error}"
            return {"status": "error", "message": final_message, "html_content": html_content_for_import}

        await asyncio.to_thread(
            drive_service.permissions().create(
                fileId=document_id,
                body={'type': 'anyone', 'role': 'writer'},
                sendNotificationEmail=False
            ).execute
        )
        doc_url = f"https://docs.google.com/document/d/{document_id}/edit"
        logger.info(f"Google Doc '{doc_name}' (ID: {document_id}) is now public at: {doc_url}")

        message = f"Google Document '{doc_name}' created successfully. URL: {doc_url}"
        if content_generation_error: # If there was an LLM error but we still created a doc (e.g., with error message)
            message += f" Note on content generation: {content_generation_error}"
        
        return {"status": "success", "message": message, "url": doc_url, "document_id": document_id, "html_content": html_content_for_import}

    except Exception as e:
        import traceback
        logger.error(f"Error in create_google_doc '{doc_name}': {str(e)}\n{traceback.format_exc()}")
        return {"status": "error", "message": f"Failed to create Google Doc: {str(e)}", "html_content": html_content_for_import if 'html_content_for_import' in locals() and html_content_for_import is not None else "HTML content was not generated before error."}

@mcp.tool()
async def create_google_form(
    form_title: str,
    form_items_prompt: Optional[str] = None,
    model_for_items: str = "gemini-2.5-flash-preview-04-17" # MODIFIED
) -> dict:
    """
    Creates a new Google Form, optionally adds questions/items based on a natural language prompt,
    and makes it publicly accessible.

    Args:
        form_title (str): The title for the new Google Form.
        form_items_prompt (Optional[str]): A natural language prompt describing the questions and items
                                           for the form. If provided, an LLM will generate
                                           Google Forms API batchUpdate requests to create these items.
                                           Example: "Create a survey with two questions: 1. Name (Text input).
                                           2. Favorite Color (Multiple Choice: Red, Green, Blue)."
        model_for_items (str): The LLM model to use for generating form item creation requests if
                               `form_items_prompt` is provided.
    Returns:
        dict: {"status": "success", "message": "Form created...", "url": "...", "form_id": "..."} or
              {"status": "error", "message": "Error details"}
    """
    SCOPES_FORMS_DRIVE = [
        'https://www.googleapis.com/auth/forms.body',      # To create and manage forms
        'https://www.googleapis.com/auth/drive'           # To manage form permissions (as forms are Drive files)
    ]
    SERVICE_ACCOUNT_FILE = os.path.join(os.path.dirname(__file__), '../../utils/google_service_account.json')

    try:
        creds = await asyncio.to_thread(
            service_account.Credentials.from_service_account_file,
            SERVICE_ACCOUNT_FILE, scopes=SCOPES_FORMS_DRIVE
        )
        forms_service = build('forms', 'v1', credentials=creds)
        drive_service = build('drive', 'v3', credentials=creds) # For permissions

        # 1. Create the Google Form
        form_body = {
            'info': {
                'title': form_title,
                'documentTitle': form_title # The title shown in Drive
            }
        }
        created_form = await asyncio.to_thread(
            forms_service.forms().create(body=form_body).execute
        )
        form_id = created_form.get('formId')
        responder_uri = created_form.get('responderUri')
        logger.info(f"Google Form '{form_title}' created with ID: {form_id}. Responder URI: {responder_uri}")

        item_creation_error = None
        if form_items_prompt and form_id:
            # 2. Generate form item creation requests using an LLM
            system_prompt_for_form_items = f"""You are an expert in the Google Forms API, specifically the forms.batchUpdate endpoint.
Your task is to convert a natural language description of form questions/items into a valid JSON array of Google Forms API batchUpdate requests.

**STRICT REQUIREMENTS:**
1.  **Output Format - CRITICAL:** Your response MUST be a valid JSON array of request objects, enclosed in a triple backtick code block (```) with the `json` language identifier. Example for adding a text question and a multiple choice question:
    ```json
    [
      {{
        "createItem": {{
          "item": {{
            "title": "What is your name?",
            "questionItem": {{
              "question": {{
                "required": true,
                "textQuestion": {{}}
              }}
            }}
          }},
          "location": {{ "index": 0 }}
        }}
      }},
      {{
        "createItem": {{
          "item": {{
            "title": "Favorite Color?",
            "questionItem": {{
              "question": {{
                "choiceQuestion": {{
                  "type": "RADIO",
                  "options": [
                    {{"value": "Red"}},
                    {{"value": "Green"}},
                    {{"value": "Blue"}}
                  ]
                }}
              }}
            }}
          }},
          "location": {{ "index": 1 }}
        }}
      }}
    ]
    ```
    Do NOT include any other text, explanations, or comments before or after the code block.
2.  **Only Use Official API Fields:** Refer to the Google Forms API documentation for `forms.batchUpdate`, `Request`, `Item`, and `Question` objects.
    - Each request in the array will typically be a `createItem` request.
    - `location.index` specifies the 0-based position for the new item.
    - Common `questionItem.question` types include `textQuestion`, `choiceQuestion` (type: `RADIO`, `CHECKBOX`, `DROP_DOWN`), `dateQuestion`, `timeQuestion`, etc.
3.  **If Unsure, Simplify:** If a complex item cannot be mapped easily, create a simpler version or omit it.
4.  **If no valid requests can be generated, return an empty array: `[]`**

**User's Form Items Prompt:**
{form_items_prompt}

Convert this prompt into Google Forms API `batchUpdate` requests to create the items.
Assign `location.index` sequentially starting from 0 for each new item.
"""
            adapter = get_llm_adapter(model_for_items)
            llm_history_forms = [StandardizedMessage(role="user", content="Generate Google Forms API batchUpdate requests based on the system prompt.")]
            llm_config_forms = StandardizedLLMConfig(system_prompt=system_prompt_for_form_items)

            try:
                llm_response = await adapter.generate_content(
                    model_name=model_for_items,
                    history=llm_history_forms,
                    tools=None, # Added tools=None
                    config=llm_config_forms
                )
                if llm_response.error:
                    item_creation_error = f"LLM error generating form items: {llm_response.error}"
                else:
                    response_text = llm_response.text_content or ""
                    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', response_text)
                    if json_match:
                        try:
                            item_requests = json.loads(json_match.group(1))
                            if item_requests: # If there are actual requests
                                await asyncio.to_thread(
                                    forms_service.forms().batchUpdate(
                                        formId=form_id,
                                        body={'requests': item_requests}
                                    ).execute
                                )
                                logger.info(f"Successfully applied LLM-generated items to form {form_id}.")
                        except json.JSONDecodeError as json_err:
                            item_creation_error = f"Error parsing LLM JSON for form items: {json_err}. Response: {response_text[:200]}"
                        except Exception as api_err:
                            item_creation_error = f"API error applying form items: {api_err}"
                    elif response_text.strip() != "[]":
                        item_creation_error = "LLM did not return form item requests in the expected JSON format."
            except Exception as e:
                item_creation_error = f"Error during LLM call for form items: {str(e)}"

            if item_creation_error:
                logger.error(item_creation_error)

        # 3. Make the form public (anyone with the link can respond)
        # Forms are Drive files, so use Drive API to set permissions.
        # 'writer' role on a Form allows responding and viewing summary of responses.
        # 'reader' allows responding only. Let's use 'writer' for broader utility or 'reader' if only for responses.
        # For general access to respond, 'reader' on the Drive file is usually sufficient.
        # However, to allow viewing the form itself (not just responding) & potentially results, 'writer' might be needed depending on sharing settings within form.
        # Let's try with 'anyone' with 'reader' role first, which is typical for public surveys.
        await asyncio.to_thread(
            drive_service.permissions().create(
                fileId=form_id,
                body={'type': 'anyone', 'role': 'reader'}, # Allows anyone to view and respond
                sendNotificationEmail=False
            ).execute
        )
        logger.info(f"Google Form '{form_title}' (ID: {form_id}) permissions set to public reader.")

        message = f"Google Form '{form_title}' created successfully. URL: {responder_uri}"
        if item_creation_error:
            message += f" Note on items: {item_creation_error}"

        return {"status": "success", "message": message, "url": responder_uri, "form_id": form_id}

    except Exception as e:
        import traceback
        logger.error(f"Error creating Google Form '{form_title}': {str(e)}\n{traceback.format_exc()}")
        return {"status": "error", "message": f"Failed to create Google Form: {str(e)}"}

# Run the server if this script is executed directly
if __name__ == "__main__":
    mcp.run()