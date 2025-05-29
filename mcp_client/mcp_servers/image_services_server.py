import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
from fastmcp import FastMCP
import uuid
import re
import json
import requests
import base64
import filetype
from PIL import Image
from io import BytesIO
import asyncio
import hashlib
from typing import List, Optional, Dict, Tuple, Any
import logging
from utils.constants import DOMAIN
import vertexai
from vertexai.preview.vision_models import ImageGenerationModel
from PIL import Image as PILImage
import time

logging.basicConfig(stream=sys.stderr, level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

mcp = FastMCP("Image and Video Services Server")

# Multiple Vertex AI projects will be initialized within the generation functions
# for better load distribution and rate limit handling across different projects
logger.info("Image and Video Services Server ready - Vertex AI projects will be initialized on first use")

# --- Copy the following from test_server.py ---
# Helper functions:
#   - sanitize_for_path
#   - download_and_encode_image (if needed)
#
# Tool implementations:
#   - generate_images_with_prompts
#   - analyze_images
#   - analyze_image (wrapper for analyze_images)
#   - edit_image_with_gemini
#
# Any constants or prompts used by these tools (e.g., DOMAIN, IMAGE_OUTPUT_DIR, etc.)
#
# Make sure to also include any required imports for PIL, Google genai, etc.
#
# --- End of copy list ---

@mcp.tool()
async def analyze_images(urls: list, analysis_prompt: str = "Describe this image in detail.") -> dict:
    """
    Analyzes a list of images by downloading each from its URL and using Gemini to interpret its contents.
    Args:
        urls (list): List of image URLs to analyze.
        analysis_prompt (str): Instructions for how Gemini should analyze the images.
    Returns:
        dict: {"status": "success", "results": [ ... ]} or {"status": "error", "message": ...}
    """
    from llm_adapters import get_llm_adapter, StandardizedMessage, StandardizedLLMConfig, AttachmentPart

    async def analyze_single_image(url):
        try:
            response = await asyncio.to_thread(requests.get, url, timeout=10)
            response.raise_for_status()
            content_type = response.headers.get('Content-Type', '')
            if not content_type.startswith('image/'):
                return {"status": "error", "message": f"URL does not point to an image (content type: {content_type})", "url": url}
            image_bytes_io = BytesIO(response.content)
            image = await asyncio.to_thread(Image.open, image_bytes_io)
            img_bytes_for_gemini = BytesIO()
            img_format = image.format if image.format and image.format.upper() in Image.SAVE.keys() else "PNG"
            await asyncio.to_thread(image.save, img_bytes_for_gemini, format=img_format)
            img_bytes_for_gemini.seek(0)

            # Use the adapter for Gemini LLM call
            adapter = get_llm_adapter("gemini-2.5-flash-preview-05-20")  # Will be forced to Flash in the adapter
            attachment = AttachmentPart(mime_type=content_type, data=img_bytes_for_gemini.getvalue(), name=url)
            history = [
                StandardizedMessage(
                    role="user",
                    content=analysis_prompt,
                    attachments=[attachment]
                )
            ]
            llm_config = StandardizedLLMConfig()
            llm_response = await adapter.generate_content(
                model_name="gemini-2.5-flash-preview-05-20",
                history=history,
                tools=None,
                config=llm_config
            )
            analysis = llm_response.text_content
            if llm_response.error:
                return {"status": "error", "message": f"LLM error: {llm_response.error}", "url": url}
            return {"status": "success", "analysis": analysis, "url": url}
        except requests.exceptions.RequestException as e:
            return {"status": "error", "message": f"Error downloading image: {str(e)}", "url": url}
        except Exception as e:
            return {"status": "error", "message": f"Error analyzing image: {str(e)}", "url": url}

    if not isinstance(urls, list):
        return {"status": "error", "message": "urls must be a list of image URLs."}
    tasks = [analyze_single_image(url) for url in urls]
    results = await asyncio.gather(*tasks)
    return {"status": "success", "results": results}

def download_and_encode_image(url):
    """
    Downloads an image from the given URL and returns (base64_data, media_type).
    Returns (None, None) if download or type detection fails.
    """
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        content_type = resp.headers.get('Content-Type', '')
        if not content_type.startswith('image/'):
            return None, None
        b64_data = base64.b64encode(resp.content).decode('utf-8')
        return b64_data, content_type
    except Exception:
        return None, None

def sanitize_for_path(name_part: str) -> str:
    """Sanitizes a string to be safe for use as part of a directory or file name."""
    if not isinstance(name_part, str):
        name_part = str(name_part)
    # Remove or replace potentially problematic characters
    name_part = name_part.replace('+', '') # Common in user_numbers
    # Hash group IDs for consistent, short, safe names
    if name_part.startswith('group_'):
        group_id_val = name_part[len('group_'):]
        hash_val = hashlib.md5(group_id_val.encode()).hexdigest()[:12] # Slightly longer hash
        name_part = f"group_{hash_val}"
    
    name_part = re.sub(r'[^\w.-]', '_', name_part) # Allow word chars, dots, hyphens; replace others with underscore
    name_part = re.sub(r'_+', '_', name_part) # Collapse multiple underscores
    name_part = name_part.strip('_.- ') # Strip leading/trailing problematic chars
    if not name_part: # Handle empty string after sanitization
        return f"sanitized_{uuid.uuid4().hex[:8]}"
    return name_part

async def _generate_images_with_prompts_concurrent(user_number, prompts):
    import re
    import hashlib
    
    # Use default user number if empty
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"
    
    def sanitize(s):
        s = str(s).replace('+', '')
        # Always hash group IDs for shortness
        if s.startswith('group_'):
            group_id = s[len('group_'):]
            hash_val = hashlib.md5(group_id.encode()).hexdigest()[:8]
            s = f"group_{hash_val}"
        s = re.sub(r'[^a-zA-Z0-9]', '_', s)
        s = re.sub(r'_+', '_', s)
        return s.strip('_')

    user_number_safe = sanitize(user_number)
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    image_dir = os.path.join(base_dir, user_number_safe, "images")
    os.makedirs(image_dir, exist_ok=True)

    # --- Multiple Vertex AI Project Configuration ---
    vertex_projects = [
        "gen-lang-client-0761146080",
        "maximal-totem-456502-h3",
        "imagen-api-3", 
        "imagen-api-4",
        "imagen-api-5"
    ]
    location = "us-central1"
    
    # Initialize models for each project
    generation_models = []
    for i, project_id in enumerate(vertex_projects):
        try:
            # Re-initialize Vertex AI for each project
            vertexai.init(project=project_id, location=location)
            model = ImageGenerationModel.from_pretrained("imagen-4.0-generate-preview-05-20")
            generation_models.append((project_id, model))
            logger.info(f"Initialized Vertex AI project {i+1}/{len(vertex_projects)}: {project_id}")
        except Exception as e:
            logger.error(f"Failed to initialize Vertex AI project {project_id}: {e}")
            continue
    
    if not generation_models:
        logger.error("Error: No Vertex AI projects could be initialized.")
        return {"status": "error", "message": "No Vertex AI projects configured successfully."}

    num_projects = len(generation_models)
    logger.info(f"Initialized image generation with {num_projects} Vertex AI projects.")

    # --- Helper Functions ---
    async def process_image_response(response, prompt, prompt_idx):
        """Processes images from a prompt response concurrently."""
        os.makedirs(image_dir, exist_ok=True)

        async def _save_and_process_single_image(generated_image, index):
            """Handles saving the PNG image and returning its URL."""
            try:
                # For Vertex AI ImageGenerationModel, use the _pil_image attribute
                if hasattr(generated_image, '_pil_image'):
                    image = generated_image._pil_image
                else:
                    logger.error(f"Could not extract PIL image from generated_image object: {type(generated_image)}, dir: {dir(generated_image)}")
                    return None
                
                # Filename now uses only a prefix and a portion of UUID.
                # Using 8 hex characters from UUID for good collision resistance.
                filename = f"img_{uuid.uuid4().hex[:8]}.png"
                local_path = os.path.join(image_dir, filename)

                # Save the original PNG image to disk non-blockingly
                await asyncio.to_thread(image.save, local_path)

                # Construct the URL using the original PNG filename saved to disk
                image_url = f"{DOMAIN}/user_data/{user_number_safe}/images/{filename}"
                return image_url
            except Exception as e:
                logger.error(f"Error processing image {index} for prompt {prompt_idx} ('{prompt[:30]}...'): {e}")
                return None # Return None on error for this specific image

        # Create and run tasks concurrently for all images from this single prompt response
        # For Vertex AI, response.images contains the list of GeneratedImage objects
        if hasattr(response, 'images'):
            images_list = response.images
        else:
            logger.error(f"Unexpected response format from Vertex AI: {type(response)}, expected ImageGenerationResponse with 'images' attribute")
            return []

        save_tasks = [
            _save_and_process_single_image(img, i)
            for i, img in enumerate(images_list)
        ]
        
        image_url_results = await asyncio.gather(*save_tasks)

        # Filter out None results (errors during saving/processing)
        successful_urls = [url for url in image_url_results if url is not None]
        
        # Return only the successfully processed URLs
        return successful_urls

    async def generate_for_prompt(prompt, idx, project_model_tuple):
        project_id, generation_model = project_model_tuple
        project_index = generation_models.index(project_model_tuple)

        try:
            logger.debug(f"Attempting prompt '{prompt}' (idx: {idx}) with Vertex AI project {project_id} (index: {project_index}).")
            
            # Re-initialize Vertex AI for this specific project before generating
            vertexai.init(project=project_id, location=location)
            
            response = await asyncio.to_thread(
                generation_model.generate_images,
                prompt=prompt,
                number_of_images=1,
                aspect_ratio="1:1",
                negative_prompt="",
                person_generation="",
                safety_filter_level="",
                add_watermark=True
            )
            urls = await process_image_response(response, prompt, idx)
            
            if not urls:
                logger.warning(f"Warning: Vertex AI project {project_id} generated response for prompt '{prompt}' (idx: {idx}), but processing/saving failed for all images.")
                return {"error": f"Image generation API succeeded for prompt '{prompt}' with project {project_id}, but processing/saving failed for all images."}
            
            logger.info(f"Success for prompt '{prompt}' (idx: {idx}) with project {project_id}. Generated {len(urls)} URLs.")
            return urls

        except Exception as e:
            error_str = str(e)
            logger.error(f"Error on prompt '{prompt}' (idx: {idx}) with project {project_id}: {error_str}")
            
            # Check if it's a rate limit/quota error for logging purposes
            is_rate_limit = False
            try:
                from google.api_core import exceptions as google_exceptions
                if isinstance(e, google_exceptions.ResourceExhausted): is_rate_limit = True
                elif isinstance(e, google_exceptions.GoogleAPIError) and e.code == 429: is_rate_limit = True
            except ImportError: pass
            if not is_rate_limit and hasattr(e, 'code') and e.code == 429: is_rate_limit = True
            elif not is_rate_limit and ("rate limit" in error_str.lower() or "quota" in error_str.lower() or "429" in error_str): is_rate_limit = True

            if is_rate_limit:
                error_message = f"Rate limit hit on project {project_id} for prompt '{prompt}'."
            else:
                error_message = f"Image generation failed on project {project_id} for prompt '{prompt}': {error_str}"

            logger.debug(f"DEBUG: Failing prompt '{prompt}' due to error: {error_message}")
            return {"error": error_message}

    # --- Run Concurrent Tasks ---
    tasks = [generate_for_prompt(prompt, idx, generation_models[idx % num_projects]) for idx, prompt in enumerate(prompts)]
    results = await asyncio.gather(*tasks, return_exceptions=False) # Errors handled within generate_for_prompt

    # --- Process Results ---
    final_results = []
    any_errors = False
    error_message = "Multiple errors occurred during image generation."

    for i, r in enumerate(results):
        if isinstance(r, dict) and "error" in r:
            any_errors = True
            # Use the specific error message from the result
            error_message = r["error"]
            logger.error(f"Error reported for prompt index {i}: {r['error']}")
            final_results.append({"error": r["error"]}) # Keep error info per prompt
        elif isinstance(r, list):
             final_results.append(r)
        else:
            any_errors = True
            error_message = f"Unexpected result type for prompt index {i}: {type(r)}"
            logger.error(error_message)
            final_results.append({"error": "Unexpected result type."})

    if any_errors:
         # Return partial success with errors marked per prompt
         return {"status": "partial_error", "message": "Some images failed to generate. Check results for details.", "results": final_results}

    # If no errors found in results
    return {"status": "success", "results": final_results}

@mcp.tool()
async def generate_images_with_prompts(
    user_number: str = "+17145986105",
    prompts: list = None
) -> dict:
    """
    Generate one image for each prompt using Google's Imagen 4.0 model via Vertex AI (`imagen-4.0-generate-preview-05-20`).
    This tool cycles between multiple Vertex AI projects for better reliability and rate limit handling.
    All generated images include a SynthID watermark.

    Args:
        user_number (str): The user's unique identifier (used for directory structure).
        prompts (list): List of text prompts. Each prompt will generate one image.

    Returns:
        dict: {"status": "success", "results": [ [url], ... ]} or {"status": "error", "message": ...}

    **Vertex AI Project Cycling:**
    - Uses 4 different Vertex AI projects: maximal-totem-456502-h3, imagen-api-3, imagen-api-4, imagen-api-5
    - Distributes prompts across projects to handle rate limits and improve reliability
    - All projects use the same us-central1 location and imagen-4.0-generate-preview-05-20 model

    **Prompting Guidelines for Imagen 4.0:**
    - **Max Prompt Length:** 480 tokens.
    - **Core Structure:** Start with `subject`, `context/background`, and `style`.
        - *Example Basic:* "A vintage bicycle (subject) leaning against a brick wall (context) in a sunny alley (background), impressionist painting (style)."
    - **Refine with Details:** Add descriptive adjectives, adverbs, and specifics. The more detail, the better.
        - *Example Refined:* "A highly detailed, photorealistic close-up photo of a classic red Vespa scooter parked on a cobblestone street in Rome. The background shows a quaint cafe with outdoor seating, slightly blurred (bokeh). The lighting is warm, late afternoon sun, casting soft shadows."
    - **Photography Modifiers:**
        - Start with: "A photo of..."
        - Camera: "close-up photo," "aerial shot," "taken from a low angle."
        - Lighting: "studio lighting," "dramatic lighting," "golden hour," "moonlit."
        - Lens/Effects: "35mm lens photo," "macro photo," "soft focus," "motion blur."
        - Film Type: "black and white photograph," "polaroid style."
        - *Example:* "A photo of a steaming cup of coffee on a rustic wooden table, captured with a macro lens, soft morning light filtering through a window."
    - **Artistic Styles:**
        - "A pencil sketch of...", "A watercolor painting of...", "A digital art illustration of...", "In the style of [famous artist/movement, e.g., Van Gogh, Art Deco]."
        - *Example:* "An Art Nouveau poster design featuring a woman with flowing hair, surrounded by floral patterns, with the text 'Spring Bloom' elegantly integrated."
    - **Shapes and Materials:**
        - "A sculpture made of recycled metal," "a futuristic building in the shape of a crystal."
    - **Image Quality Modifiers:**
        - "high-quality," "beautiful," "stylized," "4K," "HDR," "studio photo," "professionally shot," "intricately detailed."
    - **Text in Images (Experimental):**
        - Keep text short (under 25 chars). Limit to 1-3 phrases. Guide placement (e.g., "text at the top"). Specify general font style ("bold," "script").
        - *Example:* "A logo for a coffee shop named 'The Daily Grind', featuring a coffee bean icon. Text 'The Daily Grind' in a clean, modern font."
    - **Iteration is Key:** If the first result isn't perfect, refine your prompt and try again.

    **Current Tool Limitations (vs. full Imagen 4.0 API):**
    - Generates 1 image per prompt.
    - Aspect ratio defaults to 1:1 (square); cannot be changed via this tool.
    - `personGeneration` defaults to allowing adults; cannot be changed via this tool.
    - Uses Vertex AI with multiple projects for authentication and load distribution.
    """
    # Use default user number if empty
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"
    
    return await _generate_images_with_prompts_concurrent(user_number, prompts)

@mcp.tool()
async def edit_image_with_gemini(
    images: List[str],  # Changed from image: str
    edit_prompt: str,
    user_number: str = "+17145986105"
) -> dict:
    """
    Edits a list of images concurrently using `gemini-2.0-flash-preview-image-generation` based on a common text prompt.
    This model is good for conversational image editing, leveraging context, and blending text with images.
    All generated images include a SynthID watermark.

    Args:
        images (List[str]): A list of URLs or base64-encoded images to be edited.
                            **IMPORTANT**: If the user provided an image directly with their request (e.g., as an attachment in a chat),
                            its URL might be mentioned in the prompt context (e.g., "[Context: The following files were attached... Attachment 0 (Name: user_img.jpg, URL: https://...)]").
                            If so, you SHOULD use that specific URL for this 'image' argument when the edit request pertains to that user-provided image.
        edit_prompt (str): Text describing the desired edit (applied to all images).
        user_number (str): User identifier for saving the results.

    Returns:
        dict: {
            "status": "success" | "partial_error" | "error",
            "message": "Overall status message",
            "results": [
                {
                    "status": "success",
                    "original_image": "input_image_identifier",
                    "edited_url": "url_to_edited_image.png",
                    "message": "Image edited successfully."
                },
                {
                    "status": "error",
                    "original_image": "input_image_identifier",
                    "message": "Error message for this image."
                },
                ...
            ]
        }

    **Prompting Guidelines for Gemini Image Editing (apply to `edit_prompt`):**
    - **Conversational Edits:** You can make sequential requests.
        - *Example (after providing an image of a cat):*
            - Prompt 1: "Add a small party hat to the cat."
            - Prompt 2 (after seeing the result): "Okay, now change the hat color to blue and add some confetti in the background."
    - **Be Specific and Clear:** Describe the change you want precisely.
        - *Instead of:* "Make it better."
        - *Try:* "Change the background to a sunny beach scene." or "Make the cat look happier by giving it a slight smile."
    - **Explicitly Request Image Updates:** If Gemini responds with only text, you can ask it to show the image.
        - *Example:* "Generate an image showing that change." or "Update the image with that edit."
    - **Combining Text and Image Edits:**
        - *Example:* "Add a speech bubble above the dog saying 'Woof!' and make the dog's eyes sparkle."
    - **Context is Maintained:** The model remembers previous edits in a conversation.
    - **Best Languages:** Performs best with English, Spanish (Mexico), Japanese, Chinese (Simplified), and Hindi.
    - **Retry if Needed:** If the first edit isn't perfect or if the model doesn't generate an image, try rephrasing your prompt or asking again.

    **Example Workflow (for a single image in the list):**
    1. Call tool with `images=["URL_to_cat_photo.jpg"]`, `edit_prompt="Add a red collar to this cat."`
    2. If satisfied, stop. If not, call again with the *newly generated image URL* (from step 1's output) and a new `edit_prompt`:
       `images=["URL_to_cat_with_collar.jpg"]`, `edit_prompt="Now, make the cat wear a tiny crown."`
    """
    # Imports are scoped to the function to keep them specific to this tool
    from google import genai
    from google.genai import types
    from PIL import Image
    from io import BytesIO
    import base64
    import requests
    import os
    import hashlib
    import re
    import uuid # Added for unique filenames
    import asyncio # For concurrent processing

    # Use default user number if empty or placeholder
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"

    # --- Sanitize function for user number (kept local for now) ---
    def sanitize(s):
        s = str(s).replace('+', '')
        if s.startswith('group_'):
            group_id = s[len('group_'):]
            hash_val = hashlib.md5(group_id.encode()).hexdigest()[:8]
            s = f"group_{hash_val}"
        s = re.sub(r'[^a-zA-Z0-9]', '_', s)
        s = re.sub(r'_+', '_', s)
        return s.strip('_')

    user_number_safe = sanitize(user_number)
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    image_dir = os.path.join(base_dir, user_number_safe, "edited_images")
    os.makedirs(image_dir, exist_ok=True)

    # --- Prepare Gemini client (single client for all concurrent requests) ---
    # If rate limits become an issue, a multi-client strategy like in 
    # generate_images_with_prompts could be considered.
    try:
        client = genai.Client()
    except Exception as e:
        logger.error(f"Failed to initialize Gemini client: {e}")
        return {"status": "error", "message": f"Failed to initialize Gemini client: {e}", "results": []}

    # --- Helper function to process a single image ---
    async def _process_single_image_edit(image_input: str, current_edit_prompt: str) -> Dict[str, Any]:
        try:
            # --- Download or decode the image ---
            if image_input.startswith("http://") or image_input.startswith("https://"):
                resp = await asyncio.to_thread(requests.get, image_input, timeout=20) # Increased timeout slightly
                resp.raise_for_status()
                img_bytes = resp.content
            elif len(image_input) > 100 and image_input.endswith(('=', '==')) : # Heuristic for base64
                 img_bytes = base64.b64decode(image_input)
            else: # Assuming it might be a malformed base64 or other identifier not a URL
                return {"status": "error", "original_image": image_input, "message": "Invalid image input: not a valid URL or recognizable base64."}

            img = await asyncio.to_thread(Image.open, BytesIO(img_bytes))

        except requests.exceptions.RequestException as e:
            logger.error(f"Could not download image '{image_input}': {e}")
            return {"status": "error", "original_image": image_input, "message": f"Could not download image: {e}"}
        except Exception as e:
            logger.error(f"Could not load image '{image_input}': {e}")
            return {"status": "error", "original_image": image_input, "message": f"Could not load image: {e}"}

        # --- Call Gemini for image editing ---
        try:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model="gemini-2.0-flash-preview-image-generation",
                contents=[current_edit_prompt, img], # img must be a PIL Image object
                config=types.GenerateContentConfig(
                    response_modalities=['TEXT', 'IMAGE']
                )
            )
        except Exception as e:
            logger.error(f"Gemini API error for image '{image_input}' with prompt '{current_edit_prompt[:50]}...': {e}")
            return {"status": "error", "original_image": image_input, "message": f"Gemini API error: {e}"}

        # --- Extract the edited image from the response ---
        edited_image_pil = None
        if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if part.inline_data and part.inline_data.data:
                    try:
                        edited_image_pil = await asyncio.to_thread(Image.open, BytesIO(part.inline_data.data))
                        break
                    except Exception as e:
                        logger.error(f"Failed to open image data from Gemini response for '{image_input}': {e}")
                        # Continue, maybe another part has the image or it's a text-only response
        
        if edited_image_pil is None:
            text_response = response.text if hasattr(response, 'text') else "No text content."
            logger.warning(f"No image returned by Gemini for '{image_input}'. Response text: {text_response}")
            return {"status": "error", "original_image": image_input, "message": f"No image returned by Gemini. Model response: {text_response}"}

        # --- Save the edited image ---
        try:
            filename = f"gemini_edit_{uuid.uuid4().hex[:8]}.png"
            file_path = os.path.join(image_dir, filename) # image_dir is from outer scope
            await asyncio.to_thread(edited_image_pil.save, file_path, format="PNG")
            
            url = f"{DOMAIN}/user_data/{user_number_safe}/edited_images/{filename}" # user_number_safe from outer
            return {
                "status": "success",
                "original_image": image_input,
                "edited_url": url,
                "message": "Image edited successfully."
            }
        except Exception as e:
            logger.error(f"Failed to save edited image for '{image_input}': {e}")
            return {"status": "error", "original_image": image_input, "message": f"Failed to save edited image: {e}"}

    # --- Create and run concurrent tasks ---
    if not isinstance(images, list):
        return {"status": "error", "message": "'images' argument must be a list.", "results": []}
    if not images:
        return {"status": "success", "message": "No images provided to edit.", "results": []}


    tasks = [_process_single_image_edit(img_input, edit_prompt) for img_input in images]
    
    # Errors are handled within _process_single_image_edit and returned as part of its dict
    individual_results = await asyncio.gather(*tasks, return_exceptions=False)

    # --- Process overall results ---
    any_errors = any(res.get("status") == "error" for res in individual_results)
    all_successful = all(res.get("status") == "success" for res in individual_results)

    if all_successful:
        overall_status = "success"
        overall_message = "All images edited successfully."
    elif any_errors and not all_successful:
        overall_status = "partial_error"
        overall_message = "Some images failed to edit. Check results for details."
    else: # Should cover all errors if not all successful and not partial
        overall_status = "error"
        overall_message = "All image edits failed. Check results for details."
        # If individual_results is empty due to an early exit or all tasks failing catastrophically
        # before gather (unlikely with return_exceptions=False), this ensures a clear error state.

    return {
        "status": overall_status,
        "message": overall_message,
        "results": individual_results
    }

