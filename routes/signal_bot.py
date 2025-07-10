from flask import Blueprint, jsonify, request, render_template
import requests
import aiohttp

import threading
import base64
from system_prompts import *
from dotenv import load_dotenv
import os
import json
from datetime import datetime, timezone
from database import read_data, write_data 
import uuid
import tempfile
import asyncio
import websockets  # Add this import at the top
from utils.signal_utils import send_signal_message, send_read_receipt, list_groups, send_typing_indicator
from collections import deque
import uuid
import base64
import requests
from database import write_data
# from utils.constants import DOMAIN # Keep this commented or remove if DOMAIN is not directly used from constants
from llm_adapters import get_llm_adapter, StandardizedMessage, StandardizedLLMConfig, AttachmentPart
import re

# Load environment variables
load_dotenv()
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')

# Add Brave Search API constants
BRAVE_NEWS_SEARCH_API_URL = "https://api.search.brave.com/res/v1/news/search"
BRAVE_API_KEY = os.getenv('BRAVE_API_KEY')  # Add this to your .env file

# Create Blueprint
signal_bp = Blueprint('signal', __name__)

# Constants and Configuration
# -------------------------
# Signal Config
SIGNAL_NUMBER="+16504441293"
ALLOWED_SENDERS = ["+17145986105", "+15108290931", "+16503829987", "+14087585303", "+17148003340", "+17143341931", "+17142723257", "+15628107443", "+16503346038","+18478946368", "+14152599266"]
SIGNAL_API_URL = "http://127.0.0.1:8080"
MESSAGE_DB_PREFIX = "messages"

# Base directory for storing user-specific attachments
USER_DATA_BASE_DIR = "user_data"
os.makedirs(USER_DATA_BASE_DIR, exist_ok=True) # Ensure base directory exists

# Add this after other global variables/constants
# Simple in-memory conversation history storage
processed_messages = deque(maxlen=100)  # Store the last 100 processed message IDs


def init_signal_bot():
    """Initialize signal bot in a separate thread"""
    def run_bot():
        print("Initializing signal bot...\n")
        try:
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)

            # Schedule the websocket check as a background task
            loop.create_task(check_messages_websocket())
            loop.run_forever()
        except Exception as e:
            print(f"Error in bot thread: {e}")
        finally:
            try:
                loop.close()
            except Exception:
                pass

    # Start the bot in a separate thread
    bot_thread = threading.Thread(target=run_bot, daemon=True)
    bot_thread.start()

async def check_messages_websocket():
    """Continuously checks for new messages using websocket connection"""
    uri = f"ws://127.0.0.1:8080/v1/receive/{SIGNAL_NUMBER}"
    
    while True:
        try:
            async with websockets.connect(uri) as websocket:
                print("WebSocket connection established")
                
                while True:
                    try:
                        message = await websocket.recv()
                        messages = json.loads(message)
                        
                        if not isinstance(messages, list):
                            messages = [messages]
                        
                        # Process each message directly without locking
                        for msg in messages:
                            envelope = msg.get("envelope", {})
                            timestamp = envelope.get("timestamp", 0)
                            sender = envelope.get("sourceNumber", "")
                            msg_id = f"{sender}_{timestamp}"
                            
                            print(f"Processing message {msg_id}")
                            # Create task to process message asynchronously
                            asyncio.create_task(process_message(msg))
                            
                    except websockets.exceptions.ConnectionClosed:
                        print("WebSocket connection closed, attempting to reconnect...")
                        break
                    except Exception as e:
                        print(f"Error receiving message: {e}")
                        
        except Exception as e:
            print(f"Error connecting to websocket: {e}")
            await asyncio.sleep(5)

