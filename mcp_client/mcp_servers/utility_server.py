import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
from fastmcp import FastMCP
import requests
import asyncio
import logging
from typing import List, Optional, Dict, Tuple, Any

logging.basicConfig(stream=sys.stderr, level=logging.WARNING, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

mcp = FastMCP("Utility Server")

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