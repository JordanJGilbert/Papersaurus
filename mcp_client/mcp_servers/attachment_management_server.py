#!/usr/bin/env python3
"""
Attachment Management Server for MCP

Provides comprehensive attachment handling capabilities:
- Upload and store files with metadata
- Retrieve attachment information and content
- List attachments with filtering
- Clean up temporary files
"""

import sys
import os
import json
import tempfile
import re
import asyncio
import base64
import shutil
from typing import Optional, Tuple

# Ensure project root is in path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from fastmcp import FastMCP
from llm_adapters import get_llm_adapter, StandardizedMessage, StandardizedLLMConfig

# Base user_data directory
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..', 'user_data'))

mcp = FastMCP("Attachment Management Server")

def sanitize_user_id(user_id: str) -> str:
    """Sanitize a user identifier for filesystem path use."""
    if user_id.startswith('+'):
        user_id = user_id[1:]
    # Remove any non-alphanumeric characters
    sanitized = re.sub(r'\W+', '', user_id)
    return sanitized or 'unknown_user_id'


def load_index_for_user(user_number: str) -> dict:
    """Load the attachments index.json for a given user."""
    uid = sanitize_user_id(user_number)
    index_path = os.path.join(BASE_DIR, uid, 'attachments', 'index.json')
    try:
        with open(index_path, 'r') as f:
            return json.load(f)
    except Exception:
        return {}


def save_index_for_user(user_number: str, idx: dict):
    """Atomically save the attachments index.json for a given user."""
    uid = sanitize_user_id(user_number)
    attachments_dir = os.path.join(BASE_DIR, uid, 'attachments')
    os.makedirs(attachments_dir, exist_ok=True)
    index_path = os.path.join(attachments_dir, 'index.json')
    # Atomic write to temp file then replace
    fd, tmp_path = tempfile.mkstemp(dir=attachments_dir, prefix='idx-', suffix='.tmp')
    with os.fdopen(fd, 'w') as tmpf:
        json.dump(idx, tmpf, indent=2)
    os.replace(tmp_path, index_path)


# --- Helper function for path validation ---
async def _get_validated_user_path(user_number: str, relative_path_str: str = "", check_existence: bool = False, item_must_be_dir: Optional[bool] = None) -> Tuple[Optional[str], Optional[str]]:
    """
    Validates and resolves a path relative to a user's specific data directory.

    Args:
        user_number (str): The user's identifier.
        relative_path_str (str): The path relative to the user's data root.
                                 Can be empty to refer to the user's root.
        check_existence (bool): If True, checks if the resolved path exists.
        item_must_be_dir (Optional[bool]): If True, checks if path is a directory. If False, checks if it's a file.
                                         If None, no type check is performed.

    Returns:
        Tuple[Optional[str], Optional[str]]: (absolute_path, error_message).
                                             absolute_path is None if validation fails.
                                             error_message contains the reason for failure.
    """
    sanitized_uid = sanitize_user_id(user_number)
    user_root_path = os.path.abspath(os.path.join(BASE_DIR, sanitized_uid))

    # Ensure user root directory exists, create if not (for operations like mkdir in user root)
    if not await asyncio.to_thread(os.path.exists, user_root_path):
        try:
            await asyncio.to_thread(os.makedirs, user_root_path, exist_ok=True)
        except Exception as e:
            return None, f"Failed to create user root directory {user_root_path}: {e}"

    # Normalize the relative path: remove leading/trailing slashes, protect against ".."
    # os.path.normpath will handle "." and ".." but we need to ensure it doesn't escape the root.
    # Prevent absolute paths in relative_path_str by stripping leading slashes.
    cleaned_relative_path = relative_path_str.lstrip('/').lstrip('\\\\')
    
    # Join and normalize
    prospective_path = os.path.normpath(os.path.join(user_root_path, cleaned_relative_path))

    # Security check: Ensure the resolved path is still within the user's root directory
    if not prospective_path.startswith(user_root_path):
        return None, "Path traversal attempt detected. Access denied."

    abs_path = os.path.abspath(prospective_path) # Final absolute path

    if check_existence:
        path_exists = await asyncio.to_thread(os.path.exists, abs_path)
        if not path_exists:
            return None, f"Path does not exist: {relative_path_str}"
        
        if item_must_be_dir is not None:
            is_dir = await asyncio.to_thread(os.path.isdir, abs_path)
            if item_must_be_dir and not is_dir:
                return None, f"Path is not a directory: {relative_path_str}"
            if not item_must_be_dir and is_dir:
                return None, f"Path is not a file: {relative_path_str}"
                
    return abs_path, None



