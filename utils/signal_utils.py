import aiohttp
import asyncio
import time
from datetime import datetime, timezone
import uuid
from database import read_data, write_data
import re
from urllib.parse import urlparse, parse_qs

SIGNAL_API_URL = "http://127.0.0.1:8080"
SIGNAL_NUMBER = "+16504441293"

async def save_ai_response(sender, response_data, user_message_key):
    """Save AI response by updating the corresponding user message"""
    # Import here to avoid circular dependency
    from routes.signal_bot import MESSAGE_DB_PREFIX
    
    try:
        clean_sender = sender.replace('+', '')
        db_key = f"{MESSAGE_DB_PREFIX}-{clean_sender}"
        
        # Get current database
        try:
            db_response = await read_data(db_key)
            if not db_response or 'value' not in db_response:
                print(f"No database found for {db_key}")
                return False
            db = db_response['value']
        except Exception as e:
            print(f"Error reading database: {e}")
            return False
        
        # Find the user message by key if provided
        updated = False
        if user_message_key:
            for message in db["messages"]:
                if message["key"] == user_message_key:
                    # Create AI response structure
                    ai_response = {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "text": response_data.get("text", ""),
                        "attachments": []
                    }
                    
                    # Handle attachments if present
                    if response_data.get("media_data") and response_data.get("media_type"):
                        attachment_key = str(uuid.uuid4())  # Generate clean key for attachment
                        attachment = {
                            "key": attachment_key,
                            "type": response_data["media_type"]
                        }
                        ai_response["attachments"].append(attachment)
                        
                        # Save attachment data separately
                        try:
                            await write_data(attachment_key, {
                                "data": response_data["media_data"],
                                "type": response_data["media_type"],
                                "created_at": ai_response["timestamp"]
                            })
                        except Exception as e:
                            print(f"Error saving attachment: {e}")
                    
                    # Support multiple attachments if present
                    if response_data.get("attachments"):
                        for attachment_data in response_data["attachments"]:
                            try:
                                attachment_key = str(uuid.uuid4())
                                attachment = {
                                    "key": attachment_key,
                                    "type": attachment_data["media_type"]
                                }
                                ai_response["attachments"].append(attachment)
                                
                                # Save attachment data separately
                                await write_data(attachment_key, {
                                    "data": attachment_data["media_data"],
                                    "type": attachment_data["media_type"],
                                    "created_at": ai_response["timestamp"]
                                })
                            except Exception as e:
                                print(f"Error saving multiple attachment: {e}")
                                continue
                    
                    # Update the message with AI response
                    message["ai_response"] = ai_response
                    updated = True
                    break
        
        # If we didn't update an existing message but still need to save the response,
        # create a standalone AI message
        if not updated and not user_message_key:
            # Create a standalone AI message
            ai_message = {
                "key": str(uuid.uuid4()),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "type": "ai_message",
                "text": response_data.get("text", ""),
                "attachments": []
            }
            
            # Handle attachments if present
            if response_data.get("media_data") and response_data.get("media_type"):
                attachment_key = str(uuid.uuid4())
                attachment = {
                    "key": attachment_key,
                    "type": response_data["media_type"]
                }
                ai_message["attachments"].append(attachment)
                
                # Save attachment data separately
                await write_data(attachment_key, {
                    "data": response_data["media_data"],
                    "type": response_data["media_type"],
                    "created_at": ai_message["timestamp"]
                })
            
            # Add the message to the database
            db["messages"].append(ai_message)
            updated = True
        
        # Save updated database if changes were made
        if updated:
            try:
                await write_data(db_key, db)
                return True
            except Exception as e:
                print(f"Error writing updated database: {e}")
                return False
        
        return updated

    except Exception as e:
        print(f"Error saving AI response: {e}")
        return False
    
# Core Signal Message Functions
# ---------------------------
async def extract_image_info_from_message(message):
    """
    Extracts image information from a message containing hosted image links.
    Returns a tuple of (modified_message, image_keys, media_types)
    """
    if not message:
        return message, [], []
        
    # Pattern to match hosted image links
    pattern = r'https://jordanjohngilbert\.link/serve_image\?key=([^&]+)&type=([^&\s]+)'
    
    image_keys = []
    media_types = []
    modified_message = message
    
    # Find all matches
    matches = re.findall(pattern, message)
    
    if matches:
        # Extract image keys and media types
        for key, media_type in matches:
            image_keys.append(key)
            media_types.append(media_type)
            
        # Remove the URLs from the message
        modified_message = re.sub(pattern, '', message)
        # Clean up any double spaces or trailing/leading spaces
        modified_message = re.sub(r'\s+', ' ', modified_message).strip()
    
    return modified_message, image_keys, media_types

