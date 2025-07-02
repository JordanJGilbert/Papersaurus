import base64
from io import BytesIO
import sys
from flask import Flask, request, jsonify, send_file, send_from_directory, redirect, Response, render_template, make_response, abort, stream_with_context
import os
import hashlib
import time
import json
import requests
import re
import uuid
from dotenv import load_dotenv
from routes.signal_bot import signal_bp, init_signal_bot
# Note: Using sync_read_data and sync_write_data defined in this file for Flask routes
from fast_card_cache import get_cache
import anthropic
import asyncio
import threading
import logging
import webbrowser
from pathlib import Path
import subprocess
import tempfile
import shutil
from weasyprint import HTML  # Add this import at the top of the file
import pygments
from pygments.lexers import PythonLexer
from pygments.formatters import HtmlFormatter
# PDF generation imports
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from PIL import Image
# Image processing imports for HEIC support
from PIL import Image
try:
    import pillow_heif
    # Enable HEIF support in Pillow
    pillow_heif.register_heif_opener()
    HEIC_SUPPORT_AVAILABLE = True
    print("HEIC support enabled via pillow-heif")
except ImportError as e:
    HEIC_SUPPORT_AVAILABLE = False
    print(f"HEIC support not available: {e}. HEIC files will be handled as regular files.")

# Gmail API imports for delegated email sending
try:
    from google.auth.transport.requests import Request
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    from email.mime.base import MIMEBase
    from email import encoders
    import mimetypes
    GMAIL_API_AVAILABLE = True
    print("Gmail API support enabled")
except ImportError as e:
    GMAIL_API_AVAILABLE = False
    print(f"Gmail API not available: {e}. Email functionality will be disabled.")
# Load environment variables
load_dotenv()

DOMAIN_FROM_ENV = os.getenv("DOMAIN") # Default if not set

# Attempt to import llm_adapter components, handling potential ImportError
try:
    from llm_adapters import get_llm_adapter, StandardizedMessage, AttachmentPart, StandardizedLLMConfig, StandardizedLLMResponse
    LLM_ADAPTERS_AVAILABLE = True
except ImportError as e: # Added "as e" and fixed the print statement
    LLM_ADAPTERS_AVAILABLE = False
    print(f"WARNING: llm_adapters module not found or import error: {e}. Some functionalities (e.g., /analyze_image_gemini) will be disabled.")
    # Define dummy classes if not available to prevent NameError at endpoint definition
    class StandardizedMessage: pass
    class AttachmentPart: pass
    class StandardizedLLMConfig: pass
    class StandardizedLLMResponse: pass # type: ignore
    def get_llm_adapter(model_name: str): return None


app = Flask(__name__)

# Context processor to inject DOMAIN into templates
@app.context_processor
def inject_domain():
    return dict(DOMAIN=DOMAIN_FROM_ENV)

# Register the signal blueprint
app.register_blueprint(signal_bp, url_prefix='/signal')

# Initialize signal bot when app starts
init_signal_bot()

# No need for MCP client initialization in the Flask app anymore
# since we're using a separate service

DATA_DIR = 'data'
CARDS_DIR = os.path.join(DATA_DIR, 'cards')

# Ensure directories exist
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(CARDS_DIR, exist_ok=True)
STATIC_DIR = 'static'

OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY')
GROQ_API_KEY = os.getenv('GROQ_API_KEY')
DEEPSEEK_API_KEY = os.getenv('DEEPSEEK_API_KEY')
MCP_INTERNAL_API_KEY = os.getenv('MCP_INTERNAL_API_KEY')

anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

def get_file_path(key):
    hash_value = hashlib.md5(key.encode()).hexdigest()
    dir_path = os.path.join(DATA_DIR, hash_value[:2], hash_value[2:4])
    os.makedirs(dir_path, exist_ok=True)
    return os.path.join(dir_path, hash_value)

def slugify(name):
    """Convert a name into a URL-friendly slug."""
    # Convert to lowercase and replace spaces with hyphens
    slug = name.lower().replace(' ', '-')
    # Remove any characters that aren't alphanumeric or hyphens
    slug = re.sub(r'[^a-z0-9-]', '', slug)
    # Remove multiple consecutive hyphens
    slug = re.sub(r'-+', '-', slug)
    # Remove leading and trailing hyphens
    slug = slug.strip('-')
    return slug

@app.route('/')
def root():
    return redirect('/chat')

@app.route('/warehouse')
def warehouse():
    return render_template("static_html/warehouse.html")

@app.route('/app-library')
def app_library():
    return render_template("static_html/app-library.html")

@app.route('/editor')
def editor():
    return render_template("static_html/editor.html")

@app.route('/register')
def register():
    return render_template("static_html/register.html")

@app.route('/nearby')
def nearby():       
    return render_template("static_html/nearby.html")

@app.route('/qr-test')
def qr_test():
    """QR Code generator test page"""
    return render_template("qr_test.html")

@app.route('/card-gallery')
def card_gallery():
    """Serve the card gallery page"""
    return render_template('card_gallery.html')

@app.route('/delete-cards')
def delete_cards_page():
    """Serve the card deletion management page"""
    return render_template('delete_cards.html')

@app.route('/chat')
def chatbot_ui():
    # Assuming chatbot.html is in the application root directory (same as app.py)
    # If chatbot.html also needs the DOMAIN variable and is a static HTML file,
    # it should also be moved to templates/static_html/ and served via render_template.
    # For now, leaving as is, but flagging for potential change.
    return send_from_directory(app.root_path, "chatbot.html")

@app.route('/bootstrap.html')
def bootstrap_page():
    return render_template("static_html/bootstrap.html")

@app.route('/query', methods=['POST'])
def mcp_query():
    """Proxy queries to the MCP service, handling streaming and non-streaming."""
    try:
        data = request.json
        if not data or 'query' not in data:
            return jsonify({"error": "Missing 'query' parameter"}), 400

        client_requests_stream = data.get('stream', False)
        mcp_request_data = data  # This contains 'query' and 'stream' flag for MCP service
        mcp_service_url = 'http://localhost:5001/query'

        if client_requests_stream:
            # Client wants a stream, so we expect NDJSON from MCP service
            mcp_response = requests.post(
                mcp_service_url,
                json=mcp_request_data,
                timeout=300,
                stream=True  # Critical: tells 'requests' to stream the response
            )
            mcp_response.raise_for_status()  # Check for HTTP 4xx/5xx errors

            def generate_proxy_stream():
                # Stream NDJSON lines from MCP service to client
                for line in mcp_response.iter_lines(chunk_size=1, decode_unicode=False):
                    if line:
                        yield line + b'\n'
            
            # MCP service already sends NDJSON. We pass it through with the correct mimetype.
            resp = Response(stream_with_context(generate_proxy_stream()), mimetype='application/x-ndjson', direct_passthrough=True)
            resp.headers['X-Accel-Buffering'] = 'no'  # Disable any nginx buffering just in case
            return resp

        else:
            # Client wants a single JSON response
            mcp_response = requests.post(
                mcp_service_url,
                json=mcp_request_data, # 'stream' will be false or absent
                timeout=300
                # No 'stream=True' for 'requests' here
            )
            mcp_response.raise_for_status()

            # MCP service should return a single JSON object in this case
            return jsonify(mcp_response.json())

    except requests.exceptions.HTTPError as http_err:
        error_detail = f"HTTP error communicating with MCP service: {str(http_err)}"
        try:
            if http_err.response is not None:
                mcp_error_content_type = http_err.response.headers.get("Content-Type", "")
                if "application/json" in mcp_error_content_type:
                    mcp_error_json = http_err.response.json()
                    if "error" in mcp_error_json:
                        error_detail = f"MCP Service Error: {mcp_error_json['error']}"
                    elif "detail" in mcp_error_json:
                        error_detail = f"MCP Service Detail: {mcp_error_json['detail']}"
                else:
                    error_detail = f"HTTP error {http_err.response.status_code} from MCP service: {http_err.response.text[:500]}"
        except ValueError: # If response on error is not JSON
            if http_err.response is not None:
                 error_detail = f"HTTP error {http_err.response.status_code} from MCP service (non-JSON response): {http_err.response.text[:500]}"
        return jsonify({"error": error_detail}), http_err.response.status_code if http_err.response is not None else 500
    except requests.exceptions.RequestException as e:
        # Catches other network errors, or if mcp_response.json() fails for non-streaming
        return jsonify({"error": f"Error communicating with MCP service: {str(e)}"}), 500
    except json.JSONDecodeError as e: # Should be caught by RequestException if from response.json()
        # Fallback for non-streaming case if MCP service sends bad JSON
        return jsonify({"error": f"Invalid JSON response from MCP service (non-streaming): {str(e)}"}), 500

@app.route('/upload', methods=['POST'])
def upload_file():
    """Handle file uploads and return URLs"""
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        # Generate a unique key for the file
        timestamp = time.time()
        file_key = f"upload-{hashlib.md5(f'{file.filename}-{timestamp}'.encode()).hexdigest()}"
        
        # Read file content
        file_content = file.read()
        
        # Determine MIME type
        mime_type = file.content_type
        filename = file.filename
        
        # Check if this is a HEIC file and convert to JPEG if needed
        is_heic = False
        force_server_conversion = request.form.get('convert_heic') == 'true'
        
        if (filename.lower().endswith(('.heic', '.heif')) or 
            mime_type in ['image/heic', 'image/heif'] or 
            force_server_conversion):
            
            if not HEIC_SUPPORT_AVAILABLE:
                if force_server_conversion:
                    print(f"Frontend requested server-side HEIC conversion for {filename}, but HEIC support not available. Uploading as-is.")
                else:
                    print(f"HEIC file detected ({filename}) but HEIC support not available. Uploading as-is.")
                # Continue with original file without conversion
            else:
                try:
                    if force_server_conversion:
                        print(f"Frontend requested server-side HEIC conversion for: {filename}")
                    else:
                        print(f"Detected HEIC file: {filename}, converting to JPEG...")
                    
                    # Open HEIC image with Pillow
                    img = Image.open(BytesIO(file_content))
                    
                    # Convert to RGB if necessary (HEIC might be in other color modes)
                    if img.mode != 'RGB':
                        img = img.convert('RGB')
                    
                    # Save as JPEG to BytesIO
                    jpeg_buffer = BytesIO()
                    img.save(jpeg_buffer, format='JPEG', quality=85, optimize=True)
                    jpeg_buffer.seek(0)
                    
                    # Update file content and metadata
                    file_content = jpeg_buffer.getvalue()
                    mime_type = 'image/jpeg'
                    
                    # Update filename extension
                    base_name = os.path.splitext(filename)[0]
                    filename = f"{base_name}.jpg"
                    
                    is_heic = True
                    print(f"Successfully converted HEIC to JPEG: {filename}")
                    
                except Exception as conv_error:
                    print(f"Error converting HEIC file {filename}: {str(conv_error)}")
                    # Fall back to original file if conversion fails
                    pass
        
        # If mime_type is still not determined, try to guess from filename
        if not mime_type:
            import mimetypes
            mime_type, _ = mimetypes.guess_type(filename)
            if not mime_type:
                mime_type = 'application/octet-stream'
        
        # Encode as base64
        file_base64 = base64.b64encode(file_content).decode('utf-8')
        
        # Create data URI format for storage
        data_uri = f"data:{mime_type};base64,{file_base64}"
        
        # Store the file data
        file_data = {
            'key': file_key,
            'value': data_uri,
            'filename': filename,
            'original_filename': file.filename,  # Keep track of original name
            'mime_type': mime_type,
            'size': len(file_content),
            'converted_from_heic': is_heic,  # Flag to indicate conversion
            'write_timestamp': timestamp,
            'read_timestamp': None,
            'read_count': 0
        }
        
        # Save the file data
        file_path = get_file_path(file_key)
        with open(file_path, 'w') as f:
            json.dump(file_data, f)
        
        # Generate URL for accessing the file
        if mime_type.startswith('image/') or mime_type.startswith('video/'):
            file_url = f"{DOMAIN_FROM_ENV}/serve_image?key={file_key}"
        else:
            file_url = f"{DOMAIN_FROM_ENV}/serve?key={file_key}"
        
        response_data = {
            "url": file_url,
            "key": file_key,
            "filename": filename,
            "mime_type": mime_type,
            "size": len(file_content)
        }
        
        # Add conversion info if applicable
        if is_heic:
            response_data["converted_from_heic"] = True
            response_data["original_filename"] = file.filename
        
        # If this is a logo image, save it to the logo library
        if mime_type.startswith('image/') and request.form.get('save_as_logo') == 'true':
            try:
                logo_library_key = f"logo_library_{file_key}"
                logo_data = {
                    'file_key': file_key,
                    'filename': filename,
                    'original_filename': file.filename,
                    'url': file_url,
                    'mime_type': mime_type,
                    'size': len(file_content),
                    'uploaded_at': timestamp,
                    'is_logo': True
                }
                
                # Save to logo library
                logo_path = get_file_path(logo_library_key)
                with open(logo_path, 'w') as f:
                    json.dump({
                        'key': logo_library_key,
                        'value': logo_data,
                        'write_timestamp': timestamp,
                        'read_timestamp': None,
                        'read_count': 0
                    }, f)
                
                response_data["saved_as_logo"] = True
                response_data["logo_id"] = logo_library_key
                
            except Exception as logo_error:
                print(f"Error saving logo to library: {logo_error}")
                response_data["logo_save_error"] = str(logo_error)
        
        return jsonify(response_data), 200
        
    except Exception as e:
        print(f"Error uploading file: {str(e)}")
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500

@app.route('/generate_thumbnail', methods=['POST'])
def generate_thumbnail():
    """Generate optimized thumbnail version of card images"""
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        image_url = data.get('image_url')
        if not image_url:
            return jsonify({"error": "Missing 'image_url' parameter"}), 400
        
        # Default thumbnail dimensions (maintain 2:3 aspect ratio for cards)
        thumb_width = data.get('width', 400)
        thumb_height = data.get('height', 600)
        quality = data.get('quality', 85)
        
        # Download the original image
        try:
            response = requests.get(image_url, timeout=30)
            response.raise_for_status()
            img_data = response.content
        except Exception as e:
            return jsonify({"error": f"Failed to download image: {str(e)}"}), 400
        
        # Process the image
        try:
            img = Image.open(BytesIO(img_data))
            
            # Resize while maintaining aspect ratio
            img.thumbnail((thumb_width, thumb_height), Image.Resampling.LANCZOS)
            
            # Convert to RGB if necessary (for WebP support)
            if img.mode in ('RGBA', 'LA', 'P'):
                img = img.convert('RGB')
            
            # Save as WebP for better compression
            output = BytesIO()
            img.save(output, format='WebP', quality=quality, optimize=True)
            output.seek(0)
            
            # Generate unique key for thumbnail
            thumb_key = f"thumb_{hashlib.md5(f'{image_url}_{thumb_width}x{thumb_height}_{quality}'.encode()).hexdigest()}"
            
            # Store thumbnail data
            thumb_data = {
                'content_type': 'image/webp',
                'data': base64.b64encode(output.getvalue()).decode('utf-8'),
                'original_url': image_url,
                'dimensions': f"{thumb_width}x{thumb_height}",
                'quality': quality,
                'created_timestamp': time.time(),
                'read_count': 0
            }
            
            file_path = get_file_path(thumb_key)
            with open(file_path, 'w') as f:
                json.dump(thumb_data, f)
            
            # Return the thumbnail URL
            thumbnail_url = f"/file/{thumb_key}"
            return jsonify({
                "thumbnail_url": thumbnail_url,
                "original_url": image_url,
                "dimensions": f"{img.width}x{img.height}",
                "file_size_kb": round(len(output.getvalue()) / 1024, 2)
            })
            
        except Exception as e:
            return jsonify({"error": f"Failed to process image: {str(e)}"}), 500
            
    except Exception as e:
        print(f"Error generating thumbnail: {str(e)}")
        return jsonify({"error": f"Thumbnail generation failed: {str(e)}"}), 500

@app.route('/mcp/status', methods=['GET'])
def mcp_status():
    """Proxy status requests to the MCP service"""
    try:
        # Forward the request to the MCP service
        response = requests.get('http://localhost:5001/status', timeout=10)
        response.raise_for_status()
        return jsonify(response.json())
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Error communicating with MCP service: {str(e)}"}), 500

@app.route('/internal/call_mcp_tool', methods=['POST'])
def call_mcp_tool():
    """Proxy internal MCP tool calls to the MCP service"""
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        # Validate required fields
        if 'tool_name' not in data:
            return jsonify({"error": "Missing 'tool_name' parameter"}), 400
        if 'arguments' not in data:
            return jsonify({"error": "Missing 'arguments' parameter"}), 400
        
        # Check if we have the internal API key
        if not MCP_INTERNAL_API_KEY:
            return jsonify({"error": "MCP_INTERNAL_API_KEY not configured"}), 500
        
        # Prepare headers for the internal call
        headers = {
            'Content-Type': 'application/json',
            'X-Internal-API-Key': MCP_INTERNAL_API_KEY
        }
        
        # Forward the request to the MCP service's internal endpoint
        mcp_response = requests.post(
            'http://localhost:5001/internal/call_mcp_tool',
            json=data,
            headers=headers,
            timeout=300
        )
        mcp_response.raise_for_status()
        
        # Return the response from the MCP service
        return jsonify(mcp_response.json())
        
    except requests.exceptions.HTTPError as http_err:
        error_detail = f"HTTP error calling MCP tool: {str(http_err)}"
        try:
            if http_err.response is not None:
                mcp_error_content_type = http_err.response.headers.get("Content-Type", "")
                if "application/json" in mcp_error_content_type:
                    mcp_error_json = http_err.response.json()
                    if "error" in mcp_error_json:
                        error_detail = f"MCP Tool Error: {mcp_error_json['error']}"
                    elif "detail" in mcp_error_json:
                        error_detail = f"MCP Tool Detail: {mcp_error_json['detail']}"
                else:
                    error_detail = f"HTTP error {http_err.response.status_code} from MCP service: {http_err.response.text[:500]}"
        except ValueError:
            if http_err.response is not None:
                error_detail = f"HTTP error {http_err.response.status_code} from MCP service (non-JSON response): {http_err.response.text[:500]}"
        return jsonify({"error": error_detail}), http_err.response.status_code if http_err.response is not None else 500
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Error communicating with MCP service: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500

@app.route('/write', methods=['POST'])
def write():
    key = request.json.get('key')
    print('key: ' + key)
    value = request.json.get('value')
    app_name = request.json.get('app_name')
    
    timestamp = time.time()
    data = {
        'key': key,
        'value': value,
        'write_timestamp': timestamp,
        'read_timestamp': None,
        'read_count': 0
    }
    
    # Save the main data
    file_path = get_file_path(key)
    with open(file_path, 'w') as f:
        json.dump(data, f)
    
    # If an app name is provided, create a mapping
    if app_name:
        slug = slugify(app_name)
        mapping_data = {
            'app_name': app_name,
            'slug': slug,
            'key': key
        }
        mapping_path = get_file_path(f'mapping-{slug}')
        with open(mapping_path, 'w') as f:
            json.dump(mapping_data, f)
    
    return jsonify({
        'status': 'success',
        'key': key,
        'slug': slug if app_name else None
    }), 200

@app.route('/read', methods=['GET'])
def read():
    key = request.args.get('key')
    file_path = get_file_path(key)
    if not os.path.exists(file_path):
        return jsonify({'error': 'Key not found'}), 404
        
    with open(file_path, 'r+') as f:
        data = json.load(f)
        
        # Initialize missing fields if they don't exist
        if 'read_count' not in data:
            data['read_count'] = 0
        if 'read_timestamp' not in data:
            data['read_timestamp'] = None
            
        data['read_timestamp'] = time.time()
        data['read_count'] += 1
        
        # Write back the updated data
        f.seek(0)
        json.dump(data, f)
        f.truncate()
        
    return jsonify({
        'key': key,
        'value': data.get('value', data),  # If 'value' doesn't exist, return the whole data
        'write_timestamp': data.get('write_timestamp'),
        'read_timestamp': data['read_timestamp'],
        'read_count': data['read_count']
    }), 200

@app.route('/search', methods=['GET'])
def search():
    query = request.args.get('query')
    results = []
    for root, dirs, files in os.walk(DATA_DIR):
        for file in files:
            file_path = os.path.join(root, file)
            with open(file_path, 'r') as f:
                data = json.load(f)
                if 'key' in data:
                    if query.lower() in data['key'].lower():
                        results.append({
                            'key': data['key'],
                            'write_timestamp': data['write_timestamp'],
                            'read_count': data['read_count']
                        })
    return jsonify(results), 200



@app.route('/serve', methods=['GET'])
def serve():
    key = request.args.get('key')
    print('serve key: ' + key)

    file_path = get_file_path(key)
    if not os.path.exists(file_path):
        return jsonify({'error': 'Key not found'}), 404
        
    with open(file_path, 'r') as f:
        data = json.load(f)
    
    # If this is an app, return the HTML content directly
    if key.startswith('app-'):
        return data['value']['html'], 200, {'Content-Type': 'text/html'}
    
    # If this is a PDF request (old style), generate and return the PDF
    if key.startswith('pdf-'):
        html_content = data['value']['html']
        filename = data['value'].get('filename', 'document.pdf')
        
        # Generate PDF using WeasyPrint
        pdf_data = HTML(string=html_content).write_pdf()
        
        # Return the PDF with appropriate headers
        response = make_response(pdf_data)
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = f'inline; filename="{filename}.pdf"'
        return response
    
    # If this is a card PDF (new style), serve the stored PDF data
    if key.startswith('card-pdf-') and data.get('mime_type') == 'application/pdf':
        value = data['value']
        filename = data.get('filename', 'document.pdf')
        
        # Handle data URI format
        if value.startswith('data:application/pdf;base64,'):
            # Extract base64 data
            pdf_base64 = value.split(',')[1]
            pdf_data = base64.b64decode(pdf_base64)
        else:
            # Assume it's raw base64
            pdf_data = base64.b64decode(value)
        
        # Update read statistics
        data['read_timestamp'] = time.time()
        data['read_count'] += 1
        
        with open(file_path, 'w') as f:
            json.dump(data, f)
        
        # Return the PDF with appropriate headers
        response = make_response(pdf_data)
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = f'inline; filename="{filename}"'
        return response
        
    # Otherwise return the value field as before
    return data['value'], 200, {'Content-Type': 'text/html'}

