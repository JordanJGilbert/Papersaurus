#!/usr/bin/env python3
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

import asyncio
from fastmcp import FastMCP, Context
import fastmcp as f_mcp
# from mcp import types # For Context type hint if needed. types.TextContent if needed.
from typing import AsyncGenerator, Dict, Any, Annotated, Union, Optional
from pydantic import Field
import logging

logging.basicConfig(stream=sys.stderr, level=logging.INFO)
logger = logging.getLogger(__name__)

mcp = FastMCP("Streaming And Sampling Test Server")



@mcp.tool()
async def test_llm_sampling_tool(
    ctx: Context,
    prompt_for_llm: Annotated[str, Field(description="The prompt to send to the client's LLM via ctx.sample().")] = "Generate a short, 3-line poem about real-time data streams.",
    user_number: Annotated[Optional[str], Field(description="The user's identifier, automatically injected by the system.")] = None
) -> Dict[str, Any]:
    """
    Tests ctx.sample() to see if the assistant's subsequent response (incorporating this tool's result) is streamed.
    This tool itself does NOT stream its own result via yield. It gets a complete response from ctx.sample().
    """
    # --- Start Debug Logging ---
    try:
        version_info = f_mcp.__version__
        path_info = f_mcp.__file__
        python_executable = sys.executable
        sys_path_info = sys.path
        print(f"DEBUG INSIDE TOOL: FastMCP version: {version_info}, Path: {path_info}")
        print(f"DEBUG INSIDE TOOL: Python executable: {python_executable}")
        print(f"DEBUG INSIDE TOOL: sys.path: {sys_path_info}")
        await ctx.info(f"Tool Debug: FastMCP version: {version_info}, Path: {path_info}. Python: {python_executable}")
    except Exception as e_debug:
        print(f"DEBUG INSIDE TOOL: Error getting FastMCP debug info: {e_debug}")
        await ctx.info(f"Tool Debug: Error getting FastMCP debug info: {e_debug}")
    # --- End Debug Logging ---

    await ctx.info(f"test_llm_sampling_tool: Sending prompt to client's LLM (via ctx.sample): '{prompt_for_llm}'")
    
    try:
        # ctx.sample returns a TextContent object (or ImageContent, but we expect text)
        # The actual LLM call and its own potential internal streaming (to ai_models.py)
        # is abstracted away from this tool. This tool gets the final, complete text.
        llm_response_content = await ctx.sample(
            messages=prompt_for_llm,
            model_preferences=["gemini-2.5-flash-preview-05-20"] # Optional: hint for a fast model
        )
        
        generated_text = ""
        if hasattr(llm_response_content, 'text'):
            generated_text = llm_response_content.text
            await ctx.info(f"test_llm_sampling_tool: Received text from ctx.sample(): '{generated_text[:100]}...'")
        else:
            await ctx.warning("test_llm_sampling_tool: ctx.sample() did not return TextContent or it had no text.")
            generated_text = "[No text content received from ctx.sample()]"

        return {
            "status": "success",
            "prompt_sent_to_llm": prompt_for_llm,
            "text_received_from_llm": generated_text
        }
    except Exception as e:
        await ctx.error(f"test_llm_sampling_tool: Error during ctx.sample() call: {str(e)}")
        return {
            "status": "error",
            "prompt_sent_to_llm": prompt_for_llm,
            "error_message": str(e)
        }

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