async def process_message(msg):
    """Process individual message independently"""
    envelope = msg.get("envelope", {})
    source_number = envelope.get("sourceNumber", "")  # Always capture the original sender's number
    is_group_message = False
    
    # Check if this is a group message
    original_sender_number = envelope.get("sourceNumber", "") # Capture original sender for paths etc.

    if "dataMessage" in envelope and "groupInfo" in envelope["dataMessage"]:
        is_group_message = True
        # For group messages, get the internal groupId first
        internal_group_id = envelope["dataMessage"]["groupInfo"].get("groupId", "")
        
        # Translate internal_id to proper group.id for sending responses
        try:
            groups = await list_groups()
            if groups:
                for group in groups:
                    if group.get("internal_id") == internal_group_id:
                        sender = group.get("id")  # Get the proper "group.id" format and use as sender
                        print(f"Group message: translated internal_id {internal_group_id} to group.id {sender}")
                        break
                else:
                    sender = internal_group_id  # Fallback to internal ID if translation fails
                    print(f"WARNING: Could not find group with internal_id {internal_group_id}. Using as-is but message might fail.")
        except Exception as e:
            sender = internal_group_id  # Fallback to internal ID if exception occurs
            print(f"Error translating group ID: {e}")
    else:
        sender = source_number  # Original sender (person who wrote the message)

    # Process all direct messages, but group messages need "buddy"
    data_message = envelope.get("dataMessage", {})
    message_text = data_message.get("message", "")
    if sender not in ALLOWED_SENDERS and not is_group_message:
        return
    if is_group_message and "buddy" not in (message_text or "").lower():
        return
    
    sender_name = envelope.get("sourceName", "")
    timestamp = envelope.get("timestamp", 0)
    
    print("envelope: ", envelope)
    print("sender: ", sender)
    print("source_number: ", source_number)
    print("In Process Message\n\n\n")
    # Create a unique message ID for deduplication
    msg_id = f"{sender}_{timestamp}"
    
    # Skip if we've already processed this message
    if msg_id in processed_messages:
        print(f"Skipping already processed message: {msg_id}")
        return False
    
    # Add to processed messages immediately to prevent duplicate processing
    processed_messages.append(msg_id)
    
    # Check if this is our own bot number - don't respond to our own messages
    if source_number == SIGNAL_NUMBER:
        print(f"Skipping our own message from {source_number}")
        return False
    
    # Extract data message which contains the actual content
    data_message = envelope.get("dataMessage", {})
    message_text = data_message.get("message", "")
    
    # For voice messages, the message might be None, so check only attachments
    if not message_text and not data_message.get("attachments"):
        print("Empty message, skipping")
        return False
    
    # Send read receipt to the original sender's number for both direct and group messages
    await send_read_receipt(source_number, timestamp)
    
    # Generate and send reaction (using source_number as the receipt target and sender as the recipient for replies)
    if message_text:  # Only send reaction if there's text
        if is_group_message:
            await generate_and_send_reaction(source_number, sender, message_text, timestamp)
        else:
            await generate_and_send_reaction(sender, sender, message_text, timestamp)
    
    # Process attachments if any
    attachments = data_message.get("attachments", [])
    attachment_contents = []
    attachment_urls = []
    
    if attachments:
        print(f"Processing {len(attachments)} attachments")
        # temp_files = [] # Removed: No longer using temporary files that need individual tracking for deletion here
        
        # Create user-specific directory for attachments
        if original_sender_number:
            temp_path_component = original_sender_number
            if temp_path_component.startswith('+'):
                temp_path_component = temp_path_component[1:] # Remove leading '+'
            sanitized_sender_for_path = re.sub(r'\W+', '', temp_path_component) # Remove any remaining non-alphanumeric characters
            if not sanitized_sender_for_path: # If sanitization results in an empty string
                sanitized_sender_for_path = "unknown_user_id"
        else:
            sanitized_sender_for_path = "unknown_user_id"
            
        # Special handling for Claude Code user (17145986105)
        if original_sender_number in ["+17145986105", "17145986105"]:
            user_specific_attachments_dir = "/var/www/flask_app/claude_attachments"
            os.makedirs(user_specific_attachments_dir, exist_ok=True)
        else:
            user_specific_base_data_dir = os.path.join(USER_DATA_BASE_DIR, sanitized_sender_for_path)
            user_specific_attachments_dir = os.path.join(user_specific_base_data_dir, "attachments")
            os.makedirs(user_specific_attachments_dir, exist_ok=True)  # Ensure the attachments subdirectory exists
        
        async with aiohttp.ClientSession() as session:
            for attachment in attachments:
                attachment_id = attachment.get("id")
                content_type = attachment.get("contentType", "")
                filename = attachment.get("filename", "")
                
                print(f"Processing attachment: {filename}, type: {content_type}")
                
                if attachment_id:
                    try:
                        # Download the attachment using aiohttp
                        async with session.get(f"{SIGNAL_API_URL}/v1/attachments/{attachment_id}") as attachment_response:
                            if attachment_response.status == 200:
                                attachment_data = await attachment_response.read()
                                
                                # Create a persistent file path
                                file_suffix = _get_file_suffix(content_type, filename)
                                unique_filename_for_storage = f"{uuid.uuid4()}{file_suffix}"
                                persistent_file_path = os.path.join(user_specific_attachments_dir, unique_filename_for_storage)  # Save in attachments subdir
                                
                                with open(persistent_file_path, "wb") as pf:
                                    pf.write(attachment_data)
                                
                                print(f"Saved attachments to persistent file: {persistent_file_path}")
                                
                                # Generate a unique key for this attachment for DB storage/URL generation
                                key = f"attachment_{uuid.uuid4()}"
                                
                                # Convert binary data to base64 for storage
                                attachment_base64 = base64.b64encode(attachment_data).decode('utf-8')
                                
                                # Store the attachment data in the database
                                await write_data(key, attachment_base64)
                                
                                # Create URL to access the attachment via serve_image endpoint
                                current_domain = os.getenv("DOMAIN") # Get domain from .env
                                attachment_url = f"{current_domain}/serve_image?key={key}&type={content_type}"
                                
                                # Add attachment to the unified list with all metadata
                                attachment_urls.append({
                                    "url": attachment_url,
                                    "path": persistent_file_path, # Use the new persistent path
                                    "mime_type": content_type,
                                    "filename": filename,
                                    "content_type": content_type,
                                    "id": attachment_id,
                                    "size": attachment.get("size"),
                                    "width": attachment.get("width"),
                                    "height": attachment.get("height"),
                                    "type": "image" if content_type.startswith('image/') else
                                           "audio" if content_type.startswith('audio/') or filename.lower().endswith(('.m4a', '.aac', '.mp3', '.wav')) else
                                           "video" if content_type.startswith('video/') or filename.lower().endswith(('.mp4', '.mov', '.avi')) else
                                           "other"
                                })
                                
                                # For backward compatibility
                                attachment_contents.append({
                                    "content_type": content_type,
                                    "id": attachment_id,
                                    "url": attachment_url,
                                    "filename": filename,
                                    "size": attachment.get("size"),
                                    "width": attachment.get("width"),
                                    "height": attachment.get("height")
                                })

                                # Update attachment index.json
                                index_path = os.path.join(user_specific_attachments_dir, "index.json")
                                try:
                                    if os.path.exists(index_path):
                                        with open(index_path, "r") as idxf:
                                            idx = json.load(idxf)
                                    else:
                                        idx = {}
                                except Exception:
                                    idx = {}
                                key = unique_filename_for_storage.rsplit(".", 1)[0]

                                # --- Gemini 2.0 Flash label/description generation ---
                                label = None
                                description = None
                                print("content_type: ", content_type)
                                if content_type.startswith("image/"):
                                    try:
                                        adapter = get_llm_adapter("gemini-2.0-flash")
                                        url = attachment_url
                                        prompt = (
                                            f"You are a file labeling assistant.\n"
                                            f"File URL: {url}\n\n"
                                            "Task:\n"
                                            "1) Provide a concise filesystem-safe label (3–5 words, underscore_separated).\n"
                                            "2) Provide a 1-2 sentence description.\n\n"
                                            "Respond with a JSON object in a code block, like this:\n"
                                            "```json\n"
                                            '{"label": "...", "description": "..."}\n'
                                            "```"
                                        )
                                        # Prepare the image as an attachment
                                        attachment_part = AttachmentPart(
                                            mime_type=content_type,
                                            data=attachment_data,
                                            name=filename or "image"
                                        )
                                        history = [
                                            StandardizedMessage(
                                                role="user",
                                                content=prompt,
                                                attachments=[attachment_part]
                                            )
                                        ]
                                        llm_config = StandardizedLLMConfig(system_prompt=None)
                                        response = await adapter.generate_content(
                                            model_name="gemini-2.0-flash",
                                            history=history,
                                            tools=None,
                                            config=llm_config
                                        )
                                        text = response.text_content or ""
                                        # Extract JSON from a code block (either ```json or just ```)
                                        code_block_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
                                        if code_block_match:
                                            json_str = code_block_match.group(1)
                                        else:
                                            json_str = text
                                        data = json.loads(json_str.strip())
                                        label = re.sub(r'\W+', '_', data.get('label','')).strip('_')
                                        description = data.get('description','')
                                    except Exception as e:
                                        print(f"Gemini labeling failed: {e}")
                                        label = "unknown_attachment"
                                        description = "Could not auto-label this attachment."
                                idx[key] = {
                                    "filename": unique_filename_for_storage,
                                    "path": persistent_file_path,
                                    "url": attachment_url,
                                    "mime_type": content_type,
                                    "timestamp": timestamp,
                                    "message_id": msg_id,
                                    "label": label,
                                    "description": description,
                                    "size": len(attachment_data)
                                }
                                # Atomic write back
                                dirpath = os.path.dirname(index_path)
                                fd, tmp_path = tempfile.mkstemp(dir=dirpath, prefix="idx-", suffix=".tmp")
                                with os.fdopen(fd, "w") as tmpf:
                                    json.dump(idx, tmpf, indent=2)
                                os.replace(tmp_path, index_path)
                    except Exception as e:
                        print(f"Error processing attachment: {str(e)}")
                        continue
        
        print("attachment_urls: ", attachment_urls)
    
    # Indicate to the user that we're processing their message
    await send_typing_indicator(sender, True)
    
    try:
        # Process the message with MCP service
        # Prepare the request data
        request_data = {
            "query": message_text,
            "sender": sender
        }
        
        # Extract URLs from attachment metadata and add to request
        if attachment_urls:
            # Extract just the URLs for the AI context
            urls_only = [attachment["url"] for attachment in attachment_urls if "url" in attachment]
            if urls_only:
                request_data["attachment_urls"] = urls_only
                
                # Update the message text to mention the uploaded images
                image_count = len([a for a in attachment_urls if a.get("type") == "image"])
                if image_count > 0:
                    if message_text and message_text.strip():
                        request_data["query"] = f"{message_text}\n\nUser has uploaded {image_count} image{'s' if image_count != 1 else ''}: {', '.join(urls_only)}"
                    else:
                        request_data["query"] = f"User has uploaded {image_count} image{'s' if image_count != 1 else ''}: {', '.join(urls_only)}"
        
        # Send request to MCP service using aiohttp instead of requests
        async with aiohttp.ClientSession() as session:
            async with session.post(
                'http://localhost:5001/query',
                json=request_data,
                timeout=500
            ) as response:
                # Check response status
                response.raise_for_status()
                # Parse the AI response
                mcp_response = await response.json()
                response_text = mcp_response.get("result", "")
        
        if isinstance(response_text, str):
            try:
                # Check if the response is JSON
                json_data = json.loads(response_text)
                # Format the JSON response nicely
                response_text = json.dumps(json_data, indent=2)
            except json.JSONDecodeError:
                # Not JSON, use the string as is
                response_text = response_text
        
        # Prevent sending empty responses
        if not response_text or response_text.strip() == "":
            response_text = "I'm sorry, I couldn't generate a proper response. Please try again."
        
        # # Send the response back to the sender
        # await send_signal_message(
        #     recipient=sender,
        #     message=response_text,
        #     text_mode="styled"
        # )
        
    except Exception as e:
        error_message = f"Error processing your message: {str(e)}"
        print(f"Error in process_message: {str(e)}")
        
        # Send error message back to the user
        await send_signal_message(
            recipient=sender,
            message=error_message
        )
    finally:
        # Stop typing indicator
        await send_typing_indicator(sender, False)
        
        # Clean up temporary files - REMOVED as files are now persistent in user_data
        # if attachments:
        #     for temp_file_path in temp_files:
        #         try:
        #             if os.path.exists(temp_file_path):
        #                 os.unlink(temp_file_path)
        #         except Exception as e:
        #             print(f"Error removing temp file {temp_file_path}: {str(e)}")
        
    return True