@app.route('/serve_image', methods=['GET'])
def serve_image():
    key = request.args.get('key')
    # New parameter for explicit image or video type
    explicit_type = request.args.get('type')
    print('serve media key: ' + key)
    
    file_path = get_file_path(key)
    if not os.path.exists(file_path):
        return jsonify({'error': 'Key not found'}), 404
        
    with open(file_path, 'r') as f:
        data = json.load(f)
    
    value = data['value']
    
    # Check if value is a string (should be for all cases)
    if not isinstance(value, str):
        return jsonify({'error': 'Content is not an image or video'}), 400
    
    # Video content types to support
    video_types = [
        'video/mp4',
        'video/mpeg',
        'video/mov',
        'video/avi',
        'video/x-flv',
        'video/mpg',
        'video/webm',
        'video/wmv',
        'video/3gpp'
    ]
    
    # NEW: Priority 1 - Use stored MIME type from file data if available
    if 'mime_type' in data and data['mime_type'] and data['mime_type'] != 'application/octet-stream':
        content_type = data['mime_type']
        print(f"Using stored MIME type: {content_type}")
        # If data URI format, extract just the base64 part
        if value.startswith('data:'):
            try:
                base64_data = value.split(',')[1]
            except Exception as e:
                print(f"Error parsing data URI: {e}")
                return jsonify({'error': 'Invalid data URI format'}), 400
        else:
            base64_data = value
    
    # Priority 2: Explicit type provided by user
    elif explicit_type and (explicit_type.startswith('image/') or explicit_type in video_types):
        content_type = explicit_type
        # If data URI format, extract just the base64 part
        if value.startswith('data:'):
            try:
                base64_data = value.split(',')[1]
            except Exception as e:
                print(f"Error parsing data URI: {e}")
                return jsonify({'error': 'Invalid data URI format'}), 400
        else:
            base64_data = value
    
    # Priority 3: Value has data URI prefix for image or video
    elif value.startswith('data:image/') or any(value.startswith(f'data:{vtype}') for vtype in video_types):
        try:
            # Format is typically: data:image/jpeg;base64,/9j/4AAQSkZJRg...
            # or data:video/mp4;base64,...
            content_type = value.split(';')[0].split(':')[1]
            base64_data = value.split(',')[1]
        except Exception as e:
            print(f"Error parsing data URI: {e}")
            return jsonify({'error': 'Invalid data URI format'}), 400
    
    # Priority 4: Raw base64 data without prefix - attempt detection
    else:
        # Attempt to detect media type from the base64 data
        content_type = detect_media_type(value)
        base64_data = value
        
        # If we couldn't determine a proper image/video type, reject the request
        if content_type == 'application/octet-stream':
            return jsonify({'error': 'Unable to determine media type or not an image/video'}), 400
    
    try:
        # Validate that we have a proper image/video content type
        if not (content_type.startswith('image/') or content_type in video_types):
            print(f"Invalid content type for serve_image: {content_type}")
            return jsonify({'error': f'Invalid content type: {content_type}. Expected image/* or video/*'}), 400
        
        # Decode the base64 data
        media_data = base64.b64decode(base64_data)
        
        # Create a BytesIO object from the decoded data
        media_io = BytesIO(media_data)
        
        # Update read statistics
        data['read_timestamp'] = time.time()
        data['read_count'] += 1
        
        with open(file_path, 'w') as f:
            json.dump(data, f)
            
        print(f"Serving media with Content-Type: {content_type}")
        # Return the image or video with the appropriate content type
        return send_file(media_io, mimetype=content_type)
    except Exception as e:
        print(f"Error serving media: {e}")
        return jsonify({'error': f'Failed to process media: {str(e)}'}), 500

def detect_media_type(base64_data):
    try:
        # Decode a small portion of the base64 data
        media_data = base64.b64decode(base64_data[:32])
        
        # Check file signatures (magic bytes)
        # Image formats
        if media_data.startswith(b'\xff\xd8\xff'):
            return 'image/jpeg'
        elif media_data.startswith(b'\x89PNG\r\n\x1a\n'):
            return 'image/png'
        elif media_data.startswith(b'GIF87a') or media_data.startswith(b'GIF89a'):
            return 'image/gif'
        elif media_data.startswith(b'RIFF') and media_data[8:12] == b'WEBP':
            return 'image/webp'
        elif media_data.startswith(b'<svg') or media_data.startswith(b'<?xml'):
            return 'image/svg+xml'
        
        # Video formats
        # MP4 signature
        elif media_data[4:8] in (b'ftyp', b'moov'):
            return 'video/mp4'
        # WebM signature
        elif media_data.startswith(b'\x1a\x45\xdf\xa3'):
            return 'video/webm'
        # AVI signature
        elif media_data.startswith(b'RIFF') and media_data[8:12] == b'AVI ':
            return 'video/avi'
        # MPEG signature
        elif media_data.startswith(b'\x00\x00\x01\xba') or media_data.startswith(b'\x00\x00\x01\xb3'):
            return 'video/mpeg'
        # FLV signature
        elif media_data.startswith(b'FLV\x01'):
            return 'video/x-flv'
        # 3GPP signature
        elif media_data[4:8] == b'ftyp' and media_data[8:11] in (b'3gp', b'3g2'):
            return 'video/3gpp'
        
        return 'application/octet-stream'  # Default fallback
    except:
        return 'application/octet-stream'

@app.route('/app/<app_name>')
def serve_by_name(app_name):
    """Serve an app by its friendly name."""
    # Convert the app name to a slug for consistency
    slug = slugify(app_name)
    
    # Try to find the mapping file
    mapping_path = get_file_path(f'mapping-{slug}')
    if not os.path.exists(mapping_path):
        return jsonify({'error': 'App not found'}), 404
    
    # Load the mapping to get the original key
    with open(mapping_path, 'r') as f:
        mapping = json.load(f)
    # Get the app metadata using the key from the mapping
    metadata_path = get_file_path(mapping['key'])
    if not os.path.exists(metadata_path):
        return jsonify({'error': 'App data not found'}), 404
    
    # Load the app metadata
    with open(metadata_path, 'r') as f:
        metadata = json.load(f)
    # Get the current code block
    code_block_path = get_file_path(metadata['value']['current_code'])
    if not os.path.exists(code_block_path):
        return jsonify({'error': 'Code block not found'}), 404
        
    # Load the actual code content
    with open(code_block_path, 'r') as f:
        code_data = json.load(f)
        
    # Update read stats for the metadata
    metadata['read_timestamp'] = time.time()
    metadata['read_count'] += 1
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f)
    
    # Return the actual code content
    return code_data['value'], 200, {'Content-Type': 'text/html'}

@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory(STATIC_DIR, filename)

@app.route('/store_prompt', methods=['POST'])
def store_prompt():
    try:
        data = request.json
        alias = data['alias']
        prompt_text = data['prompt']
        model = data['model']
        description = data.get('description', '')
        
        current_time = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        
        # Get existing metadata if it exists
        meta_path = get_file_path(f'prompt:meta:{alias}')
        if os.path.exists(meta_path):
            with open(meta_path, 'r') as f:
                existing_meta = json.load(f)
                current_version = int(existing_meta['current_version'].replace('v', ''))
                version_count = existing_meta.get('version_count', current_version)
                new_version = f'v{version_count + 1}'
                version_count += 1
        else:
            new_version = 'v1'
            version_count = 1

        # Store version data
        version_data = {
            "version": new_version,
            "prompt_text": prompt_text,
            "model": model,
            "created_at": current_time,
            "parameters": extract_parameters(prompt_text)
        }
        
        version_path = get_file_path(f'prompt:version:{alias}:{new_version}')
        with open(version_path, 'w') as f:
            json.dump(version_data, f)

        # Update metadata with version counter
        meta_data = {
            "alias": alias,
            "current_version": new_version,
            "version_count": version_count,  # Store total version count
            "created_at": current_time if new_version == 'v1' else existing_meta.get('created_at'),
            "updated_at": current_time,
            "description": description,
            "tags": data.get('tags', []),
            "model": model,
            "use_count": 0 if new_version == 'v1' else existing_meta.get('use_count', 0)
        }
        
        with open(meta_path, 'w') as f:
            json.dump(meta_data, f)

        # Update the prompt index
        index_path = get_file_path('prompt:index')
        if os.path.exists(index_path):
            with open(index_path, 'r') as f:
                index_data = json.load(f)
        else:
            index_data = {"aliases": []}
            
        # Add the alias if it's not already in the index
        if alias not in index_data['aliases']:
            index_data['aliases'].append(alias)
            index_data['aliases'].sort()  # Keep aliases sorted alphabetically
            
        with open(index_path, 'w') as f:
            json.dump(index_data, f)

        return jsonify({
            "status": "success",
            "alias": alias,
            "version": new_version
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

def extract_parameters(prompt_text):
    """Extract parameters from prompt template."""
    params = {}
    for param in re.findall(r'\[\[(\w+)\]\]', prompt_text):
        params[param] = {
            "type": "string",
            "description": f"Parameter: {param}",
            "required": True
        }
    return params

def extract_json_from_backticks(text):
    """
    Extract JSON content from triple backticks and language identifier.
    Returns the extracted JSON text or None if no valid format is found.
    """
    if not text:
        return None
        
    # Match ```json\n{...}``` pattern
    pattern = r'```json\n([\s\S]*?)```'
    match = re.search(pattern, text)
    
    if match:
        return match.group(1).strip()
    return None

def detect_json(text):
    """
    Attempt to parse text as JSON with comprehensive fixes.
    Returns tuple (parsed_json, error_message).
    """
    if not text:
        return None, "Input text is empty"
    
    # First try to extract JSON from backticks if present
    extracted_text = extract_json_from_backticks(text)
    if extracted_text:
        text = extracted_text
    
    try:
        # Try parsing as-is
        return json.loads(text), None
    except json.JSONDecodeError:
        # If that fails, try fixing the JSON
        try:
            fixed_text = fix_json(text)
            parsed = json.loads(fixed_text)
            return parsed, None
        except json.JSONDecodeError as e:
            # Get error position
            pos = e.pos
            
            # Extract context around the error (20 chars before and after)
            start = max(0, pos - 20)
            end = min(len(fixed_text), pos + 20)
            
            # Get the problematic character
            error_char = fixed_text[pos] if pos < len(fixed_text) else 'EOF'
            
            # Create context string with error character highlighted
            context = (
                fixed_text[start:pos] + 
                f"->{error_char}<-" + 
                fixed_text[pos+1:end]
            )
            
            error_message = (
                f"JSON Error: {str(e)}\n"
                f"Position: {pos}\n"
                f"Context: '{context}'\n"
                f"Original text: {text[:100]}..." if len(text) > 100 else text
            )
            return None, error_message

def fix_json(text):
    """
    Fix common JSON formatting issues and prepare text for parsing.
    """
    if not text:
        return text
        
    # Remove leading/trailing whitespace
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL) 
    text = text.strip()
    
    # Remove leading non-JSON characters (like ! or other prefixes before {)
    if text and not text.startswith('{'):
        # Find the first { character
        start_idx = text.find('{')
        if start_idx > 0:
            text = text[start_idx:]
    
    # First try to extract JSON from backticks if present
    extracted_text = extract_json_from_backticks(text)
    
    # Fix fields with backticks for any field, not just html
    pattern = r'("[\w_]+"\s*:\s*)`(.*?)`(\s*[,}])'
    def replace_backticks(match):
        field_name = match.group(1)
        content = match.group(2)
        suffix = match.group(3)
        # Escape backslashes, quotes, and newlines for valid JSON
        content = content.replace('\\', '\\\\')
        content = content.replace('"', '\\"')
        content = content.replace('\n', '\\n')
        return f'{field_name}"{content}"{suffix}'
    
    # Apply backtick fixes
    text = re.sub(pattern, replace_backticks, text, flags=re.DOTALL)
    
    # Fix missing quotes around property names
    text = re.sub(r'(\{|\,)\s*([a-zA-Z_]\w*)\s*:', r'\1"\2":', text)
    
    # Fix trailing commas in arrays and objects
    text = re.sub(r',(\s*[\]}])', r'\1', text)
    
    # Fix missing quotes around string values
    text = re.sub(r':\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*([,}])', r':"\1"\2', text)
    
    return text

@app.route('/run_prompt', methods=['POST'])
def run_prompt():
    try:
        alias = request.json.get('alias')
        params = request.json.get('params', {})
        stream = request.json.get('stream', False)
        image_data = params.get('image', None)
        raw = request.json.get('raw', False)
        
        def execute_prompt(prompt_alias, prompt_params):
             # Generate a cache key based on prompt alias and parameters
            cache_key = f"{prompt_alias}-{json.dumps(prompt_params, sort_keys=True)}"
            
            # Check cache first
            cached_result = get_from_cache(cache_key)
            if cached_result:
                # Update use count even for cached results
                meta_path = get_file_path(f'prompt:meta:{prompt_alias}')
                if os.path.exists(meta_path):
                    with open(meta_path, 'r+') as f:
                        meta_data = json.load(f)
                        meta_data['use_count'] += 1
                        f.seek(0)
                        json.dump(meta_data, f)
                        f.truncate()
                return cached_result
            print(prompt_alias)
            meta_path = get_file_path(f'prompt:meta:{prompt_alias}')
            if not os.path.exists(meta_path):
                raise Exception(f'Prompt not found: {prompt_alias}')

            with open(meta_path, 'r') as f:
                meta_data = json.load(f)
                        
            # Load current version
            version_path = get_file_path(f'prompt:version:{prompt_alias}:{meta_data["current_version"]}')
            with open(version_path, 'r') as f:
                version_data = json.load(f)

            # Validate parameters
            for param_name, param_info in version_data['parameters'].items():
                if param_info['required'] and param_name not in prompt_params:
                    raise Exception(f'Missing required parameter for {prompt_alias}: {param_name}')

            # Replace parameters in prompt
            prompt = version_data['prompt_text']
            for key, value in prompt_params.items():
                prompt = prompt.replace(f'[[{key}]]', str(value)) 

            # Make API call based on model
            model = version_data['model']
            
            if image_data:
                converted_image = convert_to_supported_format(image_data)
                client = OpenAI(api_key=OPENAI_API_KEY)
                response = client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": params.get("prompt", "What's in this image?"),
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {"url": f"data:image/jpeg;base64,{converted_image}"},
                                },
                            ],
                        }
                    ],
                )
                content = response.choices[0].message.content
                return content

            elif model == 'dall-e-3':
                size = prompt_params.get('size', '1024x1024')
                quality = prompt_params.get('quality', 'standard')
                style = prompt_params.get('style', 'vivid')
                
                content, was_cached = generate_image(prompt, size, quality, style)
                content = json.dumps(content)  # Convert to string for consistency with other responses

                if not was_cached:
                    # Only update use count if we actually made an API call
                    meta_data['use_count'] += 1
                    with open(meta_path, 'w') as f:
                        json.dump(meta_data, f)
            
            elif model == "deepseek-r1":
                client = Groq(
                    api_key=GROQ_API_KEY,
                )

                chat_completion = client.chat.completions.create(
                    messages=[
                        {
                            "role": "user",
                            "content": prompt,
                        }
                    ],
                    model="deepseek-r1-distill-llama-70b",
                )

                content = chat_completion.choices[0].message.content
                return content

        
            elif not model.startswith('claude'):
                api_url = 'https://api.openai.com/v1/chat/completions'
                headers = {
                    'Authorization': f'Bearer {OPENAI_API_KEY}',
                    'Content-Type': 'application/json'
                }
                
                
                data = {
                    'model': model,
                    'messages': [
                    {
                        'role': 'user', 
                        'content': prompt
                    }
                    ], 
                    'stream': stream
                }

                if model in ['o3-mini-low', 'o3-mini-medium', 'o3-mini-high']:
                    if model == 'o3-mini-low':
                        data['reasoning_effort'] = 'low'
                    elif model == 'o3-mini-medium':
                        data['reasoning_effort'] = 'medium'
                    else:
                        data['reasoning_effort'] = 'high'
                    data['model'] = 'o3-mini'
                
                response = requests.post(api_url, headers=headers, json=data)
                response.raise_for_status()
                
                if stream:  
                    return response
                else:
                    response_data = response.json()
                    content = response_data['choices'][0]['message']['content']
                
            elif model.startswith('claude'):
                if stream:
                    # NEW: capture whether the client wants to filter only the HTML portion
                    capture_html = request.json.get('html', False)

                    def generate():
                        try:
                            # We'll keep a buffer of accumulated text to search for <!DOCTYPE html> and </html>
                            buffer = ""
                            # If capture_html=False, we always yield everything immediately.
                            # If capture_html=True, we wait until we see <!DOCTYPE html> before yielding anything,
                            # and we stop at </html>.
                            found_doctype = False

                            with anthropic_client.messages.stream(
                                max_tokens=8192,
                                messages=[{'role': 'user', 'content': prompt}],
                                model='claude-3-7-sonnet-latest'
                            ) as claude_stream:
                                for text_chunk in claude_stream.text_stream:
                                    buffer += text_chunk

                                    if capture_html:
                                        # 1) Haven't found <!DOCTYPE html> yet?
                                        if not found_doctype:
                                            doctype_index = buffer.find("<!DOCTYPE html>")
                                            if doctype_index != -1:
                                                # Discard everything before <!DOCTYPE html>, and keep everything after
                                                buffer = buffer[doctype_index:]
                                                found_doctype = True

                                        # 2) If we are in the HTML portion, look for </html>
                                        if found_doctype:
                                            end_index = buffer.find("</html>")
                                            if end_index != -1:
                                                # We found </html>. Yield everything up to </html>
                                                html_chunk = buffer[: end_index + len("</html>")]
                                                yield sse_format(html_chunk)
                                                # Then STOP streaming
                                                break
                                            else:
                                                # No closing tag yet; yield everything in buffer and keep going.
                                                yield sse_format(buffer)
                                                buffer = ""
                                    else:
                                        # If capture_html=False, just yield everything as it arrives
                                        yield sse_format(text_chunk)

                            # After the loop, if capture_html is True but we never found </html>,
                            # you might want to yield any trailing content or do nothing. 
                            # Below yields leftover content only if we already found <!DOCTYPE html>
                            if capture_html and found_doctype and buffer:
                                # check if leftover buffer accidentally includes `</html>`
                                if "</html>" not in buffer:
                                    yield sse_format(buffer)

                            # Finally, send the message_stop SSE event
                            yield 'data: {"type": "message_stop"}\n\n'

                        except Exception as e:
                            print(f"Error in stream generation: {str(e)}")
                            # You can yield an error SSE or just raise
                            raise

                    # Return a streaming response
                    return Response(
                        generate(),
                        content_type='text/event-stream',
                        headers={
                            'Cache-Control': 'no-cache',
                            'X-Accel-Buffering': 'no'
                        }
                    )
                else:
                    # Use SDK for non-streaming case too for consistency
                    message = anthropic_client.messages.create(
                        max_tokens=8192,
                        messages=[{'role': 'user', 'content': prompt}],
                        model='claude-3-7-sonnet-latest'
                    )
                    
                    if isinstance(message.content, list):
                        content = ' '.join(
                            block.text for block in message.content
                            if block.type == 'text'
                        )
                    else:
                        content = message.content
                    
                    return content

            # Update use count
            meta_data['use_count'] += 1
            with open(meta_path, 'w') as f:
                json.dump(meta_data, f)
            return content

        # Execute the main prompt
        final_content = execute_prompt(alias, params)

        if isinstance(final_content, Response):
            return final_content
        
        if raw:
            cache_key = f"{alias}-{json.dumps(params, sort_keys=True)}"
            add_to_cache(cache_key, final_content)

            # Return the raw content string
            return final_content, 200, {'Content-Type': 'text/plain'}
        
        # For non-streaming responses, try to parse JSON
        json_content, json_error = detect_json(final_content)

        if json_error:
            return jsonify({
                "status": "error",
                "code": "INVALID_JSON",
                "message": "Invalid JSON in response",
                "details": str(json_error)
            }), 422  # Unprocessable Entity

        # If we got valid JSON, cache and return the result
        cache_key = f"{alias}-{json.dumps(params, sort_keys=True)}"
        add_to_cache(cache_key, final_content)

        return jsonify(json_content), 200
 

    except ValueError as e:
        # Handle validation errors (missing parameters, prompt not found)
        return jsonify({
            "status": "error",
            "code": "VALIDATION_ERROR",
            "message": str(e)
        }), 400

    except requests.exceptions.RequestException as e:
        # Handle API request errors
        return jsonify({
            "status": "error",
            "code": "API_ERROR",
            "message": "Error calling external API",
            "details": str(e)
        }), 502  # Bad Gateway

    except Exception as e:
        # Handle unexpected errors
        return jsonify({
            "status": "error",
            "code": "INTERNAL_ERROR",
            "message": "Internal server error",
            "details": str(e)
        }), 500

def sse_format(chunk_text: str) -> str:
    """
    Convert a chunk of text into an SSE JSON block.
    """
    payload = {
        "type": "content_block_delta",
        "delta": {
            "type": "text_delta",
            "text": chunk_text
        }
    }
    # Return the SSE line with a blank line after for SSE compliance
    return f"data: {json.dumps(payload)}\n\n"

def convert_to_supported_format(image_base64):
    """
    Convert an image to a supported format (JPEG) for OpenAI API.
    
    Args:
        image_base64 (str): Base64 encoded image string
    
    Returns:
        str: Base64 encoded JPEG image string
    """
    try:
        # Decode base64 string to bytes
        image_data = base64.b64decode(image_base64)
        
        # Create PIL Image object from bytes
        image = Image.open(io.BytesIO(image_data))
        
        # Convert image to RGB mode if it's not already
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Create a new bytes buffer
        buffer = io.BytesIO()
        
        # Save as JPEG to the buffer
        image.save(buffer, format='JPEG', quality=95)
        
        # Get bytes from buffer and encode to base64
        converted_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        return converted_base64
    except Exception as e:
        raise Exception(f"Error converting image: {str(e)}")

