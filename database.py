import os
import hashlib
import json
import sys
import time
import aiofiles
import asyncio
from google.genai import types

DATA_DIR = 'data'

def get_file_path(key):
    hash_value = hashlib.md5(key.encode()).hexdigest()
    dir_path = os.path.join(DATA_DIR, hash_value[:2], hash_value[2:4])
    os.makedirs(dir_path, exist_ok=True)
    return os.path.join(dir_path, hash_value)

async def write_data(key, value, app_name=None):
    """Write data to local storage asynchronously"""
    try:
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
        async with aiofiles.open(file_path, 'w') as f:
            await f.write(json.dumps(data))
        
        # # If an app name is provided, create a mapping
        # if app_name:
        #     from app import slugify  # Import here to avoid circular dependency
        #     slug = slugify(app_name)
        #     mapping_data = {
        #         'app_name': app_name,
        #         'slug': slug,
        #         'key': key
        #     }
        #     mapping_path = get_file_path(f'mapping-{slug}')
        #     async with aiofiles.open(mapping_path, 'w') as f:
        #         await f.write(json.dumps(mapping_data))

        print(f"In write_data: Data written to key: {key}", file=sys.stderr)
        return {
            'status': 'success',
            'key': key,
        }
    except Exception as e:
        raise Exception(f"Error writing data: {str(e)}")

async def read_data(key):
    """Read data from local storage asynchronously"""
    try:
        file_path = get_file_path(key)
        if not os.path.exists(file_path):
            raise Exception('Key not found')
            
        # First read the data
        async with aiofiles.open(file_path, 'r') as f:
            content = await f.read()
            data = json.loads(content)
            
        # Initialize missing fields if they don't exist
        if 'read_count' not in data:
            data['read_count'] = 0
        if 'read_timestamp' not in data:
            data['read_timestamp'] = None
            
        data['read_timestamp'] = time.time()
        data['read_count'] += 1
        
        # Write back the updated data
        async with aiofiles.open(file_path, 'w') as f:
            await f.write(json.dumps(data))
            
        return {
            'key': key,
            'value': data.get('value', data),
            'write_timestamp': data.get('write_timestamp'),
            'read_timestamp': data['read_timestamp'],
            'read_count': data['read_count']
        }
    except Exception as e:
        raise Exception(f"Error reading data: {str(e)}")

async def delete_data(key):
    """Delete data from local storage asynchronously"""
    try:
        file_path = get_file_path(key)
        if not os.path.exists(file_path):
            raise Exception('Key not found')
            
        # Use asyncio to run the file deletion
        await asyncio.to_thread(os.remove, file_path)
        return {
            'status': 'success',
            'key': key,
            'message': 'Data deleted successfully'
        }
    except Exception as e:
        raise Exception(f"Error deleting data: {str(e)}")

async def save_user_app(sender_phone, app_name, app_id, app_key, serve_url):
    """Save app to user's collection of apps asynchronously"""
    try:
        # Use a standardized key format for user's apps collection
        user_apps_key = f"apps-{sender_phone}"
        
        # Try to get existing apps collection, or create a new one
        try:
            user_apps_data = await read_data(user_apps_key)
            user_apps = user_apps_data.get('value', {}) if isinstance(user_apps_data, dict) else {}
        except:
            # If no apps collection exists yet, create an empty one
            user_apps = {}
        
        # Add the new app to the collection
        user_apps[app_name] = {
            'app_id': app_id,
            'app_key': app_key,
            'url': serve_url,
            'created_at': time.time()
        }
        
        # Save the updated collection
        write_result = await write_data(user_apps_key, user_apps)
        
        return write_result
    except Exception as e:
        raise Exception(f"Error saving user app: {str(e)}")