def _get_file_suffix(mime_type, filename=None):
    """Get appropriate file suffix based on MIME type or filename"""
    # First try to get extension from the filename if provided
    if filename and '.' in filename:
        return os.path.splitext(filename)[1]
    
    # Otherwise use the MIME type mapping
    mime_to_suffix = {
        # Image formats
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/heic": ".heic",
        "image/heif": ".heif",
        
        # Video formats
        "video/mp4": ".mp4",
        "video/mpeg": ".mpeg",
        "video/mov": ".mov",
        "video/avi": ".avi",
        "video/x-flv": ".flv",
        "video/mpg": ".mpg",
        "video/webm": ".webm",
        "video/wmv": ".wmv",
        "video/3gpp": ".3gp",
        
        # Audio formats
        "audio/wav": ".wav",
        "audio/mp3": ".mp3",
        "audio/aiff": ".aiff",
        "audio/aac": ".aac",
        "audio/ogg": ".ogg",
        "audio/flac": ".flac",
        "audio/mpeg": ".mp3",
        "audio/m4a": ".m4a",  # Common iOS audio format
        
        # Document formats
        "application/pdf": ".pdf",
        "text/plain": ".txt",
        "text/html": ".html",
        "application/json": ".json",
    }
    
    return mime_to_suffix.get(mime_type, ".bin")  # Default to .bin if unknown