def generate_image(prompt, size='1024x1024', quality='standard', style='vivid'):
    """Helper function to generate images with caching"""
    # Generate cache key based on input parameters
    cache_key = f"image-{hashlib.sha256(prompt.encode()).hexdigest()}-{size}-{quality}-{style}"
    
    # Check cache first
    cached_result = get_from_cache(cache_key)
    if cached_result:
        return cached_result, True

    api_url = 'https://api.openai.com/v1/images/generations'
    headers = {
        'Authorization': f'Bearer {OPENAI_API_KEY}',
        'Content-Type': 'application/json'
    }
    
    payload = {
        'model': 'dall-e-3',
        'prompt': prompt,
        'n': 1,
        'size': size,
        'quality': quality,
        'style': style,
        'response_format': 'b64_json'
    }

    response = requests.post(api_url, headers=headers, json=payload)
    response.raise_for_status()
    response_data = response.json()

    result = {
        'type': 'image',
        'format': 'base64',
        'data': response_data['data'][0]['b64_json'],
        'revised_prompt': response_data['data'][0].get('revised_prompt', prompt)
    }

    # Cache the result
    add_to_cache(cache_key, result)

    return result, False
@app.route('/delete_prompt', methods=['POST'])
def delete_prompt():
    try:
        alias = request.json.get('alias')
        if not alias:
            return jsonify({'error': 'Alias is required'}), 400

        # Get paths for all related files
        meta_path = get_file_path(f'prompt:meta:{alias}')
        
        # Check if prompt exists
        if not os.path.exists(meta_path):
            return jsonify({'error': 'Prompt not found'}), 404
            
        # Load metadata to get version info
        with open(meta_path, 'r') as f:
            meta_data = json.load(f)
            
        # Delete all version files
        if 'version_count' in meta_data:
            for version_num in range(1, meta_data['version_count'] + 1):
                version_path = get_file_path(f'prompt:version:{alias}:v{version_num}')
                if os.path.exists(version_path):
                    os.remove(version_path)
                
        # Delete metadata file
        os.remove(meta_path)
        
        # Update prompt index
        index_path = get_file_path('prompt:index')
        if os.path.exists(index_path):
            with open(index_path, 'r') as f:
                index_data = json.load(f)
                if 'aliases' in index_data:
                    index_data['aliases'] = [a for a in index_data['aliases'] if a != alias]
                    with open(index_path, 'w') as f:
                        json.dump(index_data, f)

        return jsonify({
            'status': 'success',
            'message': f'Prompt {alias} and all its versions have been deleted'
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# Define cache directory and memory limit
CACHE_DIR = "cache"
MAX_MEMORY = 1024 * 1024 * 1024  # 100 MB

# Ensure cache directory exists
if not os.path.exists(CACHE_DIR):
    os.makedirs(CACHE_DIR)

def hash_key(key):
    """Create a multi-level hash path for a given cache key to prevent inode thrashing."""
    hash_object = hashlib.sha256(key.encode())
    hex_dig = hash_object.hexdigest()
    return os.path.join(CACHE_DIR, hex_dig[:2], hex_dig[2:4], hex_dig[4:])

def get_from_cache(cache_key):
    """Retrieve data from cache file if it exists."""
    cache_path = hash_key(cache_key)
    if os.path.exists(cache_path):
        with open(cache_path, 'r') as f:
            return json.load(f)
    return None

def add_to_cache(cache_key, value):
    """Add data to cache by saving it as a file on disk."""
    cache_path = hash_key(cache_key)
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    with open(cache_path, 'w') as f:
        json.dump(value, f)


@app.route('/search_prompts', methods=['GET'])
def search_prompts():
    query = request.args.get('query')
    results = []
    for root, dirs, files in os.walk(DATA_DIR):
        for file in files:
            file_path = os.path.join(root, file)
            with open(file_path, 'r') as f:
                try:
                    data = json.load(f)
                    if 'alias' in data and query.lower() in data['alias'].lower():
                        results.append({
                            'alias': data['alias'],
                            'prompt': data['prompt'],
                            'model': data['model'],
                            'description': data.get('description', '')
                        })
                except json.JSONDecodeError:
                    pass
    return jsonify(results), 200

@app.route('/create_app', methods=['POST'])
def create_app():
    try:
        # Get required fields from request
        data = request.json
        code = data.get('current_code')
        name = data.get('name')
        description = data.get('description', '')
        categories = data.get('categories', [])
        prompt = data.get('current_prompt', "")
        app_uuid = data.get('uuid', str(uuid.uuid4()))
        
        if not code or not name:
            return jsonify({
                'status': 'error',
                'message': 'Both code and name are required'
            }), 400

        # Generate UUIDs for app and initial code block
        initial_code_block_uuid = str(uuid.uuid4())
        
        # Create friendly URL from name
        friendly_url = slugify(name)
        
        # Get current timestamp
        current_time = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.%fZ')
        
        # Create the code block entry
        code_block_data = {
            'key': initial_code_block_uuid,
            'value': code,
            'write_timestamp': time.time(),
            'read_timestamp': None,
            'read_count': 0
        }
        
        # Save code block
        code_block_path = get_file_path(initial_code_block_uuid)
        with open(code_block_path, 'w') as f:
            json.dump(code_block_data, f)
        
        # Create app metadata
        app_data = {
            'key': app_uuid,
            'value': {
                'uuid': app_uuid,
                'name': name,
                'description': description,
                'friendly_url': friendly_url,
                'categories': categories,
                'created_at': current_time,
                'updated_at': current_time,
                'current_version': 'v1',
                'current_code': initial_code_block_uuid,
                'current_prompt': prompt,
                'current_code_content': '',
                'editor_config': {
                    'language': 'html',
                    'settings': {
                        'tabSize': 4,
                        'wordWrap': 'on'
                    },
                    'theme': 'vs-dark'
                },
                'versions': {
                    'v0': {
                        'code_block': initial_code_block_uuid,
                        'message': 'Initial version',
                        'timestamp': current_time,
                        'prompt': prompt
                    }
                }
            },
            'write_timestamp': time.time(),
            'read_timestamp': None,
            'read_count': 0
        }
        
        # Save app metadata
        app_path = get_file_path(app_uuid)
        with open(app_path, 'w') as f:
            json.dump(app_data, f)
            
        # Create mapping for friendly URL
        mapping_data = {
            'app_name': name,
            'slug': friendly_url,
            'key': app_uuid
        }
        mapping_path = get_file_path(f'mapping-{friendly_url}')
        with open(mapping_path, 'w') as f:
            json.dump(mapping_data, f)
        
        # Update warehouse data
        warehouse_path = get_file_path('warehouse-data')
        if os.path.exists(warehouse_path):
            with open(warehouse_path, 'r') as f:
                warehouse_data = json.load(f)
                if isinstance(warehouse_data, dict):
                    warehouse_data = warehouse_data.get('value', [])
        else:
            warehouse_data = []
            
        if app_uuid not in warehouse_data:
            warehouse_data.append(app_uuid)
            write_data('warehouse-data', warehouse_data)
        
        return jsonify({
            'status': 'success',
            'uuid': app_uuid,
            'friendly_url': friendly_url,
            'name': name
        }), 200
        
    except Exception as e:
        print(f"Error in create_app: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Failed to create app: {str(e)}'
        }), 500

@app.route('/list_prompts', methods=['GET'])
def list_prompts():
    index_path = get_file_path('prompt:index')
    if not os.path.exists(index_path):
        return jsonify([]), 200

    with open(index_path, 'r') as f:
        index_data = json.load(f)
    results = []
    for alias in index_data['aliases']:
        meta_path = get_file_path(f'prompt:meta:{alias}')
        try:
            with open(meta_path, 'r') as f:
                meta = json.load(f)
            version_path = get_file_path(f'prompt:version:{alias}:{meta["current_version"]}')
            with open(version_path, 'r') as f:
                version = json.load(f)
            results.append({
                'alias': alias,
                'prompt': version['prompt_text'],
                'model': version['model'],
                'description': meta.get('description', ''),
                'created_at': meta['created_at'],
                'updated_at': meta['updated_at'],
                'use_count': meta['use_count'],
                'tags': meta['tags'],
                'current_version': meta['current_version'],
                'version_count': meta['version_count'],
                'parameters': version['parameters']
            })
        except (FileNotFoundError, json.JSONDecodeError):
            continue

    return jsonify(sorted(results, key=lambda x: x['alias'])), 200

@app.route('/clear_cache', methods=['POST'])
def clear_cache():
    """Clear all cached data from the cache directory."""
    try:
        cleared_files = 0
        for root, dirs, files in os.walk(CACHE_DIR):
            for file in files:
                file_path = os.path.join(root, file)
                try:
                    os.remove(file_path)
                    cleared_files += 1
                except OSError as e:
                    print(f"Error removing {file_path}: {e}")
        
        # Remove empty directories
        for root, dirs, files in os.walk(CACHE_DIR, topdown=False):
            for dir_name in dirs:
                dir_path = os.path.join(root, dir_name)
                try:
                    os.rmdir(dir_path)
                except OSError:
                    # Directory not empty, skip it
                    pass
        
        return jsonify({
            'status': 'success',
            'message': f'Cache cleared successfully. Removed {cleared_files} files.',
            'files_cleared': cleared_files
        }), 200
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Failed to clear cache: {str(e)}'
        }), 500

@app.route('/delete_app', methods=['DELETE'])
def delete_app():
    """Delete an app by either UUID or name."""
    try:
        app_uuid = request.args.get('uuid')
        app_name = request.args.get('name')
        
        if not app_uuid and not app_name:
            return jsonify({
                'status': 'error',
                'message': 'Either uuid or name parameter is required'
            }), 400

        # If name is provided, try to find the UUID through mapping
        if app_name and not app_uuid:
            friendly_url = slugify(app_name)
            mapping_path = get_file_path(f'mapping-{friendly_url}')
            
            if os.path.exists(mapping_path):
                with open(mapping_path, 'r') as f:
                    mapping_data = json.load(f)
                    app_uuid = mapping_data.get('key')
            
            if not app_uuid:
                return jsonify({
                    'status': 'error',
                    'message': f'App with name "{app_name}" not found'
                }), 404

        # Get app metadata
        app_path = get_file_path(app_uuid)
        if not os.path.exists(app_path):
            return jsonify({
                'status': 'error',
                'message': f'App with UUID "{app_uuid}" not found'
            }), 404

        # Load app metadata to get associated code blocks
        with open(app_path, 'r') as f:
            app_data = json.load(f)
            app_metadata = app_data.get('value', {})

        # Delete all code blocks associated with versions
        versions = app_metadata.get('versions', {})
        for version in versions.values():
            code_block_id = version.get('code_block')
            if code_block_id:
                code_block_path = get_file_path(code_block_id)
                if os.path.exists(code_block_path):
                    os.remove(code_block_path)

        # Delete the mapping if it exists
        friendly_url = app_metadata.get('friendly_url')
        if friendly_url:
            mapping_path = get_file_path(f'mapping-{friendly_url}')
            if os.path.exists(mapping_path):
                os.remove(mapping_path)

        # Delete the app metadata
        os.remove(app_path)

        # Remove from warehouse data
        warehouse_path = get_file_path('warehouse-data')
        if os.path.exists(warehouse_path):
            with open(warehouse_path, 'r') as f:
                warehouse_data = json.load(f)
                if isinstance(warehouse_data, dict):
                    warehouse_data = warehouse_data.get('value', [])
                
            if app_uuid in warehouse_data:
                warehouse_data.remove(app_uuid)
                write_data('warehouse-data', warehouse_data)

        return jsonify({
            'status': 'success',
            'message': f'App {"" if not app_name else f"({app_name}) "}successfully deleted',
            'uuid': app_uuid
        }), 200

    except Exception as e:
        print(f"Error in delete_app: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Failed to delete app: {str(e)}'
        }), 500

def write_data(key, value):
    """Helper function to write data with proper structure"""
    try:
        data = {
            'key': key,
            'value': value,
            'write_timestamp': time.time(),
            'read_timestamp': None,
            'read_count': 0
        }
        
        file_path = get_file_path(key)
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        with open(file_path, 'w') as f:
            json.dump(data, f)
            
        return {'status': 'success'}
    except Exception as e:
        return {
            'status': 'error',
            'message': f'Failed to write data: {str(e)}'
        }

@app.route('/check_app_exists', methods=['GET'])
def check_app_exists():
    try:
        # Get the app name or UUID from query parameters
        app_name = request.args.get('name')
        app_uuid = request.args.get('uuid')
        
        if not app_name and not app_uuid:
            return jsonify({
                'error': 'Either name or uuid parameter is required'
            }), 400
            
        # Read warehouse data
        warehouse_path = get_file_path('warehouse-data')
        if not os.path.exists(warehouse_path):
            return jsonify({
                'exists': False,
                'message': 'No apps found in warehouse'
            }), 200
            
        with open(warehouse_path, 'r') as f:
            warehouse_data = json.load(f)
            # Handle both cases: direct array or nested in 'value' field
            app_ids = warehouse_data if isinstance(warehouse_data, list) else warehouse_data.get('value', [])
            
        # If UUID is provided, direct check
        if app_uuid:
            exists = app_uuid in app_ids
            return jsonify({
                'exists': exists,
                'uuid': app_uuid if exists else None
            }), 200
            
        # If name is provided, need to check each app's metadata
        if app_name:
            friendly_url = slugify(app_name)
            
            for app_id in app_ids:
                try:
                    app_path = get_file_path(app_id)
                    if os.path.exists(app_path):
                        with open(app_path, 'r') as f:
                            app_data = json.load(f)
                            # Handle both direct and nested value structures
                            app_value = app_data.get('value', app_data)
                            if isinstance(app_value, dict):
                                stored_url = app_value.get('friendly_url')
                                if stored_url == friendly_url:
                                    return jsonify({
                                        'exists': True,
                                        'uuid': app_id,
                                        'name': app_value.get('name'),
                                        'friendly_url': friendly_url
                                    }), 200
                except (IOError, json.JSONDecodeError) as e:
                    print(f"Error reading app {app_id}: {str(e)}")
                    continue
                            
        return jsonify({
            'exists': False,
            'message': 'App not found'
        }), 200
        
    except Exception as e:
        print(f"Error in check_app_exists: {str(e)}")
        return jsonify({
            'error': str(e),
            'message': 'Internal server error'
        }), 500


@app.route('/process_pdf', methods=['POST'])
def process_pdf():
    try:
        # Get the base64 encoded PDF and query from the request
        data = request.json
        pdf_base64 = data.get('pdf')
        query = data.get('query', 'Please summarize this PDF document.')
        
        # Validate inputs
        if not pdf_base64:
            return jsonify({
                'status': 'error',
                'message': 'PDF content is required'
            }), 400

        # Prepare the API request to Claude
        api_url = 'https://api.anthropic.com/v1/messages'
        headers = {
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        }
        
        # Construct the message payload
        payload = {
            'model': 'claude-3-7-sonnet-latest',
            'max_tokens': 4096,
            'messages': [{
                'role': 'user',
                'content': [
                    {
                        'type': 'document',
                        'source': {
                            'type': 'base64',
                            'media_type': 'application/pdf',
                            'data': pdf_base64
                        }
                    },
                    {
                        'type': 'text',
                        'text': query
                    }
                ]
            }]
        }

        # Make the API request to Claude
        response = requests.post(api_url, headers=headers, json=payload)
        response.raise_for_status()
        
        # Extract the content from Claude's response
        response_data = response.json()
        if isinstance(response_data['content'], list):
            content = ' '.join(
                block['text'] for block in response_data['content']
                if block['type'] == 'text'
            )
        else:
            content = response_data['content']

        # Return the processed result
        return jsonify({
            'status': 'success',
            'content': content
        }), 200

    except requests.exceptions.RequestException as e:
        # Handle API request errors
        return jsonify({
            'status': 'error',
            'code': 'API_ERROR',
            'message': 'Error calling Claude API',
            'details': str(e)
        }), 502

    except Exception as e:
        # Handle unexpected errors
        return jsonify({
            'status': 'error',
            'code': 'INTERNAL_ERROR',
            'message': 'Internal server error',
            'details': str(e)
        }), 500

@app.route('/text_to_speech', methods=['POST'])
def text_to_speech():
    try:
        data = request.json
        text = data.get('text')
        model = data.get('model', 'tts-1')
        voice = data.get('voice', 'alloy')
        
        if not text:
            return jsonify({
                'status': 'error',
                'message': 'Text content is required'
            }), 400

        if model not in ['tts-1', 'tts-1-hd']:
            return jsonify({
                'status': 'error',
                'message': 'Invalid model. Must be either tts-1 or tts-1-hd'
            }), 400

        # Generate cache key based on input parameters
        cache_key = f"tts-{model}-{voice}-{hashlib.sha256(text.encode()).hexdigest()}"
        
        # Check cache first
        cached_result = get_from_cache(cache_key)
        if cached_result:
            return jsonify({
                'status': 'success',
                'audio': cached_result,
                'format': 'mp3',
                'cached': True
            }), 200

        # If not in cache, make API request
        api_url = 'https://api.openai.com/v1/audio/speech'
        headers = {
            'Authorization': f'Bearer {OPENAI_API_KEY}',
            'Content-Type': 'application/json'
        }
        
        payload = {
            'model': model,
            'input': text,
            'voice': voice,
            'response_format': 'mp3'
        }

        response = requests.post(api_url, headers=headers, json=payload)
        response.raise_for_status()

        # Convert to base64 for JSON response
        audio_base64 = b64encode(response.content).decode('utf-8')

        # Cache the result
        add_to_cache(cache_key, audio_base64)

        return jsonify({
            'status': 'success',
            'audio': audio_base64,
            'format': 'mp3',
            'cached': False
        }), 200

    except requests.exceptions.RequestException as e:
        return jsonify({
            'status': 'error',
            'code': 'API_ERROR',
            'message': 'Error calling OpenAI API',
            'details': str(e)
        }), 502

    except Exception as e:
        return jsonify({
            'status': 'error',
            'code': 'INTERNAL_ERROR',
            'message': 'Internal server error',
            'details': str(e)
        }), 500


@app.route('/appd/<app_name>')
def serve_by_named(app_name):
    """Serve an app by its friendly name."""
    # Convert the app name to a slug for consistency
    slug = slugify(app_name)

    # Try to find the mapping file
    mapping_path = get_file_path(f'mapping-{slug}')
    if not os.path.exists(mapping_path):
        return jsonify({'error': 'App not found'}), 404

    # Load the mapping to get the original key
    with open(mapping_path, 'r') as f:
        mapping = json.load(f)

    # Get the app metadata using the key from the mapping
    metadata_path = get_file_path(mapping['key'])
    if not os.path.exists(metadata_path):
        return jsonify({'error': 'App data not found'}), 404

    # Load the app metadata
    with open(metadata_path, 'r') as f:
        metadata = json.load(f)

    # Get the current code block
    code_block_path = get_file_path(metadata['value']['current_code'])
    if not os.path.exists(code_block_path):
        return jsonify({'error': 'Code block not found'}), 404

    # Load the actual code content
    with open(code_block_path, 'r') as f:
        code_data = json.load(f)

    # Extract HTML content
    html_content = code_data['value']

    # Check for specific URL parameters
    og_title = request.args.get('ogtitle')
    og_description = request.args.get('ogdescription')
    og_image = request.args.get('ogimage')

    # If any of the parameters exist, modify the HTML
    if og_title or og_description or og_image:
        from bs4 import BeautifulSoup

        # Parse the HTML content
        soup = BeautifulSoup(html_content, 'html.parser')

        # Find or create the <head> section
        if not soup.head:
            head_tag = soup.new_tag('head')
            soup.insert(0, head_tag)
        else:
            head_tag = soup.head

        # Add meta tags as necessary
        if og_title:
            meta_tag = soup.new_tag('meta', property='og:title', content=og_title)
            head_tag.append(meta_tag)
        if og_description:
            meta_tag = soup.new_tag('meta', property='og:description', content=og_description)
            head_tag.append(meta_tag)
        if og_image:
            meta_tag = soup.new_tag('meta', property='og:image', content=og_image)
            head_tag.append(meta_tag)

        # Convert back to string
        html_content = str(soup)

    # Update read stats for the metadata
    metadata['read_timestamp'] = time.time()
    metadata['read_count'] += 1
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f)

    # Return the modified HTML content
    return html_content, 200, {'Content-Type': 'text/html'}

# @app.route('/chat')
# def chat():
#     return render_template('chat.html')

# @app.route('/send_message', methods=['POST'])
# def send_message():
#     data = request.json
#     message = data.get('message', '')
    
#     try:
#         response = anthropic_client.messages.create(
#             model="claude-3-sonnet-20240229",
#             max_tokens=1024,
#             messages=[{
#                 "role": "user",
#                 "content": message
#             }],
#             stream=True
#         )
        
#         def generate():
#             for chunk in response:
#                 if chunk.delta.text:
#                     yield f"data: {json.dumps({'text': chunk.delta.text})}\n\n"
        
#         return Response(generate(), mimetype='text/event-stream')
#     except Exception as e:
#         return jsonify({'error': str(e)}), 500
    