async def delete_user_app(sender_phone, app_name):
    """Delete an app from user's collection of apps asynchronously"""
    try:
        # Use a standardized key format for user's apps collection
        user_apps_key = f"apps-{sender_phone}"
        
        # Try to get existing apps collection
        try:
            user_apps_data = await read_data(user_apps_key)
            user_apps = user_apps_data.get('value', {}) if isinstance(user_apps_data, dict) else {}
        except:
            return {
                'status': 'error',
                'message': 'No apps found for this user'
            }
        
        # Check if the app exists
        if app_name not in user_apps:
            # Try case-insensitive search
            app_found = False
            for stored_app_name in list(user_apps.keys()):
                if stored_app_name.lower() == app_name.lower():
                    app_name = stored_app_name  # Use the actual stored name with correct case
                    app_found = True
                    break
                    
            if not app_found:
                return {
                    'status': 'error',
                    'message': f'App "{app_name}" not found'
                }
        
        # Get app details before deleting
        app_info = user_apps[app_name]
        app_key = app_info.get('app_key')
        
        # Remove the app from the collection
        del user_apps[app_name]
        
        # Save the updated collection
        write_result = await write_data(user_apps_key, user_apps)
        
        # Try to delete the actual app data
        if app_key:
            try:
                await delete_data(app_key)
            except Exception as e:
                print(f"Warning: Could not delete app data for {app_key}: {e}")
                # Continue with deletion even if app data cannot be removed
        
        return {
            'status': 'success',
            'message': f'App "{app_name}" successfully deleted'
        }
    except Exception as e:
        return {
            'status': 'error',
            'message': f"Error deleting user app: {str(e)}"
        }

async def get_conversation_history(sender_phone, max_messages=30):
    """Retrieve the conversation history for a specific user"""
    try:
        # Use the phone number directly as the key
        history_key = sender_phone
        file_path = f"chat_history/{history_key}.json"
        
        try:
            # Try to get existing conversation history from JSON file
            if os.path.exists(file_path):
                with open(file_path, 'r') as f:
                    messages = json.load(f)
                return messages[-max_messages:] if messages else []
            else:
                return []
        except Exception as e:
            print(f"Error reading conversation history: {str(e)}")
            # If no history exists yet or there's an error reading, return an empty list
            return []
    except Exception as e:
        print(f"Error retrieving conversation history: {str(e)}")
        return []

async def update_conversation_history(sender_phone, messages, max_history=30):
    """
    Save the conversation history for a user
    messages: A list of message objects that are JSON serializable
    """
    try:
        # Use the phone number directly as the key
        history_key = sender_phone
        file_path = f"chat_history/{history_key}.json"
        
        # Ensure all messages are JSON serializable
        # This is a safety check that should happen before calling this function
        try:
            # Test serialization
            json.dumps(messages)
        except TypeError as e:
            print(f"Warning: Messages are not JSON serializable: {str(e)}")
            return {
                'status': 'error',
                'message': f"Messages are not JSON serializable: {str(e)}"
            }
        
        # Keep only the most recent messages
        if len(messages) > max_history:
            messages = messages[-max_history:]
        
        # Ensure the directory exists
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        # Write history to JSON file
        with open(file_path, 'w') as f:
            json.dump(messages, f, indent=2)
        
        return {
            'status': 'success',
            'message': 'Conversation history updated'
        }
    except Exception as e:
        print(f"Error updating conversation history: {str(e)}")
        return {
            'status': 'error',
            'message': f"Failed to update conversation history: {str(e)}"
        }

async def clear_conversation_history(sender_phone):
    """Clear the entire conversation history for a specific user"""
    try:
        # Use the phone number directly as the key
        history_key = sender_phone
        file_path = f"chat_history/{history_key}.json"
        
        # Check if history exists
        if not os.path.exists(file_path):
            return {
                'status': 'success',
                'message': 'No conversation history found to clear'
            }
        
        # Write an empty array to replace the existing history
        with open(file_path, 'w') as f:
            json.dump([], f)
        
        return {
            'status': 'success',
            'message': 'Conversation history cleared successfully'
        }
    except Exception as e:
        print(f"Error clearing conversation history: {str(e)}")
        return {
            'status': 'error',
            'message': f"Failed to clear conversation history: {str(e)}"
        }
