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
from utils.constants import DOMAIN
import time
# Added for gpt-image-1 support
from openai import OpenAI
# Google GenAI client for Imagen
from google import genai
from google.genai import types
# import base64 # Already imported globally

mcp = FastMCP("Image, Video, Music, and Speech Services Server")

print("Image, Video, Music, and Speech Services Server ready - Google GenAI clients will be initialized on first use")

@mcp.tool(
    annotations={
        "outputSchema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["success", "error"],
                    "description": "Overall analysis status"
                },
                "results": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "status": {
                                "type": "string",
                                "enum": ["success", "error"],
                                "description": "Individual image analysis status"
                            },
                            "analysis": {
                                "type": "string",
                                "description": "Detailed analysis text from Gemini"
                            },
                            "url": {
                                "type": "string",
                                "format": "uri",
                                "description": "Original image URL that was analyzed"
                            },
                            "message": {
                                "type": "string",
                                "description": "Error message if analysis failed"
                            }
                        },
                        "required": ["status", "url"],
                        "description": "Analysis result for individual image"
                    },
                    "description": "Array of analysis results, one per image"
                }
            },
            "required": ["status", "results"]
        }
    }
)
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

async def _generate_images_with_prompts_concurrent(user_number, prompts, model_version="imagen-4.0-generate-preview-06-06", input_images=None, aspect_ratio="16:9"):
    import re
    import hashlib
    import time
    # Ensure base64 is available for OpenAI path; it's already globally imported but good to note.
    # import base64 
    from PIL import Image # Ensure PIL.Image is available
    from io import BytesIO # Ensure BytesIO is available
    import uuid # Ensure uuid is available
    import os # Ensure os is available
    from utils.constants import DOMAIN # Ensure DOMAIN is available
    
    # Use default user number if empty
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"
    
    def sanitize_for_path_local(s_input): # Renamed to avoid conflict with global sanitize_for_path
        s = str(s_input).replace('+', '')
        if s.startswith('group_'):
            group_id = s[len('group_'):]
            hash_val = hashlib.md5(group_id.encode()).hexdigest()[:8]
            s = f"group_{hash_val}"
        s = re.sub(r'[^a-zA-Z0-9]', '_', s)
        s = re.sub(r'_+', '_', s)
        s = s.strip('_')
        if not s: # Handle empty string after sanitization
            return f"sanitized_{uuid.uuid4().hex[:8]}"
        return s

    user_number_safe = sanitize_for_path_local(user_number)
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    image_dir = os.path.join(base_dir, user_number_safe, "images")
    os.makedirs(image_dir, exist_ok=True)

    if model_version == "gpt-image-1":
        # OpenAI GPT Image Logic - NOW USING RESPONSES API
        openai_api_key = os.environ.get("OPENAI_API_KEY")
        if not openai_api_key:
            print("Error: OPENAI_API_KEY environment variable not set.")
            return {"status": "error", "message": "OPENAI_API_KEY environment variable not set for gpt-image-1 model."}
        
        try:
            client = OpenAI() 
        except Exception as e:
            print(f"Error initializing OpenAI client: {str(e)}")
            return {"status": "error", "message": f"Failed to initialize OpenAI client: {str(e)}"}

        all_prompt_results = []
        any_errors_openai = False
        
        async def generate_for_single_prompt_openai_responses_api(prompt_text, prompt_idx_openai):
            try:
                print(f"🎯 OpenAI (Responses API) Prompt #{prompt_idx_openai}: '{prompt_text[:50]}...'")
                start_time_openai = time.time()
                
                gpt_size = "1024x1024"
                if aspect_ratio == "16:9": gpt_size = "1536x1024"
                elif aspect_ratio == "9:16": gpt_size = "1024x1536"
                elif aspect_ratio == "4:3": gpt_size = "1536x1024" 
                elif aspect_ratio == "3:4": gpt_size = "1024x1536" 
                elif aspect_ratio == "3:2": gpt_size = "1536x1024" 
                elif aspect_ratio == "2:3": gpt_size = "1024x1536"
                elif aspect_ratio == "1:1": gpt_size = "1024x1024"

                input_content_for_api = [{"type": "input_text", "text": prompt_text}]
                
                if input_images and prompt_idx_openai < len(input_images):
                    current_input_image_sources = input_images[prompt_idx_openai]
                    if not isinstance(current_input_image_sources, list):
                         current_input_image_sources = [current_input_image_sources]

                    for source_index, image_source_url_or_b64 in enumerate(current_input_image_sources):
                        print(f"🖼️ Processing input_image #{source_index} for OpenAI Responses API: {str(image_source_url_or_b64)[:70]}...")
                        img_bytes = None
                        mime_type = "image/png" # Default, will be refined
                        
                        try:
                            if str(image_source_url_or_b64).startswith("data:image"):
                                # Already a data URL, pass it directly
                                input_content_for_api.append({"type": "input_image", "image_url": image_source_url_or_b64})
                                print(f"✅ Added pre-formatted data URL for input_image #{source_index}")
                                continue # Skip further processing for this image
                            elif str(image_source_url_or_b64).startswith("http://") or str(image_source_url_or_b64).startswith("https://"):
                                resp = await asyncio.to_thread(requests.get, image_source_url_or_b64, timeout=20)
                                resp.raise_for_status()
                                img_bytes = resp.content
                                header_content_type = resp.headers.get('Content-Type', '')
                                if header_content_type.startswith('image/'):
                                    mime_type = header_content_type
                            elif len(str(image_source_url_or_b64)) > 100: # Assume raw base64
                                img_bytes = base64.b64decode(image_source_url_or_b64)
                            else:
                                print(f"⚠️ Invalid input_image format for prompt #{prompt_idx_openai}, source #{source_index}. Skipping.")
                                continue

                            if img_bytes:
                                pil_image = await asyncio.to_thread(Image.open, BytesIO(img_bytes))
                                original_format = pil_image.format # PNG, JPEG, GIF, WEBP etc.
                                
                                # Refine MIME type based on Pillow's detection
                                if original_format:
                                    if original_format.upper() == "JPEG": mime_type = "image/jpeg"
                                    elif original_format.upper() == "PNG": mime_type = "image/png"
                                    elif original_format.upper() == "GIF": mime_type = "image/gif"
                                    elif original_format.upper() == "WEBP": mime_type = "image/webp"
                                    # Keep default 'image/png' if Pillow format is None or not one of the above common ones
                                
                                # Convert to PNG if not a directly supported format by OpenAI or for consistency
                                if original_format not in ['PNG', 'JPEG', 'GIF', 'WEBP']:
                                    print(f"Unsupported format {original_format}, converting to PNG for OpenAI input.")
                                    output_buffer = BytesIO()
                                    # Handle transparency correctly during conversion
                                    if pil_image.mode == 'RGBA' or pil_image.mode == 'LA' or (pil_image.mode == 'P' and 'transparency' in pil_image.info):
                                        await asyncio.to_thread(pil_image.save, output_buffer, format='PNG')
                                    else: # Convert to RGB first if no alpha, then save as PNG
                                        rgb_pil_image = pil_image.convert('RGB')
                                        await asyncio.to_thread(rgb_pil_image.save, output_buffer, format='PNG')
                                    img_bytes = output_buffer.getvalue()
                                    mime_type = 'image/png' # Mime type is now PNG

                                b64_encoded_img = base64.b64encode(img_bytes).decode('utf-8')
                                data_url = f"data:{mime_type};base64,{b64_encoded_img}"
                                input_content_for_api.append({"type": "input_image", "image_url": data_url})
                                print(f"✅ Added data URL for input_image #{source_index} (final mime: {mime_type}, size: {len(img_bytes)})")

                        except Exception as e_proc_img:
                            print(f"⚠️ Failed to process input_image source #{source_index} for prompt #{prompt_idx_openai}: {e_proc_img}")
                
                print(f"Calling OpenAI client.responses.create with model gpt-4o-mini, tool image_generation, size: {gpt_size}")
                input_summary = []
                for item in input_content_for_api:
                    if item["type"] == "input_text":
                        input_summary.append({"type": "input_text", "text_length": len(item["text"])})
                    elif item["type"] == "input_image":
                        input_summary.append({"type": "input_image", "image_url_preview": item["image_url"][:100] + "..." if item.get("image_url") else "No URL"})
                print(f"Input content summary: {json.dumps(input_summary, indent=2)}")

                response_openai = await asyncio.to_thread(
                    client.responses.create,
                    model="gpt-4o-mini", 
                    input=[{"role": "user", "content": input_content_for_api}],
                    tools=[{
                        "type": "image_generation",
                        "size": gpt_size,
                        "quality": "high", 
                        "moderation": "low",
                    }],
                )

                end_time_openai = time.time()
                duration_openai = end_time_openai - start_time_openai
                print(f"✅ OpenAI Responses API CALL COMPLETE - Prompt #{prompt_idx_openai} (took {duration_openai:.2f}s)")

                generated_image_b64 = None
                revised_prompt_for_image = None

                if response_openai.output:
                    for output_item in response_openai.output:
                        if output_item.type == "image_generation_call":
                            if output_item.status == "completed" and output_item.result:
                                generated_image_b64 = output_item.result
                                revised_prompt_for_image = output_item.revised_prompt
                                print(f"🖼️ Image generated. Revised prompt by gpt-4o-mini: {revised_prompt_for_image}")
                                break
                            else:
                                print(f"⚠️ Image generation tool call not completed or no result: Status {output_item.status}. Message: {getattr(output_item, 'message', 'N/A')}")
                                return {"error": f"OpenAI image generation tool call status: {output_item.status}. Message: {getattr(output_item, 'message', 'N/A')}"}
                
                if not generated_image_b64:
                    print(f"Error: OpenAI Responses API did not return image data for prompt: {prompt_text}")
                    full_output_log = "No output attribute or empty."
                    if hasattr(response_openai, 'output') and response_openai.output:
                        try:
                            full_output_log = response_openai.output.model_dump_json(indent=2)
                        except Exception: # Fallback if model_dump_json fails or not available
                            full_output_log = str(response_openai.output)
                    print(f"Full OpenAI Response Output: {full_output_log}")
                    return {"error": f"OpenAI Responses API did not return image data for prompt: {prompt_text}"}

                image_bytes_data = base64.b64decode(generated_image_b64)
                pil_image_obj = Image.open(BytesIO(image_bytes_data))
                
                filename_openai = f"gpt_responses_img_{uuid.uuid4().hex[:8]}.png" # Always save as PNG from this API
                local_path_openai = os.path.join(image_dir, filename_openai)
                await asyncio.to_thread(pil_image_obj.save, local_path_openai, format="PNG")
                
                image_url_openai = f"{DOMAIN}/user_data/{user_number_safe}/images/{filename_openai}"
                print(f"✅ OpenAI (Responses API) Success: Prompt #{prompt_idx_openai}. Generated image: {image_url_openai}")
                return [image_url_openai]

            except Exception as e_openai:
                error_str_openai = str(e_openai)
                print(f"❌ OpenAI (Responses API) Error Type: {type(e_openai).__name__}")
                print(f"❌ OpenAI (Responses API) Error: Prompt #{prompt_idx_openai} ('{prompt_text[:30]}...'): {error_str_openai}")
                import traceback
                print(traceback.format_exc())
                return {"error": f"OpenAI image generation via Responses API failed for prompt '{prompt_text}': {error_str_openai}"}

        openai_tasks = [generate_for_single_prompt_openai_responses_api(p, i) for i, p in enumerate(prompts)]
        
        # Debug: Show batch start time for OpenAI
        batch_start_time_openai = time.time()
        batch_start_str_openai = time.strftime("%H:%M:%S", time.localtime(batch_start_time_openai))
        print(f"\n⏱️ OpenAI BATCH START [{batch_start_str_openai}] - Launching {len(prompts)} concurrent API calls...")

        results_from_openai_api = await asyncio.gather(*openai_tasks, return_exceptions=False) # Errors handled within helper

        # Debug: Show batch completion time for OpenAI
        batch_end_time_openai = time.time()
        batch_duration_openai = batch_end_time_openai - batch_start_time_openai
        batch_end_str_openai = time.strftime("%H:%M:%S", time.localtime(batch_end_time_openai))
        print(f"\n🏁 OpenAI BATCH COMPLETE [{batch_end_str_openai}] - All {len(prompts)} requests finished (total time: {batch_duration_openai:.2f}s)")


        for i_openai, r_openai in enumerate(results_from_openai_api):
            if isinstance(r_openai, dict) and "error" in r_openai:
                any_errors_openai = True
                all_prompt_results.append(r_openai) 
            elif isinstance(r_openai, list):
                all_prompt_results.append(r_openai)
            else:
                any_errors_openai = True
                error_msg_detail = f"Unexpected result type for OpenAI prompt index {i_openai}: {type(r_openai)}"
                print(error_msg_detail)
                all_prompt_results.append({"error": error_msg_detail})
        
        if any_errors_openai:
            # Check if all failed
            if all(isinstance(res, dict) and "error" in res for res in all_prompt_results):
                 return {"status": "error", "message": "All image generations failed with OpenAI. Check results for details.", "results": all_prompt_results}
            return {"status": "partial_error", "message": "Some images failed to generate with OpenAI. Check results for details.", "results": all_prompt_results}
        
        return {"status": "success", "results": all_prompt_results}

    else:
        # --- Google GenAI Client Logic ---
        # --- Multiple Google Cloud Project Configuration ---
        google_projects = [
            "gen-lang-client-0761146080",
            "maximal-totem-456502-h3",
            "imagen-api-3", 
            "imagen-api-4",
            "imagen-api-5",
            "imagen-api-6-461900",
            "imagen-api-5-461900",
            "imagen-api-8",
            "imagen-api-9",
            "imagen-api-10",
            "imagen-api-11",
            "imagen-api-12",
        ]
        location = os.environ.get("GOOGLE_CLOUD_REGION", "us-central1")
        
        # Create a lock for client initialization to prevent race conditions
        client_init_lock = asyncio.Lock()
        
        # Initialize GenAI clients for each project
        generation_clients = []
        for i, project_id in enumerate(google_projects):
            try:
                # Initialize Google GenAI client for each project
                client = genai.Client(vertexai=True, project=project_id, location=location)
                generation_clients.append((project_id, client))
                print(f"✅ Initialized Google GenAI client {i+1}/{len(google_projects)}: {project_id}")
            except Exception as e:
                print(f"❌ Failed to initialize Google GenAI client {project_id}: {e}")
                continue
        
        if not generation_clients:
            print("Error: No Google GenAI clients could be initialized.")
            return {"status": "error", "message": "No Google GenAI clients configured successfully."}

        num_projects = len(generation_clients)
        print(f"🚀 Initialized image generation with {num_projects} Google GenAI clients for rate limit distribution.")

        # --- Helper Functions ---
        async def process_image_response(response, prompt, prompt_idx):
            """Processes images from a prompt response concurrently."""
            os.makedirs(image_dir, exist_ok=True)

            async def _save_and_process_single_image(generated_image, index):
                """Handles saving the PNG image and returning its URL."""
                try:
                    # For Google GenAI client, use the .image attribute
                    if hasattr(generated_image, 'image'):
                        image = generated_image.image
                    else:
                        print(f"Could not extract PIL image from generated_image object: {type(generated_image)}, dir: {dir(generated_image)}")
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
                    print(f"Error processing image {index} for prompt {prompt_idx} ('{prompt[:30]}...'): {e}")
                    return None # Return None on error for this specific image

            # Create and run tasks concurrently for all images from this single prompt response
            # For Google GenAI client, response.generated_images contains the list of GeneratedImage objects
            if hasattr(response, 'generated_images'):
                images_list = response.generated_images
            else:
                print(f"Unexpected response format from Google GenAI: {type(response)}, expected response with 'generated_images' attribute")
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

        async def generate_for_prompt(prompt, idx, project_client_tuple):
            project_id, client = project_client_tuple
            project_index = generation_clients.index(project_client_tuple)

            try:
                print(f"🎯 Prompt #{idx}: '{prompt[:50]}...' → Project: {project_id} (#{project_index + 1}/{num_projects})")
                
                # Debug: Show API call start time
                start_time = time.time()
                current_time = time.strftime("%H:%M:%S", time.localtime(start_time))
                print(f"🚀 API CALL START [{current_time}] - Prompt #{idx} → {project_id}")
                
                # Map aspect ratio to Google GenAI format
                genai_aspect_ratio = aspect_ratio
                if aspect_ratio == "16:9":
                    genai_aspect_ratio = "16:9"
                elif aspect_ratio == "9:16":
                    genai_aspect_ratio = "9:16"
                elif aspect_ratio == "1:1":
                    genai_aspect_ratio = "1:1"
                elif aspect_ratio == "4:3":
                    genai_aspect_ratio = "4:3"
                elif aspect_ratio == "3:4":
                    genai_aspect_ratio = "3:4"
                else:
                    genai_aspect_ratio = "16:9"  # Default fallback
                
                response = await asyncio.to_thread(
                    client.models.generate_images,
                    model=model_version,
                    prompt=prompt,
                    config=types.GenerateImagesConfig(
                        aspect_ratio=genai_aspect_ratio,
                        number_of_images=1,
                        safety_filter_level="BLOCK_MEDIUM_AND_ABOVE",
                        person_generation="ALLOW_ADULT",
                    )
                )
                
                # Debug: Show API call completion time
                end_time = time.time()
                duration = end_time - start_time
                completion_time = time.strftime("%H:%M:%S", time.localtime(end_time))
                print(f"✅ API CALL COMPLETE [{completion_time}] - Prompt #{idx} → {project_id} (took {duration:.2f}s)")
                
                urls = await process_image_response(response, prompt, idx)
                
                if not urls:
                    print(f"⚠️ Warning: Google GenAI client {project_id} generated response for prompt '{prompt}' (idx: {idx}), but processing/saving failed for all images.")
                    return {"error": f"Image generation API succeeded for prompt '{prompt}' with project {project_id}, but processing/saving failed for all images."}
                
                print(f"✅ Success: Prompt #{idx} with {project_id}. Generated {len(urls)} URLs.")
                return urls

            except Exception as e:
                error_str = str(e)
                print(f"❌ Error: Prompt #{idx} with {project_id}: {error_str}")
                
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
                    error_message = f"⏰ Rate limit hit on project {project_id} for prompt '{prompt}' - this is why we cycle projects!"
                    print(f"📊 Rate limit status: Project {project_id} ({project_index + 1}/{num_projects}) hit rate limit")
                else:
                    error_message = f"Image generation failed on project {project_id} for prompt '{prompt}': {error_str}"

                print(f"DEBUG: Failing prompt '{prompt}' due to error: {error_message}")
                return {"error": error_message}

        # --- Run Concurrent Tasks with Project Distribution ---
        print(f"📝 Distributing {len(prompts)} prompts across {num_projects} projects:")
        for i, prompt in enumerate(prompts):
            project_idx = i % num_projects
            project_id = generation_clients[project_idx][0]
            print(f"   Prompt #{i}: {prompt[:30]}... → {project_id}")
        
        # Debug: Show batch start time
        batch_start_time = time.time()
        batch_start_str = time.strftime("%H:%M:%S", time.localtime(batch_start_time))
        print(f"\n⏱️ BATCH START [{batch_start_str}] - Launching {len(prompts)} concurrent API calls...")
        
        tasks = [generate_for_prompt(prompt, idx, generation_clients[idx % num_projects]) for idx, prompt in enumerate(prompts)]
        results = await asyncio.gather(*tasks, return_exceptions=False) # Errors handled within generate_for_prompt

        # Debug: Show batch completion time
        batch_end_time = time.time()
        batch_duration = batch_end_time - batch_start_time
        batch_end_str = time.strftime("%H:%M:%S", time.localtime(batch_end_time))
        print(f"\n🏁 BATCH COMPLETE [{batch_end_str}] - All {len(prompts)} requests finished (total time: {batch_duration:.2f}s)")

        # --- Process Results ---
        final_results = []
        any_errors = False
        error_message = "Multiple errors occurred during image generation."

        for i, r in enumerate(results):
            if isinstance(r, dict) and "error" in r:
                any_errors = True
                # Use the specific error message from the result
                error_message = r["error"]
                print(f"Error reported for prompt index {i}: {r['error']}")
                final_results.append({"error": r["error"]}) # Keep error info per prompt
            elif isinstance(r, list):
                 final_results.append(r)
            else:
                any_errors = True
                error_message = f"Unexpected result type for prompt index {i}: {type(r)}"
                print(error_message)
                final_results.append({"error": "Unexpected result type."})

        if any_errors:
             # Return partial success with errors marked per prompt
             return {"status": "partial_error", "message": "Some images failed to generate. Check results for details.", "results": final_results}

        # If no errors found in results
        return {"status": "success", "results": final_results}