class AiderEditor:
    def __init__(self):
        self.aider_path = Path.home() / '.local' / 'bin' / 'aider'
        if not self.aider_path.exists():
            raise FileNotFoundError(f"Aider not found at {self.aider_path}")

    def create_temp_file(self, content, filename=None):
        """Create a temporary file with the given content."""
        if filename is None or not filename.strip():
            filename = "temp_file.html"
        
        temp_dir = tempfile.mkdtemp()
        file_path = os.path.join(temp_dir, filename)
        
        with open(file_path, 'w') as f:
            f.write(content)
            
        return file_path, temp_dir

    async def edit_file(self, file_content, edit_request, filename=None, image_path=None, model='sonnet', edit_format='webapp', attachments=None):
        """Edit a file using aider based on the edit request, with optional image reference and attachments."""
        temp_dir = None
        file_path = None # Initialize file_path
        stdout = '' # Initialize stdout
        stderr = '' # Initialize stderr
        attachments_temp_files = [] # Track temporary attachment files
        
        try:
            filename = filename or 'temp_file.html'
            
            # create_temp_file is synchronous, call it directly
            file_path, temp_dir = self.create_temp_file(file_content, filename)

            # Build the command
            command = [
                str(self.aider_path),
                '--no-auto-commits',
                '--no-stream',
                '--no-check-update',
                # '--cache-prompts',
                '--no-git',
                '--edit-format', edit_format,
                '--message', edit_request,     
                file_path
            ]
            print(f"Command: {command}", file=sys.stderr)
            
            # Set up environment with model
            # Handle special case for sonnet-thinking model
            if model == "sonnet-thinking":
                command.extend(['--model', 'sonnet', '--thinking-tokens', '32k'])
            else:
                command.extend(['--model', model])

            # Add image to the command if provided
            if image_path and os.path.exists(image_path):
                command.append(image_path)
                
            # Process attachments
            if attachments and isinstance(attachments, list):
                import requests
                import mimetypes
                import tempfile
                import os
                
                for attachment in attachments:
                    # Skip non-image attachments for now
                    if isinstance(attachment, dict) and 'url' in attachment:
                        url = attachment['url']
                        if url.startswith(('http://', 'https://')):
                            try:
                                # Download the image
                                response = requests.get(url, stream=True, timeout=30)
                                if response.status_code == 200:
                                    # Determine content type and extension
                                    content_type = attachment.get('content_type') or response.headers.get('Content-Type', '')
                                    if content_type.startswith('image/'):
                                        # Get appropriate extension
                                        extension = mimetypes.guess_extension(content_type) or '.jpg'
                                        # Create temporary file
                                        temp_file = tempfile.NamedTemporaryFile(suffix=extension, dir=temp_dir, delete=False)
                                        # Write image content
                                        for chunk in response.iter_content(chunk_size=8192):
                                            temp_file.write(chunk)
                                        temp_file.close()
                                        # Add to command and track for cleanup
                                        command.append(temp_file.name)
                                        attachments_temp_files.append(temp_file.name)
                                        print(f"Added attachment image from URL: {url} to {temp_file.name}", file=sys.stderr)
                            except Exception as e:
                                print(f"Error processing attachment URL {url}: {str(e)}", file=sys.stderr)
                    # Handle string URLs
                    elif isinstance(attachment, str) and attachment.startswith(('http://', 'https://')):
                        try:
                            # Download the image
                            response = requests.get(attachment, stream=True, timeout=30)
                            if response.status_code == 200:
                                # Determine content type and extension
                                content_type = response.headers.get('Content-Type', '')
                                if content_type.startswith('image/'):
                                    # Get appropriate extension
                                    extension = mimetypes.guess_extension(content_type) or '.jpg'
                                    # Create temporary file
                                    temp_file = tempfile.NamedTemporaryFile(suffix=extension, dir=temp_dir, delete=False)
                                    # Write image content
                                    for chunk in response.iter_content(chunk_size=8192):
                                        temp_file.write(chunk)
                                    temp_file.close()
                                    # Add to command and track for cleanup
                                    command.append(temp_file.name)
                                    attachments_temp_files.append(temp_file.name)
                                    print(f"Added attachment image from URL: {attachment} to {temp_file.name}", file=sys.stderr)
                        except Exception as e:
                            print(f"Error processing attachment URL {attachment}: {str(e)}", file=sys.stderr)

            # Run aider asynchronously
            process = await asyncio.create_subprocess_exec(
                *command, 
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            # Wait for the process to finish first
            await process.wait()
            
            # Then read all stdout and stderr
            stdout, stderr = await asyncio.gather(
                process.stdout.read(),
                process.stderr.read()
            )
            
            # Convert to strings
            stdout = stdout.decode('utf-8', errors='replace')
            stderr = stderr.decode('utf-8', errors='replace')
            
            # Extract cost information
            total_tokens = 0
            input_tokens = 0
            output_tokens = 0
            message_cost = 0.0
            session_cost = 0.0
            
            for line in stderr.splitlines():
                # Try to parse cost info
                if "Tokens: " in line:
                    token_parts = line.split("Tokens: ")[1].split()
                    for part in token_parts:
                        if "+" in part and "=" in part:
                            input_output_parts = part.split("=")[0].split("+")
                            if len(input_output_parts) == 2:
                                try:
                                    input_tokens = int(input_output_parts[0])
                                    output_tokens = int(input_output_parts[1])
                                except ValueError:
                                    pass
                elif "Cost: " in line:
                    cost_parts = line.split("Cost: $")[1].split()
                    for part in cost_parts:
                        if part.replace(".", "", 1).isdigit():  # Check if it's a number
                            try:
                                session_cost = float(part)
                            except ValueError:
                                pass
            
            # Check if the file was modified (aider edited it)
            with open(file_path, 'r') as f:
                modified_content = f.read()
                
            # Detect if there was an error
            success = True
            error_message = None
            
            # Check for common error patterns
            if "Error: OpenAI API error" in stderr or "Error: Anthropic API error" in stderr:
                success = False
                error_message = stderr.split("Error: ")[1].split("\n")[0]
            elif "ERROR" in stderr and "No edits" in stderr:
                success = False
                error_message = "No edits were made to the file. The model could not understand the request."
            
            return {
                'success': success,
                'error': error_message,
                'modified_content': modified_content,
                'stdout': stdout,
                'stderr': stderr,
                'input_tokens': input_tokens,
                'output_tokens': output_tokens,
                'message_cost': message_cost,
                'session_cost': session_cost
            }
                
        except Exception as e:
            import traceback
            return {
                'success': False,
                'error': str(e),
                'traceback': traceback.format_exc(),
                'stdout': stdout,
                'stderr': stderr
            }
        finally:
            # Clean up temp files
            if temp_dir and os.path.exists(temp_dir):
                try:
                    import shutil
                    shutil.rmtree(temp_dir)
                except:
                    pass

@app.route('/api/edit_file', methods=['POST'])
def api_edit_file():
    try:
        data = request.get_json()
        file_content = data.get('file_content')
        edit_request = data.get('edit_request')
        filename = data.get('filename')
        image_path = data.get('image_path')
        model = data.get('model', 'sonnet')
        edit_format = data.get('edit_format', 'webapp')
        attachments = data.get('attachments', [])
        
        # Call the async edit_file method from a sync context
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(editor.edit_file(
            file_content=file_content,
            edit_request=edit_request,
            filename=filename,
            image_path=image_path,
            model=model,
            edit_format=edit_format,
            attachments=attachments
        ))
        loop.close()
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/edit/stream', methods=['POST'])
def edit_code_stream():
    # Create a new editor instance for each request
    request_editor = AiderEditor()
    try:
        data = request.get_json()
        
        if not data or 'file_content' not in data or 'edit_request' not in data:
            def error_stream():
                error_json = json.dumps({
                    'type': 'error',
                    'content': 'Missing required fields: file_content and edit_request'
                })
                yield f"data: {error_json}\n\n"
            return Response(error_stream(), mimetype='text/event-stream')
        
        from system_prompts import WEB_APP_PROMPT
        file_content = data['file_content']
        edit_request = data['edit_request']
        filename = data.get('filename')
        
        # Handle image context if provided
        image_context = ""
        if 'image_data' in data and 'image_type' in data:
            # Add image context to the edit request
            image_context = f"\n\nI'm including an image for additional context. Please use this image to help understand what changes I'm requesting."
            edit_request = edit_request + image_context
        
        # Create a synchronous generator to replace the async one
        def generate():
            try:
                # Create temporary file for the editor
                temp_dir = tempfile.mkdtemp()
                file_path = os.path.join(temp_dir, filename or "temp_file.html")
                
                with open(file_path, 'w') as f:
                    f.write(file_content)
                
                # Create command for aider
                command = [
                    str(request_editor.aider_path),
                    '--edit-format', 'webapp',
                    '--no-auto-commits',
                    '--no-stream',
                    '--no-check-update',
                    '--cache-prompts',
                    '--no-git',
                    '--message', edit_request,
                    file_path
                ]
            
                
                # Add image to the command if provided
                image_path = None
                if 'image_data' in data and 'image_type' in data:
                    try:
                        import base64
                        image_data = data['image_data']
                        image_type = data['image_type']
                        image_ext = image_type.split('/')[-1]
                        image_path = os.path.join(temp_dir, f"context_image.{image_ext}")
                        
                        # Save the image
                        with open(image_path, 'wb') as img_file:
                            img_file.write(base64.b64decode(image_data))
                        
                        # Add image to command
                        command.append(image_path)
                    except Exception as e:
                        yield f"data: {json.dumps({'type': 'output', 'content': f'Error processing image: {str(e)}'})}\n\n"
                
                # Add the message at the end
                command.extend(['--message', edit_request])
                
                # Run aider
                process = subprocess.Popen(
                    command,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    bufsize=1  # Line buffered
                )
                
                while process.poll() is None:
                    # Check for output from aider
                    output_line = process.stdout.readline()
                    if output_line:
                        # Check if this line contains info about the modified file
                        if 'Modified' in output_line and file_path in output_line:
                            yield f"data: {json.dumps({'type': 'output', 'content': output_line.strip(), 'filePath': file_path})}\n\n"
                        else:
                            yield f"data: {json.dumps({'type': 'output', 'content': output_line.strip()})}\n\n"
                
                # Try to read any modified file
                if os.path.exists(file_path):
                    try:
                        with open(file_path, 'r') as f:
                            modified_content = f.read()
                        # Send the final modified content
                        yield f"data: {json.dumps({'type': 'content', 'content': modified_content})}\n\n"
                    except Exception as e:
                        yield f"data: {json.dumps({'type': 'output', 'content': f'Error reading modified file: {str(e)}'})}\n\n"
                
                # Send completion message with file path for reference
                yield f"data: {json.dumps({'type': 'complete', 'filePath': file_path})}\n\n"
                
                # Store temp directory path for retrieval endpoint
                app.config['LAST_TEMP_DIR'] = temp_dir
                
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
            
        return Response(generate(), mimetype='text/event-stream')
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/get-temp-file', methods=['POST'])
def get_temp_file():
    """Get the content of a temporary file"""
    try:
        data = request.get_json()
        file_path = data.get('temp_file_path')
        
        if not file_path or not os.path.exists(file_path):
            return jsonify({
                'success': False,
                'error': 'File not found'
            }), 404
            
        with open(file_path, 'r') as f:
            content = f.read()
            
        return jsonify({
            'success': True,
            'content': content
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Initialize the editor
editor = AiderEditor()

@app.route('/api/edit', methods=['POST'])
def edit_code():
    """
    Endpoint to edit code using aider.
    
    Expected JSON payload:
    {
        "file_content": "original file content",
        "edit_request": "description of desired changes",
        "filename": "optional filename"
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'file_content' not in data or 'edit_request' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required fields: file_content and edit_request'
            }), 400
            
        file_content = data['file_content']
        edit_request = data['edit_request']
        filename = data.get('filename')
        
        result = editor.edit_file(file_content, edit_request, filename)
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 500
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500




from flask import Flask, request, jsonify
import csv
import io
import base64
from email.mime.text import MIMEText
from google.oauth2 import service_account
from googleapiclient.discovery import build


SERVICE_ACCOUNT_FILE = 'sheets.json'
IMPERSONATE_EMAIL = 'aitoolfactory@gmail.com'

def _a1_to_index(a1_range):
    # Parses A1 notation to startRow, endRow, startCol, endCol (0-indexed)
    def col_to_index(col):
        col = col.upper()
        result = 0
        for char in col:
            result = result * 26 + (ord(char) - ord('A') + 1)
        return result - 1

    match = re.match(r'([A-Z]+)(\d+):([A-Z]+)(\d+)', a1_range)
    if not match:
        raise ValueError("Invalid A1 notation: " + a1_range)
    start_col, start_row, end_col, end_row = match.groups()
    return (int(start_row) - 1, int(end_row), col_to_index(start_col), col_to_index(end_col) + 1)

# === SHEETS: Upload CSV and make public ===
@app.route('/upload_csv', methods=['POST'])
def upload_csv():
    SCOPES = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]
    data = request.get_json()
    file_name = data.get('file_name')
    csv_string = data.get('csv_string')
    styles = data.get('styles', [])  # Optional styling info
    
    if not file_name or not csv_string:
        return jsonify({'error': 'Missing file_name or csv_string'}), 400

    try:
        creds = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, scopes=SCOPES)
        sheets_service = build('sheets', 'v4', credentials=creds)
        drive_service = build('drive', 'v3', credentials=creds)

        # Create spreadsheet
        spreadsheet = {'properties': {'title': file_name}}
        result = sheets_service.spreadsheets().create(
            body=spreadsheet, fields='spreadsheetId').execute()
        spreadsheet_id = result['spreadsheetId']

        # Write CSV content
        reader = csv.reader(io.StringIO(csv_string))
        values = list(reader)
        sheets_service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range='Sheet1!A1',
            valueInputOption='RAW',
            body={'values': values}
        ).execute()

        # Apply styles if provided
        if styles:
            requests = []
            for style in styles:
                cell_format = {}
                if style.get('bold'):
                    cell_format.setdefault('textFormat', {})['bold'] = True
                if 'horizontalAlignment' in style:
                    cell_format['horizontalAlignment'] = style['horizontalAlignment']
                if 'backgroundColor' in style:
                    cell_format['backgroundColor'] = style['backgroundColor']
                
                requests.append({
                    "repeatCell": {
                        "range": {
                            "sheetId": 0,
                            "startRowIndex": _a1_to_index(style['range'])[0],
                            "endRowIndex": _a1_to_index(style['range'])[1],
                            "startColumnIndex": _a1_to_index(style['range'])[2],
                            "endColumnIndex": _a1_to_index(style['range'])[3],
                        },
                        "cell": {
                            "userEnteredFormat": cell_format
                        },
                        "fields": "userEnteredFormat"
                    }
                })
            
            sheets_service.spreadsheets().batchUpdate(
                spreadsheetId=spreadsheet_id,
                body={"requests": requests}
            ).execute()

        # Make spreadsheet public with write access
        drive_service.permissions().create(
            fileId=spreadsheet_id,
            body={'type': 'anyone', 'role': 'writer'},
            fields='id',
            sendNotificationEmail=False
        ).execute()

        return jsonify({'url': f'https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit'})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

def _a1_to_index_range(a1_range):
    """
    Convert A1 notation (e.g., A1:C3) to row/column index range.
    Returns (startRow, endRow, startCol, endCol).
    """
    match = re.match(r'([A-Z]+)(\d+):([A-Z]+)(\d+)', a1_range.upper())
    if not match:
        raise ValueError("Invalid A1 range format")

    start_col_letter, start_row, end_col_letter, end_row = match.groups()
    start_col = sum((ord(char) - 64) * (26 ** i) for i, char in enumerate(reversed(start_col_letter))) - 1
    end_col = sum((ord(char) - 64) * (26 ** i) for i, char in enumerate(reversed(end_col_letter))) - 1
    return int(start_row) - 1, int(end_row), start_col, end_col + 1  # endCol is exclusive

@app.route('/upload_csv_w_styles', methods=['POST'])
def upload_csv_w_styles():
    SCOPES = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
    ]
    data = request.get_json()
    file_name = data.get('file_name')
    csv_string = data.get('csv_string')
    styles = data.get('styles', [])  # Must be a valid list of batchUpdate requests

    if not file_name or not csv_string:
        return jsonify({'error': 'Missing file_name or csv_string'}), 400

    try:
        creds = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, scopes=SCOPES)
        sheets_service = build('sheets', 'v4', credentials=creds)
        drive_service = build('drive', 'v3', credentials=creds)

        # Create spreadsheet
        spreadsheet = {'properties': {'title': file_name}}
        result = sheets_service.spreadsheets().create(
            body=spreadsheet, fields='spreadsheetId').execute()
        spreadsheet_id = result['spreadsheetId']

        # Write CSV content
        reader = csv.reader(io.StringIO(csv_string))
        values = list(reader)
        sheets_service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range='Sheet1!A1',
            valueInputOption='RAW',
            body={'values': values}
        ).execute()

        # Apply styles directly
        if styles:
            sheets_service.spreadsheets().batchUpdate(
                spreadsheetId=spreadsheet_id,
                body={"requests": styles}
            ).execute()

        # Make spreadsheet public with write access
        drive_service.permissions().create(
            fileId=spreadsheet_id,
            body={'type': 'anyone', 'role': 'writer'},
            fields='id',
            sendNotificationEmail=False
        ).execute()

        return jsonify({'url': f'https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit'})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/create_doc', methods=['POST'])
def create_doc():
    SCOPES = [
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/drive'
    ]
    data = request.get_json()
    title = data.get('title', 'Untitled Document')
    requests = data.get('requests', [])

    try:
        creds = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, scopes=SCOPES)

        docs_service = build('docs', 'v1', credentials=creds)
        drive_service = build('drive', 'v3', credentials=creds)

        # Create the doc
        doc = docs_service.documents().create(body={'title': title}).execute()
        doc_id = doc['documentId']

        # Apply JSON requests
        if requests:
            docs_service.documents().batchUpdate(
                documentId=doc_id,
                body={'requests': requests}
            ).execute()

        # Set permission to public (anyone with the link can view)
        drive_service.permissions().create(
            fileId=doc_id,
            body={
                'type': 'anyone',
                'role': 'reader'
            }
        ).execute()

        return jsonify({'url': f'https://docs.google.com/document/d/{doc_id}/edit'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/extract_doc', methods=['POST'])
def extract_doc():
    SCOPES = [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/documents.readonly',
        'https://www.googleapis.com/auth/drive.activity.readonly'
    ]

    data = request.get_json()
    doc_url = data.get('url')

    if not doc_url or 'docs.google.com/document/d/' not in doc_url:
        return jsonify({'error': 'Invalid or missing Google Doc URL'}), 400

    try:
        doc_id = doc_url.split('/d/')[1].split('/')[0]

        creds = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, scopes=SCOPES)

        docs_service = build('docs', 'v1', credentials=creds)
        drive_service = build('drive', 'v3', credentials=creds)
        activity_service = build('driveactivity', 'v2', credentials=creds)

        file_meta = drive_service.files().get(
            fileId=doc_id, fields='mimeType, name').execute()

        if file_meta['mimeType'] != 'application/vnd.google-apps.document':
            return jsonify({
                'error': 'File is not a native Google Doc',
                'mimeType': file_meta['mimeType'],
                'fileName': file_meta.get('name')
            }), 400

        result = {
            'doc_id': doc_id,
            'title': file_meta.get('name'),
            'warnings': []
        }

        # 🧾 Get full content with suggestions
        try:
            doc = docs_service.documents().get(
                documentId=doc_id,
                suggestionsViewMode='SUGGESTIONS_INLINE'
            ).execute()

            def extract_text_and_suggestions(elements):
                text = ''
                suggestions = []
                for val in elements:
                    if 'paragraph' in val:
                        for el in val['paragraph'].get('elements', []):
                            tr = el.get('textRun', {})
                            content = tr.get('content', '')
                            text += content

                            if 'suggestedInsertionIds' in el:
                                suggestions.append({
                                    'type': 'insertion',
                                    'content': content,
                                    'suggestion_ids': el['suggestedInsertionIds']
                                })
                            if 'suggestedDeletionIds' in el:
                                suggestions.append({
                                    'type': 'deletion',
                                    'content': content,
                                    'suggestion_ids': el['suggestedDeletionIds']
                                })

                return text, suggestions

            content, suggestions = extract_text_and_suggestions(doc.get('body', {}).get('content', []))
            result['content'] = content
            result['suggestions'] = suggestions
        except Exception as e:
            result['content'] = ''
            result['suggestions'] = []
            result['warnings'].append(f"Could not fetch content with suggestions: {str(e)}")

        # 💬 Get inline comments
        try:
            result['comments'] = drive_service.comments().list(
                fileId=doc_id, fields="comments").execute().get('comments', [])
        except Exception as e:
            result['comments'] = []
            result['warnings'].append(f"Could not fetch comments: {str(e)}")

        # 📜 Get revisions metadata
        try:
            result['revisions'] = drive_service.revisions().list(fileId=doc_id).execute().get('revisions', [])
        except Exception as e:
            result['revisions'] = []
            result['warnings'].append(f"Could not fetch revisions: {str(e)}")

        # 🔁 Get Drive Activity (change log)
        try:
            result['change_logs'] = activity_service.activity().query(body={
                "ancestorName": f"items/{doc_id}",
                "pageSize": 50
            }).execute().get('activities', [])
        except Exception as e:
            result['change_logs'] = []
            result['warnings'].append(f"Could not fetch activity logs: {str(e)}")

        return jsonify(result)

    except HttpError as http_err:
        return jsonify({
            'error': 'Google API request failed',
            'status': http_err.resp.status,
            'details': http_err._get_reason()
        }), http_err.resp.status

    except Exception as e:
        return jsonify({'error': 'Unexpected error', 'details': str(e)}), 500

@app.route('/create_slides', methods=['POST'])
def create_slides():
    SCOPES = [
        'https://www.googleapis.com/auth/presentations',
        'https://www.googleapis.com/auth/drive'
    ]
    data = request.get_json()
    title = data.get('title', 'New Presentation')
    requests = data.get('requests', [])

    try:
        creds = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE, scopes=SCOPES)

        slides_service = build('slides', 'v1', credentials=creds)
        drive_service = build('drive', 'v3', credentials=creds)

        # Create the presentation
        presentation = slides_service.presentations().create(
            body={'title': title}).execute()
        presentation_id = presentation['presentationId']

        # Apply JSON requests
        if requests:
            slides_service.presentations().batchUpdate(
                presentationId=presentation_id,
                body={'requests': requests}
            ).execute()

        # Set permission to public (anyone with the link can view)
        drive_service.permissions().create(
            fileId=presentation_id,
            body={
                'type': 'anyone',
                'role': 'reader'
            }
        ).execute()

        return jsonify({'url': f'https://docs.google.com/presentation/d/{presentation_id}/edit'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500



import smtplib
from flask import Flask, request, jsonify
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


# Gmail API Configuration and Helper Functions
GMAIL_SERVICE_ACCOUNT_FILE = 'utils/google_service_account.json'
GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send']
GMAIL_DOMAIN = 'ast.engineer'

def initialize_gmail_client(delegate_email):
    """
    Initialize Gmail client with JWT authentication (Python version of Node.js function).
    
    Args:
        delegate_email (str): Email address to impersonate
    
    Returns:
        googleapiclient.discovery.Resource: Gmail service object
    """
    if not GMAIL_API_AVAILABLE:
        raise Exception("Gmail API libraries not available")
    
    try:
        # Load service account credentials
        credentials = service_account.Credentials.from_service_account_file(
            GMAIL_SERVICE_ACCOUNT_FILE,
            scopes=[
                'https://www.googleapis.com/auth/gmail.readonly',
                'https://www.googleapis.com/auth/gmail.modify', 
                'https://www.googleapis.com/auth/gmail.send'
            ]
        )
        
        # Create delegated credentials for the specified user (equivalent to 'subject' in Node.js)
        delegated_credentials = credentials.with_subject(delegate_email)
        
        # Build the Gmail service (equivalent to google.gmail() in Node.js)
        gmail_service = build('gmail', 'v1', credentials=delegated_credentials)
        
        print(f"Gmail client initialized successfully for {delegate_email}")
        return gmail_service
        
    except FileNotFoundError:
        error_msg = f"Service account file not found: {GMAIL_SERVICE_ACCOUNT_FILE}"
        print(f"Gmail initialization error: {error_msg}")
        raise Exception(error_msg)
    except Exception as e:
        error_msg = f"Failed to create Gmail service: {str(e)}"
        print(f"Gmail initialization error: {error_msg}")
        raise Exception(error_msg)

def send_email_with_attachment(gmail_service, to, subject, body, attachment_base64=None, filename=None):
    """
    Send email with attachment using manual email construction (Python version of Node.js function).
    
    Args:
        gmail_service: Initialized Gmail service object
        to (str): Recipient email address
        subject (str): Email subject
        body (str): Email body (HTML)
        attachment_base64 (str, optional): Base64 encoded attachment data
        filename (str, optional): Attachment filename
    
    Returns:
        dict: Gmail API response
    """
    try:
        # Construct email manually (matching Node.js approach)
        email_parts = [
            f"To: {to}",
            f"Subject: {subject}",
            'Content-Type: multipart/mixed; boundary="boundary123"',
            '',
            '--boundary123',
            'Content-Type: text/html; charset=utf-8',
            '',
            body,
            ''
        ]
        
        # Add attachment if provided
        if attachment_base64 and filename:
            email_parts.extend([
                '--boundary123',
                f'Content-Type: application/pdf; name="{filename}"',
                'Content-Transfer-Encoding: base64',
                f'Content-Disposition: attachment; filename="{filename}"',
                '',
                attachment_base64
            ])
        
        # Close boundary
        email_parts.append('--boundary123--')
        
        # Join all parts
        email_content = '\n'.join(email_parts)
        
        # Encode email (matching Node.js base64url encoding)
        email_bytes = email_content.encode('utf-8')
        encoded_email = base64.urlsafe_b64encode(email_bytes).decode('utf-8')
        # Remove padding (matching Node.js .replace(/=+$/, ''))
        encoded_email = encoded_email.rstrip('=')
        
        # Send email via Gmail API
        message = {
            'raw': encoded_email
        }
        
        result = gmail_service.users().messages().send(
            userId='me',
            body=message
        ).execute()
        
        print(f"Email sent successfully: {result.get('id')}")
        return result
        
    except Exception as error:
        print(f"Email send error: {error}")
        raise error

def get_gmail_service(user_email):
    """
    Create a Gmail service object with delegated authentication.
    
    Args:
        user_email (str): Email address to impersonate (must be in vibecarding.com domain)
    
    Returns:
        googleapiclient.discovery.Resource: Gmail service object
    """
    if not GMAIL_API_AVAILABLE:
        raise Exception("Gmail API libraries not available")
    
    try:
        # Load service account credentials
        credentials = service_account.Credentials.from_service_account_file(
            GMAIL_SERVICE_ACCOUNT_FILE,
            scopes=GMAIL_SCOPES
        )
        
        # Create delegated credentials for the specified user
        delegated_credentials = credentials.with_subject(user_email)
        
        # Build the Gmail service
        service = build('gmail', 'v1', credentials=delegated_credentials)
        return service
        
    except FileNotFoundError:
        raise Exception(f"Service account file not found: {GMAIL_SERVICE_ACCOUNT_FILE}")
    except Exception as e:
        raise Exception(f"Failed to create Gmail service: {str(e)}")

def create_message(sender, to, subject, message_text, html_body=None, attachments=None):
    """
    Create a message for an email.
    
    Args:
        sender (str): Email address of the sender
        to (str): Email address of the receiver
        subject (str): The subject of the email message
        message_text (str): The text of the email message
        html_body (str, optional): HTML version of the email
        attachments (list, optional): List of attachment file paths or data
    
    Returns:
        dict: An object containing a base64url encoded email object
    """
    import uuid
    import re
    from email.utils import formatdate, make_msgid, formataddr
    
    # Clean and validate email addresses
    to = to.strip() if to else ""
    sender = sender.strip() if sender else ""
    subject = subject.strip() if subject else ""
    
    # Validate email format
    email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(email_regex, to):
        raise ValueError(f"Invalid 'To' email address: {to}")
    if not re.match(email_regex, sender):
        raise ValueError(f"Invalid 'From' email address: {sender}")
    
    # Remove any potential control characters or newlines that could break headers
    to = re.sub(r'[\r\n\x00-\x1f\x7f-\x9f]', '', to)
    sender = re.sub(r'[\r\n\x00-\x1f\x7f-\x9f]', '', sender)
    subject = re.sub(r'[\r\n\x00-\x1f\x7f-\x9f]', ' ', subject)
    
    if html_body:
        message = MIMEMultipart('alternative')
    elif attachments:
        message = MIMEMultipart()
    else:
        message = MIMEText(message_text, 'plain', 'utf-8')
        message['To'] = to
        message['From'] = sender
        message['Subject'] = subject
        
        # Add comprehensive anti-spam headers
        message['Date'] = formatdate(localtime=True)
        message['Message-ID'] = make_msgid(domain='ast.engineer')
        message['X-Mailer'] = 'VibeCarding Email Service v1.0'
        message['MIME-Version'] = '1.0'
        message['X-Priority'] = '3'
        message['X-MSMail-Priority'] = 'Normal'
        message['Importance'] = 'Normal'
        message['Reply-To'] = sender
        message['Return-Path'] = sender
        message['Sender'] = sender
        
        # Additional anti-spam headers
        message['X-Auto-Response-Suppress'] = 'All'
        message['X-Entity-ID'] = f'vibecarding-{uuid.uuid4().hex[:8]}'
        message['List-Unsubscribe'] = '<mailto:unsubscribe@ast.engineer>'
        
        return {'raw': base64.urlsafe_b64encode(message.as_bytes()).decode()}
    
    message['To'] = to
    message['From'] = sender
    message['Subject'] = subject
    
    # Add comprehensive headers for deliverability
    message['Date'] = formatdate(localtime=True)
    message['Message-ID'] = make_msgid(domain='ast.engineer')
    message['X-Mailer'] = 'VibeCarding Email Service v1.0'
    message['MIME-Version'] = '1.0'
    message['X-Priority'] = '3'
    message['X-MSMail-Priority'] = 'Normal'
    message['Importance'] = 'Normal'
    message['Reply-To'] = sender
    message['Return-Path'] = sender
    message['Sender'] = sender
    
    # Additional anti-spam headers
    message['X-Auto-Response-Suppress'] = 'All'
    message['X-Entity-ID'] = f'vibecarding-{uuid.uuid4().hex[:8]}'
    message['List-Unsubscribe'] = '<mailto:unsubscribe@ast.engineer>'
    
    # Add text part with proper encoding
    text_part = MIMEText(message_text, 'plain', 'utf-8')
    message.attach(text_part)
    
    # Add HTML part if provided
    if html_body:
        html_part = MIMEText(html_body, 'html', 'utf-8')
        message.attach(html_part)
    
    # Add attachments if provided
    if attachments:
        for attachment in attachments:
            if isinstance(attachment, dict):
                # Attachment is data with metadata
                filename = attachment.get('filename', 'attachment')
                content = attachment.get('content', b'')
                content_type = attachment.get('content_type', 'application/octet-stream')
            else:
                # Attachment is a file path
                filename = os.path.basename(attachment)
                with open(attachment, 'rb') as f:
                    content = f.read()
                content_type, _ = mimetypes.guess_type(attachment)
                if content_type is None:
                    content_type = 'application/octet-stream'
            
            main_type, sub_type = content_type.split('/', 1)
            part = MIMEBase(main_type, sub_type)
            part.set_payload(content)
            encoders.encode_base64(part)
            part.add_header(
                'Content-Disposition',
                f'attachment; filename="{filename}"',
            )
            message.attach(part)
    
    return {'raw': base64.urlsafe_b64encode(message.as_bytes()).decode()}

def send_gmail_message(service, user_id, message):
    """
    Send an email message.
    
    Args:
        service: Authorized Gmail API service instance
        user_id (str): User's email address. The special value "me" can be used to indicate the authenticated user
        message (dict): Message to be sent
    
    Returns:
        dict: Sent Message
    """
    try:
        message = service.users().messages().send(userId=user_id, body=message).execute()
        print(f'Message Id: {message["id"]}')
        return message
    except HttpError as error:
        print(f'An error occurred: {error}')
        raise error


@app.route('/user_data/<user_number>/<category>/<path:filename>')
def serve_user_file(user_number, category, filename):
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'user_data'))
    user_dir = os.path.join(base_dir, user_number, category)
    file_path = os.path.join(user_dir, filename)
    # If the file does not exist and does not end with .html (for apps), try adding .html
    if category == "apps" and not os.path.exists(file_path) and not filename.endswith('.html'):
        file_path += '.html'
        filename += '.html'
    # Prevent path traversal
    if not os.path.abspath(file_path).startswith(os.path.join(base_dir, user_number)):
        abort(403)
    if not os.path.exists(file_path):
        abort(404)
    return send_from_directory(user_dir, filename)

@app.route('/utils/<path:filename>')
def serve_utils_file(filename):
    """Serve files from utils directory"""
    try:
        # Construct the file path
        utils_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'utils'))
        file_path = os.path.join(utils_dir, filename)
        
        # Prevent path traversal
        if not os.path.abspath(file_path).startswith(utils_dir):
            abort(403)
        
        # Check if file exists
        if not os.path.exists(file_path):
            abort(404)
        
        # Serve the file
        return send_from_directory(utils_dir, filename)
        
    except Exception as e:
        print(f"Error serving utils file: {str(e)}")
        abort(500)

# Initialize signal bot when app starts
init_signal_bot()

@app.route('/view/code/<path:filename>')
def view_code(filename):
    """
    View code files with syntax highlighting in the browser.
    Currently supports Python files in the user_data/generated_mcp_servers directory.
    """
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'user_data/generated_mcp_servers'))
    file_path = os.path.join(base_dir, filename)
    
    # Prevent path traversal
    if not os.path.abspath(file_path).startswith(base_dir):
        abort(403)
    
    if not os.path.exists(file_path):
        abort(404)
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            code = f.read()
            
        # Generate syntax highlighted HTML
        lexer = PythonLexer()
        formatter = HtmlFormatter(style='default', linenos=True, full=True)
        highlighted_code = pygments.highlight(code, lexer, formatter)
        
        # Include CSS for syntax highlighting
        css = formatter.get_style_defs('.highlight')
        
        # Combine CSS and highlighted code
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Code: {filename}</title>
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; }}
                .container {{ max-width: 1200px; margin: 0 auto; padding: 20px; }}
                h1 {{ font-size: 24px; margin-bottom: 20px; }}
                {css}
                .highlight {{ overflow-x: auto; }}
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Code Viewer: {filename}</h1>
                {highlighted_code}
            </div>
        </body>
        </html>
        """
        
        return html
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/analyze_images', methods=['POST'])
def proxy_analyze_images():
    """
    Analyze images using Gemini AI model.
    Accepts a list of image URLs and returns detailed analysis for each.
    
    Expected JSON payload:
    {
        "urls": ["url1", "url2", ...],
        "analysis_prompt": "Describe this image in detail."  // optional, defaults to "Describe this image in detail."
    }
    
    Returns:
    {
        "status": "success" | "error",
        "results": [
            {
                "status": "success" | "error",
                "analysis": "Detailed analysis text from Gemini",
                "url": "Original image URL that was analyzed",
                "message": "Error message if analysis failed"
            }
        ]
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                "status": "error",
                "message": "No JSON data provided"
            }), 400
            
        urls = data.get('urls')
        analysis_prompt = data.get('analysis_prompt', "Describe this image in detail.")
        
        if not urls:
            return jsonify({
                "status": "error", 
                "message": "Missing 'urls' parameter"
            }), 400
            
        if not isinstance(urls, list):
            return jsonify({
                "status": "error",
                "message": "'urls' must be a list"
            }), 400
            
        # Prepare the request for the MCP service
        mcp_request_data = {
            "tool_name": "analyze_images",
            "arguments": {
                "urls": urls,
                "analysis_prompt": analysis_prompt
            }
        }
        
        # Check if we have the internal API key
        if not MCP_INTERNAL_API_KEY:
            return jsonify({
                "status": "error",
                "message": "MCP_INTERNAL_API_KEY not configured"
            }), 500
        
        # Prepare headers for the internal call
        headers = {
            'Content-Type': 'application/json',
            'X-Internal-API-Key': MCP_INTERNAL_API_KEY
        }
        
        # Forward the request to the MCP service's internal endpoint
        mcp_response = requests.post(
            'http://localhost:5001/internal/call_mcp_tool',
            json=mcp_request_data,
            headers=headers,
            timeout=300
        )
        mcp_response.raise_for_status()
        
        # Parse the MCP response and unwrap the result
        mcp_json = mcp_response.json()
        
        # Extract the result field from the MCP response
        if 'result' in mcp_json:
            result_data = mcp_json['result']
            
            # If result is a JSON string, parse it
            if isinstance(result_data, str):
                try:
                    parsed_result = json.loads(result_data)
                    return jsonify(parsed_result)
                except json.JSONDecodeError:
                    # If it's not valid JSON, return it as is
                    return jsonify({"status": "error", "message": "Invalid JSON in MCP result", "raw_result": result_data}), 500
            else:
                # If result is already parsed, return it directly
                return jsonify(result_data)
        else:
            # If no result field, return the entire response
            return jsonify(mcp_json)
        
    except requests.exceptions.HTTPError as http_err:
        error_detail = f"HTTP error calling MCP image analysis: {str(http_err)}"
        try:
            if http_err.response is not None:
                mcp_error_content_type = http_err.response.headers.get("Content-Type", "")
                if "application/json" in mcp_error_content_type:
                    mcp_error_json = http_err.response.json()
                    if "error" in mcp_error_json:
                        error_detail = f"MCP Image Analysis Error: {mcp_error_json['error']}"
                    elif "detail" in mcp_error_json:
                        error_detail = f"MCP Image Analysis Detail: {mcp_error_json['detail']}"
                else:
                    error_detail = f"HTTP error {http_err.response.status_code} from MCP service: {http_err.response.text[:500]}"
        except ValueError:
            if http_err.response is not None:
                error_detail = f"HTTP error {http_err.response.status_code} from MCP service (non-JSON response): {http_err.response.text[:500]}"
        return jsonify({"status": "error", "message": error_detail}), http_err.response.status_code if http_err.response is not None else 500
    except requests.exceptions.RequestException as e:
        return jsonify({
            "status": "error", 
            "message": f"Error communicating with MCP service: {str(e)}"
        }), 500
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Unexpected error: {str(e)}"
        }), 500

@app.route('/generate_images', methods=['POST'])
def generate_images():
    """
    Generate images using Google's Imagen 4.0 model.
    Accepts a list of prompts and returns a list of image URLs.
    
    Expected JSON payload:
    {
        "prompts": ["prompt1", "prompt2", ...],
        "user_number": "+17145986105",  // optional, defaults to "+17145986105"
        "model_version": "imagen-4.0-generate-preview-06-06"  // optional, defaults to balanced model
    }
    
    Returns:
    {
        "status": "success" | "partial_error" | "error",
        "message": "Human-readable status message",
        "results": [
            ["url1", "url2", ...],  // URLs for successful generations
            {"error": "error message"}  // Error objects for failed generations
        ]
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                "status": "error",
                "message": "No JSON data provided"
            }), 400
            
        prompts = data.get('prompts')
        user_number = data.get('user_number', 'default')
        model_version = data.get('model_version', 'imagen-4.0-generate-preview-06-06')
        
        if not prompts:
            return jsonify({
                "status": "error", 
                "message": "Missing 'prompts' parameter"
            }), 400
            
        if not isinstance(prompts, list):
            return jsonify({
                "status": "error",
                "message": "'prompts' must be a list"
            }), 400
            
        # Prepare the request for the MCP service
        mcp_request_data = {
            "tool_name": "generate_images_with_prompts",
            "arguments": {
                "user_number": user_number,
                "prompts": prompts,
                "model_version": model_version
            }
        }
        
        # Check if we have the internal API key
        if not MCP_INTERNAL_API_KEY:
            return jsonify({
                "status": "error",
                "message": "MCP_INTERNAL_API_KEY not configured"
            }), 500
        
        # Prepare headers for the internal call
        headers = {
            'Content-Type': 'application/json',
            'X-Internal-API-Key': MCP_INTERNAL_API_KEY
        }
        
        # Forward the request to the MCP service's internal endpoint
        mcp_response = requests.post(
            'http://localhost:5001/internal/call_mcp_tool',
            json=mcp_request_data,
            headers=headers,
            timeout=300
        )
        mcp_response.raise_for_status()
        
        # Parse the MCP response and unwrap the result
        mcp_json = mcp_response.json()
        
        # Extract the result field from the MCP response
        if 'result' in mcp_json:
            result_data = mcp_json['result']
            
            # If result is a JSON string, parse it
            if isinstance(result_data, str):
                try:
                    parsed_result = json.loads(result_data)
                    return jsonify(parsed_result)
                except json.JSONDecodeError:
                    # If it's not valid JSON, return it as is
                    return jsonify({"status": "error", "message": "Invalid JSON in MCP result", "raw_result": result_data}), 500
            else:
                # If result is already parsed, return it directly
                return jsonify(result_data)
        else:
            # If no result field, return the entire response
            return jsonify(mcp_json)
        
    except requests.exceptions.HTTPError as http_err:
        error_detail = f"HTTP error calling MCP image generation: {str(http_err)}"
        try:
            if http_err.response is not None:
                mcp_error_content_type = http_err.response.headers.get("Content-Type", "")
                if "application/json" in mcp_error_content_type:
                    mcp_error_json = http_err.response.json()
                    if "error" in mcp_error_json:
                        error_detail = f"MCP Image Generation Error: {mcp_error_json['error']}"
                    elif "detail" in mcp_error_json:
                        error_detail = f"MCP Image Generation Detail: {mcp_error_json['detail']}"
                else:
                    error_detail = f"HTTP error {http_err.response.status_code} from MCP service: {http_err.response.text[:500]}"
        except ValueError:
            if http_err.response is not None:
                error_detail = f"HTTP error {http_err.response.status_code} from MCP service (non-JSON response): {http_err.response.text[:500]}"
        return jsonify({"status": "error", "message": error_detail}), http_err.response.status_code if http_err.response is not None else 500
    except requests.exceptions.RequestException as e:
        return jsonify({
            "status": "error", 
            "message": f"Error communicating with MCP service: {str(e)}"
        }), 500
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Unexpected error: {str(e)}"
        }), 500