async def _generate_videos_with_prompts_concurrent(user_number, prompts, input_images=None, duration_seconds=8, aspect_ratio="16:9", sample_count=1, negative_prompt="", enhance_prompt=True):
    import re
    import hashlib
    import json
    import uuid
    import base64
    import os
    from utils.constants import DOMAIN
    
    # Use default user number if empty
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"
    
    def sanitize(s):
        s = str(s).replace('+', '')
        # Always hash group IDs for shortness
        if s.startswith('group_'):
            group_id = s[len('group_'):]
            hash_val = hashlib.md5(group_id.encode()).hexdigest()[:8]
            s = f"group_{hash_val}"
        s = re.sub(r'[^a-zA-Z0-9]', '_', s)
        s = re.sub(r'_+', '_', s)
        return s.strip('_')

    user_number_safe = sanitize(user_number)
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    video_dir = os.path.join(base_dir, user_number_safe, "videos")
    os.makedirs(video_dir, exist_ok=True)

    # --- Multiple Vertex AI Project Configuration ---
    vertex_projects = [
        "gen-lang-client-0761146080",
        "maximal-totem-456502-h3",
        "imagen-api-3", 
        "imagen-api-4",
        "imagen-api-5"
    ]
    location = "us-central1"
    model_id = "veo-2.0-generate-001"  # Using Veo 2 for GA availability
    
    if not vertex_projects:
        logger.error("Error: No Vertex AI projects configured for video generation.")
        return {"status": "error", "message": "No Vertex AI projects configured for video generation."}

    num_projects = len(vertex_projects)
    logger.info(f"Initialized video generation with {num_projects} Vertex AI projects.")

    # --- Helper Functions ---
    async def get_access_token(project_id):
        """Get access token for the specific project."""
        try:
            from google.auth import default
            from google.auth.transport.requests import Request
            import google.auth.transport.requests
            
            # Get default credentials
            credentials, _ = default(scopes=['https://www.googleapis.com/auth/cloud-platform'])
            
            # Refresh the credentials to get a valid token
            request = google.auth.transport.requests.Request()
            credentials.refresh(request)
            
            return credentials.token
        except Exception as e:
            logger.error(f"Failed to get access token for project {project_id}: {e}")
            return None

    async def start_video_generation(prompt, project_id, input_image=None):
        """Start video generation and return operation ID."""
        try:
            token = await get_access_token(project_id)
            if not token:
                return None, f"Failed to get access token for project {project_id}"

            url = f"https://{location}-aiplatform.googleapis.com/v1/projects/{project_id}/locations/{location}/publishers/google/models/{model_id}:predictLongRunning"
            
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            
            # Build request payload according to the documentation
            instance = {"prompt": prompt}
            
            # Add input image if provided
            if input_image:
                if input_image.startswith("http://") or input_image.startswith("https://"):
                    # Download and encode image
                    resp = await asyncio.to_thread(requests.get, input_image, timeout=20)
                    resp.raise_for_status()
                    image_bytes = base64.b64encode(resp.content).decode('utf-8')
                    mime_type = resp.headers.get('Content-Type', 'image/jpeg')
                else:
                    # Assume it's already base64 encoded
                    image_bytes = input_image
                    mime_type = "image/jpeg"
                
                instance["image"] = {
                    "bytesBase64Encoded": image_bytes,
                    "mimeType": mime_type
                }
            
            payload = {
                "instances": [instance],
                "parameters": {
                    "aspectRatio": aspect_ratio,
                    "sampleCount": sample_count,
                    "durationSeconds": duration_seconds,
                    "personGeneration": "allow_adult",
                    "enablePromptRewriting": enhance_prompt,
                    "addWatermark": True,
                    "includeRailReason": True
                }
            }
            
            # Add negative prompt if provided
            if negative_prompt:
                payload["parameters"]["negativePrompt"] = negative_prompt
            
            # Make the request
            response = await asyncio.to_thread(
                requests.post, url, headers=headers, json=payload, timeout=30
            )
            response.raise_for_status()
            
            result = response.json()
            operation_name = result.get("name")
            
            if operation_name:
                logger.info(f"Started video generation for project {project_id}: {operation_name}")
                return operation_name, None
            else:
                return None, f"No operation name returned from project {project_id}"
                
        except Exception as e:
            logger.error(f"Error starting video generation for project {project_id}: {e}")
            return None, str(e)

    async def poll_video_operation(operation_name, project_id, max_wait_time=300):
        """Poll the video generation operation until completion."""
        try:
            token = await get_access_token(project_id)
            if not token:
                return None, f"Failed to get access token for polling project {project_id}"

            # Use the correct fetchPredictOperation endpoint as per documentation
            url = f"https://{location}-aiplatform.googleapis.com/v1/projects/{project_id}/locations/{location}/publishers/google/models/{model_id}:fetchPredictOperation"
            
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            
            # Send the operation name in the request body
            payload = {"operationName": operation_name}
            
            start_time = time.time()
            while time.time() - start_time < max_wait_time:
                response = await asyncio.to_thread(
                    requests.post, url, headers=headers, json=payload, timeout=30
                )
                response.raise_for_status()
                
                result = response.json()
                
                if result.get("done"):
                    logger.info(f"Operation {operation_name} completed successfully")
                    
                    if "response" in result:
                        videos = []
                        # Parse the response format for video generation
                        response_data = result["response"]
                        
                        # Handle Veo 2 response format
                        if "videos" in response_data:
                            for idx, video_data in enumerate(response_data["videos"]):
                                if "bytesBase64Encoded" in video_data:
                                    logger.info(f"Found video data in video {idx}")
                                    
                                    # Generate unique filename
                                    video_id = str(uuid.uuid4())
                                    filename = f"video_{video_id}.mp4"
                                    file_path = os.path.join(video_dir, filename)
                                    
                                    # Ensure directory exists
                                    os.makedirs(video_dir, exist_ok=True)
                                    
                                    # Decode and save video
                                    video_bytes = base64.b64decode(video_data["bytesBase64Encoded"])
                                    
                                    with open(file_path, "wb") as f:
                                        f.write(video_bytes)
                                    
                                    video_url = f"{DOMAIN}/user_data/{user_number_safe}/videos/{filename}"
                                    videos.append(video_url)
                                    logger.info(f"Video saved to {file_path}, URL: {video_url}")
                                else:
                                    logger.warning(f"No bytesBase64Encoded in video {idx}: {video_data.keys()}")
                        elif "predictions" in response_data:
                            # Fallback to predictions format
                            for idx, prediction in enumerate(response_data["predictions"]):
                                if "bytesBase64Encoded" in prediction:
                                    logger.info(f"Found video data in prediction {idx}")
                                    
                                    # Generate unique filename
                                    video_id = str(uuid.uuid4())
                                    filename = f"video_{video_id}.mp4"
                                    file_path = os.path.join(video_dir, filename)
                                    
                                    # Ensure directory exists
                                    os.makedirs(video_dir, exist_ok=True)
                                    
                                    # Decode and save video
                                    video_bytes = base64.b64decode(prediction["bytesBase64Encoded"])
                                    
                                    with open(file_path, "wb") as f:
                                        f.write(video_bytes)
                                    
                                    video_url = f"{DOMAIN}/user_data/{user_number_safe}/videos/{filename}"
                                    videos.append(video_url)
                                    logger.info(f"Video saved to {file_path}, URL: {video_url}")
                                else:
                                    logger.warning(f"No bytesBase64Encoded in prediction {idx}: {prediction.keys()}")
                        else:
                            logger.warning(f"No videos or predictions in response data: {response_data.keys()}")
                        
                        if videos:
                            logger.info(f"Successfully parsed {len(videos)} videos from response")
                            return videos, None
                        else:
                            logger.error("No videos found in completed operation response")
                            return [], f"No videos generated on project {project_id}"
                    else:
                        error_info = result.get("error", {})
                        error_msg = error_info.get("message", "Unknown error")
                        logger.error(f"Operation completed with error: {json.dumps(error_info, indent=2)}")
                        return None, f"Video generation failed: {error_msg}"
                
                # Wait before polling again
                await asyncio.sleep(10)
            
            return None, f"Video generation timed out after {max_wait_time} seconds"
            
        except Exception as e:
            logger.error(f"Error polling video operation for project {project_id}: {e}")
            return None, str(e)

    async def generate_video_for_prompt(prompt, idx, project_id, input_image=None):
        """Generate video for a single prompt using specified project."""
        try:
            logger.debug(f"Attempting video generation for prompt '{prompt}' (idx: {idx}) with project {project_id}.")
            
            # Start video generation
            operation_name, error = await start_video_generation(prompt, project_id, input_image)
            if error:
                return {"error": f"Failed to start video generation on project {project_id}: {error}"}
            
            # Poll for completion
            video_uris, error = await poll_video_operation(operation_name, project_id)
            if error:
                return {"error": f"Video generation failed on project {project_id}: {error}"}
            
            if not video_uris:
                return {"error": f"No videos generated on project {project_id} for prompt '{prompt}'"}
            
            logger.info(f"Success for prompt '{prompt}' (idx: {idx}) with project {project_id}. Generated {len(video_uris)} videos.")
            return video_uris
            
        except Exception as e:
            error_str = str(e)
            logger.error(f"Error on video generation for prompt '{prompt}' (idx: {idx}) with project {project_id}: {error_str}")
            
            # Check if it's a rate limit/quota error
            is_rate_limit = "quota" in error_str.lower() or "rate limit" in error_str.lower() or "429" in error_str
            
            if is_rate_limit:
                error_message = f"Rate limit hit on project {project_id} for video prompt '{prompt}'."
            else:
                error_message = f"Video generation failed on project {project_id} for prompt '{prompt}': {error_str}"

            return {"error": error_message}

    # --- Run Concurrent Tasks ---
    tasks = []
    for idx, prompt in enumerate(prompts):
        project_id = vertex_projects[idx % num_projects]
        input_image = input_images[idx] if input_images and idx < len(input_images) else None
        tasks.append(generate_video_for_prompt(prompt, idx, project_id, input_image))
    
    results = await asyncio.gather(*tasks, return_exceptions=False)

    # --- Process Results ---
    final_results = []
    any_errors = False
    error_message = "Multiple errors occurred during video generation."

    for i, r in enumerate(results):
        if isinstance(r, dict) and "error" in r:
            any_errors = True
            error_message = r["error"]
            logger.error(f"Error reported for video prompt index {i}: {r['error']}")
            final_results.append({"error": r["error"]})
        elif isinstance(r, list):
             final_results.append(r)
        else:
            any_errors = True
            error_message = f"Unexpected result type for video prompt index {i}: {type(r)}"
            logger.error(error_message)
            final_results.append({"error": "Unexpected result type."})

    if any_errors:
         return {"status": "partial_error", "message": "Some videos failed to generate. Check results for details.", "results": final_results}

    return {"status": "success", "results": final_results}