async def generate_reaction(message_text):
    """Generates an appropriate reaction emoji based on message content using Gemini 2.0 Flash via llm_adapters. Expects emoji in a markdown code block for reliability."""
    try:
        prompt = (
            "You are an expert at choosing the perfect emoji reaction for messages. "
            "Based on the following message, choose ONE emoji that best captures the sentiment, emotion, or appropriate response.\n\n"
            "Rules:\n"
            "1. Return ONLY the emoji character, nothing else, and put it between triple backticks (markdown code block), e.g. ```😀```\n"
            "2. Choose any emoji that fits best - be creative and precise\n"
            "3. Consider the tone, content, and implied emotion of the message\n"
            "4. Pick specific emojis over generic ones (e.g. '🎸' for music-related content instead of just '👍')\n\n"
            f"Message: {message_text}"
        )

        adapter = get_llm_adapter("models/gemini-2.0-flash")
        history = [StandardizedMessage.from_text("user", prompt)]
        result = await adapter.generate_content(
            model_name="models/gemini-2.0-flash",
            history=history,
            tools=None,
        )
        print("emoji result: ", result)
        response_text = (result.text_content or "").strip()
        # Try to extract emoji from a markdown code block
        match = re.search(r"```(.*?)```", response_text, re.DOTALL)
        if match:
            emoji = match.group(1).strip()
            # Basic validation: must contain at least one non-ascii character
            if emoji and any(ord(c) > 255 for c in emoji):
                return emoji
        # Fallback: extract first emoji character from the response
        for c in response_text:
            if ord(c) > 255:
                return c
        return "👍"
    except Exception as e:
        print(f"Error generating reaction: {e}")
        return "👍"