@app.route('/users/<user_id>/tools', methods=['GET'])
def proxy_user_tools(user_id):
    """Proxy the per-user tools list request to the MCP service.
    The front-end asks GET {BACKEND_API_BASE_URL}/users/<user_id>/tools → forward to mcp_service (localhost:5001).
    """
    try:
        # Forward request to the MCP service
        mcp_resp = requests.get(f'http://localhost:5001/users/{user_id}/tools', timeout=10)
        mcp_resp.raise_for_status()
        return jsonify(mcp_resp.json()), mcp_resp.status_code
    except requests.exceptions.HTTPError as http_err:
        detail = f"HTTP error from MCP service: {str(http_err)}"
        if http_err.response is not None:
            try:
                detail_json = http_err.response.json()
                detail = detail_json.get('detail') or detail_json.get('error') or detail
            except Exception:
                detail = f"HTTP {http_err.response.status_code}: {http_err.response.text[:200]}"
        return jsonify({"error": detail}), http_err.response.status_code if http_err.response else 502
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Error communicating with MCP service: {str(e)}"}), 502

# Add Epson Connect API integration before the user tools proxy section

# Epson Connect API Configuration
EPSON_CLIENT_ID = "56686329726c4e079b93fd9c4250f7f5"
EPSON_CLIENT_SECRET = "Rnf1TIOnPenFR8OQkH9ybPKbFGhhoTXy3wSeWNRhhYbdx9FnHPW5TpW9lX2XB7t8VEX79ZqQMZAEc4XTqYx1VQ"
EPSON_API_KEY = "xbAKo4PujZ79C1t02TAjl8SuazDD7Nyx2UT4kfty"
EPSON_REDIRECT_URI = f"{DOMAIN_FROM_ENV}/epson/callback"

def get_epson_tokens():
    """Get stored Epson tokens from data storage"""
    try:
        file_path = get_file_path('epson-tokens')
        if os.path.exists(file_path):
            with open(file_path, 'r') as f:
                data = json.load(f)
                return data.get('value', {})
    except Exception as e:
        print(f"Error reading Epson tokens: {e}")
    return None

def store_epson_tokens(tokens):
    """Store Epson tokens in data storage"""
    try:
        data = {
            'key': 'epson-tokens',
            'value': tokens,
            'write_timestamp': time.time(),
            'read_timestamp': None,
            'read_count': 0
        }
        file_path = get_file_path('epson-tokens')
        with open(file_path, 'w') as f:
            json.dump(data, f)
        return True
    except Exception as e:
        print(f"Error storing Epson tokens: {e}")
        return False