@mcp.tool()
async def generate_videos_with_prompts(
    user_number: str = "+17145986105",
    prompts: list = None,
    input_images: list = None,
    duration_seconds: int = 8,
    aspect_ratio: str = "16:9",
    sample_count: int = 1,
    negative_prompt: str = "",
    enhance_prompt: bool = True
) -> dict:
    """
    Generate videos using Google's Veo 2 model via Vertex AI (`veo-2.0-generate-001`).
    This tool cycles between multiple Vertex AI projects for better reliability and rate limit handling.
    Supports both text-to-video and image-to-video generation.

    Args:
        user_number (str): The user's unique identifier (used for directory structure).
        prompts (list): List of text prompts. Each prompt will generate video(s).
        input_images (list, optional): List of input image URLs or base64 strings for image-to-video generation.
                                     If provided, should match the length of prompts list.
        duration_seconds (int): Length of generated videos. Range: 5-8 seconds (default: 8).
        aspect_ratio (str): Video aspect ratio. Options: "16:9" (landscape), "9:16" (portrait).
        sample_count (int): Number of videos to generate per prompt (1-4).
        negative_prompt (str): Text describing what to discourage in generation.
        enhance_prompt (bool): Enable prompt rewriting using Gemini (enablePromptRewriting parameter).

    Returns:
        dict: {"status": "success", "results": [ [video_urls], ... ]} or {"status": "error", "message": ...}

    **Vertex AI Project Cycling:**
    - Uses 5 different Vertex AI projects for load distribution
    - Distributes prompts across projects to handle rate limits and improve reliability
    - All projects use us-central1 location and veo-2.0-generate-001 model

    **Video Generation Types:**
    1. **Text-to-Video**: Provide only prompts
    2. **Image-to-Video**: Provide both prompts and input_images

    **API Parameters Used:**
    - aspectRatio: "16:9" or "9:16"
    - sampleCount: 1-4 videos per prompt
    - durationSeconds: 5-8 seconds
    - personGeneration: "allow_adult" (default)
    - enablePromptRewriting: true/false
    - addWatermark: true (always enabled)
    - includeRailReason: true (always enabled)

    **Prompting Guidelines for Veo 2:**
    - **Camera Movement**: "A fast-tracking shot", "aerial view", "close-up", "wide shot"
    - **Lighting**: "volumetric lighting", "lens flare", "soft light", "dramatic lighting"
    - **Environment**: "bustling dystopian sprawl", "deep ocean", "Arctic sky", "futuristic Tokyo"
    - **Style**: "cinematic", "incredible details", "timelapse", "slow motion"
    - **Examples**:
        - "create a video of a cat eating mushrooms"
        - "A fast-tracking shot through a bustling dystopian sprawl with bright neon signs, flying cars and mist, night, lens flare, volumetric lighting"
        - "Many spotted jellyfish pulsating under water. Their bodies are transparent and glowing in deep ocean"
        - "Timelapse of the northern lights dancing across the Arctic sky, stars twinkling, snow-covered landscape"
        - "A lone cowboy rides his horse across an open plain at beautiful sunset, soft light, warm colors"

    **Technical Specifications:**
    - Duration: 5-8 seconds (configurable, default 8)
    - Resolution: 1280x720 (16:9) or 720x1280 (9:16)
    - Format: MP4 (no audio - use Veo 3 for audio support)
    - Input images: 720p+ recommended, 16:9 or 9:16 aspect ratio

    **Current Limitations:**
    - Video generation takes 2-5 minutes per video
    - Maximum 4 videos per prompt
    - No audio generation (Veo 2 limitation)
    - Both portrait (9:16) and landscape (16:9) supported
    """
    # Use default user number if empty
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"
    
    return await _generate_videos_with_prompts_concurrent(
        user_number, prompts, input_images, duration_seconds, aspect_ratio, 
        sample_count, negative_prompt, enhance_prompt
    )

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