@mcp.tool(
    annotations={
        "outputSchema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["success", "partial_error", "error"],
                    "description": "Overall generation status"
                },
                "message": {
                    "type": "string",
                    "description": "Human-readable status message"
                },
                "results": {
                    "type": "array",
                    "items": {
                        "oneOf": [
                            {
                                "type": "array",
                                "items": {"type": "string", "format": "uri"},
                                "description": "Array of generated image URLs"
                            },
                            {
                                "type": "object",
                                "properties": {
                                    "error": {"type": "string"}
                                },
                                "required": ["error"],
                                "description": "Error object for failed generations"
                            }
                        ]
                    },
                    "description": "Array of results, one per prompt"
                }
            },
            "required": ["status", "results"]
        }
    }
)
async def generate_images_with_prompts(
    user_number: str = "+17145986105",
    prompts: list = None,
    model_version: str = "imagen-4.0-generate-preview-06-06",
    input_images: list = None,
    aspect_ratio: str = "16:9" # Add aspect_ratio parameter
) -> dict:
    """
    Generate one image for each prompt using Google's Imagen 4.0 model or OpenAI's GPT-1.
    All images will be generated with the specified aspect ratio (defaults to 16:9).
    
    **NEW: Image Input Support for GPT-1**
    When using GPT-1 with input_images, the model can analyze reference images and use them as context
    for generating new images. This is perfect for style transfer, handwriting replication, and 
    reference-based generation.

    Args:
        user_number (str): The user's unique identifier (used for directory structure).
        prompts (list): List of text prompts. Each prompt will generate one image.
        model_version (str): Model version to use. Options:
                           - "imagen-4.0-generate-preview-06-06" (default, Google GenAI client, balanced)
                           - "imagen-4.0-fast-generate-preview-06-06" (Google GenAI client, faster generation)
                           - "imagen-4.0-ultra-generate-preview-06-06" (Google GenAI client, highest quality)
                           - "gpt-image-1" (OpenAI, supports image inputs as context)
        input_images (list, optional): List of image URLs or base64 strings to use as context/reference.
                                     Only supported by gpt-image-1. If provided, should match the length 
                                     of prompts list, or provide one image to use for all prompts.
                                     Images are used as visual context for generation.
        aspect_ratio (str): Aspect ratio for generated images. Supported ratios:
                            - "1:1" (square) - 1024x1024 for GPT-1
                            - "16:9" (landscape) - 1536x1024 for GPT-1 (closest available)
                            - "9:16" (portrait) - 1024x1536 for GPT-1 (closest available)
                            - "4:3" (landscape) - 1536x1024 for GPT-1
                            - "3:4" (portrait) - 1024x1536 for GPT-1
                            - "3:2" (landscape) - 1536x1024 for GPT-1
                            - "2:3" (portrait) - 1024x1536 for GPT-1
                            Defaults to "16:9". GPT-1 uses closest supported size, Imagen supports exact ratios.
                            Note: GPT-1 only supports '1024x1024', '1024x1536', '1536x1024', 'auto'.

    Returns:
        dict: {"status": "success", "results": [ [url], ... ]} or {"status": "error", "message": ...}

    **GPT-1 with Image Context Examples:**
    ```python
    # Use handwriting sample as reference for generating new message
    result = await generate_images_with_prompts(
        prompts=["Write 'Happy Birthday!' in the same handwriting style as this sample"],
        model_version="gpt-image-1",
        input_images=["https://example.com/handwriting_sample.jpg"]
    )

    # Style transfer from reference image
    result = await generate_images_with_prompts(
        prompts=["Create a landscape painting in the same artistic style as this reference"],
        model_version="gpt-image-1", 
        input_images=["https://example.com/art_reference.jpg"]
    )

    # Multiple prompts with same reference
    result = await generate_images_with_prompts(
        prompts=["Write 'Hello'", "Write 'Goodbye'"],
        model_version="gpt-image-1",
        input_images=["https://example.com/handwriting.jpg"]  # Same reference for both
    )
    ```

    **Image Input Requirements (GPT-1 only):**
    - Supported formats: PNG, JPEG, WebP, non-animated GIF
    - Maximum size: 50MB per image
    - Maximum: 500 images per request
    - Images are processed as visual context alongside text prompts
    - Can provide one image for all prompts, or one image per prompt
    """
    # Use default user number if empty
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"
    
    # Validate model version
    valid_models = [
        "imagen-4.0-generate-preview-06-06",
        "imagen-4.0-fast-generate-preview-06-06", 
        "imagen-4.0-ultra-generate-preview-06-06",
        "gpt-image-1"  # Added gpt-image-1
    ]
    
    if model_version not in valid_models:
        return {
            "status": "error",
            "message": f"Invalid model_version '{model_version}'. Must be one of: {', '.join(valid_models)}"
        }
    
    # Validate aspect_ratio for Google GenAI models
    valid_aspect_ratios = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"]
    if aspect_ratio not in valid_aspect_ratios:
        return {
            "status": "error",
            "message": f"Invalid aspect_ratio '{aspect_ratio}'. Must be one of: {', '.join(valid_aspect_ratios)}"
        }
    
    return await _generate_images_with_prompts_concurrent(user_number, prompts, model_version, input_images, aspect_ratio)

