#!/usr/bin/env python3
"""
Google Maps Server for MCP

Provides tools for working with Google Maps:
- get_directions: Get directions between locations
- search_places: Search for places using Google Places API
"""

import sys
import os
import requests
import asyncio
from typing import Optional, List, Dict, Any
from urllib.parse import urlencode

# Ensure project root is in path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from fastmcp import FastMCP
from utils.constants import DOMAIN
import hashlib
import re
import uuid
import googlemaps

mcp = FastMCP("Google Maps Server")

# Environment variable for the API key
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY")

if not GOOGLE_MAPS_API_KEY:
    print("WARNING: GOOGLE_MAPS_API_KEY environment variable not set. Google Maps tools will not work.", file=sys.stderr)

# Helper to check API key
async def _check_api_key() -> Optional[str]:
    if not GOOGLE_MAPS_API_KEY:
        return "GOOGLE_MAPS_API_KEY is not set in the environment."
    return None

def sanitize_for_path(name_part: str) -> str:
    """Sanitizes a string to be safe for use as part of a directory or file name."""
    if not isinstance(name_part, str):
        name_part = str(name_part)
    # Remove or replace potentially problematic characters
    name_part = name_part.replace('+', '') # Common in user_numbers
    # Hash group IDs for consistent, short, safe names
    if name_part.startswith('group_'):
        group_id_val = name_part[len('group_'):]
        hash_val = hashlib.md5(group_id_val.encode()).hexdigest()[:12]
        name_part = f"group_{hash_val}"
    
    name_part = re.sub(r'[^\w.-]', '_', name_part) # Allow word chars, dots, hyphens; replace others with underscore
    name_part = re.sub(r'_+', '_', name_part) # Collapse multiple underscores
    name_part = name_part.strip('_.- ') # Strip leading/trailing problematic chars
    if not name_part: # Handle empty string after sanitization
        return f"sanitized_{uuid.uuid4().hex[:8]}"
    return name_part

@mcp.tool()
async def get_directions(
    destination: str,
    origin: Optional[str] = None, # Made origin optional
    mode: Optional[str] = "driving" # driving, walking, bicycling, transit
) -> Dict[str, Any]:
    """
    Provides directions between an origin and a destination using Google Maps.

    Args:
        destination (str): The end point for the directions (e.g., "San Francisco, CA" or "Louvre Museum").
        origin (Optional[str]): The starting point for the directions (e.g., "1600 Amphitheatre Parkway, Mountain View, CA" or "Eiffel Tower").
                                If the user refers to their "current location", the client application should obtain these
                                coordinates and pass them as a string (e.g., "37.7749,-122.4194").
                                If not provided, the tool will ask the user to specify an origin.
        mode (Optional[str]): The mode of travel. Defaults to 'driving'.
                              Possible values: 'driving', 'walking', 'bicycling', 'transit'.

    Returns:
        Dict[str, Any]: A dictionary containing the directions response from Google Maps API
                        or an error message.
    """
    api_key_error = await _check_api_key()
    if api_key_error:
        return {"status": "error", "message": api_key_error}

    if not destination:
        return {"status": "error", "message": "Destination must be provided."}
    if not origin:
        return {"status": "error", "message": "Origin must be provided. Please specify a starting point, address, or indicate 'my current location' if your application supports it."}

    valid_modes = ["driving", "walking", "bicycling", "transit"]
    if mode not in valid_modes:
        return {"status": "error", "message": f"Invalid travel mode '{mode}'. Valid modes are: {', '.join(valid_modes)}."}

    base_url = "https://maps.googleapis.com/maps/api/directions/json"
    params = {
        "origin": origin,
        "destination": destination,
        "mode": mode,
        "key": GOOGLE_MAPS_API_KEY
    }

    try:
        # Use asyncio.to_thread to run the synchronous requests.get in a separate thread
        response = await asyncio.to_thread(requests.get, base_url, params=params)
        response.raise_for_status()  # Raise an exception for HTTP errors
        directions_data = response.json()

        if directions_data.get("status") == "OK":
            return {"status": "success", "data": directions_data}
        else:
            error_message = directions_data.get("error_message", "Unknown error from Google Maps API.")
            return {"status": "error", "message": f"Google Maps API Error: {directions_data.get('status')} - {error_message}"}

    except requests.exceptions.RequestException as e:
        return {"status": "error", "message": f"Network error calling Google Maps API: {e}"}
    except Exception as e:
        return {"status": "error", "message": f"An unexpected error occurred: {e}"}

# --- Tool implementations will go here ---

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