@mcp.tool()
async def list_attachments(
    user_number: str,
    since_timestamp: int = 0,
    limit: int = 10
) -> dict:
    """
    Lists metadata for attachments associated with a given user.
    The LLM typically calls this tool first to discover available files and review their
    metadata (key, url, mime_type, timestamp, label, description).
    Based on this information, the LLM can then decide if it needs to retrieve the
    actual content of specific files using the 'fetch_attachments' tool.

    Args:
        user_number (str): The user's identifier.
        since_timestamp (int, optional): Filters attachments to those created or modified
                                         after this UNIX timestamp. Defaults to 0 (all attachments).
        limit (int, optional): Maximum number of attachments to return. Defaults to 10.

    Returns:
        dict: A dictionary containing a list of attachment metadata objects under the key "attachments".
              Each object includes 'key', 'url', 'mime_type', 'timestamp', 'label', and 'description'.
    """
    idx = load_index_for_user(user_number)
    items = []
    for key, entry in idx.items():
        ts = entry.get('timestamp', 0)
        if ts >= since_timestamp:
            items.append({
                'key': key,
                'url': entry.get('url'),
                'mime_type': entry.get('mime_type'),
                'timestamp': ts,
                'label': entry.get('label'),
                'description': entry.get('description')
            })
    # Sort by most recent
    items.sort(key=lambda x: x['timestamp'], reverse=True)
    return {"attachments": items[:limit]}


@mcp.tool()
async def fetch_attachments(
    user_number: str,
    keys: list
) -> dict:
    """
    Retrieves the content of specific attachments for a user, base64-encoded.
    After using 'list_attachments' to identify relevant files, the LLM calls this tool
    with a list of 'keys' (obtained from the 'list_attachments' response) to get their content.
    The calling system (e.g., the AI model's orchestration layer) is expected to:
    1. Receive the list of attachment dictionaries from this tool.
    2. For each attachment, decode the 'base64_data' field back into bytes.
    3. Prepare this byte data as inline content (e.g., a Gemini 'Blob' part) for the LLM.
    4. Include these inline content parts in the next message/turn to the LLM,
       allowing it to directly process or "see" the file content.

    Args:
        user_number (str): The user's identifier.
        keys (list): A list of attachment keys (strings) to fetch.

    Returns:
        dict: A dictionary containing a list of attachment dictionaries under the key "attachments_data".
              Each dictionary corresponds to a requested attachment and includes: 'key', 'filename', 'mime_type', and 'base64_data' (the
              base64-encoded file content). If a key is not found or an error occurs
              while processing a file, that file may be omitted from the results or
              an error indicator might be included (current behavior is to print a warning
              and skip).
    """
    idx = load_index_for_user(user_number)
    output_attachments = []
    if not isinstance(keys, list):
        # Handle cases where keys might not be a list, though Pydantic/MCP should enforce this.
        print(f"Warning: 'keys' argument was not a list for user {user_number}. Got: {type(keys)}")
        return {"attachments_data": []} # Or raise an error

    for key in keys:
        entry = idx.get(key)
        if not entry:
            print(f"Warning: Attachment key '{key}' not found in index for user {user_number}.")
            continue
        
        file_path = entry.get("path")
        mime_type = entry.get("mime_type", "application/octet-stream") # Default MIME type
        original_filename = entry.get("filename", key) # Fallback to key if no filename

        if not file_path or not os.path.exists(file_path):
            print(f"Warning: File path for key '{key}' not found or invalid: {file_path}")
            continue
        
        try:
            with open(file_path, "rb") as f:
                file_bytes = f.read()
            base64_encoded_data = base64.b64encode(file_bytes).decode('utf-8')
            output_attachments.append({
                "key": key,
                "filename": original_filename,
                "mime_type": mime_type,
                "base64_data": base64_encoded_data # Changed field name for clarity
            })
        except Exception as e:
            print(f"Error reading or encoding file for key '{key}' (user {user_number}): {e}")
            # Optionally, include error information in the response or skip this attachment
            continue
            
    return {"attachments_data": output_attachments} # Standardized return format

# Add mcp.run() if it's not already there for standalone execution/testing
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