@mcp.tool(
    annotations={
        "outputSchema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["success", "partial_error", "error"],
                    "description": "Overall editing status"
                },
                "message": {
                    "type": "string",
                    "description": "Human-readable status message"
                },
                "results": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "status": {
                                "type": "string",
                                "enum": ["success", "error"],
                                "description": "Individual image editing status"
                            },
                            "original_image": {
                                "type": "string",
                                "description": "Input image identifier (URL or base64)"
                            },
                            "edited_url": {
                                "type": "string",
                                "format": "uri",
                                "description": "URL to the edited image (only present on success)"
                            },
                            "message": {
                                "type": "string",
                                "description": "Status message for this image"
                            }
                        },
                        "required": ["status", "original_image", "message"],
                        "description": "Editing result for individual image"
                    },
                    "description": "Array of editing results, one per image"
                }
            },
            "required": ["status", "message", "results"]
        }
    }
)
async def edit_images(
    images: List[str],
    edit_prompt: str,
    user_number: str = "+17145986105",
    model: str = "gpt-image-1",
    background: str = "auto",
    mask: str = None,
    output_format: str = "png",
    quality: str = "auto",
    output_compression: int = 100,
    size: str = "1024x1536",
    n: int = 1
) -> dict:
    """
    Edits images using either OpenAI's GPT-1 (default) or Google's Gemini image generation models.
    GPT-1 is now the default and recommended model for image editing.

    **🎨 PERFECT FOR STYLE TRANSFER & REFERENCE-BASED EDITING:**
    This tool excels at using input images as references to apply styling, context, or transformations.
    You can take any image and transform it to match a desired style, mood, or aesthetic.

    Args:
        images (List[str]): List of URLs or base64-encoded images to be edited.
                            **IMPORTANT**: If the user provided an image directly with their request (e.g., as an attachment in a chat),
                            its URL might be mentioned in the prompt context (e.g., "[Context: The following files were attached... Attachment 0 (Name: user_img.jpg, URL: https://...)]").
                           If so, you SHOULD use that specific URL for this 'images' argument when the edit request pertains to that user-provided image.
        edit_prompt (str): Text describing the desired edit (applied to all images).
                          Max length: 32,000 characters for gpt-image-1, 1,000 for dall-e-2.
                          **TIP**: Be specific about styles, moods, and transformations you want applied.
        user_number (str): User identifier for saving the results.
        model (str): Model to use for editing. Options:
                    - "gpt-image-1" (default, OpenAI, highest quality, supports up to 16 images)
                    - "gemini" (Google Gemini image generation model)
        background (str): Background transparency for gpt-image-1. Options: "transparent", "opaque", "auto" (default).
                         Only works with png/webp output formats. Ignored for other models.
        mask (str): Optional mask image URL for gpt-image-1. PNG with transparent areas indicating where to edit.
                   Must have same dimensions as input image. Ignored for other models.
        output_format (str): Output format for gpt-image-1. Options: "png" (default), "jpeg", "webp".
                            Ignored for other models.
        quality (str): Image quality for gpt-image-1. Options: "auto" (default), "high", "medium", "low".
                      Ignored for other models.
        output_compression (int): Compression level 0-100% for gpt-image-1 with webp/jpeg formats.
                                 Default: 100. Ignored for other models.
        size (str): Output size for gpt-image-1. Options: "auto" (default), "1024x1024", "1536x1024", "1024x1536", "1536x1536".
                   Ignored for other models.
        n (int): Number of edited images to generate per input image (1-10). Default: 1.
                Only supported by gpt-image-1.

    Returns:
        dict: {"status": "success", "results": [{"edited_url": "...", "original_image": "...", ...}]}

    **🎯 STYLE TRANSFER & REFERENCE EXAMPLES:**
    ```python
    # Transform photo to match artistic styles
    result = await edit_images(
        images=["https://example.com/portrait.jpg"],
        edit_prompt="Transform this into a Van Gogh painting with swirling brushstrokes and vibrant colors"
    )

    # Apply mood and atmosphere from reference descriptions
    result = await edit_images(
        images=["https://example.com/landscape.jpg"],
        edit_prompt="Make this look like a moody cyberpunk scene with neon lighting and rain"
    )

    # Style transfer with specific artistic movements
    result = await edit_images(
        images=["https://example.com/photo.jpg"],
        edit_prompt="Convert to Art Deco style with geometric patterns, gold accents, and 1920s aesthetic"
    )

    # Transform to match specific visual references
    result = await edit_images(
        images=["https://example.com/building.jpg"],
        edit_prompt="Make this look like it's from a Studio Ghibli film - soft colors, whimsical details, hand-drawn animation style"
    )

    # Apply contextual transformations
    result = await edit_images(
        images=["https://example.com/person.jpg"],
        edit_prompt="Transform this person into a medieval knight in shining armor in a castle setting"
    )

    # Multiple style variations from one reference
    result = await edit_images(
        images=["https://example.com/image.jpg"],
        edit_prompt="Create variations: watercolor, oil painting, and digital art styles",
        n=3
    )
    ```

    **🛠️ TECHNICAL EDITING EXAMPLES:**
    ```python
    # Precise background removal
    result = await edit_images(
        images=["https://example.com/image.jpg"],
        edit_prompt="Remove the background completely",
        background="transparent",
        output_format="png"
    )

    # Mask-based selective editing
    result = await edit_images(
        images=["https://example.com/image.jpg"],
        edit_prompt="Change only the sky to a sunset",
        mask="https://example.com/sky-mask.png"
    )

    # High-quality professional editing
    result = await edit_images(
        images=["https://example.com/image.jpg"],
        edit_prompt="Professional photo retouching - enhance lighting and colors",
        quality="high",
        output_format="jpeg"
    )
    ```

    **💡 CREATIVE USE CASES:**
    - **Style Matching**: "Make this photo look like [specific artist/style]"
    - **Mood Transfer**: "Apply the atmosphere of a [genre] movie"
    - **Era Transformation**: "Make this look like it's from the [time period]"
    - **Genre Conversion**: "Transform to [art style/medium]"
    - **Context Switching**: "Place this subject in a [different environment]"
    - **Artistic Interpretation**: "Reimagine this as [artistic movement]"

    **GPT-1 Features (Default Model):**
    - Supports up to 16 images simultaneously
    - Advanced transparency control with background parameter
    - Multiple output formats (PNG, JPEG, WebP)
    - Quality and compression control
    - Mask-based editing for precise control
    - Multiple size options including landscape/portrait
    - Can generate multiple variations per input (n parameter)
    - 32,000 character prompt limit

    **Gemini Features:**
    - Excellent for conversational and contextual editing
    - Natural language understanding for complex transformations
    - Includes SynthID watermark
    - Great for artistic and creative interpretations

    **Technical Specifications:**
    - GPT-1: PNG/WebP/JPG files < 50MB each, up to 16 images
    - Gemini: URLs or base64 images, unlimited size
    - All models: Concurrent processing for multiple images
    - Output: High-resolution edited images saved to user directory
    """
    import os
    import hashlib
    import re
    import uuid
    import asyncio
    import base64
    import requests
    from PIL import Image
    from io import BytesIO
    from typing import Dict, Any

    # Use default user number if empty or placeholder
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"

    # Validate inputs
    if not isinstance(images, list):
        return {"status": "error", "message": "'images' argument must be a list.", "results": []}
    if not images:
        return {"status": "success", "message": "No images provided to edit.", "results": []}
    
    if model not in ["gpt-image-1", "gemini"]:
        return {"status": "error", "message": f"Unsupported model '{model}'. Use 'gpt-image-1' or 'gemini'.", "results": []}

    # Validate GPT-1 specific parameters
    if model == "gpt-image-1":
        if len(images) > 16:
            return {"status": "error", "message": "GPT-1 supports maximum 16 images per request.", "results": []}
        if len(edit_prompt) > 32000:
            return {"status": "error", "message": "GPT-1 prompt must be 32,000 characters or less.", "results": []}
        if background not in ["transparent", "opaque", "auto"]:
            return {"status": "error", "message": "Background must be 'transparent', 'opaque', or 'auto'.", "results": []}
        if output_format not in ["png", "jpeg", "webp"]:
            return {"status": "error", "message": "Output format must be 'png', 'jpeg', or 'webp'.", "results": []}
        if quality not in ["auto", "high", "medium", "low"]:
            return {"status": "error", "message": "Quality must be 'auto', 'high', 'medium', or 'low'.", "results": []}
        if not (0 <= output_compression <= 100):
            return {"status": "error", "message": "Output compression must be between 0 and 100.", "results": []}
        if size not in ["auto", "1024x1024", "1536x1024", "1024x1536", "1536x1536"]:
            return {"status": "error", "message": "Size must be 'auto', '1024x1024', '1536x1024', '1024x1536', or '1536x1536'.", "results": []}
        if not (1 <= n <= 10):
            return {"status": "error", "message": "n must be between 1 and 10.", "results": []}

    # --- Sanitize function for user number ---
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

    if model == "gpt-image-1":
        # --- OpenAI GPT-1 Image Editing Logic ---
        openai_api_key = os.environ.get("OPENAI_API_KEY")
        if not openai_api_key:
            return {"status": "error", "message": "OPENAI_API_KEY environment variable not set for gpt-image-1 model.", "results": []}
        
        try:
            client = OpenAI(api_key=openai_api_key)
        except Exception as e:
            return {"status": "error", "message": f"Failed to initialize OpenAI client: {str(e)}", "results": []}

        async def _process_single_image_edit_gpt1(image_input: str) -> Dict[str, Any]:
            try:
                # --- Download or decode the image ---
                if image_input.startswith("http://") or image_input.startswith("https://"):
                    resp = await asyncio.to_thread(requests.get, image_input, timeout=20)
                    resp.raise_for_status()
                    img_bytes = resp.content
                    
                    # Validate content type
                    content_type = resp.headers.get('Content-Type', '')
                    if not content_type.startswith('image/'):
                        return {"status": "error", "original_image": image_input, "message": f"URL does not point to an image (content type: {content_type})"}
                elif len(image_input) > 100 and image_input.endswith(('=', '==')):
                    try:
                        img_bytes = base64.b64decode(image_input)
                    except Exception as e:
                        return {"status": "error", "original_image": image_input, "message": f"Invalid base64 image data: {e}"}
                else:
                    return {"status": "error", "original_image": image_input, "message": "Invalid image input: not a valid URL or recognizable base64."}

                # Validate image format and size
                try:
                    img = await asyncio.to_thread(Image.open, BytesIO(img_bytes))
                    
                    # Check file size (50MB limit for GPT-1)
                    if len(img_bytes) > 50 * 1024 * 1024:
                        return {"status": "error", "original_image": image_input, "message": "Image file size exceeds 50MB limit for GPT-1."}
                    
                    # Convert to supported format if needed (PNG, WebP, JPG)
                    if img.format not in ['PNG', 'WEBP', 'JPEG']:
                        # Convert to PNG
                        img_buffer = BytesIO()
                        img.save(img_buffer, format='PNG')
                        img_bytes = img_buffer.getvalue()
                        
                except Exception as e:
                    return {"status": "error", "original_image": image_input, "message": f"Could not process image: {e}"}

                # --- Prepare mask if provided ---
                mask_bytes = None
                if mask:
                    try:
                        if mask.startswith("http://") or mask.startswith("https://"):
                            mask_resp = await asyncio.to_thread(requests.get, mask, timeout=20)
                            mask_resp.raise_for_status()
                            mask_bytes = mask_resp.content
                        elif len(mask) > 100 and mask.endswith(('=', '==')):
                            mask_bytes = base64.b64decode(mask)
                        
                        # Validate mask is PNG
                        if mask_bytes:
                            mask_img = await asyncio.to_thread(Image.open, BytesIO(mask_bytes))
                            if mask_img.format != 'PNG':
                                return {"status": "error", "original_image": image_input, "message": "Mask must be a PNG file."}
                            
                            # Check mask dimensions match image
                            if mask_img.size != img.size:
                                return {"status": "error", "original_image": image_input, "message": "Mask dimensions must match image dimensions."}
                    except Exception as e:
                        return {"status": "error", "original_image": image_input, "message": f"Could not process mask: {e}"}

                # Detect the actual image format from the bytes
                img_pil = await asyncio.to_thread(Image.open, BytesIO(img_bytes))
                img_format = img_pil.format
                
                # Prepare image file with proper format
                if img_format == 'JPEG':
                    image_file = BytesIO(img_bytes)
                    image_file.name = "image.jpg"
                elif img_format == 'PNG':
                    image_file = BytesIO(img_bytes)
                    image_file.name = "image.png"
                elif img_format == 'WEBP':
                    image_file = BytesIO(img_bytes)
                    image_file.name = "image.webp"
                else:
                    # Convert unsupported formats to JPEG
                    print(f"Converting {img_format} to JPEG for GPT-1 compatibility")
                    if img_pil.mode in ('RGBA', 'LA', 'P'):
                        # Convert to RGB for JPEG
                        rgb_img = Image.new('RGB', img_pil.size, (255, 255, 255))
                        if img_pil.mode == 'P':
                            img_pil = img_pil.convert('RGBA')
                        rgb_img.paste(img_pil, mask=img_pil.split()[-1] if img_pil.mode == 'RGBA' else None)
                        img_pil = rgb_img
                    
                    # Save as JPEG
                    jpeg_buffer = BytesIO()
                    await asyncio.to_thread(img_pil.save, jpeg_buffer, format='JPEG', quality=95)
                    img_bytes = jpeg_buffer.getvalue()
                    image_file = BytesIO(img_bytes)
                    image_file.name = "image.jpg"
                    img_format = 'JPEG'  # Update format after conversion

                # --- Call OpenAI Image Edit API ---
                try:
                    print(f"🎨 GPT-1 editing image: '{image_input[:50]}...' with prompt: '{edit_prompt[:50]}...'")
                    print(f"📋 Image details: format={img_format}, size={len(img_bytes)} bytes, filename={image_file.name}")
                    
                    # Prepare API call parameters
                    api_params = {
                        "model": "gpt-image-1",
                        "prompt": edit_prompt,
                        "n": n
                        # Note: gpt-image-1 automatically returns b64_json format, no response_format parameter needed
                    }
                    
                    # Add GPT-1 specific parameters
                    if background != "auto":
                        api_params["background"] = background
                    if output_format != "png":
                        api_params["output_format"] = output_format
                    if quality != "auto":
                        api_params["quality"] = quality
                    if output_compression != 100 and output_format in ["webp", "jpeg"]:
                        api_params["output_compression"] = output_compression
                    if size != "auto":
                        api_params["size"] = size

                    # Add mask if provided
                    if mask_bytes:
                        mask_file = BytesIO(mask_bytes)
                        mask_file.name = "mask.png"
                        api_params["mask"] = mask_file

                    # Make API call
                    response = await asyncio.to_thread(
                        client.images.edit,
                        image=image_file,
                        **api_params
                    )
                    
                    if not response.data:
                        return {"status": "error", "original_image": image_input, "message": "No edited images returned by GPT-1."}

                    # --- Process and save edited images ---
                    edited_urls = []
                    for i, image_data in enumerate(response.data):
                        if not image_data.b64_json:
                            print(f"Warning: No base64 data for edited image {i}")
                            continue
                            
                        try:
                            # Decode base64 image
                            edited_img_bytes = base64.b64decode(image_data.b64_json)
                            edited_img = await asyncio.to_thread(Image.open, BytesIO(edited_img_bytes))
                            
                            # Save edited image
                            filename = f"gpt1_edit_{uuid.uuid4().hex[:8]}_{i}.{output_format}"
                            file_path = os.path.join(image_dir, filename)
                            
                            # Save with appropriate format
                            save_format = output_format.upper()
                            if save_format == "JPEG":
                                save_format = "JPEG"
                                # Convert RGBA to RGB for JPEG
                                if edited_img.mode == "RGBA":
                                    rgb_img = Image.new("RGB", edited_img.size, (255, 255, 255))
                                    rgb_img.paste(edited_img, mask=edited_img.split()[-1])
                                    edited_img = rgb_img
                            
                            await asyncio.to_thread(edited_img.save, file_path, format=save_format)
                            
                            url = f"{DOMAIN}/user_data/{user_number_safe}/edited_images/{filename}"
                            edited_urls.append(url)
                            
                        except Exception as e:
                            print(f"Error saving edited image {i}: {e}")
                            continue
                    
                    if not edited_urls:
                        return {"status": "error", "original_image": image_input, "message": "Failed to save any edited images."}
                    
                    print(f"✅ GPT-1 Success: Generated {len(edited_urls)} edited images")
                    
                    # Return first URL for single image, or all URLs for multiple
                    primary_url = edited_urls[0] if edited_urls else None
                    message = f"Successfully edited with GPT-1. Generated {len(edited_urls)} variation(s)."
                    
                    return {
                        "status": "success",
                        "original_image": image_input,
                        "edited_url": primary_url,
                        "all_edited_urls": edited_urls,  # Include all variations
                        "message": message
                    }
                    
                except Exception as e:
                    error_str = str(e)
                    print(f"❌ GPT-1 API error for image '{image_input}': {error_str}")
                    return {"status": "error", "original_image": image_input, "message": f"GPT-1 API error: {error_str}"}

            except Exception as e:
                print(f"❌ Unexpected error processing image '{image_input}': {e}")
                return {"status": "error", "original_image": image_input, "message": f"Unexpected error: {e}"}

        # --- Process all images concurrently with GPT-1 ---
        tasks = [_process_single_image_edit_gpt1(img_input) for img_input in images]
        individual_results = await asyncio.gather(*tasks, return_exceptions=False)

    else:
        # --- Gemini Image Editing Logic (rewritten implementation) ---
        try:
            client = genai.Client() # Initialize client within the try block
        except Exception as e:
            return {"status": "error", "message": f"Failed to initialize Gemini client: {e}", "results": []}

        async def _process_single_image_edit_gemini(image_input: str) -> Dict[str, Any]:
            try:
                # --- Download or decode the image ---
                if image_input.startswith("http://") or image_input.startswith("https://"):
                    resp = await asyncio.to_thread(requests.get, image_input, timeout=20)
                    resp.raise_for_status()
                    img_bytes = resp.content
                elif len(image_input) > 100 and image_input.endswith(('=', '==')):
                    img_bytes = base64.b64decode(image_input)
                else:
                    return {"status": "error", "original_image": image_input, "message": "Invalid image input: not a valid URL or recognizable base64."}

                img = await asyncio.to_thread(Image.open, BytesIO(img_bytes))

            except requests.exceptions.RequestException as e:
                return {"status": "error", "original_image": image_input, "message": f"Could not download image: {e}"}
            except Exception as e:
                return {"status": "error", "original_image": image_input, "message": f"Could not load/decode image: {e}"}

            # Ensure img is not None before proceeding
            if img is None:
                return {"status": "error", "original_image": image_input, "message": "Image could not be loaded or decoded properly."}

            # --- Call Gemini for image editing ---
            try:
                response = await asyncio.to_thread(
                    client.models.generate_content,
                    model="gemini-2.0-flash-preview-image-generation",
                    contents=[edit_prompt, img]
                )
            except Exception as e:
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
                            print(f"Failed to open image data from Gemini response: {e}")
                            continue
            
            if edited_image_pil is None:
                text_response = response.text if hasattr(response, 'text') else "No text content."
                return {"status": "error", "original_image": image_input, "message": f"No image returned by Gemini. Model response: {text_response}"}

            # --- Save the edited image ---
            try:
                filename = f"gemini_edit_{uuid.uuid4().hex[:8]}.png"
                file_path = os.path.join(image_dir, filename)
                await asyncio.to_thread(edited_image_pil.save, file_path, format="PNG")
                
                url = f"{DOMAIN}/user_data/{user_number_safe}/edited_images/{filename}"
                return {
                    "status": "success",
                    "original_image": image_input,
                    "edited_url": url,
                    "message": "Image edited successfully with Gemini."
                }
            except Exception as e:
                return {"status": "error", "original_image": image_input, "message": f"Failed to save edited image: {e}"}

        # --- Process all images concurrently with Gemini ---
        tasks = [_process_single_image_edit_gemini(img_input) for img_input in images]
        individual_results = await asyncio.gather(*tasks, return_exceptions=False)

    # --- Process overall results ---
    any_errors = any(res.get("status") == "error" for res in individual_results)
    all_successful = all(res.get("status") == "success" for res in individual_results)

    if all_successful:
        overall_status = "success"
        overall_message = f"All {len(images)} images edited successfully with {model}."
    elif any_errors and not all_successful:
        overall_status = "partial_error"
        overall_message = f"Some images failed to edit with {model}. Check results for details."
    else:
        overall_status = "error"
        overall_message = f"All image edits failed with {model}. Check results for details."

    return {
        "status": overall_status,
        "message": overall_message,
        "results": individual_results
    }


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