async def send_signal_message(recipient, message="", base64_attachment=None, media_type="image/jpeg", 
                             base64_attachments=None, media_types=None, attachment_filenames=None,
                             text_mode="styled", is_group=False):
    """Sends a message via Signal with optional attachment(s) asynchronously
    
    Args:
        recipient: Signal recipient number or group ID when is_group=True.
                   If a phone number, it will be formatted to E.164 if needed.
        message: Text message to send
        base64_attachment: Optional single base64-encoded attachment (legacy)
        media_type: MIME type of the single attachment (default: image/jpeg)
        base64_attachments: Optional list of base64-encoded attachments
        media_types: Optional list of MIME types for multiple attachments
        attachment_filenames: Optional list of filenames for attachments
        text_mode: Text formatting mode ('normal' or 'styled')
        is_group: Whether the recipient is a group ID (default: False)
    """
    
    formatted_recipient = recipient
    if not is_group and isinstance(recipient, str) and recipient.isdigit():
        # This logic assumes 'recipient' is a string of digits if it's a non-group recipient.
        # It was previously sanitized in ai_models.py (e.g., "17145986105").
        if len(recipient) == 10: # e.g. 7145986105 -> +17145986105
            formatted_recipient = "+1" + recipient
        elif len(recipient) > 10 and recipient.startswith('1'): # e.g. 17145986105 -> +17145986105
            formatted_recipient = "+" + recipient
        elif not recipient.startswith('+'): # General fallback for all-digit numbers without '+'
            formatted_recipient = "+" + recipient
    
    # Use 'formatted_recipient' for all Signal API interactions below instead of 'recipient'
    
    # Only show typing indicator for individual recipients, not groups
    # Ensure typing indicator also uses the correctly formatted recipient if applicable
    await send_typing_indicator(formatted_recipient if not is_group else recipient, False)

    print("message: ", message)
    
    # Handle multiple attachments if provided
    if base64_attachments and media_types and len(base64_attachments) == len(media_types):
        print(f"Sending message with {len(base64_attachments)} attachments to {'group' if is_group else 'recipient'} {formatted_recipient}") # Use formatted_recipient
        
        async with aiohttp.ClientSession() as session:
            payload = {
                "message": message if message else "",
                "number": SIGNAL_NUMBER,
                "recipients": [formatted_recipient], # Use formatted_recipient
                "base64_attachments": []
            }
            
            # Format attachments with filenames if provided
            for i, (attachment, mtype) in enumerate(zip(base64_attachments, media_types)):
                filename = None
                if attachment_filenames and i < len(attachment_filenames):
                    filename = attachment_filenames[i]
                
                if filename:
                    payload["base64_attachments"].append(f"data:{mtype};filename={filename};base64,{attachment}")
                else:
                    payload["base64_attachments"].append(f"data:{mtype};base64,{attachment}")
            
            # Add text_mode if specified
            if text_mode == "styled":
                payload["text_mode"] = "styled"
            
            print("payload with multiple attachments")
            async with session.post(f"{SIGNAL_API_URL}/v2/send", json=payload) as response:
                try:
                    response_json = await response.json()
                    print("response_json: ", response_json)
                    
                    # Check for rate limit challenge
                    if response.status == 428 and response_json.get("error") and "challenge_tokens" in response_json:
                        # Handle rate limit challenge
                        print(f"Rate limit challenge detected for recipient {formatted_recipient}") # Use formatted_recipient
                        challenge_tokens = response_json.get("challenge_tokens", [])
                        
                        if challenge_tokens:
                            # Import handle_rate_limit_challenge here to avoid circular imports
                            from routes.signal_bot import handle_rate_limit_challenge
                            captcha_url = await handle_rate_limit_challenge(formatted_recipient, challenge_tokens[0]) # Use formatted_recipient
                            
                            # Return response with challenge info
                            response_json["captcha_required"] = True
                            response_json["captcha_url"] = captcha_url
                except Exception as e:
                    print(f"Error parsing response: {e}")
                    response_json = {"error": str(e)}
                    
                return response_json
    
    # If no multiple attachments, fall back to original single attachment logic
    messages = [message] if message else []
        
    response_json = None
    
    async with aiohttp.ClientSession() as session:
        # If we have an attachment but no message, still need to send the request
        if base64_attachment and not messages:
            # Check if we have a filename for the single attachment
            attachment_filename = attachment_filenames[0] if attachment_filenames and len(attachment_filenames) > 0 else None
            
            if attachment_filename:
                attachment_data = f"data:{media_type};filename={attachment_filename};base64,{base64_attachment}"
            else:
                attachment_data = f"data:{media_type};base64,{base64_attachment}"
                
            payload = {
                "message": "",
                "number": SIGNAL_NUMBER,
                "recipients": [formatted_recipient], # Use formatted_recipient
                "base64_attachments": [attachment_data]
            }
                
            async with session.post(f"{SIGNAL_API_URL}/v2/send", json=payload) as response:
                try:
                    response_json = await response.json()
                    
                    # Check for rate limit challenge
                    if response.status == 428 and response_json.get("error") and "challenge_tokens" in response_json:
                        # Handle rate limit challenge
                        print(f"Rate limit challenge detected for recipient {formatted_recipient}") # Use formatted_recipient
                        challenge_tokens = response_json.get("challenge_tokens", [])
                        
                        if challenge_tokens:
                            # Import handle_rate_limit_challenge here to avoid circular imports
                            from routes.signal_bot import handle_rate_limit_challenge
                            captcha_url = await handle_rate_limit_challenge(formatted_recipient, challenge_tokens[0]) # Use formatted_recipient
                            
                            # Return response with challenge info
                            response_json["captcha_required"] = True
                            response_json["captcha_url"] = captcha_url
                except Exception as e:
                    print(f"Error parsing response: {e}")
                    response_json = {"error": str(e)}
                    
                return response_json
        
        # Original logic for messages with or without attachments
        for i, msg in enumerate(messages):
            if i == 0 and base64_attachment:
                # Check if we have a filename for the single attachment
                attachment_filename = attachment_filenames[0] if attachment_filenames and len(attachment_filenames) > 0 else None
                
                if attachment_filename:
                    attachment_data = f"data:{media_type};filename={attachment_filename};base64,{base64_attachment}"
                else:
                    attachment_data = f"data:{media_type};base64,{base64_attachment}"
                    
                payload = {
                    "message": msg,
                    "number": SIGNAL_NUMBER,
                    "recipients": [formatted_recipient], # Use formatted_recipient
                    "base64_attachments": [attachment_data]
                }
            else:
                payload = {
                    "message": msg,
                    "number": SIGNAL_NUMBER,
                    "recipients": [formatted_recipient] # Use formatted_recipient
                }
                
            # Add text_mode if specified
            if text_mode == "styled":
                payload["text_mode"] = "styled"
            
            print("payload: ", payload)
            async with session.post(f"{SIGNAL_API_URL}/v2/send", json=payload) as response:
                try:
                    response_json = await response.json()
                    
                    # Check for rate limit challenge
                    if response.status == 428 and response_json.get("error") and "challenge_tokens" in response_json:
                        # Handle rate limit challenge
                        print(f"Rate limit challenge detected for recipient {formatted_recipient}") # Use formatted_recipient
                        challenge_tokens = response_json.get("challenge_tokens", [])
                        
                        if challenge_tokens:
                            # Import handle_rate_limit_challenge here to avoid circular imports
                            from routes.signal_bot import handle_rate_limit_challenge
                            captcha_url = await handle_rate_limit_challenge(formatted_recipient, challenge_tokens[0]) # Use formatted_recipient
                            
                            # Return response with challenge info
                            response_json["captcha_required"] = True
                            response_json["captcha_url"] = captcha_url
                            
                            # Break the loop as we need to solve the captcha first
                            break
                except Exception as e:
                    print(f"Error parsing response: {e}")
                    response_json = {"error": str(e)}
            
            await asyncio.sleep(1)  # Non-blocking sleep
    
    return response_json if messages else None

