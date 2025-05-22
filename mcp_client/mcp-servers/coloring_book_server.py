import sys
import os
import asyncio
from typing import List, Dict, Optional

# Ensure the mcp_client directory is in the Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from mcp.server.fastmcp import FastMCP
from mcp_client.utils.internal_mcp_caller import call_another_mcp_tool # Adjusted import path

mcp = FastMCP("Coloring Book Server")

@mcp.tool()
async def create_coloring_book(
    topic: str,
    num_pages: int = 5,
    user_number: Optional[str] = "+17145986105" # Default user for saving outputs via sub-tools
) -> Dict[str, str]:
    """
    Creates a coloring book PDF with the given topic and number of pages.
    It first generates line-art images using an image generation tool,
    then compiles them into a PDF using a document generation tool.

    Args:
        topic (str): The theme or topic for the coloring book (e.g., "Dinosaurs", "Space Exploration").
        num_pages (int): The number of pages the coloring book should have. Defaults to 5.
        user_number (Optional[str]): The user's identifier, used by underlying tools for directory structuring.

    Returns:
        Dict[str, str]: A dictionary with "status" and either "pdf_url" or "message" (on error).
    """
    if not topic:
        return {"status": "error", "message": "Topic cannot be empty."}
    if not 1 <= num_pages <= 20: # Max 20 pages to keep generation time reasonable for a test
        return {"status": "error", "message": "Number of pages must be between 1 and 20."}

    image_prompts = []
    for i in range(num_pages):
        # Create diverse prompts for each page
        prompt = f"A simple black and white line drawing of a {topic} scene, suitable for a children's coloring book page. Page {i+1} of {num_pages}. Clear outlines, no shading, plenty of white space to color."
        if i % 3 == 0 and i > 0:
             prompt = f"A detailed full-page black and white line art illustration of {topic}, for a coloring book. No gray areas. Focus on theme: {topic.lower()} - variation {i//3}."
        elif i % 2 == 0:
            prompt = f"A fun and easy coloring page for kids: {topic}. Simple lines, bold outlines, black and white only. Subject: {topic}, item {i+1}."
        image_prompts.append(prompt)

    print(f"[ColoringBookServer] Generated {len(image_prompts)} prompts for topic ''{topic}'.")

    # Step 1: Call Image Generation Server
    # Assuming 'generate_images_with_prompts' is on image_services_server.py
    # The generate_images_with_prompts tool expects a list of prompts.
    image_gen_args = {
        "prompts": image_prompts,
        # user_number is implicitly passed if the tool definition in image_services_server.py has it as an arg
        # and if the internal_mcp_caller injects it, or if the tool itself uses a default.
        # For clarity, if generate_images_with_prompts *requires* user_number, it should be here.
        # Let's assume for now it's handled by the tool or caller.
    }
    
    print(f"[ColoringBookServer] Calling 'generate_images_with_prompts' for topic ''{topic}' with {num_pages} prompts.")
    image_gen_result, ig_error = await call_another_mcp_tool(
        tool_name="generate_images_with_prompts",
        arguments=image_gen_args,
        user_id_context=user_number # Pass user_number for context to the image gen tool
    )

    if ig_error:
        err_msg = f"Error calling image generation tool: {ig_error}"
        print(f"[ColoringBookServer] {err_msg}")
        return {"status": "error", "message": err_msg}
    
    if not image_gen_result or image_gen_result.get("status") not in ["success", "partial_error"]:
        err_msg = f"Image generation failed or returned unexpected status: {image_gen_result.get('message', 'No message') if image_gen_result else 'No result'}"
        print(f"[ColoringBookServer] {err_msg}")
        return {"status": "error", "message": err_msg}

    generated_image_urls = []
    # 'results' is a list of lists, where each inner list contains URLs for a prompt
    # e.g., [[url1_for_prompt1], [url1_for_prompt2], ...] if 1 image per prompt
    # or [[url1_p1, url2_p1], [url1_p2], ...] if multiple images for some prompts (though our target tool generates 1)
    raw_image_results = image_gen_result.get("results", [])
    for prompt_result_list in raw_image_results:
        if isinstance(prompt_result_list, list) and prompt_result_list:
            # Assuming the first URL in the list is the one we want for each prompt
            generated_image_urls.append(prompt_result_list[0]) 
        elif isinstance(prompt_result_list, dict) and 'error' in prompt_result_list:
            print(f"[ColoringBookServer] Image generation for a prompt failed: {prompt_result_list['error']}")
            # Decide if we want to continue with fewer pages or fail the whole book
            # For now, we'll skip this page.
            continue 

    if not generated_image_urls:
        err_msg = "No images were successfully generated."
        print(f"[ColoringBookServer] {err_msg}")
        return {"status": "error", "message": err_msg}

    print(f"[ColoringBookServer] Successfully generated {len(generated_image_urls)} image URLs.")
    print(f"[ColoringBookServer] Image URLs: {generated_image_urls}")

    # Step 2: Call PDF Generation Server
    # Assuming 'create_pdf_document' is on document_generation_server.py
    pdf_doc_name = f"{topic.replace(' ', '_')}_Coloring_Book_{num_pages}pages"
    pdf_context = (
        f"Create a PDF coloring book titled '{topic} Coloring Book'. "
        f"Each of the following {len(generated_image_urls)} attached images should be placed on a separate page. "
        f"Ensure images are centered and scaled appropriately for an A4 page, leaving room for coloring. "
        f"The images are black and white line art. No other text or elements are needed unless specified by the images themselves."
    )

    pdf_creation_args = {
        "doc_name": pdf_doc_name,
        "attachments": generated_image_urls, # List of URLs
        "client_injected_context": pdf_context,
        # user_number is important here for the create_pdf_document tool
        "user_number": user_number 
    }
    
    print(f"[ColoringBookServer] Calling 'create_pdf_document' for topic ''{topic}'.")
    pdf_result, pdf_error = await call_another_mcp_tool(
        tool_name="create_pdf_document",
        arguments=pdf_creation_args,
        user_id_context=user_number # User context for the PDF tool itself
    )

    if pdf_error:
        err_msg = f"Error calling PDF creation tool: {pdf_error}"
        print(f"[ColoringBookServer] {err_msg}")
        return {"status": "error", "message": err_msg}

    if not pdf_result or pdf_result.get("status") != "success" or not pdf_result.get("url"):
        err_msg = f"PDF creation failed or returned an invalid response: {pdf_result.get('message', 'No message') if pdf_result else 'No result'}"
        print(f"[ColoringBookServer] {err_msg}")
        return {"status": "error", "message": err_msg}

    pdf_url = pdf_result["url"]
    print(f"[ColoringBookServer] Successfully created coloring book PDF: {pdf_url}")
    return {"status": "success", "pdf_url": pdf_url, "message": f"Coloring book '{pdf_doc_name}' created."}

if __name__ == "__main__":
    # To run this server:
    # 1. Make sure mcp_service.py is running.
    # 2. Make sure image_services_server.py (with generate_images_with_prompts) is running.
    # 3. Make sure document_generation_server.py (with create_pdf_document) is running.
    # 4. Set the MCP_INTERNAL_API_KEY environment variable to the same value used in mcp_service.py
    #    export MCP_INTERNAL_API_KEY="your_secret_internal_api_key_here"
    #    (or MCP_INTERNAL_API_KEY_FOR_CALLING if you used that name in internal_mcp_caller.py for the calling server)
    # Example: python mcp_client/mcp-servers/coloring_book_server.py
    mcp.run() 