def refresh_epson_token():
    """Refresh the Epson device token using the refresh token"""
    tokens = get_epson_tokens()
    if not tokens or 'refresh_token' not in tokens:
        return None
    
    try:
        # Encode client credentials
        credentials = f"{EPSON_CLIENT_ID}:{EPSON_CLIENT_SECRET}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()
        
        headers = {
            'Authorization': f'Basic {encoded_credentials}',
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        
        data = {
            'grant_type': 'refresh_token',
            'refresh_token': tokens['refresh_token']
        }
        
        response = requests.post(
            'https://auth.epsonconnect.com/auth/token',
            headers=headers,
            data=data,
            timeout=30
        )
        
        if response.status_code == 200:
            token_data = response.json()
            # Update stored tokens
            updated_tokens = {
                'access_token': token_data['access_token'],
                'refresh_token': token_data['refresh_token'],
                'expires_in': token_data['expires_in'],
                'token_timestamp': time.time(),
                'scope': token_data.get('scope', 'device')
            }
            store_epson_tokens(updated_tokens)
            return updated_tokens
        else:
            print(f"Failed to refresh Epson token: {response.status_code} - {response.text}")
            return None
            
    except Exception as e:
        print(f"Error refreshing Epson token: {e}")
        return None

@app.route('/epson/authorize')
def epson_authorize():
    """Redirect user to Epson Connect authorization"""
    auth_url = (
        f"https://auth.epsonconnect.com/auth/authorize"
        f"?response_type=code"
        f"&client_id={EPSON_CLIENT_ID}"
        f"&redirect_uri={EPSON_REDIRECT_URI}"
        f"&scope=device"
    )
    return redirect(auth_url)

@app.route('/epson/callback')
def epson_callback():
    """Handle Epson Connect OAuth callback"""
    # Debug: log all parameters received
    all_args = dict(request.args)
    print(f"Epson callback received parameters: {all_args}")
    
    code = request.args.get('code')
    error = request.args.get('error')
    error_description = request.args.get('error_description')
    
    if error:
        return jsonify({
            'status': 'error',
            'message': f'Authorization failed: {error}',
            'error_description': error_description,
            'received_params': all_args
        }), 400
    
    if not code:
        return jsonify({
            'status': 'error',
            'message': 'No authorization code received',
            'received_params': all_args
        }), 400
    
    try:
        # Exchange authorization code for tokens
        credentials = f"{EPSON_CLIENT_ID}:{EPSON_CLIENT_SECRET}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()
        
        headers = {
            'Authorization': f'Basic {encoded_credentials}',
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        
        data = {
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': EPSON_REDIRECT_URI,
            'client_id': EPSON_CLIENT_ID
        }
        
        response = requests.post(
            'https://auth.epsonconnect.com/auth/token',
            headers=headers,
            data=data,
            timeout=30
        )
        
        if response.status_code == 200:
            token_data = response.json()
            tokens = {
                'access_token': token_data['access_token'],
                'refresh_token': token_data['refresh_token'],
                'expires_in': token_data['expires_in'],
                'token_timestamp': time.time(),
                'scope': token_data.get('scope', 'device')
            }
            
            if store_epson_tokens(tokens):
                return """
                <html>
                <head><title>Epson Authorization Success</title></head>
                <body>
                    <h1>✅ Epson Printer Authorized!</h1>
                    <p>Your printer has been successfully connected.</p>
                    <p>You can now close this window and use the printing API.</p>
                    <script>
                        setTimeout(() => window.close(), 3000);
                    </script>
                </body>
                </html>
                """
            else:
                return jsonify({
                    'status': 'error',
                    'message': 'Failed to store tokens'
                }), 500
        else:
            return jsonify({
                'status': 'error',
                'message': f'Token exchange failed: {response.status_code} - {response.text}'
            }), 400
            
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Authorization error: {str(e)}'
        }), 500

@app.route('/epson/status')
def epson_status():
    """Check Epson printer connection status"""
    tokens = get_epson_tokens()
    if not tokens:
        return jsonify({
            'status': 'not_authorized',
            'message': 'Printer not authorized. Please authorize first.',
            'auth_url': f"{DOMAIN_FROM_ENV}/epson/authorize"
        })
    
    # Check if token needs refresh (expires in 1 hour)
    token_age = time.time() - tokens.get('token_timestamp', 0)
    if token_age > 3000:  # Refresh if older than 50 minutes
        refreshed_tokens = refresh_epson_token()
        if refreshed_tokens:
            tokens = refreshed_tokens
        else:
            return jsonify({
                'status': 'token_expired',
                'message': 'Token expired and refresh failed. Please re-authorize.',
                'auth_url': f"{DOMAIN_FROM_ENV}/epson/authorize"
            })
    
    # Test device info API to verify connection
    try:
        headers = {
            'Authorization': f"Bearer {tokens['access_token']}",
            'x-api-key': EPSON_API_KEY
        }
        
        response = requests.get(
            'https://api.epsonconnect.com/api/2/printing/devices/info',
            headers=headers,
            timeout=15
        )
        
        if response.status_code == 200:
            device_info = response.json()
            return jsonify({
                'status': 'connected',
                'message': 'Printer is connected and ready',
                'device_info': device_info,
                'token_age_minutes': int(token_age / 60)
            })
        else:
            return jsonify({
                'status': 'error',
                'message': f'Device check failed: {response.status_code}',
                'details': response.text[:200]
            })
            
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Connection test failed: {str(e)}'
        })

@app.route('/epson/print', methods=['POST'])
def epson_print():
    """Print a document via Epson Connect API"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        # Required fields
        file_url = data.get('file_url')
        job_name = data.get('job_name', 'Print Job')
        
        if not file_url:
            return jsonify({'error': 'file_url is required'}), 400
        
        # Optional print settings with defaults
        print_settings = {
            'paperSize': data.get('paper_size', 'ps_letter'),
            'paperType': data.get('paper_type', 'pt_plainpaper'),
            'borderless': data.get('borderless', False),
            'printQuality': data.get('print_quality', 'normal'),
            'paperSource': data.get('paper_source', 'auto'),
            'colorMode': data.get('color_mode', 'color'),
            'copies': data.get('copies', 1),
            'doubleSided': data.get('double_sided', 'none')
        }
        
        # Get valid tokens
        tokens = get_epson_tokens()
        if not tokens:
            return jsonify({
                'error': 'Printer not authorized',
                'auth_url': f"{DOMAIN_FROM_ENV}/epson/authorize"
            }), 401
        
        # Check if token needs refresh
        token_age = time.time() - tokens.get('token_timestamp', 0)
        if token_age > 3000:  # Refresh if older than 50 minutes
            refreshed_tokens = refresh_epson_token()
            if refreshed_tokens:
                tokens = refreshed_tokens
            else:
                return jsonify({
                    'error': 'Token expired and refresh failed',
                    'auth_url': f"{DOMAIN_FROM_ENV}/epson/authorize"
                }), 401
        
        headers = {
            'Authorization': f"Bearer {tokens['access_token']}",
            'x-api-key': EPSON_API_KEY,
            'Content-Type': 'application/json'
        }
        
        # Step 1: Create print job
        job_payload = {
            'jobName': job_name,
            'printMode': 'document',
            'printSettings': print_settings
        }
        
        job_response = requests.post(
            'https://api.epsonconnect.com/api/2/printing/jobs',
            headers=headers,
            json=job_payload,
            timeout=30
        )
        
        if job_response.status_code != 200:
            return jsonify({
                'error': 'Failed to create print job',
                'details': job_response.text
            }), job_response.status_code
        
        job_data = job_response.json()
        job_id = job_data['jobId']
        upload_uri = job_data['uploadUri']
        
        # Step 2: Download and upload file
        try:
            # Download the file
            file_response = requests.get(file_url, timeout=60)
            file_response.raise_for_status()
            
            # Upload to Epson
            upload_response = requests.post(
                f"{upload_uri}&File=document.pdf",
                headers={'Content-Type': 'application/pdf'},
                data=file_response.content,
                timeout=60
            )
            
            if upload_response.status_code not in [200, 204]:
                return jsonify({
                    'error': 'Failed to upload file',
                    'details': upload_response.text
                }), upload_response.status_code
            
        except Exception as e:
            return jsonify({
                'error': 'Failed to download or upload file',
                'details': str(e)
            }), 500
        
        # Step 3: Start printing
        print_response = requests.post(
            f'https://api.epsonconnect.com/api/2/printing/jobs/{job_id}/print',
            headers={
                'Authorization': f"Bearer {tokens['access_token']}",
                'x-api-key': EPSON_API_KEY
            },
            timeout=30
        )
        
        if print_response.status_code == 200:
            return jsonify({
                'status': 'success',
                'message': 'Print job started successfully',
                'job_id': job_id,
                'job_name': job_name
            })
        else:
            return jsonify({
                'error': 'Failed to start printing',
                'details': print_response.text
            }), print_response.status_code
            
    except Exception as e:
        return jsonify({
            'error': 'Print request failed',
            'details': str(e)
        }), 500

@app.route('/epson/capabilities')
def epson_capabilities():
    """Get printer capabilities"""
    try:
        print_mode = request.args.get('mode', 'document')  # document or photo
        
        tokens = get_epson_tokens()
        if not tokens:
            return jsonify({
                'error': 'Printer not authorized',
                'auth_url': f"{DOMAIN_FROM_ENV}/epson/authorize"
            }), 401
        
        # Check if token needs refresh
        token_age = time.time() - tokens.get('token_timestamp', 0)
        if token_age > 3000:
            refreshed_tokens = refresh_epson_token()
            if refreshed_tokens:
                tokens = refreshed_tokens
            else:
                return jsonify({
                    'error': 'Token expired and refresh failed',
                    'auth_url': f"{DOMAIN_FROM_ENV}/epson/authorize"
                }), 401
        
        headers = {
            'Authorization': f"Bearer {tokens['access_token']}",
            'x-api-key': EPSON_API_KEY
        }
        
        response = requests.get(
            f'https://api.epsonconnect.com/api/2/printing/capability/{print_mode}',
            headers=headers,
            timeout=15
        )
        
        if response.status_code == 200:
            return jsonify(response.json())
        else:
            return jsonify({
                'error': 'Failed to get capabilities',
                'details': response.text
            }), response.status_code
            
    except Exception as e:
        return jsonify({
            'error': 'Capabilities request failed',
            'details': str(e)
        }), 500

@app.route('/epson/print-card', methods=['POST'])
def epson_print_card():
    """Simple endpoint for Card Studio to print cards"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        # Extract card URLs
        front_cover = data.get('front_cover')
        back_cover = data.get('back_cover')
        left_page = data.get('left_page') 
        right_page = data.get('right_page')
        card_name = data.get('card_name', 'Greeting Card')
        
        if not front_cover:
            return jsonify({'error': 'front_cover URL is required'}), 400
        
        # For now, let's just print the front cover as a test
        # Later we can enhance this to create a proper card layout PDF
        
        # Get valid tokens
        tokens = get_epson_tokens()
        if not tokens:
            return jsonify({
                'error': 'Printer not authorized',
                'auth_url': f"{DOMAIN_FROM_ENV}/epson/authorize"
            }), 401
        
        # Check if token needs refresh
        token_age = time.time() - tokens.get('token_timestamp', 0)
        if token_age > 3000:  # Refresh if older than 50 minutes
            refreshed_tokens = refresh_epson_token()
            if refreshed_tokens:
                tokens = refreshed_tokens
            else:
                return jsonify({
                    'error': 'Token expired and refresh failed',
                    'auth_url': f"{DOMAIN_FROM_ENV}/epson/authorize"
                }), 401
        
        headers = {
            'Authorization': f"Bearer {tokens['access_token']}",
            'x-api-key': EPSON_API_KEY,
            'Content-Type': 'application/json'
        }
        
        # Print settings optimized for card printing
        print_settings = {
            'paperSize': 'ps_letter',  # Standard letter size
            'paperType': 'pt_plainpaper',
            'borderless': True,  # Full bleed for cards
            'printQuality': 'high',
            'paperSource': 'auto',
            'colorMode': 'color',
            'copies': 1,
            'doubleSided': 'none'
        }
        
        # Step 1: Create print job
        job_payload = {
            'jobName': f"Card: {card_name}",
            'printMode': 'document',
            'printSettings': print_settings
        }
        
        job_response = requests.post(
            'https://api.epsonconnect.com/api/2/printing/jobs',
            headers=headers,
            json=job_payload,
            timeout=30
        )
        
        if job_response.status_code != 200:
            return jsonify({
                'error': 'Failed to create print job',
                'details': job_response.text
            }), job_response.status_code
        
        job_data = job_response.json()
        job_id = job_data['jobId']
        upload_uri = job_data['uploadUri']
        
        # Step 2: Download and upload the front cover image
        try:
            # Download the image
            file_response = requests.get(front_cover, timeout=60)
            file_response.raise_for_status()
            
            # For now, upload as PDF - in the future we'll convert image to PDF properly
            upload_response = requests.post(
                f"{upload_uri}&File=card.jpg",
                headers={'Content-Type': 'image/jpeg'},
                data=file_response.content,
                timeout=60
            )
            
            if upload_response.status_code not in [200, 204]:
                return jsonify({
                    'error': 'Failed to upload card image',
                    'details': upload_response.text
                }), upload_response.status_code
            
        except Exception as e:
            return jsonify({
                'error': 'Failed to download or upload card image',
                'details': str(e)
            }), 500
        
        # Step 3: Start printing
        print_response = requests.post(
            f'https://api.epsonconnect.com/api/2/printing/jobs/{job_id}/print',
            headers={
                'Authorization': f"Bearer {tokens['access_token']}",
                'x-api-key': EPSON_API_KEY
            },
            timeout=30
        )
        
        if print_response.status_code == 200:
            return jsonify({
                'status': 'success',
                'message': f'Card "{card_name}" sent to printer successfully',
                'job_id': job_id,
                'printed_section': 'front_cover'
            })
        else:
            return jsonify({
                'error': 'Failed to start printing',
                'details': print_response.text
            }), print_response.status_code
            
    except Exception as e:
        return jsonify({
            'error': 'Card print request failed',
            'details': str(e)
        }), 500

# Print Queue System for Remote Printing
print_queue = []

@app.route('/api/print-queue', methods=['GET'])
def get_print_queue():
    """Get pending print jobs for local print agent"""
    try:
        # Return only pending jobs
        pending_jobs = [job for job in print_queue if job['status'] == 'pending']
        
        return jsonify({
            'status': 'success',
            'jobs': pending_jobs,
            'total_pending': len(pending_jobs),
            'total_jobs': len(print_queue)
        })
        
    except Exception as e:
        return jsonify({
            'error': 'Failed to get print queue',
            'details': str(e)
        }), 500

@app.route('/api/print-complete/<job_id>', methods=['POST'])
def mark_print_complete(job_id):
    """Mark a print job as completed"""
    try:
        data = request.get_json() or {}
        success = data.get('success', True)
        error_message = data.get('error_message', '')
        
        # Find and update the job
        for job in print_queue:
            if job['id'] == job_id:
                job['status'] = 'completed' if success else 'failed'
                job['completed_at'] = time.time()
                if error_message:
                    job['error_message'] = error_message
                
                return jsonify({
                    'status': 'updated',
                    'job_id': job_id,
                    'new_status': job['status']
                })
        
        return jsonify({
            'error': 'Job not found',
            'job_id': job_id
        }), 404
        
    except Exception as e:
        return jsonify({
            'error': 'Failed to update job status',
            'details': str(e)
        }), 500

@app.route('/api/print-status/<job_id>', methods=['GET'])
def get_print_status(job_id):
    """Get the status of a specific print job"""
    try:
        # Find the job
        for job in print_queue:
            if job['id'] == job_id:
                return jsonify({
                    'status': 'found',
                    'job': job
                })
        
        return jsonify({
            'status': 'not_found',
            'job_id': job_id
        }), 404
        
    except Exception as e:
        return jsonify({
            'error': 'Failed to get job status',
            'details': str(e)
        }), 500

@app.route('/api/print-history', methods=['GET'])
def get_print_history():
    """Get print job history"""
    try:
        # Get query parameters
        limit = request.args.get('limit', 50, type=int)
        status_filter = request.args.get('status')  # pending, completed, failed
        
        # Filter jobs
        filtered_jobs = print_queue
        if status_filter:
            filtered_jobs = [job for job in print_queue if job['status'] == status_filter]
        
        # Sort by creation time (newest first) and limit
        sorted_jobs = sorted(filtered_jobs, key=lambda x: x['created_at'], reverse=True)[:limit]
        
        return jsonify({
            'status': 'success',
            'jobs': sorted_jobs,
            'total_returned': len(sorted_jobs),
            'total_all_jobs': len(print_queue)
        })
        
    except Exception as e:
        return jsonify({
            'error': 'Failed to get print history',
                      'details': str(e)
      }), 500

@app.route('/api/create-card-pdf', methods=['POST'])
def create_card_pdf():
    """Create a proper duplex PDF for card printing"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        # Required card images
        front_cover = data.get('front_cover')
        back_cover = data.get('back_cover')
        left_page = data.get('left_page')
        right_page = data.get('right_page')
        
        # Optional settings
        paper_size = data.get('paper_size', 'standard')  # standard = 5x7 card
        is_front_back_only = data.get('is_front_back_only', False)
        
        if not front_cover or not back_cover:
            return jsonify({'error': 'front_cover and back_cover are required'}), 400
        
        if not is_front_back_only and (not left_page or not right_page):
            return jsonify({'error': 'left_page and right_page are required for full cards'}), 400
        
        # Set up PDF dimensions based on paper size
        if paper_size == 'compact':
            # 4×6 card (8×6 print layout)
            page_width = 8 * inch
            page_height = 6 * inch
            card_width = 4 * inch
            card_height = 6 * inch
        elif paper_size == 'a6':
            # A6 card (8.3×5.8 print layout)
            page_width = 8.3 * inch
            page_height = 5.8 * inch
            card_width = 4.15 * inch
            card_height = 5.8 * inch
        else:
            # Default: standard 5×7 card (10×7 print layout)
            page_width = 10 * inch
            page_height = 7 * inch
            card_width = 5 * inch
            card_height = 7 * inch
        
        # Create PDF in memory
        pdf_buffer = io.BytesIO()
        pdf = canvas.Canvas(pdf_buffer, pagesize=(page_width, page_height))
        
        def download_and_process_image(url):
            """Download image and prepare for PDF"""
            try:
                if url.startswith('data:'):
                    # Handle base64 data URLs
                    print(f"Processing base64 data URL: {url[:50]}...")
                    # Extract the base64 data
                    header, data = url.split(',', 1)
                    img_data = base64.b64decode(data)
                    img = Image.open(io.BytesIO(img_data))
                else:
                    # Handle HTTP URLs
                    print(f"Downloading image from URL: {url}")
                    response = requests.get(url, timeout=30)
                    response.raise_for_status()
                    
                    # Open with PIL to ensure proper format
                    img = Image.open(io.BytesIO(response.content))
                
                # Convert to RGB if needed
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                
                # Create BytesIO for reportlab
                img_buffer = io.BytesIO()
                img.save(img_buffer, format='JPEG', quality=95)
                img_buffer.seek(0)
                
                return ImageReader(img_buffer)
            except Exception as e:
                print(f"Error processing image {url[:100]}...: {e}")
                return None
        
        # Download all images
        print("Downloading card images...")
        print(f"Front cover URL: {front_cover}")
        print(f"Back cover URL: {back_cover[:100]}..." if len(back_cover) > 100 else f"Back cover URL: {back_cover}")
        
        front_img = download_and_process_image(front_cover)
        back_img = download_and_process_image(back_cover)
        
        if not front_img:
            print("Failed to process front cover image")
            return jsonify({'error': 'Failed to download front cover image'}), 500
        if not back_img:
            print("Failed to process back cover image")
            return jsonify({'error': 'Failed to download back cover image'}), 500
        
        left_img = None
        right_img = None
        if not is_front_back_only:
            left_img = download_and_process_image(left_page)
            right_img = download_and_process_image(right_page)
            
            if not left_img or not right_img:
                return jsonify({'error': 'Failed to download interior page images'}), 500
        
        if is_front_back_only:
            # Simple front/back layout on one page
            print("Creating front/back only PDF...")
            
            # Left half: Back cover (when folded, this becomes the back)
            pdf.drawImage(back_img, 0, 0, width=card_width, height=card_height, preserveAspectRatio=True, anchor='c')
            
            # Right half: Front cover 
            pdf.drawImage(front_img, card_width, 0, width=card_width, height=card_height, preserveAspectRatio=True, anchor='c')
            
            # Add fold line guide (very light)
            pdf.setStrokeColorRGB(0.9, 0.9, 0.9)
            pdf.setLineWidth(0.5)
            pdf.line(card_width, 0, card_width, card_height)
            
        else:
            # Full duplex card layout
            print("Creating full duplex PDF...")
            
            # Page 1: Outside (Back + Front)
            # Left half: Back cover
            pdf.drawImage(back_img, 0, 0, width=card_width, height=card_height, preserveAspectRatio=True, anchor='c')
            
            # Right half: Front cover
            pdf.drawImage(front_img, card_width, 0, width=card_width, height=card_height, preserveAspectRatio=True, anchor='c')
            
            # Add fold line guide
            pdf.setStrokeColorRGB(0.9, 0.9, 0.9)
            pdf.setLineWidth(0.5)
            pdf.line(card_width, 0, card_width, card_height)
            
            # Start new page for inside
            pdf.showPage()
            
            # Page 2: Inside (Left + Right interior) - Rotated 180° for proper duplex alignment
            pdf.saveState()
            
            # Rotate 180 degrees around center of page
            pdf.translate(page_width, page_height)
            pdf.rotate(180)
            
            # Left half: Left interior (appears on left when opened)
            pdf.drawImage(left_img, 0, 0, width=card_width, height=card_height, preserveAspectRatio=True, anchor='c')
            
            # Right half: Right interior (appears on right when opened)
            pdf.drawImage(right_img, card_width, 0, width=card_width, height=card_height, preserveAspectRatio=True, anchor='c')
            
            # Add fold line guide
            pdf.setStrokeColorRGB(0.9, 0.9, 0.9)
            pdf.setLineWidth(0.5)
            pdf.line(card_width, 0, card_width, card_height)
            
            pdf.restoreState()
        
        # Finalize PDF
        pdf.save()
        pdf_buffer.seek(0)
        
        # Store the PDF and return URL
        pdf_data = pdf_buffer.getvalue()
        pdf_base64 = base64.b64encode(pdf_data).decode('utf-8')
        
        # Create data URI
        data_uri = f"data:application/pdf;base64,{pdf_base64}"
        
        # Generate unique key for the PDF
        pdf_key = f"card-pdf-{hashlib.md5(f'{front_cover}-{back_cover}-{time.time()}'.encode()).hexdigest()}"
        
        # Store the PDF data
        pdf_file_data = {
            'key': pdf_key,
            'value': data_uri,
            'filename': f"greeting-card-{paper_size}.pdf",
            'mime_type': 'application/pdf',
            'size': len(pdf_data),
            'write_timestamp': time.time(),
            'read_timestamp': None,
            'read_count': 0,
            'card_type': 'front_back_only' if is_front_back_only else 'full_duplex',
            'paper_size': paper_size
        }
        
        # Save the PDF data
        file_path = get_file_path(pdf_key)
        with open(file_path, 'w') as f:
            json.dump(pdf_file_data, f)
        
        # Generate URL for accessing the PDF
        pdf_url = f"{DOMAIN_FROM_ENV}/serve?key={pdf_key}"
        
        return jsonify({
            'status': 'success',
            'pdf_url': pdf_url,
            'pdf_key': pdf_key,
            'size': len(pdf_data),
            'pages': 1 if is_front_back_only else 2,
            'layout': 'front_back_only' if is_front_back_only else 'full_duplex',
            'instructions': {
                'front_back_only': 'Print single-sided, then fold along center line',
                'full_duplex': 'Print duplex with "flip on short edge" setting'
            }
        })
        
    except Exception as e:
        print(f"Error creating card PDF: {str(e)}")
        return jsonify({
            'error': 'Failed to create PDF',
            'details': str(e)
        }), 500

@app.route('/api/print-queue', methods=['POST'])
def queue_print_job():
    """Add a print job to the queue for local print agent to process"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        # Check if this is a card print job
        if 'front_cover' in data:
            # This is a card - create PDF first
            print("Creating PDF for card print job...")
            
            pdf_response = requests.post(
                f"{DOMAIN_FROM_ENV}/api/create-card-pdf",
                json=data,
                timeout=60
            )
            
            if pdf_response.status_code != 200:
                return jsonify({
                    'error': 'Failed to create card PDF',
                    'details': pdf_response.text
                }), 500
            
            pdf_data = pdf_response.json()
            file_url = pdf_data['pdf_url']
            job_name = f"Card: {data.get('card_name', 'Greeting Card')}"
            
            # Set duplex settings based on card type
            is_duplex = not data.get('is_front_back_only', False)
            
        else:
            # Regular file print job
            file_url = data.get('file_url')
            if not file_url:
                return jsonify({'error': 'file_url is required'}), 400
            job_name = data.get('job_name', 'Remote Print Job')
            is_duplex = data.get('duplex', False)
        
        # Create print job
        job = {
            'id': str(uuid.uuid4()),
            'file_url': file_url,
            'job_name': job_name,
            'settings': {
                'duplex': is_duplex,
                'copies': data.get('copies', 1),
                'paper_size': data.get('paper_size', 'letter'),
                'color_mode': data.get('color_mode', 'color'),
                'quality': data.get('quality', 'high'),
                'paper_type': 'cardstock' if 'front_cover' in data else 'plain'
            },
            'status': 'pending',
            'created_at': time.time(),
            'user_info': {
                'user_agent': request.headers.get('User-Agent', ''),
                'ip_address': request.remote_addr
            },
            'type': 'card' if 'front_cover' in data else 'document'
        }
        
        print_queue.append(job)
        
        return jsonify({
            'status': 'queued',
            'job_id': job['id'],
            'message': 'Print job added to queue successfully',
            'file_url': file_url,
            'duplex': is_duplex
        })
        
    except Exception as e:
        print(f"Error queuing print job: {str(e)}")
        return jsonify({
            'error': 'Failed to queue print job',
            'details': str(e)
        }), 500