async def send_read_receipt(recipient, timestamp):
    """Sends a read receipt for a message asynchronously"""
    # If this function can be called externally with a potentially unformatted number,
    # it might also need the formatting logic.
    # However, if it's only called internally or `recipient` is expected to be group ID or pre-formatted,
    # then it might be okay. For consistency, adding it here is safer.
    formatted_recipient = recipient
    if isinstance(recipient, str) and recipient.isdigit(): # Basic check, no group check needed for receipt
        if len(recipient) == 10:
            formatted_recipient = "+1" + recipient
        elif len(recipient) > 10 and recipient.startswith('1'):
            formatted_recipient = "+" + recipient
        elif not recipient.startswith('+'):
            formatted_recipient = "+" + recipient

    payload = {
        "receipt_type": "read",
        "recipient": formatted_recipient, # Use formatted_recipient
        "timestamp": timestamp
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.post(f"{SIGNAL_API_URL}/v1/receipts/{SIGNAL_NUMBER}", json=payload) as response:
            print("sent read receipt response: ", response)
            return response.status == 204

async def send_typing_indicator(recipient, start=True):
    """Shows/hides typing indicator asynchronously"""
    # Similar to send_read_receipt, consider formatting if called externally.
    # If called by send_signal_message, recipient is already formatted.
    # For safety, let's add it, assuming it could be called directly with a non-group number.
    formatted_recipient = recipient
    if isinstance(recipient, str) and recipient.isdigit(): # No group check in original typing indicator logic
        if len(recipient) == 10:
            formatted_recipient = "+1" + recipient
        elif len(recipient) > 10 and recipient.startswith('1'):
            formatted_recipient = "+" + recipient
        elif not recipient.startswith('+'):
            formatted_recipient = "+" + recipient

    method = "PUT" if start else "DELETE"
    payload = {
        "recipient": formatted_recipient, # Use formatted_recipient
        "number": SIGNAL_NUMBER 
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.request(
            method, 
            f"{SIGNAL_API_URL}/v1/typing-indicator/{SIGNAL_NUMBER}", 
            json=payload
        ) as response:
            return response.status == 200

# Signal Group Functions
# ---------------------------
async def list_groups():
    """List all Signal groups for the configured number"""
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{SIGNAL_API_URL}/v1/groups/{SIGNAL_NUMBER}") as response:
            if response.status == 200:
                return await response.json()
            else:
                error_data = await response.json()
                print(f"Error listing groups: {error_data.get('error', 'Unknown error')}")
                return None
