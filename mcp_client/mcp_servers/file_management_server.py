#!/usr/bin/env python3
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from fastmcp import FastMCP, Context
import asyncio
import json
import shutil
from pathlib import Path
from typing import List, Optional, Annotated, Literal
import logging
from pydantic import Field
import re
import tempfile

# Import the search/replace functionality from utils
from utils.search_replace import (
    SearchReplaceBlockParser,
    SearchReplaceApplicator,
    apply_search_replace_blocks,
    flexible_search_and_replace,
    editblock_strategies
)

logging.basicConfig(stream=sys.stderr, level=logging.WARNING, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

mcp = FastMCP("File Management Server")

def sanitize_path(path: str) -> str:
    """Sanitize a file path to prevent directory traversal attacks."""
    # Convert to Path object to normalize
    normalized = os.path.normpath(path)
    
    # Prevent directory traversal
    if '..' in normalized or normalized.startswith('/'):
        raise ValueError(f"Invalid path: {path}. Path cannot contain '..' or start with '/'")
    
    return normalized

def get_safe_path(base_dir: str, relative_path: str) -> str:
    """Get a safe absolute path within the base directory."""
    safe_relative = sanitize_path(relative_path)
    full_path = os.path.join(base_dir, safe_relative)
    
    # Ensure the path is within the base directory
    base_abs = os.path.abspath(base_dir)
    full_abs = os.path.abspath(full_path)
    
    if not full_abs.startswith(base_abs):
        raise ValueError(f"Path {relative_path} is outside allowed base directory")
    
    return full_abs

@mcp.tool()
async def read_file_content(
    file_path: Annotated[str, Field(
        description="The relative path to the file to read, including filename and extension"
    )],
    base_directory: Annotated[str, Field(
        description="The base directory to operate within (defaults to user_data directory)"
    )] = "user_data",
    encoding: Annotated[str, Field(
        description="File encoding to use when reading (utf-8, ascii, etc.)"
    )] = "utf-8"
) -> dict:
    """
    Read the content of a file and return it as text.
    
    Args:
        file_path: Relative path to the file (e.g., "folder/file.txt")
        base_directory: Base directory to operate within 
        encoding: Text encoding to use when reading the file
        
    Returns:
        dict: File content and metadata or error information
    """
    try:
        safe_path = get_safe_path(base_directory, file_path)
        
        if not await asyncio.to_thread(os.path.exists, safe_path):
            return {
                "status": "error",
                "message": f"File not found: {file_path}",
                "file_path": file_path
            }
        
        if not await asyncio.to_thread(os.path.isfile, safe_path):
            return {
                "status": "error", 
                "message": f"Path is not a file: {file_path}",
                "file_path": file_path
            }
        
        # Read file content
        with open(safe_path, 'r', encoding=encoding) as f:
            content = await asyncio.to_thread(f.read)
        
        # Get file stats
        stat_info = await asyncio.to_thread(os.stat, safe_path)
        
        return {
            "status": "success",
            "content": content,
            "file_path": file_path,
            "absolute_path": safe_path,
            "size": stat_info.st_size,
            "lines": len(content.splitlines()),
            "encoding": encoding
        }
        
    except UnicodeDecodeError as e:
        return {
            "status": "error",
            "message": f"Failed to decode file with {encoding} encoding: {str(e)}",
            "file_path": file_path,
            "suggestion": "Try a different encoding like 'latin-1' or 'utf-16'"
        }
    except ValueError as e:
        return {
            "status": "error",
            "message": f"Invalid path: {str(e)}",
            "file_path": file_path
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to read file: {str(e)}",
            "file_path": file_path
        }

@mcp.tool()
async def write_file_content(
    file_path: Annotated[str, Field(
        description="The relative path to the file to write, including filename and extension"
    )],
    content: Annotated[str, Field(
        description="The content to write to the file"
    )],
    base_directory: Annotated[str, Field(
        description="The base directory to operate within (defaults to user_data directory)"
    )] = "user_data",
    encoding: Annotated[str, Field(
        description="File encoding to use when writing (utf-8, ascii, etc.)"
    )] = "utf-8",
    create_directories: Annotated[bool, Field(
        description="Whether to create parent directories if they don't exist"
    )] = True,
    overwrite: Annotated[bool, Field(
        description="Whether to overwrite the file if it already exists"
    )] = True
) -> dict:
    """
    Write content to a file. Can create new files or overwrite existing ones.
    
    Args:
        file_path: Relative path to the file (e.g., "folder/file.txt")
        content: Content to write to the file
        base_directory: Base directory to operate within
        encoding: Text encoding to use when writing
        create_directories: Whether to create parent directories
        overwrite: Whether to overwrite if file exists
        
    Returns:
        dict: Success confirmation or error information
    """
    try:
        safe_path = get_safe_path(base_directory, file_path)
        
        # Check if file exists and overwrite is disabled
        if not overwrite and await asyncio.to_thread(os.path.exists, safe_path):
            return {
                "status": "error",
                "message": f"File already exists and overwrite is disabled: {file_path}",
                "file_path": file_path
            }
        
        # Create parent directories if needed
        if create_directories:
            parent_dir = os.path.dirname(safe_path)
            if parent_dir and not await asyncio.to_thread(os.path.exists, parent_dir):
                await asyncio.to_thread(os.makedirs, parent_dir, exist_ok=True)
        
        # Write the file
        with open(safe_path, 'w', encoding=encoding) as f:
            await asyncio.to_thread(f.write, content)
        
        # Get file stats for confirmation
        stat_info = await asyncio.to_thread(os.stat, safe_path)
        
        return {
            "status": "success",
            "message": f"File written successfully: {file_path}",
            "file_path": file_path,
            "absolute_path": safe_path,
            "size": stat_info.st_size,
            "lines": len(content.splitlines()),
            "encoding": encoding,
            "was_created": not await asyncio.to_thread(os.path.exists, safe_path) if not overwrite else None
        }
        
    except ValueError as e:
        return {
            "status": "error",
            "message": f"Invalid path: {str(e)}",
            "file_path": file_path
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to write file: {str(e)}",
            "file_path": file_path
        }

@mcp.tool()
async def edit_file_content(
    file_path: Annotated[str, Field(
        description="The relative path to the file to edit"
    )],
    search_replace_blocks: Annotated[str, Field(
        description="Search/replace blocks in the format used by the web app editor. Use <<<<<<< SEARCH / ======= / >>>>>>> REPLACE format."
    )],
    base_directory: Annotated[str, Field(
        description="The base directory to operate within (defaults to user_data directory)"
    )] = "user_data",
    encoding: Annotated[str, Field(
        description="File encoding to use"
    )] = "utf-8",
    create_backup: Annotated[bool, Field(
        description="Whether to create a backup of the original file"
    )] = True
) -> dict:
    """
    Edit a file using search/replace blocks, similar to the web app editor.
    
    Uses the same search/replace format as the web app editor:
    
    ```
    <<<<<<< SEARCH
    [Exact text to find]
    =======
    [Replacement text]
    >>>>>>> REPLACE
    ```
    
    Args:
        file_path: Relative path to the file to edit
        search_replace_blocks: The search/replace instructions
        base_directory: Base directory to operate within
        encoding: File encoding to use
        create_backup: Whether to create a .bak backup file
        
    Returns:
        dict: Edit results with success/failure details
    """
    try:
        safe_path = get_safe_path(base_directory, file_path)
        
        if not await asyncio.to_thread(os.path.exists, safe_path):
            return {
                "status": "error",
                "message": f"File not found: {file_path}",
                "file_path": file_path
            }
        
        if not await asyncio.to_thread(os.path.isfile, safe_path):
            return {
                "status": "error",
                "message": f"Path is not a file: {file_path}",
                "file_path": file_path
            }
        
        # Read current file content
        with open(safe_path, 'r', encoding=encoding) as f:
            current_content = await asyncio.to_thread(f.read)
        
        # Create backup if requested
        backup_path = None
        if create_backup:
            backup_path = safe_path + '.bak'
            with open(backup_path, 'w', encoding=encoding) as f:
                await asyncio.to_thread(f.write, current_content)
        
        # Parse search/replace blocks
        # Prepend the filename to the search_replace_blocks for the parser
        full_search_replace = f"{file_path}\n{search_replace_blocks}"
        
        parser = SearchReplaceBlockParser()
        blocks = parser.parse_blocks(full_search_replace)
        
        if not blocks:
            return {
                "status": "error",
                "message": "No valid search/replace blocks found",
                "file_path": file_path
            }
        
        # Apply search/replace blocks
        modified_content = current_content
        successful_blocks = 0
        failed_blocks = 0
        failed_details = []
        
        for i, (parsed_file_path, search_text, replace_text) in enumerate(blocks):
            # Ensure proper newline handling
            if not search_text.endswith('\n'):
                search_text += '\n'
            if not replace_text.endswith('\n'):
                replace_text += '\n'
            if not modified_content.endswith('\n'):
                modified_content += '\n'
            
            # Apply using flexible search and replace
            texts = (search_text, replace_text, modified_content)
            result = flexible_search_and_replace(texts, editblock_strategies)
            
            if result is not None:
                modified_content = result
                successful_blocks += 1
                logger.info(f"✓ Successfully applied block {i+1}/{len(blocks)}")
            else:
                failed_blocks += 1
                failed_details.append(f"Block {i+1}: Search text not found or couldn't be applied")
                logger.warning(f"✗ Failed to apply block {i+1}/{len(blocks)}")
        
        # Check if any edits were successful
        if successful_blocks == 0:
            return {
                "status": "error",
                "message": f"All {len(blocks)} search/replace blocks failed to apply",
                "file_path": file_path,
                "failed_details": failed_details,
                "backup_created": backup_path is not None,
                "backup_path": backup_path
            }
        
        # Write the modified content back to the file
        with open(safe_path, 'w', encoding=encoding) as f:
            await asyncio.to_thread(f.write, modified_content)
        
        # Get file stats
        stat_info = await asyncio.to_thread(os.stat, safe_path)
        
        return {
            "status": "success",
            "message": f"File edited successfully: {file_path}",
            "file_path": file_path,
            "absolute_path": safe_path,
            "blocks_applied": successful_blocks,
            "blocks_failed": failed_blocks,
            "total_blocks": len(blocks),
            "failed_details": failed_details if failed_details else None,
            "backup_created": backup_path is not None,
            "backup_path": backup_path,
            "new_size": stat_info.st_size,
            "new_lines": len(modified_content.splitlines()),
            "content_changed": current_content != modified_content
        }
        
    except ValueError as e:
        return {
            "status": "error",
            "message": f"Invalid path: {str(e)}",
            "file_path": file_path
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to edit file: {str(e)}",
            "file_path": file_path
        }

@mcp.tool()
async def list_directory(
    directory_path: Annotated[str, Field(
        description="The relative path to the directory to list"
    )] = "user_data",
    base_directory: Annotated[str, Field(
        description="The base directory to operate within (defaults to user_data directory)"
    )] = "user_data",
    show_hidden: Annotated[bool, Field(
        description="Whether to show hidden files (starting with .)"
    )] = False,
    include_details: Annotated[bool, Field(
        description="Whether to include file size, modification time, and permissions"
    )] = True,
    recursive: Annotated[bool, Field(
        description="Whether to recursively list subdirectories"
    )] = False,
    max_depth: Annotated[int, Field(
        description="Maximum recursion depth (only used if recursive=True)"
    )] = 3
) -> dict:
    """
    List the contents of a directory.
    
    Args:
        directory_path: Relative path to the directory to list
        base_directory: Base directory to operate within
        show_hidden: Whether to show hidden files/directories
        include_details: Whether to include detailed file information
        recursive: Whether to recursively list subdirectories
        max_depth: Maximum recursion depth
        
    Returns:
        dict: Directory listing with files and directories
    """
    try:
        safe_path = get_safe_path(base_directory, directory_path)
        
        if not await asyncio.to_thread(os.path.exists, safe_path):
            return {
                "status": "error",
                "message": f"Directory not found: {directory_path}",
                "directory_path": directory_path
            }
        
        if not await asyncio.to_thread(os.path.isdir, safe_path):
            return {
                "status": "error",
                "message": f"Path is not a directory: {directory_path}",
                "directory_path": directory_path
            }
        
        def get_directory_listing(path: str, current_depth: int = 0) -> dict:
            """Recursively get directory listing."""
            items = []
            
            try:
                entries = os.listdir(path)
                entries.sort()  # Sort alphabetically
                
                for entry in entries:
                    # Skip hidden files if not requested
                    if not show_hidden and entry.startswith('.'):
                        continue
                    
                    entry_path = os.path.join(path, entry)
                    relative_path = os.path.relpath(entry_path, safe_path)
                    
                    is_dir = os.path.isdir(entry_path)
                    is_file = os.path.isfile(entry_path)
                    
                    item = {
                        "name": entry,
                        "path": relative_path,
                        "type": "directory" if is_dir else "file" if is_file else "other"
                    }
                    
                    if include_details:
                        try:
                            stat_info = os.stat(entry_path)
                            item.update({
                                "size": stat_info.st_size,
                                "modified": stat_info.st_mtime,
                                "permissions": oct(stat_info.st_mode)[-3:]
                            })
                        except OSError:
                            item["size"] = None
                            item["modified"] = None
                            item["permissions"] = None
                    
                    # Recursively list subdirectories if requested
                    if recursive and is_dir and current_depth < max_depth:
                        subdirectory_listing = get_directory_listing(entry_path, current_depth + 1)
                        item["contents"] = subdirectory_listing["items"]
                    
                    items.append(item)
                
            except PermissionError:
                pass  # Skip directories we can't read
            
            return {"items": items, "count": len(items)}
        
        # Get the listing
        listing = await asyncio.to_thread(get_directory_listing, safe_path)
        
        return {
            "status": "success",
            "directory_path": directory_path,
            "absolute_path": safe_path,
            "items": listing["items"],
            "total_items": listing["count"],
            "show_hidden": show_hidden,
            "include_details": include_details,
            "recursive": recursive
        }
        
    except ValueError as e:
        return {
            "status": "error",
            "message": f"Invalid path: {str(e)}",
            "directory_path": directory_path
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to list directory: {str(e)}",
            "directory_path": directory_path
        }

@mcp.tool()
async def create_directory(
    directory_path: Annotated[str, Field(
        description="The relative path to the directory to create"
    )],
    base_directory: Annotated[str, Field(
        description="The base directory to operate within (defaults to user_data directory)"
    )] = "user_data",
    create_parents: Annotated[bool, Field(
        description="Whether to create parent directories if they don't exist"
    )] = True,
    exist_ok: Annotated[bool, Field(
        description="Whether to succeed if the directory already exists"
    )] = True
) -> dict:
    """
    Create a new directory.
    
    Args:
        directory_path: Relative path to the directory to create
        base_directory: Base directory to operate within
        create_parents: Whether to create parent directories
        exist_ok: Whether to succeed if directory already exists
        
    Returns:
        dict: Success confirmation or error information
    """
    try:
        safe_path = get_safe_path(base_directory, directory_path)
        
        # Check if directory already exists
        if await asyncio.to_thread(os.path.exists, safe_path):
            if not exist_ok:
                return {
                    "status": "error",
                    "message": f"Directory already exists: {directory_path}",
                    "directory_path": directory_path
                }
            elif await asyncio.to_thread(os.path.isdir, safe_path):
                return {
                    "status": "success",
                    "message": f"Directory already exists: {directory_path}",
                    "directory_path": directory_path,
                    "absolute_path": safe_path,
                    "was_created": False
                }
            else:
                return {
                    "status": "error",
                    "message": f"Path exists but is not a directory: {directory_path}",
                    "directory_path": directory_path
                }
        
        # Create the directory
        if create_parents:
            await asyncio.to_thread(os.makedirs, safe_path, exist_ok=exist_ok)
        else:
            await asyncio.to_thread(os.mkdir, safe_path)
        
        return {
            "status": "success",
            "message": f"Directory created successfully: {directory_path}",
            "directory_path": directory_path,
            "absolute_path": safe_path,
            "was_created": True
        }
        
    except ValueError as e:
        return {
            "status": "error",
            "message": f"Invalid path: {str(e)}",
            "directory_path": directory_path
        }
    except FileExistsError:
        return {
            "status": "error",
            "message": f"Directory or file already exists: {directory_path}",
            "directory_path": directory_path
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to create directory: {str(e)}",
            "directory_path": directory_path
        }

@mcp.tool()
async def delete_file(
    file_path: Annotated[str, Field(
        description="The relative path to the file to delete"
    )],
    base_directory: Annotated[str, Field(
        description="The base directory to operate within (defaults to user_data directory)"
    )] = "user_data",
    create_backup: Annotated[bool, Field(
        description="Whether to create a backup before deleting"
    )] = False,
    confirm: Annotated[bool, Field(
        description="Confirmation flag - must be True to actually delete the file"
    )] = False
) -> dict:
    """
    Delete a file.
    
    Args:
        file_path: Relative path to the file to delete
        base_directory: Base directory to operate within
        create_backup: Whether to create a backup before deletion
        confirm: Must be True to actually perform the deletion
        
    Returns:
        dict: Success confirmation or error information
    """
    try:
        safe_path = get_safe_path(base_directory, file_path)
        
        if not await asyncio.to_thread(os.path.exists, safe_path):
            return {
                "status": "error",
                "message": f"File not found: {file_path}",
                "file_path": file_path
            }
        
        if not await asyncio.to_thread(os.path.isfile, safe_path):
            return {
                "status": "error",
                "message": f"Path is not a file: {file_path}",
                "file_path": file_path
            }
        
        # Safety check - require explicit confirmation
        if not confirm:
            stat_info = await asyncio.to_thread(os.stat, safe_path)
            return {
                "status": "confirmation_required",
                "message": f"File '{file_path}' exists and can be deleted. Set 'confirm=True' to proceed.",
                "file_path": file_path,
                "absolute_path": safe_path,
                "size": stat_info.st_size,
                "warning": "This action cannot be undone unless create_backup=True"
            }
        
        # Create backup if requested
        backup_path = None
        if create_backup:
            backup_path = safe_path + '.deleted.bak'
            await asyncio.to_thread(shutil.copy2, safe_path, backup_path)
        
        # Get file info before deletion
        stat_info = await asyncio.to_thread(os.stat, safe_path)
        file_size = stat_info.st_size
        
        # Delete the file
        await asyncio.to_thread(os.remove, safe_path)
        
        return {
            "status": "success",
            "message": f"File deleted successfully: {file_path}",
            "file_path": file_path,
            "absolute_path": safe_path,
            "size_deleted": file_size,
            "backup_created": backup_path is not None,
            "backup_path": backup_path
        }
        
    except ValueError as e:
        return {
            "status": "error",
            "message": f"Invalid path: {str(e)}",
            "file_path": file_path
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to delete file: {str(e)}",
            "file_path": file_path
        }

@mcp.tool()
async def delete_directory(
    directory_path: Annotated[str, Field(
        description="The relative path to the directory to delete"
    )],
    base_directory: Annotated[str, Field(
        description="The base directory to operate within (defaults to user_data directory)"
    )] = "user_data",
    recursive: Annotated[bool, Field(
        description="Whether to delete the directory and all its contents recursively"
    )] = False,
    confirm: Annotated[bool, Field(
        description="Confirmation flag - must be True to actually delete the directory"
    )] = False
) -> dict:
    """
    Delete a directory.
    
    Args:
        directory_path: Relative path to the directory to delete
        base_directory: Base directory to operate within
        recursive: Whether to delete contents recursively
        confirm: Must be True to actually perform the deletion
        
    Returns:
        dict: Success confirmation or error information
    """
    try:
        safe_path = get_safe_path(base_directory, directory_path)
        
        if not await asyncio.to_thread(os.path.exists, safe_path):
            return {
                "status": "error",
                "message": f"Directory not found: {directory_path}",
                "directory_path": directory_path
            }
        
        if not await asyncio.to_thread(os.path.isdir, safe_path):
            return {
                "status": "error",
                "message": f"Path is not a directory: {directory_path}",
                "directory_path": directory_path
            }
        
        # Check if directory is empty
        contents = await asyncio.to_thread(os.listdir, safe_path)
        is_empty = len(contents) == 0
        
        # Safety check - require explicit confirmation
        if not confirm:
            return {
                "status": "confirmation_required",
                "message": f"Directory '{directory_path}' exists and can be deleted. Set 'confirm=True' to proceed.",
                "directory_path": directory_path,
                "absolute_path": safe_path,
                "is_empty": is_empty,
                "contents_count": len(contents),
                "recursive_required": not is_empty,
                "warning": "This action cannot be undone"
            }
        
        # Check if recursive deletion is needed but not allowed
        if not is_empty and not recursive:
            return {
                "status": "error",
                "message": f"Directory is not empty and recursive=False: {directory_path}",
                "directory_path": directory_path,
                "contents_count": len(contents),
                "suggestion": "Set recursive=True to delete non-empty directory"
            }
        
        # Delete the directory
        if recursive and not is_empty:
            await asyncio.to_thread(shutil.rmtree, safe_path)
        else:
            await asyncio.to_thread(os.rmdir, safe_path)
        
        return {
            "status": "success",
            "message": f"Directory deleted successfully: {directory_path}",
            "directory_path": directory_path,
            "absolute_path": safe_path,
            "was_empty": is_empty,
            "contents_deleted": len(contents) if recursive else 0,
            "recursive_deletion": recursive and not is_empty
        }
        
    except ValueError as e:
        return {
            "status": "error",
            "message": f"Invalid path: {str(e)}",
            "directory_path": directory_path
        }
    except OSError as e:
        return {
            "status": "error",
            "message": f"Failed to delete directory: {str(e)}",
            "directory_path": directory_path
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to delete directory: {str(e)}",
            "directory_path": directory_path
        }

@mcp.tool()
async def move_file(
    source_path: Annotated[str, Field(
        description="The relative path to the source file or directory to move"
    )],
    destination_path: Annotated[str, Field(
        description="The relative path to the destination location"
    )],
    base_directory: Annotated[str, Field(
        description="The base directory to operate within (defaults to user_data directory)"
    )] = "user_data",
    overwrite: Annotated[bool, Field(
        description="Whether to overwrite destination if it exists"
    )] = False,
    create_directories: Annotated[bool, Field(
        description="Whether to create parent directories for destination"
    )] = True
) -> dict:
    """
    Move/rename a file or directory.
    
    Args:
        source_path: Relative path to the source file/directory
        destination_path: Relative path to the destination
        base_directory: Base directory to operate within
        overwrite: Whether to overwrite existing destination
        create_directories: Whether to create parent directories
        
    Returns:
        dict: Success confirmation or error information
    """
    try:
        safe_source = get_safe_path(base_directory, source_path)
        safe_destination = get_safe_path(base_directory, destination_path)
        
        if not await asyncio.to_thread(os.path.exists, safe_source):
            return {
                "status": "error",
                "message": f"Source not found: {source_path}",
                "source_path": source_path
            }
        
        # Check if destination exists
        if await asyncio.to_thread(os.path.exists, safe_destination):
            if not overwrite:
                return {
                    "status": "error",
                    "message": f"Destination already exists and overwrite=False: {destination_path}",
                    "destination_path": destination_path
                }
        
        # Create parent directories if needed
        if create_directories:
            parent_dir = os.path.dirname(safe_destination)
            if parent_dir and not await asyncio.to_thread(os.path.exists, parent_dir):
                await asyncio.to_thread(os.makedirs, parent_dir, exist_ok=True)
        
        # Get source info before moving
        is_file = await asyncio.to_thread(os.path.isfile, safe_source)
        is_dir = await asyncio.to_thread(os.path.isdir, safe_source)
        
        if is_file:
            stat_info = await asyncio.to_thread(os.stat, safe_source)
            source_size = stat_info.st_size
        else:
            source_size = None
        
        # Move the file/directory
        await asyncio.to_thread(shutil.move, safe_source, safe_destination)
        
        return {
            "status": "success",
            "message": f"{'File' if is_file else 'Directory'} moved successfully",
            "source_path": source_path,
            "destination_path": destination_path,
            "source_absolute": safe_source,
            "destination_absolute": safe_destination,
            "type": "file" if is_file else "directory" if is_dir else "other",
            "size": source_size
        }
        
    except ValueError as e:
        return {
            "status": "error",
            "message": f"Invalid path: {str(e)}",
            "source_path": source_path,
            "destination_path": destination_path
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to move: {str(e)}",
            "source_path": source_path,
            "destination_path": destination_path
        }

@mcp.tool()
async def copy_file(
    source_path: Annotated[str, Field(
        description="The relative path to the source file or directory to copy"
    )],
    destination_path: Annotated[str, Field(
        description="The relative path to the destination location"
    )],
    base_directory: Annotated[str, Field(
        description="The base directory to operate within (defaults to user_data directory)"
    )] = "user_data",
    overwrite: Annotated[bool, Field(
        description="Whether to overwrite destination if it exists"
    )] = False,
    create_directories: Annotated[bool, Field(
        description="Whether to create parent directories for destination"
    )] = True,
    recursive: Annotated[bool, Field(
        description="Whether to copy directories recursively"
    )] = True
) -> dict:
    """
    Copy a file or directory.
    
    Args:
        source_path: Relative path to the source file/directory
        destination_path: Relative path to the destination
        base_directory: Base directory to operate within
        overwrite: Whether to overwrite existing destination
        create_directories: Whether to create parent directories
        recursive: Whether to copy directories recursively
        
    Returns:
        dict: Success confirmation or error information
    """
    try:
        safe_source = get_safe_path(base_directory, source_path)
        safe_destination = get_safe_path(base_directory, destination_path)
        
        if not await asyncio.to_thread(os.path.exists, safe_source):
            return {
                "status": "error",
                "message": f"Source not found: {source_path}",
                "source_path": source_path
            }
        
        # Check if destination exists
        if await asyncio.to_thread(os.path.exists, safe_destination):
            if not overwrite:
                return {
                    "status": "error",
                    "message": f"Destination already exists and overwrite=False: {destination_path}",
                    "destination_path": destination_path
                }
        
        # Create parent directories if needed
        if create_directories:
            parent_dir = os.path.dirname(safe_destination)
            if parent_dir and not await asyncio.to_thread(os.path.exists, parent_dir):
                await asyncio.to_thread(os.makedirs, parent_dir, exist_ok=True)
        
        # Determine source type
        is_file = await asyncio.to_thread(os.path.isfile, safe_source)
        is_dir = await asyncio.to_thread(os.path.isdir, safe_source)
        
        if is_file:
            # Copy file
            await asyncio.to_thread(shutil.copy2, safe_source, safe_destination)
            stat_info = await asyncio.to_thread(os.stat, safe_destination)
            size_copied = stat_info.st_size
        elif is_dir:
            if not recursive:
                return {
                    "status": "error",
                    "message": f"Source is a directory but recursive=False: {source_path}",
                    "source_path": source_path
                }
            # Copy directory tree
            await asyncio.to_thread(shutil.copytree, safe_source, safe_destination, dirs_exist_ok=overwrite)
            size_copied = None  # Don't calculate directory size
        else:
            return {
                "status": "error",
                "message": f"Source is neither file nor directory: {source_path}",
                "source_path": source_path
            }
        
        return {
            "status": "success",
            "message": f"{'File' if is_file else 'Directory'} copied successfully",
            "source_path": source_path,
            "destination_path": destination_path,
            "source_absolute": safe_source,
            "destination_absolute": safe_destination,
            "type": "file" if is_file else "directory" if is_dir else "other",
            "size": size_copied,
            "recursive": recursive if is_dir else None
        }
        
    except ValueError as e:
        return {
            "status": "error",
            "message": f"Invalid path: {str(e)}",
            "source_path": source_path,
            "destination_path": destination_path
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to copy: {str(e)}",
            "source_path": source_path,
            "destination_path": destination_path
        }

@mcp.tool()
async def get_file_info(
    file_path: Annotated[str, Field(
        description="The relative path to the file or directory to get info about"
    )],
    base_directory: Annotated[str, Field(
        description="The base directory to operate within (defaults to user_data directory)"
    )] = "user_data",
    include_content_preview: Annotated[bool, Field(
        description="Whether to include a preview of file content (first 200 chars for text files)"
    )] = False
) -> dict:
    """
    Get detailed information about a file or directory.
    
    Args:
        file_path: Relative path to the file/directory
        base_directory: Base directory to operate within
        include_content_preview: Whether to include content preview for text files
        
    Returns:
        dict: Detailed file/directory information
    """
    try:
        safe_path = get_safe_path(base_directory, file_path)
        
        if not await asyncio.to_thread(os.path.exists, safe_path):
            return {
                "status": "error",
                "message": f"Path not found: {file_path}",
                "file_path": file_path
            }
        
        # Get basic stats
        stat_info = await asyncio.to_thread(os.stat, safe_path)
        
        is_file = await asyncio.to_thread(os.path.isfile, safe_path)
        is_dir = await asyncio.to_thread(os.path.isdir, safe_path)
        is_symlink = await asyncio.to_thread(os.path.islink, safe_path)
        
        info = {
            "status": "success",
            "path": file_path,
            "absolute_path": safe_path,
            "type": "file" if is_file else "directory" if is_dir else "other",
            "size": stat_info.st_size,
            "created": stat_info.st_ctime,
            "modified": stat_info.st_mtime,
            "accessed": stat_info.st_atime,
            "permissions": oct(stat_info.st_mode)[-3:],
            "is_symlink": is_symlink
        }
        
        if is_file:
            # Add file-specific information
            info["extension"] = os.path.splitext(safe_path)[1]
            
            # Try to determine if it's a text file
            try:
                with open(safe_path, 'r', encoding='utf-8') as f:
                    content = f.read(1000)  # Read first 1000 chars to check
                info["is_text"] = True
                info["lines"] = len(content.splitlines())
                
                if include_content_preview:
                    with open(safe_path, 'r', encoding='utf-8') as f:
                        preview = f.read(200)
                    info["content_preview"] = preview
                    info["preview_truncated"] = len(content) > 200
                    
            except (UnicodeDecodeError, PermissionError):
                info["is_text"] = False
                info["lines"] = None
                info["content_preview"] = None
        
        elif is_dir:
            # Add directory-specific information
            try:
                contents = await asyncio.to_thread(os.listdir, safe_path)
                info["contents_count"] = len(contents)
                info["is_empty"] = len(contents) == 0
            except PermissionError:
                info["contents_count"] = None
                info["is_empty"] = None
        
        if is_symlink:
            try:
                info["symlink_target"] = await asyncio.to_thread(os.readlink, safe_path)
            except OSError:
                info["symlink_target"] = None
        
        return info
        
    except ValueError as e:
        return {
            "status": "error",
            "message": f"Invalid path: {str(e)}",
            "file_path": file_path
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to get file info: {str(e)}",
            "file_path": file_path
        }

if __name__ == "__main__":
    # Check if we should use HTTP transport
    transport = os.getenv("FASTMCP_TRANSPORT", "stdio")
    
    if transport == "streamable-http":
        host = os.getenv("FASTMCP_HOST", "127.0.0.1")
        port = int(os.getenv("FASTMCP_PORT", "9001"))  # Different port from document server
        print(f"Starting File Management Server with streamable-http transport on {host}:{port}")
        mcp.run(transport="streamable-http", host=host, port=port)
    else:
        print("Starting File Management Server with stdio transport")
        mcp.run()
