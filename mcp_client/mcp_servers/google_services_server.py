import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
from fastmcp import FastMCP
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
from googleapiclient.http import MediaIoBaseUpload
import asyncio
import logging
from typing import List, Optional, Dict, Tuple, Any
from llm_adapters import (
    get_llm_adapter,
    StandardizedMessage,
    StandardizedLLMConfig,
    AttachmentPart
)
from email.mime.text import MIMEText

logging.basicConfig(stream=sys.stderr, level=logging.WARNING, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

mcp = FastMCP("Google Services Server")

GMAIL_SERVICE_ACCOUNT_FILE = os.path.join(os.path.dirname(__file__), '../../utils/google_service_account.json')
DELEGATED_ACCOUNT = 'jordan@ast.engineer'  # Changed from 'f@ast.engineer'
SCOPES = ["https://www.googleapis.com/auth/gmail.send"]

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
async def create_google_doc(
    doc_name: str,
    initial_content_prompt: Optional[str] = None,
    user_number: str = "+17145986105",
    attachments: Optional[list] = None,
    client_injected_context: str = "No additional context provided",
    model_for_content: str = "gemini-2.5-flash-preview-05-20"
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
    model_for_items: str = "gemini-2.5-flash-preview-05-20" # MODIFIED
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

# Tool implementations:
#   - create_google_doc
#   - create_google_form
#   - create_google_sheet
#   - send_google_service_email
#
# Any constants or prompts used by these tools (e.g., DOMAIN, etc.)
#
# Make sure to also include any required imports for Google APIs, etc.
#
# --- End of copy list ---

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