# Friendly URL generation arrays
positiveAdjectives = [
    "kind", "wise", "brave", "loyal", "joyful", "humble", "gentle", "zesty", "fun", "calm",
    "pure", "bold", "bright", "sharp", "eager", "neat", "sweet", "clean", "free", "good",
    "cool", "nice", "fair", "keen", "chill", "true", "open", "brisk", "warm", 
    "gifted", "alert", "steady", "peppy", "fiery", "sly", "loving", "tender", "brilliant", "noble",
    "energetic", "charismatic", "polite", "helpful", "jovial", "thoughtful", "fantastic", "pleasant", 
    "affable", "cheerful", "delightful", "vibrant", "zestful", "creative", "kindhearted", "trustworthy", 
    "optimistic", "charming", "adventurous", "confident", "affectionate", "respectful", "considerate", 
    "motivated", "genuine", "determined", "compassionate", "faithful", "balanced", "exuberant", 
    "hardworking", "insightful", "disciplined", "skilled", "openminded", "talented", "inspiring", 
    "engaging", "peaceful", "innovative", "supportive", "resourceful", "funny", "modest", "perceptive", 
    "excited", "grounded", "focused", "humorous", "gracious", "content", "knowledgeable", "sincere", 
    "devoted", "reliable", "outgoing", "fascinating", "enthusiastic", "empowering", "diligent", 
    "friendly", "welcoming", "honest", "careful", "lovable", "sympathetic", "empathetic", "productive", 
    "dynamic", "resilient", "passionate", "curious", "dedicated", "capable", "encouraging", "caring", 
    "intelligent", "ambitious", "generous", "positive", "honorable", "gracious"
]

positiveColors = [
    "amber", "aqua", "apricot", "azure", "beige", "blush", "bronze", "cobalt", "coral", "crimson",
    "emerald", "fuchsia", "gold", "green", "honey", "jade", "lavender", "lemon", "lilac", "lime",
    "magenta", "mint", "moss", "nectar", "ocean", "peach", "pear", "periwinkle", "pink", "plum",
    "poppy", "quartz", "rose", "ruby", "sapphire", "scarlet", "seafoam", "silver", "sky", "snow",
    "sunshine", "tangerine", "topaz", "turquoise", "vanilla", "violet", "watermelon", "white", "yellow",
    "caramel", "celeste", "champagne", "charcoal", "chocolate", "citrus", "copper", "ivory", "light", 
    "melon", "midnight", "mocha", "mulberry", "navy", "orchid", "platinum", "sea", "slate", "sunset", 
    "teal", "tomato", "wine", "blue", "candy", "clover", "cool", "dandelion", "dusty", "electric", 
    "fandango", "fiesta", "flamingo", "forest", "frost", "grape", "guava", "hazel", "indigo", "jasmine", 
    "kiwi", "lemonade", "magnolia", "neon", "peacock", "pineapple", "raspberry", "seashell", "shamrock", 
    "snowflake", "soft", "spice", "spring", "sunflower", "swamp", "thistle", "wisteria", "apple", 
    "banana", "butterscotch", "daisy", "fawn", "frosty", "goldenrod", "grapefruit", "honeysuckle", 
    "jadeite", "mist", "morning", "nautical", "pearl", "peridot", "velvet", "wheat", "wild", "zinnia"
]

animals = [
    "aardvark", "albatross", "alligator", "alpaca", "anaconda", "anteater", "antelope", "armadillo",
    "baboon", "badger", "bat", "beagle", "bear", "beaver", "bee", "beetle", "beluga", "bison", 
    "blackbird", "bobcat", "buffalo", "bulldog", "bullfrog", "buzzard", "caterpillar", "catfish", 
    "chameleon", "cheetah", "chicken", "chimpanzee", "chipmunk", "clam", "clownfish", "cockroach", 
    "coyote", "crab", "crane", "crocodile", "crow", "deer", "dingo", "dog", "dolphin", "donkey", 
    "duck", "eagle", "echidna", "eel", "elephant", "elk", "emu", "falcon", "ferret", "finch", 
    "firefly", "fish", "flamingo", "fox", "frog", "gerbil", "gibbon", "giraffe", "goat", "goldfish", 
    "goose", "gorilla", "grasshopper", "guppy", "hamster", "hare", "hawk", "hedgehog", "hippopotamus", 
    "hornet", "horse", "hummingbird", "hyena", "iguana", "impala", "jaguar", "jellyfish", "kangaroo", 
    "kiwi", "koala", "komodo", "kookaburra", "ladybug", "leopard", "lion", "llama", "lobster", "lynx", 
    "macaw", "manatee", "mandrill", "meerkat", "mole", "mongoose", "monkey", "moose", "mosquito", 
    "mouse", "octopus", "ocelot", "orangutan", "ostrich", "otter", "owl", "ox", "panda", "panther", 
    "parrot", "peacock", "pelican", "penguin", "pheasant", "pig", "pigeon", "platypus", "pony", 
    "porcupine", "rabbit", "raccoon", "rat", "raven", "reindeer", "salamander", "salmon", "scorpion", 
    "seahorse", "shark", "sheep", "shrimp", "skunk", "sloth", "slug", "snail", "snake", "sparrow", 
    "spider", "squid", "squirrel", "starfish", "stingray", "stork", "swallow", "swan", "tadpole", 
    "tarantula", "termite", "tiger", "toad", "toucan", "turkey", "turtle", "wallaby", "walrus", 
    "warthog", "wasp", "weasel", "whale", "wolverine", "woodpecker", "worm", "yak", "zebra"
]

def generate_friendly_card_id():
    """Generate a friendly card ID using the random name API"""
    try:
        response = requests.get('https://16504442930.work/random-name')
        if response.ok:
            data = response.json()
            return data['camelCase']
        else:
            # Fallback to local generation if API fails
            import random
            adjective = random.choice(positiveAdjectives)
            color = random.choice(positiveColors)
            animal = random.choice(animals)
            return adjective + color.capitalize() + animal.capitalize()
    except Exception as e:
        print(f"Error fetching random name from API: {e}")
        # Fallback to local generation
        import random
        adjective = random.choice(positiveAdjectives)
        color = random.choice(positiveColors)
        animal = random.choice(animals)
        return adjective + color.capitalize() + animal.capitalize()

def sync_write_data(key, value):
    """Synchronous version of write_data for Flask routes"""
    try:
        timestamp = time.time()
        data = {
            'key': key,
            'value': value,
            'write_timestamp': timestamp,
            'read_timestamp': None,
            'read_count': 0
        }
        
        # Save the main data using the same file path logic
        file_path = get_file_path(key)
        with open(file_path, 'w') as f:
            f.write(json.dumps(data))
        
        return {
            'status': 'success',
            'key': key,
        }
    except Exception as e:
        raise Exception(f"Error writing data: {str(e)}")

def sync_read_data(key):
    """Synchronous version of read_data for Flask routes"""
    try:
        file_path = get_file_path(key)
        if not os.path.exists(file_path):
            return None
            
        # Read the data
        with open(file_path, 'r') as f:
            content = f.read()
            data = json.loads(content)
            
        # Update read timestamp and count
        data['read_timestamp'] = time.time()
        data['read_count'] = data.get('read_count', 0) + 1
        
        # Write back the updated metadata
        with open(file_path, 'w') as f:
            f.write(json.dumps(data))
            
        return data.get('value')
    except Exception as e:
        return None