async def send_reaction(sender, recipient, timestamp, emoji):
    """Sends a reaction to a message"""
    try:
        payload = {
            "reaction": emoji,
            "recipient": recipient,
            "target_author": sender,
            "timestamp": timestamp
        }
        print("sending reaction payload: ", payload)
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{SIGNAL_API_URL}/v1/reactions/{SIGNAL_NUMBER}",
                json=payload
            ) as response:
                print("reaction response: ", response.status)
                return response.status == 204
    except Exception as e:
        print(f"Error sending reaction: {e}")
        return False


async def generate_and_send_reaction(sender, recipient, message_text, timestamp, is_group=False):
    """Helper function to generate and send reaction"""
    try:
        emoji = await generate_reaction(message_text)
        await send_reaction(sender, recipient, timestamp, emoji)
    except Exception as e:
        print(f"Error sending reaction: {e}")

# API Routes
# ----------
@signal_bp.route("/")
def home():
    return jsonify({"status": "Signal AI bot is running"})

@signal_bp.route("/api/generate_image", methods=['POST'])
async def generate_image_endpoint():
    """API endpoint to generate images from a text prompt"""
    try:
        # Get request data
        request_data = request.get_json()
        num_images = request_data.get('num_images', 1)
        
        # Extract image prompt
        prompt = request_data.get('prompt')
        
        # Validate input
        if not prompt:
            return jsonify({"error": "Missing required parameter: 'prompt'"}), 400
        
        # Generate the image using the existing utility function
        # Always use num_images=1 regardless of request
        from utils.tools import generate_image_and_get_url
        result = await generate_image_and_get_url(prompt, num_images=num_images)
        
        # Return the result as JSON
        return jsonify(result)
            
    except Exception as e:
        return jsonify({"error": str(e), "message": "Error generating image"}), 500

