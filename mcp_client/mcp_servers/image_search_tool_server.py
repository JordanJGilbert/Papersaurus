import sys
import os
import json
from typing import Annotated, List, Dict
from pydantic import BaseModel, Field, field_validator, PositiveInt
import asyncio
import aiohttp

from mcp.server.fastmcp import FastMCP

# Define Pydantic input model for num_images to use PositiveInt for validation
# (though explicit check in tool is also fine and currently implemented via raise ValueError)
# We can also use Pydantic's PositiveInt directly in the annotation for num_images.

# Define Pydantic output model
class ImageSearchOutput(BaseModel):
    image_urls: List[str] = Field(default_factory=list, description="A list of direct URLs to images.")

mcp = FastMCP("MCP Server with a tool to find image URLs by topic using web search.")

@mcp.tool()
async def find_images_by_topic(
    user_number: Annotated[str, Field(description="User identifier, typically a phone number, passed by the MCP system.")],
    topic: Annotated[str, Field(description="The subject for which to find images.")],
    num_images: Annotated[PositiveInt, Field(description="Maximum number of image URLs to return. Must be a positive integer.")]
) -> ImageSearchOutput:
    """
    Finds direct image URLs related to a given topic by using the web_search MCP tool.
    It filters search results to identify links that point directly to image files.
    """
    # Pydantic PositiveInt handles num_images > 0 validation automatically.
    # If validation fails, FastMCP (via Pydantic) will raise an error before tool execution.

    mcp_service_url = os.getenv("MCP_SERVICE_URL")
    mcp_internal_api_key = os.getenv("MCP_INTERNAL_API_KEY")

    if not mcp_service_url:
        raise RuntimeError("MCP_SERVICE_URL environment variable is not set. Cannot call web_search tool.")
    if not mcp_internal_api_key:
        raise RuntimeError("MCP_INTERNAL_API_KEY environment variable is not set. Cannot call web_search tool.")

    # Construct search query for images
    optimized_query = f"{topic} image picture photo" 
    
    # Request more results than num_images to have a better chance of finding direct image links after filtering.
    num_results_to_fetch = max(num_images * 3, 15) # Fetch at least 15, or 3x num_images

    payload = {
        "tool_name": "web_search",
        "arguments": {"query": optimized_query, "num_results": num_results_to_fetch},
        "user_id_context": user_number
    }
    headers = {
        "X-Internal-API-Key": mcp_internal_api_key,
        "Content-Type": "application/json"
    }

    found_image_urls: List[str] = []
    
    try:
        async with aiohttp.ClientSession() as session:
            tool_call_url = f"{mcp_service_url.rstrip('/')}/internal/call_mcp_tool"
            async with session.post(tool_call_url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=45)) as response:
                if response.status == 200:
                    response_data = await response.json()
                    
                    if response_data.get("error"):
                        raise RuntimeError(f"web_search tool call failed: {response_data['error']}")
                    
                    web_search_raw_result_str = response_data.get("result")
                    web_search_results: List[Dict[str, str]] = [] 

                    if web_search_raw_result_str: # Ensure it's not None or empty string
                        try:
                            parsed_json = json.loads(web_search_raw_result_str)
                            if parsed_json is None: # Handles "null" string from JSON
                                web_search_results = []
                            elif isinstance(parsed_json, list):
                                web_search_results = parsed_json # Assume list of dicts
                            else:
                                raise RuntimeError(f"web_search tool returned unexpected result format. Expected a list or null, got {type(parsed_json).__name__}.")
                        except json.JSONDecodeError:
                            raise RuntimeError(f"Failed to parse JSON result string from web_search tool: '{web_search_raw_result_str[:100]}...'") # Log part of string
                    # If web_search_raw_result_str was None or empty, web_search_results remains []
                    
                    image_extensions = ('.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.avif', '.tiff')

                    for item in web_search_results:
                        if len(found_image_urls) >= num_images:
                            break
                        
                        if not isinstance(item, dict):
                            continue # Skip malformed items

                        # Check 'link' field first
                        link_url = item.get("link")
                        added_current_item = False
                        if isinstance(link_url, str) and link_url.lower().endswith(image_extensions):
                            if link_url not in found_image_urls:
                                found_image_urls.append(link_url)
                                added_current_item = True
                        
                        if added_current_item:
                            continue # Found image from 'link', move to next item

                        # Check other potential keys if 'link' wasn't a direct image or wasn't present
                        potential_image_keys = [
                            "image_url", "img_url", "thumbnail_url", "media_url", 
                            "src", "direct_image_url", "original_image_url", "image"
                        ]
                        for key in potential_image_keys:
                            img_url = item.get(key)
                            if isinstance(img_url, str) and img_url.lower().endswith(image_extensions):
                                if img_url not in found_image_urls:
                                    found_image_urls.append(img_url)
                                    break # Found image for this item using an alternative key
                        
                else: # HTTP error from /internal/call_mcp_tool endpoint
                    error_detail = await response.text()
                    raise RuntimeError(f"Failed to call web_search tool. HTTP Status: {response.status}. Details: {error_detail[:500]}")
        
        return ImageSearchOutput(image_urls=found_image_urls[:num_images])

    except aiohttp.ClientConnectorError as e:
        raise RuntimeError(f"Network connection error when calling web_search: {str(e)}")
    except asyncio.TimeoutError:
        raise RuntimeError("Request to web_search tool timed out.")
    # Other RuntimeErrors raised above will propagate.
    # Any other unhandled exceptions will be caught by FastMCP.

if __name__ == "__main__":
    # Example for local testing (ensure MCP_SERVICE_URL and MCP_INTERNAL_API_KEY are set in your environment)
    # For instance:
    # export MCP_SERVICE_URL="http://localhost:5001"
    # export MCP_INTERNAL_API_KEY="your_internal_dev_key"
    mcp.run()