# Card sharing routes
@app.route('/api/cards/store', methods=['POST'])
def store_card():
    """Store a new greeting card"""
    try:
        data = request.get_json()
        
        # Generate card ID if not provided
        card_id = data.get('id') or str(uuid.uuid4())
        
        # Create card data structure
        card_data = {
            'id': card_id,
            'prompt': data.get('prompt', ''),
            'frontCover': data.get('frontCover', ''),
            'backCover': data.get('backCover', ''),
            'leftPage': data.get('leftPage', ''),
            'rightPage': data.get('rightPage', ''),
            'createdAt': time.time(),
            'expiresAt': time.time() + (365 * 24 * 60 * 60),  # 1 year expiry
            'version': 1
        }
        
        # Store in dedicated cards directory
        card_filename = f"card_{card_id}.json"
        card_path = os.path.join(CARDS_DIR, card_filename)
        
        with open(card_path, 'w') as f:
            json.dump(card_data, f, indent=2)
        
        # Generate share URL
        domain = DOMAIN_FROM_ENV or 'https://vibecarding.com'
        if domain.startswith('https://'):
            share_url = f"{domain}/card/{card_id}"
        else:
            share_url = f"https://{domain}/card/{card_id}"
        
        return jsonify({
            'status': 'success',
            'card_id': card_id,
            'share_url': share_url,
            'message': 'Card stored successfully'
        })
        
    except Exception as e:
        print(f"Error storing card: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/cards/list', methods=['GET'])
def list_all_cards():
    """List all stored cards with pagination and filtering"""
    try:
        # Check if this is a template request (lighter payload)
        template_mode = request.args.get('template_mode', 'false').lower() == 'true'
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 20))
        search = request.args.get('search', '').lower()
        
        cards = []
        
        # Read all card files from the dedicated cards directory
        if os.path.exists(CARDS_DIR):
            for filename in os.listdir(CARDS_DIR):
                if not filename.startswith('card_') or not filename.endswith('.json'):
                    continue
                    
                card_path = os.path.join(CARDS_DIR, filename)
                try:
                    with open(card_path, 'r') as f:
                        card_data = json.load(f)
                    
                    # Skip expired cards
                    if card_data.get('expiresAt', 0) < time.time():
                        continue
                    
                    # Apply search filter if provided
                    if search:
                        prompt = card_data.get('prompt', '').lower()
                        card_id = card_data.get('id', '').lower()
                        if search not in prompt and search not in card_id:
                            continue
                    
                    # Format creation date
                    created_at = card_data.get('createdAt', 0)
                    from datetime import datetime
                    created_formatted = datetime.fromtimestamp(created_at).strftime('%B %d, %Y at %I:%M %p') if created_at else 'Unknown'
                    
                    # Generate share URL
                    domain = DOMAIN_FROM_ENV or 'https://vibecarding.com'
                    if domain.startswith('https://'):
                        share_url = f"{domain}/card/{card_data.get('id')}"
                    else:
                        share_url = f"https://{domain}/card/{card_data.get('id')}"
                    
                    if template_mode:
                        # Lighter payload for template requests
                        cards.append({
                            'id': card_data.get('id'),
                            'prompt': card_data.get('prompt', ''),
                            'frontCover': card_data.get('frontCover', ''),
                            'createdAt': created_at,
                            'createdAtFormatted': created_formatted,
                            'hasImages': bool(card_data.get('frontCover'))
                        })
                    else:
                        # Full payload for gallery requests
                        cards.append({
                            'id': card_data.get('id'),
                            'prompt': card_data.get('prompt', ''),
                            'frontCover': card_data.get('frontCover', ''),
                            'backCover': card_data.get('backCover', ''),
                            'leftPage': card_data.get('leftPage', ''),
                            'rightPage': card_data.get('rightPage', ''),
                            'createdAt': created_at,
                            'createdAtFormatted': created_formatted,
                            'shareUrl': share_url,
                            'hasImages': bool(card_data.get('frontCover') or card_data.get('backCover') or 
                                           card_data.get('leftPage') or card_data.get('rightPage'))
                        })
                        
                except (json.JSONDecodeError, IOError, KeyError) as e:
                    print(f"Error reading card file {filename}: {str(e)}")
                    continue
        
        # Sort by creation time (newest first)
        cards.sort(key=lambda x: x.get('createdAt', 0), reverse=True)
        
        # Apply pagination
        total_cards = len(cards)
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        paginated_cards = cards[start_idx:end_idx]
        
        return jsonify({
            'status': 'success',
            'cards': paginated_cards,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total_cards,
                'pages': (total_cards + per_page - 1) // per_page,
                'has_next': end_idx < total_cards,
                'has_prev': page > 1
            },
            'search': search if search else None
        })
        
    except Exception as e:
        print(f"Error listing cards: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/cards/send-email', methods=['POST'])
def send_card_email():
    """Send a card via email to a recipient"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No email data provided'}), 400
        
        email = data.get('email')
        share_url = data.get('share_url')
        card_prompt = data.get('card_prompt', 'your custom card')
        
        if not email:
            return jsonify({'error': 'Email address is required'}), 400
        if not share_url:
            return jsonify({'error': 'Share URL is required'}), 400
        
        # Send email using the same endpoint as other email functions
        email_response = requests.post('https://16504442930.work/send_email_attachments', json={
            'to': email,
            'from': 'vibecarding@ast.engineer',
            'subject': 'Someone sent you a beautiful greeting card! 🎉',
            'body': f"""Hi there!

Someone has sent you a beautiful greeting card created with VibeCarding!

View your card: {share_url}

The card was created with the theme: "{card_prompt}"

We hope this card brings a smile to your face! 

Best regards,
The VibeCarding Team
vibecarding@ast.engineer""",
            'html': False
        })
        
        if email_response.ok:
            return jsonify({
                'status': 'success',
                'message': 'Card sent successfully via email!'
            })
        else:
            return jsonify({
                'status': 'error',
                'message': 'Failed to send email'
            }), 500
        
    except Exception as e:
        print(f"Error sending card email: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': 'Failed to send email',
            'details': str(e)
        }), 500


@app.route('/card/<card_id>')
def view_shared_card(card_id):
    """Serve standalone card viewer page"""
    try:
        # Try to load card from new cards directory structure
        card_path = os.path.join(CARDS_DIR, f"card_{card_id}.json")
        card_data = None
        
        if os.path.exists(card_path):
            with open(card_path, 'r') as f:
                card_data = json.load(f)
        else:
            # Fallback: try old storage method for backward compatibility
            card_data = sync_read_data(f"shared_card_{card_id}")
        
        print(f"Retrieving card {card_id}, found data: {bool(card_data)}")
        
        if not card_data:
            print(f"Card {card_id} not found")
            abort(404)
        
        # Check if card has expired
        if card_data.get('expiresAt', 0) < time.time():
            print(f"Card {card_id} has expired")
            abort(410)  # Gone
        
        print(f"Rendering card {card_id} with image URLs: front={card_data.get('frontCover', 'None')}, back={card_data.get('backCover', 'None')}, left={card_data.get('leftPage', 'None')}, right={card_data.get('rightPage', 'None')}")
        
        # Format the creation date for display
        if card_data.get('createdAt'):
            from datetime import datetime
            created_timestamp = card_data.get('createdAt')
            card_data['createdAtFormatted'] = datetime.fromtimestamp(created_timestamp).strftime('%B %d, %Y')
        
        # Render card viewer template
        return render_template('card_viewer.html', card=card_data)
        
    except Exception as e:
        print(f"Error viewing shared card: {str(e)}")
        abort(500)

@app.route('/send_email_nodejs_style', methods=['POST'])
def send_email_nodejs_style():
    """
    Send email using the Python version of the Node.js Gmail client approach.
    Uses manual email construction and JWT authentication like the Node.js version.
    
    Expected JSON payload:
    {
        "to": "recipient@example.com",
        "from": "sender@ast.engineer",  // Optional, defaults to vibecarding@ast.engineer
        "subject": "Email Subject",
        "body": "HTML email body",
        "attachment_base64": "base64_encoded_pdf_data",  // Optional
        "filename": "attachment.pdf"  // Optional
    }
    
    Returns:
    {
        "status": "success" | "error",
        "message": "Status message",
        "message_id": "Gmail message ID (on success)"
    }
    """
    if not GMAIL_API_AVAILABLE:
        return jsonify({
            "status": "error",
            "message": "Gmail API libraries not available"
        }), 500
    
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                "status": "error",
                "message": "No JSON data provided"
            }), 400
        
        # Validate required fields
        to_email = data.get('to')
        if not to_email:
            return jsonify({
                "status": "error",
                "message": "Missing 'to' field"
            }), 400
        
        subject = data.get('subject', 'No Subject')
        body = data.get('body', '')
        attachment_base64 = data.get('attachment_base64')
        filename = data.get('filename')
        
        # Set sender email (must be in ast.engineer domain for delegation to work)
        from_email = data.get('from', 'vibecarding@ast.engineer')
        
        # Validate sender domain
        if not from_email.endswith('@ast.engineer'):
            return jsonify({
                "status": "error",
                "message": "Sender email must be from ast.engineer domain"
            }), 400
        
        # Initialize Gmail client (Python version of Node.js initializeGmailClient)
        try:
            gmail_service = initialize_gmail_client(from_email)
        except Exception as e:
            return jsonify({
                "status": "error",
                "message": f"Failed to initialize Gmail client: {str(e)}"
            }), 500
        
        # Send email using manual construction (Python version of Node.js sendEmailWithAttachment)
        try:
            result = send_email_with_attachment(
                gmail_service=gmail_service,
                to=to_email,
                subject=subject,
                body=body,
                attachment_base64=attachment_base64,
                filename=filename
            )
            
            return jsonify({
                "status": "success",
                "message": f"Email sent successfully to {to_email}",
                "message_id": result.get('id'),
                "from": from_email,
                "to": to_email,
                "subject": subject,
                "method": "nodejs_style_python"
            }), 200
            
        except Exception as e:
            return jsonify({
                "status": "error",
                "message": f"Failed to send email: {str(e)}"
            }), 500
        
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Unexpected error: {str(e)}"
        }), 500

# Job tracking storage - simple in-memory store for demo
# In production, use Redis or database
job_storage = {}

@app.route('/api/job-status/<job_id>', methods=['GET'])
def get_job_status(job_id):
    """Check the status of a card generation job."""
    try:
        if job_id not in job_storage:
            return jsonify({
                "status": "not_found",
                "message": "Job not found"
            }), 404
        
        job_data = job_storage[job_id]
        return jsonify({
            "status": job_data.get("status", "unknown"),
            "cardData": job_data.get("cardData"),
            "createdAt": job_data.get("createdAt"),
            "completedAt": job_data.get("completedAt"),
            "error": job_data.get("error")
        }), 200
        
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/api/store-job-result', methods=['POST'])
def store_job_result():
    """Store the result of a completed card generation job."""
    try:
        data = request.get_json()
        
        job_id = data.get('jobId')
        status = data.get('status')  # 'completed' or 'failed'
        card_data = data.get('cardData')
        error = data.get('error')
        
        if not job_id:
            return jsonify({
                "status": "error", 
                "message": "Job ID is required"
            }), 400
        
        # Store job result
        job_storage[job_id] = {
            "status": status,
            "cardData": card_data,
            "error": error,
            "completedAt": time.time(),
            "createdAt": job_storage.get(job_id, {}).get("createdAt", time.time())
        }
        
        return jsonify({
            "status": "success",
            "message": "Job result stored successfully"
        }), 200
        
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/api/create-job', methods=['POST'])
def create_job():
    """Create a new card generation job."""
    try:
        data = request.get_json()
        
        job_id = data.get('jobId')
        job_data = data.get('jobData')
        
        if not job_id:
            return jsonify({
                "status": "error",
                "message": "Job ID is required"
            }), 400
        
        # Store job as processing
        job_storage[job_id] = {
            "status": "processing",
            "jobData": job_data,
            "createdAt": time.time()
        }
        
        return jsonify({
            "status": "success",
            "message": "Job created successfully",
            "jobId": job_id
        }), 200
        
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/api/logos', methods=['GET'])
def get_saved_logos():
    """Get all saved logos from the logo library"""
    try:
        logos = []
        
        # Search through all files for logo library entries
        for root, dirs, files in os.walk(DATA_DIR):
            for file in files:
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, 'r') as f:
                        data = json.load(f)
                        
                    # Check if this is a logo library entry
                    if (data.get('key', '').startswith('logo_library_') and 
                        isinstance(data.get('value'), dict) and 
                        data['value'].get('is_logo')):
                        
                        logo_info = data['value']
                        logos.append({
                            'id': data['key'],
                            'filename': logo_info.get('filename'),
                            'original_filename': logo_info.get('original_filename'),
                            'url': logo_info.get('url'),
                            'size': logo_info.get('size'),
                            'uploaded_at': logo_info.get('uploaded_at'),
                            'mime_type': logo_info.get('mime_type')
                        })
                        
                except (json.JSONDecodeError, IOError):
                    continue
        
        # Sort by upload time (newest first)
        logos.sort(key=lambda x: x.get('uploaded_at', 0), reverse=True)
        
        return jsonify({
            'status': 'success',
            'logos': logos,
            'count': len(logos)
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/logos/<logo_id>', methods=['DELETE'])
def delete_saved_logo(logo_id):
    """Delete a saved logo from the library"""
    try:
        # Find and delete the logo library entry
        logo_path = get_file_path(logo_id)
        if not os.path.exists(logo_path):
            return jsonify({
                'status': 'error',
                'message': 'Logo not found'
            }), 404
        
        # Load logo data to get the original file key
        with open(logo_path, 'r') as f:
            logo_data = json.load(f)
        
        # Delete the logo library entry
        os.remove(logo_path)
        
        # Optionally delete the original file (commented out to preserve files)
        # original_file_key = logo_data['value'].get('file_key')
        # if original_file_key:
        #     original_path = get_file_path(original_file_key)
        #     if os.path.exists(original_path):
        #         os.remove(original_path)
        
        return jsonify({
            'status': 'success',
            'message': 'Logo deleted successfully'
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/generate-qr-with-logo', methods=['POST'])
def api_generate_qr_with_logo():
    """Generate a QR code with optional logo"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        url = data.get('url')
        logo_url = data.get('logo_url')  # Optional
        size = data.get('size', 160)
        seamless = data.get('seamless', False)  # Optional seamless mode
        
        if not url:
            return jsonify({'error': 'URL is required'}), 400
        
        # Generate QR code with optional logo
        qr_data_url = generate_qr_with_logo(url, logo_url, size, seamless)
        
        if qr_data_url:
            return jsonify({
                'status': 'success',
                'qr_code': qr_data_url,
                'url': url,
                'has_logo': bool(logo_url),
                'size': size
            })
        else:
            return jsonify({
                'status': 'error',
                'message': 'Failed to generate QR code'
            }), 500
            
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/generate-card-async', methods=['POST'])
def generate_card_async():
    """Start async card generation with prompts."""
    try:
        data = request.get_json()
        
        job_id = data.get('jobId')
        prompts = data.get('prompts')
        config = data.get('config')
        
        if not job_id or not prompts or not config:
            return jsonify({
                "status": "error",
                "message": "Job ID, prompts, and config are required"
            }), 400
        
        # Store job as processing
        job_storage[job_id] = {
            "status": "processing",
            "prompts": prompts,
            "config": config,
            "createdAt": time.time(),
            "progress": "Starting generation..."
        }
        
        # Start background image generation
        threading.Thread(target=generate_card_images_background, args=(job_id, prompts, config)).start()
        
        return jsonify({
            "status": "processing",
            "message": "Card generation started",
            "jobId": job_id
        }), 200
        
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

def generate_card_images_background(job_id, prompts, config):
    """Background function to generate card images."""
    try:
        print(f"Starting background generation for job {job_id}")
        
        # Update job status
        if job_id in job_storage:
            job_storage[job_id]["progress"] = "Generating images..."
        
        # Prepare sections to generate
        sections_to_generate = ["frontCover", "backCover"]
        if not config.get("isFrontBackOnly", False):
            sections_to_generate.extend(["leftInterior", "rightInterior"])
        
        # Dictionary to store generated images
        generated_images = {}
        
        # Generate all images in parallel by preparing all prompts
        print(f"Generating all sections in parallel for job {job_id}: {sections_to_generate}")
        
        # Update progress
        if job_id in job_storage:
            job_storage[job_id]["progress"] = "Generating all card images in parallel..."
        
        # Prepare all prompts for parallel generation
        prompts_list = []
        section_order = []
        
        for section in sections_to_generate:
            if section in prompts:
                prompts_list.append(prompts[section])
                section_order.append(section)
        
        if not prompts_list:
            raise Exception("No valid prompts found for any sections")
        
        try:
            # Prepare MCP call data for all prompts at once
            mcp_data = {
                "tool_name": "generate_images_with_prompts",
                "arguments": {
                    "user_number": config.get("userNumber", "+17145986105"),
                    "prompts": prompts_list,  # Pass all prompts at once
                    "model_version": config.get("modelVersion", "gpt-image-1"),
                    "aspect_ratio": config.get("aspectRatio", "9:16"),
                    "quality": config.get("quality", "high"),
                    "output_format": config.get("outputFormat", "jpeg"),
                    "output_compression": config.get("outputCompression", 100),
                    "moderation": config.get("moderation", "auto")
                }
            }
            
            print(f"Making parallel MCP call for {len(prompts_list)} prompts")
            
            # Make request to MCP service for all prompts at once
            mcp_response = call_mcp_service("generate_images_with_prompts", mcp_data["arguments"])
            
            # Handle both dict and direct list responses
            results_list = None
            if isinstance(mcp_response, dict):
                if mcp_response.get("status") == "success" and mcp_response.get("results"):
                    results_list = mcp_response["results"]
                elif mcp_response.get("status") == "partial_error" and mcp_response.get("results"):
                    results_list = mcp_response["results"]
                    print(f"Warning: Partial error in parallel generation: {mcp_response.get('message')}")
                elif mcp_response.get("status") == "error":
                    raise Exception(f"MCP service error: {mcp_response.get('message', 'Unknown error')}")
                else:
                    raise Exception(f"Unexpected MCP response status: {mcp_response.get('status')} - {mcp_response}")
            elif isinstance(mcp_response, list):
                results_list = mcp_response
            else:
                raise Exception(f"Unexpected MCP response format: {type(mcp_response)} - {mcp_response}")
            
            if not results_list or len(results_list) != len(section_order):
                raise Exception(f"Expected {len(section_order)} results, got {len(results_list) if results_list else 0}")
            
            # Process each result and map to corresponding section
            for i, (section, result) in enumerate(zip(section_order, results_list)):
                try:
                    # Handle different possible response formats for each result
                    image_url = None
                    
                    if isinstance(result, dict):
                        if "error" in result:
                            print(f"Error generating {section}: {result['error']}")
                            continue  # Skip this section but continue with others
                        elif result.get("status") == "success" and result.get("image_url"):
                            image_url = result["image_url"]
                        elif result.get("status") == "success" and result.get("url"):
                            image_url = result["url"]
                        elif result.get("status") == "error":
                            print(f"Error generating {section}: {result.get('message', 'Unknown error')}")
                            continue
                    elif isinstance(result, str):
                        # If result is directly a URL string
                        image_url = result
                    elif isinstance(result, list) and len(result) > 0:
                        # Handle case where result is a list of URLs
                        image_url = result[0]
                    
                    if image_url:
                        generated_images[section] = image_url
                        print(f"Successfully generated {section} for job {job_id}: {image_url}")
                    else:
                        print(f"No image URL found for {section}. Result: {result}")
                        
                except Exception as section_error:
                    print(f"Error processing result for {section}: {section_error}")
                    continue
                    
        except Exception as parallel_error:
            print(f"Error in parallel generation: {parallel_error}")
            # Fall back to sequential generation if parallel fails
            print("Falling back to sequential generation...")
            
            for section in sections_to_generate:
                if section not in prompts:
                    continue
                    
                try:
                    print(f"Generating {section} for job {job_id} (fallback)")
                    
                    # Update progress
                    if job_id in job_storage:
                        job_storage[job_id]["progress"] = f"Generating {section.replace('Cover', ' Cover').replace('Interior', ' Interior')} (fallback)..."
                    
                    # Single prompt call as fallback
                    single_mcp_data = {
                        "tool_name": "generate_images_with_prompts",
                        "arguments": {
                            "user_number": config.get("userNumber", "+17145986105"),
                            "prompts": [prompts[section]],
                            "model_version": config.get("modelVersion", "gpt-image-1"),
                            "aspect_ratio": config.get("aspectRatio", "9:16"),
                            "quality": config.get("quality", "high"),
                            "output_format": config.get("outputFormat", "jpeg"),
                            "output_compression": config.get("outputCompression", 100),
                            "moderation": config.get("moderation", "auto")
                        }
                    }
                    
                    mcp_response = call_mcp_service("generate_images_with_prompts", single_mcp_data["arguments"])
                    
                    # Process single response (reuse existing logic)
                    if isinstance(mcp_response, dict) and mcp_response.get("status") == "success" and mcp_response.get("results"):
                        result = mcp_response["results"][0]
                        if isinstance(result, list) and len(result) > 0:
                            generated_images[section] = result[0]
                            print(f"Successfully generated {section} (fallback): {result[0]}")
                    
                except Exception as fallback_error:
                    print(f"Fallback generation failed for {section}: {fallback_error}")
                    continue
        
        # Check if we have all required images
        required_sections = ["frontCover", "backCover"]
        if not config.get("isFrontBackOnly", False):
            required_sections.extend(["leftInterior", "rightInterior"])
        
        missing_sections = [s for s in required_sections if s not in generated_images]
        
        if missing_sections:
            # Mark as failed
            if job_id in job_storage:
                job_storage[job_id].update({
                    "status": "failed",
                    "error": f"Failed to generate sections: {', '.join(missing_sections)}",
                    "completedAt": time.time()
                })
            print(f"Job {job_id} failed - missing sections: {missing_sections}")
            return
        
        # Create card data structure
        card_data = {
            "id": job_id,
            "prompt": f"Generated card for {config.get('userEmail', 'user')}",
            "frontCover": generated_images["frontCover"],
            "backCover": generated_images["backCover"],
            "leftPage": generated_images.get("leftInterior", ""),
            "rightPage": generated_images.get("rightInterior", ""),
            "createdAt": job_storage[job_id]["createdAt"],
            "generatedPrompts": prompts
        }
        
        # Mark job as completed
        if job_id in job_storage:
            job_storage[job_id].update({
                "status": "completed",
                "cardData": card_data,
                "completedAt": time.time(),
                "progress": "Generation complete!"
            })
        
        print(f"Job {job_id} completed successfully")
        
        # Send email notification if user email is provided
        user_email = config.get("userEmail")
        if user_email:
            try:
                print(f"Sending completion email to {user_email}")
                
                # Prepare email content
                subject = "🎨 Your Custom Card is Ready!"
                
                # Create HTML email body
                body = f"""
                <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #4CAF50;">🎉 Your Card Generation is Complete!</h2>
                        
                        <p>Great news! Your custom card has been successfully generated and is ready for you.</p>
                        
                        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="margin-top: 0;">📋 Card Details:</h3>
                            <ul>
                                <li><strong>Job ID:</strong> {job_id}</li>
                                <li><strong>Generated Images:</strong> {len(generated_images)} sections</li>
                                <li><strong>Sections:</strong> {', '.join(generated_images.keys())}</li>
                            </ul>
                        </div>
                        
                        <p>🔗 <strong>View your card:</strong> You can access your completed card through the same link or interface where you initiated the generation.</p>
                        
                        <p>✨ Your card includes all the sections you requested and is ready to use!</p>
                        
                        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                        
                        <p style="font-size: 14px; color: #666;">
                            This is an automated notification from your card generation system.<br>
                            If you have any questions, please don't hesitate to reach out.
                        </p>
                        
                        <p style="text-align: center; margin-top: 30px;">
                            <strong>🎨 Happy Creating! 🎨</strong>
                        </p>
                    </div>
                </body>
                </html>
                """
                
                # Send email using the existing Gmail functionality
                if GMAIL_API_AVAILABLE:
                    # Call the internal email sending function directly
                    try:
                        gmail_service = initialize_gmail_client("vibecarding@ast.engineer")
                        result = send_email_with_attachment(
                            gmail_service=gmail_service,
                            to=user_email,
                            subject=subject,
                            body=body,
                            attachment_base64=None,
                            filename=None
                        )
                        print(f"✅ Completion email sent successfully to {user_email}, Message ID: {result.get('id')}")
                    except Exception as gmail_error:
                        print(f"Failed to send email via Gmail API: {gmail_error}")
                        # Fall back to simple notification
                        print(f"📧 Email would be sent to {user_email}: {subject}")
                else:
                    print(f"Gmail API not available. Would send email to {user_email}: {subject}")
                    
            except Exception as email_error:
                print(f"Failed to send email notification: {email_error}")
        
    except Exception as e:
        print(f"Error in background generation for job {job_id}: {e}")
        # Mark job as failed
        if job_id in job_storage:
            job_storage[job_id].update({
                "status": "failed",
                "error": str(e),
                "completedAt": time.time()
            })
        
def call_mcp_service(tool_name, arguments):
    """Helper function to call MCP service."""
    try:
        # Check if we have the internal API key
        if not MCP_INTERNAL_API_KEY:
            raise Exception("MCP_INTERNAL_API_KEY not configured")
        
        # Prepare data for MCP call
        mcp_data = {
            "tool_name": tool_name,
            "arguments": arguments
        }
        
        # Prepare headers for the internal call
        headers = {
            'Content-Type': 'application/json',
            'X-Internal-API-Key': MCP_INTERNAL_API_KEY
        }
        
        print(f"Making MCP call - Tool: {tool_name}")
        
        # Make request to MCP service via internal endpoint
        mcp_response = requests.post(
            'http://localhost:5001/internal/call_mcp_tool',
            json=mcp_data,
            headers=headers,
            timeout=300  # 5 minute timeout for image generation
        )
        
        if mcp_response.status_code != 200:
            raise Exception(f"MCP service returned status {mcp_response.status_code}: {mcp_response.text}")
        
        response_data = mcp_response.json()
        print(f"MCP response data: {response_data}")
        
        # Check for errors in response
        if response_data.get("error") and response_data["error"] != "None":
            raise Exception(f"MCP service error: {response_data['error']}")
        
        # Parse result
        result = response_data.get("result")
        print(f"MCP result type: {type(result)}, content: {result}")
        if isinstance(result, str):
            try:
                result = json.loads(result)
            except:
                raise Exception("Invalid JSON response from MCP service")
        
        # Handle case where result is a list (which seems to be the actual format)
        if isinstance(result, list):
            if len(result) == 0:
                raise Exception("Empty result list from MCP service")
            # Return the list format that the calling code expects
            return {
                "status": "success",
                "results": result
            }
        
        # Handle case where result is already a dict
        if isinstance(result, dict):
            if result.get("status") == "error":
                raise Exception(f"MCP generation error: {result.get('message', 'Unknown error')}")
            return result
        
        # If we get here, the format is unexpected
        raise Exception(f"Unexpected result format from MCP service: {type(result)}")
        
    except Exception as e:
        print(f"Error calling MCP service: {e}")
        raise e

# Enhanced QR code generation with logo support (Python server-side)
def generate_qr_with_logo(url: str, logo_path: str = None, size: int = 160, seamless: bool = False) -> str:
    """
    Generate a QR code with optional logo in the center using Python PIL.
    
    Args:
        url: URL to encode in QR code
        logo_path: Optional path to logo image file
        size: Size of the QR code in pixels
        seamless: If True, logo blends seamlessly without white background
    
    Returns:
        Base64 data URL of the QR code image
    """
    try:
        import qrcode
        from PIL import Image, ImageDraw
        import io
        import base64
        
        # Create QR code with high error correction if logo is present
        error_correction = qrcode.constants.ERROR_CORRECT_H if logo_path else qrcode.constants.ERROR_CORRECT_M
        
        qr = qrcode.QRCode(
            version=1,
            error_correction=error_correction,
            box_size=10,
            border=4,
        )
        qr.add_data(url)
        qr.make(fit=True)
        
        # Create QR code image
        qr_img = qr.make_image(fill_color="black", back_color="white")
        qr_img = qr_img.resize((size, size), Image.Resampling.LANCZOS)
        
        # Add logo if provided
        if logo_path:
            try:
                # Open logo image
                if logo_path.startswith('http'):
                    import requests
                    logo_response = requests.get(logo_path, timeout=10)
                    logo_img = Image.open(io.BytesIO(logo_response.content))
                else:
                    logo_img = Image.open(logo_path)
                
                # Calculate logo size (25% of QR code size for better fit)
                logo_size = int(size * 0.25)
                
                # Convert logo to RGBA for transparency handling
                if logo_img.mode != 'RGBA':
                    logo_img = logo_img.convert('RGBA')
                
                # Resize logo to fit perfectly
                logo_img = logo_img.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
                
                # Convert QR code to RGBA for blending
                qr_img = qr_img.convert('RGBA')
                
                # Calculate position to center the logo
                logo_pos = ((size - logo_size) // 2, (size - logo_size) // 2)
                
                if seamless:
                    # Seamless mode: logo blends directly with QR code
                    # Create a smart mask that preserves logo transparency
                    if logo_img.mode == 'RGBA':
                        # Use the logo's own alpha channel as the mask
                        _, _, _, alpha = logo_img.split()
                        qr_img.paste(logo_img, logo_pos, alpha)
                    else:
                        # For non-transparent logos, create a circular mask
                        mask = Image.new('L', (logo_size, logo_size), 0)
                        draw = ImageDraw.Draw(mask)
                        draw.ellipse((0, 0, logo_size, logo_size), fill=255)
                        qr_img.paste(logo_img, logo_pos, mask)
                else:
                    # Traditional mode: logo with white circular background
                    # Create a mask for smooth blending
                    mask = Image.new('L', (logo_size, logo_size), 0)
                    draw = ImageDraw.Draw(mask)
                    
                    # Create a circular mask with soft edges
                    draw.ellipse((2, 2, logo_size-2, logo_size-2), fill=255)
                    
                    # Apply slight blur to the mask for smoother edges
                    from PIL import ImageFilter
                    mask = mask.filter(ImageFilter.GaussianBlur(radius=1))
                    
                    # Create a white background only where the logo will be placed
                    logo_background = Image.new('RGBA', (logo_size, logo_size), (255, 255, 255, 255))
                    
                    # Paste the white background using the circular mask
                    qr_img.paste(logo_background, logo_pos, mask)
                    
                    # Now paste the logo on top using the same mask for consistency
                    qr_img.paste(logo_img, logo_pos, mask)
                
                print(f"✅ QR code generated with logo: {logo_path}")
                
            except Exception as logo_error:
                print(f"⚠️ Failed to add logo, continuing without: {logo_error}")
        
        # Convert to base64 data URL
        buffer = io.BytesIO()
        qr_img.save(buffer, format='PNG')
        img_data = buffer.getvalue()
        img_base64 = base64.b64encode(img_data).decode()
        
        return f"data:image/png;base64,{img_base64}"
        
    except Exception as e:
        print(f"❌ Error generating QR code: {e}")
        return None

# Removed static JSON endpoint - using dynamic list endpoint for always-current data

@app.route('/api/cards/delete/<card_id>', methods=['DELETE'])
def delete_card(card_id):
    """Delete a card from both new and old storage systems"""
    try:
        deleted_from = []
        
        # Try to delete from new centralized storage
        new_card_path = os.path.join(CARDS_DIR, f"card_{card_id}.json")
        if os.path.exists(new_card_path):
            os.remove(new_card_path)
            deleted_from.append("new_storage")
        
        # Try to delete from old hash-based storage
        old_card_key = f"shared_card_{card_id}"
        old_card_path = get_file_path(old_card_key)
        if os.path.exists(old_card_path):
            os.remove(old_card_path)
            deleted_from.append("old_storage")
        
        if not deleted_from:
            return jsonify({
                'status': 'error',
                'message': f'Card with ID "{card_id}" not found in any storage system'
            }), 404
        
        return jsonify({
            'status': 'success',
            'message': f'Card "{card_id}" deleted successfully',
            'deleted_from': deleted_from,
            'card_id': card_id
        })
        
    except Exception as e:
        print(f"Error deleting card {card_id}: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Failed to delete card: {str(e)}'
        }), 500

@app.route('/api/cards/delete', methods=['POST'])
def bulk_delete_cards():
    """Delete multiple cards at once"""
    try:
        data = request.get_json()
        if not data or 'card_ids' not in data:
            return jsonify({
                'status': 'error',
                'message': 'Missing card_ids array'
            }), 400
        
        card_ids = data['card_ids']
        if not isinstance(card_ids, list):
            return jsonify({
                'status': 'error',
                'message': 'card_ids must be an array'
            }), 400
        
        results = []
        total_deleted = 0
        
        for card_id in card_ids:
            try:
                deleted_from = []
                
                # Try to delete from new centralized storage
                new_card_path = os.path.join(CARDS_DIR, f"card_{card_id}.json")
                if os.path.exists(new_card_path):
                    os.remove(new_card_path)
                    deleted_from.append("new_storage")
                
                # Try to delete from old hash-based storage
                old_card_key = f"shared_card_{card_id}"
                old_card_path = get_file_path(old_card_key)
                if os.path.exists(old_card_path):
                    os.remove(old_card_path)
                    deleted_from.append("old_storage")
                
                if deleted_from:
                    results.append({
                        'card_id': card_id,
                        'status': 'success',
                        'deleted_from': deleted_from
                    })
                    total_deleted += 1
                else:
                    results.append({
                        'card_id': card_id,
                        'status': 'not_found',
                        'message': 'Card not found'
                    })
                    
            except Exception as e:
                results.append({
                    'card_id': card_id,
                    'status': 'error',
                    'message': str(e)
                })
        
        return jsonify({
            'status': 'success',
            'message': f'Processed {len(card_ids)} cards, deleted {total_deleted}',
            'total_processed': len(card_ids),
            'total_deleted': total_deleted,
            'results': results
        })
        
    except Exception as e:
        print(f"Error in bulk delete: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Bulk delete failed: {str(e)}'
        }), 500