# @signal_bp.route("/api/generate", methods=['POST'])
# async def generate_endpoint():
#     """API endpoint to run AI generation with model and return JSON"""
#     try:
#         # Get request data - Flask's request.get_json() is not a coroutine and shouldn't be awaited
#         request_data = request.get_json()
        
#         # Extract user query and optional JSON schema
#         user_query = request_data.get('query')
#         json_schema = request_data.get('schema')
#         max_iterations = request_data.get('max_iterations', 5)
        
#         # Validate input
#         if not user_query:
#             return jsonify({"error": "Missing required parameter: 'query'"}), 400
        
#         # Call the agentic loop function
#         result = await agentic_loop(user_query=user_query, json_schema=json_schema, max_iterations=max_iterations, system_prompt=AGENTIC_SYSTEM_PROMPT)
        
#         # Try to parse the result as JSON
#         try:
#             if isinstance(result, str):
#                 result_json = json.loads(result)
#                 return jsonify(result_json)
#             else:
#                 return jsonify(result)
#         except:
#             # If parsing fails, return as text response
#             return jsonify({"response": result})
            
#     except Exception as e:
#         return jsonify({"error": str(e)}), 500
    

@signal_bp.route("/api/send-greeting", methods=['POST'])
async def send_greeting():
    """API endpoint to send a greeting message to a new user"""
    try:
        data = request.json
        phone_number = data.get('phoneNumber')
        
        if not phone_number:
            return jsonify({
                "status": "error",
                "message": "Missing phone number"
            }), 400
            
        # Basic phone number validation
        if not phone_number.startswith('+'):
            phone_number = f"+{phone_number}"  # Add + if missing
        
        # Send greeting message
        greeting_message = "👋 Hi there! I'm Buddy, your AST. Nice to meet you! What can I help with today? Feel free to ask me anything!"
        
        # Send the message using the utility function
        response = await send_signal_message(
            recipient=phone_number,
            message=greeting_message,
            text_mode="styled"
        )
        
        if response and 'timestamp' in response:
            # Save this interaction to the database
            clean_number = phone_number.replace('+', '')
            db_key = f"{MESSAGE_DB_PREFIX}-{clean_number}"
            
            try:
                # Get or create database for this user
                try:
                    db_response = await read_data(db_key)
                    if db_response and 'value' in db_response:
                        db = db_response['value']
                    else:
                        db = {"messages": []}
                except Exception:
                    # Create new database if it doesn't exist
                    db = {"messages": []}
                
                # Add greeting message to the database
                db["messages"].append({
                    "key": str(uuid.uuid4()),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "type": "greeting",
                    "text": greeting_message,
                    "sender": SIGNAL_NUMBER
                })
                
                # Save updated database
                await write_data(db_key, db)
                
            except Exception as e:
                print(f"Error saving greeting to database: {e}")
                # Continue even if database save fails
            
            return jsonify({
                "status": "success",
                "message": "Greeting sent successfully"
            })
        else:
            return jsonify({
                "status": "error",
                "message": "Failed to send greeting message"
            }), 500
            
    except Exception as e:
        print(f"Error sending greeting: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

