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
# Replicate client for FLUX 1.1 Pro
import replicate
# import base64 # Already imported globally

# Simple in-memory cache for image analysis results (speeds up repeated requests)
_analysis_cache = {}
_cache_max_size = 1000  # Limit cache size to prevent memory issues

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
    OPTIMIZED for speed with concurrent processing, image compression, and batch operations.
    Args:
        urls (list): List of image URLs to analyze.
        analysis_prompt (str): Instructions for how Gemini should analyze the images.
    Returns:
        dict: {"status": "success", "results": [ ... ]} or {"status": "error", "message": ...}
    """
    from llm_adapters import get_llm_adapter, StandardizedMessage, StandardizedLLMConfig, AttachmentPart
    import aiohttp
    import asyncio
    from concurrent.futures import ThreadPoolExecutor

    # Use a shared HTTP session for connection pooling
    connector = aiohttp.TCPConnector(limit=50, limit_per_host=10)
    timeout = aiohttp.ClientTimeout(total=8)  # Reduced timeout for faster failures
    
    async def analyze_single_image(session, url, semaphore):
        async with semaphore:  # Limit concurrent operations
            try:
                # Check cache first for speed
                cache_key = hashlib.md5(f"{url}:{analysis_prompt}".encode()).hexdigest()
                if cache_key in _analysis_cache:
                    print(f"🚀 Cache hit for image analysis: {url[:50]}...")
                    return _analysis_cache[cache_key]
                
                # Faster HTTP download with aiohttp
                async with session.get(url, timeout=timeout) as response:
                    if response.status != 200:
                        return {"status": "error", "message": f"HTTP {response.status}", "url": url}
                    
                    content_type = response.headers.get('Content-Type', '')
                    if not content_type.startswith('image/'):
                        return {"status": "error", "message": f"Not an image (content type: {content_type})", "url": url}
                    
                    # Read image data
                    image_data = await response.read()
                    
                    # Quick size check before processing
                    if len(image_data) > 10 * 1024 * 1024:  # 10MB limit for speed
                        return {"status": "error", "message": "Image too large (>10MB)", "url": url}

                # Process image in thread pool for CPU-bound operations
                def process_image():
                    try:
                        image = Image.open(BytesIO(image_data))
                        
                        # Resize large images for faster processing (maintain aspect ratio)
                        max_size = 1024  # Reduced from original size for speed
                        if max(image.size) > max_size:
                            ratio = max_size / max(image.size)
                            new_size = tuple(int(dim * ratio) for dim in image.size)
                            image = image.resize(new_size, Image.Resampling.LANCZOS)
                        
                        # Convert to RGB if needed and compress
                        if image.mode in ('RGBA', 'LA', 'P'):
                            rgb_image = Image.new('RGB', image.size, (255, 255, 255))
                            if image.mode == 'P':
                                image = image.convert('RGBA')
                            if image.mode in ('RGBA', 'LA'):
                                rgb_image.paste(image, mask=image.split()[-1])
                            image = rgb_image
                        
                        # Save as compressed JPEG for faster transmission
                        img_bytes_io = BytesIO()
                        image.save(img_bytes_io, format='JPEG', quality=75, optimize=True)  # Reduced quality for speed
                        return img_bytes_io.getvalue()
                    except Exception as e:
                        raise Exception(f"Image processing error: {e}")

                # Process image in thread pool
                with ThreadPoolExecutor(max_workers=4) as executor:
                    img_bytes = await asyncio.get_event_loop().run_in_executor(executor, process_image)

                # Use the adapter for Gemini LLM call - using Flash-Lite for faster analysis
                adapter = get_llm_adapter("gemini-2.5-flash-lite-preview-06-17")
                attachment = AttachmentPart(mime_type="image/jpeg", data=img_bytes, name=url)
                history = [
                    StandardizedMessage(
                        role="user",
                        content=analysis_prompt,
                        attachments=[attachment]
                    )
                ]
                llm_config = StandardizedLLMConfig()
                llm_response = await adapter.generate_content(
                    model_name="gemini-2.5-flash-lite-preview-06-17",
                    history=history,
                    tools=None,
                    config=llm_config
                )
                analysis = llm_response.text_content
                if llm_response.error:
                    return {"status": "error", "message": f"LLM error: {llm_response.error}", "url": url}
                
                # Cache successful result for future requests
                result = {"status": "success", "analysis": analysis, "url": url}
                
                # Manage cache size
                if len(_analysis_cache) >= _cache_max_size:
                    # Remove oldest entries (simple FIFO)
                    oldest_key = next(iter(_analysis_cache))
                    del _analysis_cache[oldest_key]
                
                _analysis_cache[cache_key] = result
                return result
                
            except asyncio.TimeoutError:
                return {"status": "error", "message": "Request timeout", "url": url}
            except Exception as e:
                return {"status": "error", "message": f"Error analyzing image: {str(e)}", "url": url}

    if not isinstance(urls, list):
        return {"status": "error", "message": "urls must be a list of image URLs."}
    
    # Limit concurrent operations to prevent overwhelming the system
    semaphore = asyncio.Semaphore(10)  # Process up to 10 images concurrently
    
    async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
        tasks = [analyze_single_image(session, url, semaphore) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=False)
    
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

def strip_markdown(text):
    """Remove markdown formatting from text for image generation prompts."""
    if not isinstance(text, str):
        return text
    
    # Remove markdown formatting
    text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)  # **bold** -> bold
    text = re.sub(r'\*([^*]+)\*', r'\1', text)      # *italic* -> italic
    text = re.sub(r'_([^_]+)_', r'\1', text)        # _italic_ -> italic
    text = re.sub(r'__([^_]+)__', r'\1', text)      # __bold__ -> bold
    text = re.sub(r'`([^`]+)`', r'\1', text)        # `code` -> code
    text = re.sub(r'```[^`]*```', '', text)         # Remove code blocks
    text = re.sub(r'~~([^~]+)~~', r'\1', text)      # ~~strikethrough~~ -> strikethrough
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)  # [link text](url) -> link text
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)  # Remove headers
    text = re.sub(r'^\s*[-*+]\s+', '', text, flags=re.MULTILINE)  # Remove list markers
    text = re.sub(r'^\s*\d+\.\s+', '', text, flags=re.MULTILINE)  # Remove numbered list markers
    text = re.sub(r'^\s*>\s+', '', text, flags=re.MULTILINE)  # Remove blockquotes
    
    # Clean up extra whitespace
    text = re.sub(r'\n\s*\n', '\n', text)  # Multiple newlines to single
    text = text.strip()
    
    return text

async def qa_check_spelling(image_url: str, original_prompt: str) -> dict:
    """
    Check an image for spelling mistakes using Gemini 2.5 Flash-Lite vision.
    OPTIMIZED for speed with faster downloads and compressed images.
    
    Args:
        image_url: URL of the image to check
        original_prompt: The original prompt used to generate the image
        
    Returns:
        dict: {"has_errors": bool, "errors": list, "analysis": str}
    """
    try:
        from llm_adapters import get_llm_adapter, StandardizedMessage, StandardizedLLMConfig, AttachmentPart
        import aiohttp
        from concurrent.futures import ThreadPoolExecutor
        
        # Faster HTTP download with aiohttp
        timeout = aiohttp.ClientTimeout(total=6)  # Reduced timeout for QA checks
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(image_url) as response:
                if response.status != 200:
                    return {"has_errors": False, "errors": [], "analysis": f"Could not download image: HTTP {response.status}"}
                
                content_type = response.headers.get('Content-Type', '')
                if not content_type.startswith('image/'):
                    return {"has_errors": False, "errors": [], "analysis": "Could not analyze: not an image"}
                
                image_data = await response.read()
        
        # Process image for faster analysis
        def compress_image():
            try:
                image = Image.open(BytesIO(image_data))
                
                # Resize for faster QA processing (text is still readable at smaller sizes)
                max_size = 800  # Smaller size for QA checks
                if max(image.size) > max_size:
                    ratio = max_size / max(image.size)
                    new_size = tuple(int(dim * ratio) for dim in image.size)
                    image = image.resize(new_size, Image.Resampling.LANCZOS)
                
                # Convert to RGB and compress for faster transmission
                if image.mode in ('RGBA', 'LA', 'P'):
                    rgb_image = Image.new('RGB', image.size, (255, 255, 255))
                    if image.mode == 'P':
                        image = image.convert('RGBA')
                    if image.mode in ('RGBA', 'LA'):
                        rgb_image.paste(image, mask=image.split()[-1])
                    image = rgb_image
                
                # Compress for faster analysis
                img_bytes_io = BytesIO()
                image.save(img_bytes_io, format='JPEG', quality=85, optimize=True)
                return img_bytes_io.getvalue()
            except Exception as e:
                raise Exception(f"Image compression error: {e}")
        
        # Compress image in thread pool
        with ThreadPoolExecutor(max_workers=2) as executor:
            compressed_image_data = await asyncio.get_event_loop().run_in_executor(executor, compress_image)
        
        # Create shorter, more focused analysis prompt for speed
        analysis_prompt = f"""Quick spelling check for this image.

Original prompt: "{original_prompt[:200]}..."

Check for spelling errors in visible text. Respond with:
- "SPELLING_ERRORS_FOUND" if errors exist
- "NO_SPELLING_ERRORS" if text is correct  
- "NO_TEXT_VISIBLE" if no readable text

Be quick and focus only on obvious spelling mistakes."""

        # Use Gemini 2.5 Flash-Lite for faster analysis
        adapter = get_llm_adapter("gemini-2.5-flash-lite-preview-06-17")
        attachment = AttachmentPart(
            mime_type="image/jpeg", 
            data=compressed_image_data, 
            name=f"qa_check_{image_url.split('/')[-1]}"
        )
        
        history = [
            StandardizedMessage(
                role="user",
                content=analysis_prompt,
                attachments=[attachment]
            )
        ]
        
        llm_config = StandardizedLLMConfig()
        llm_response = await adapter.generate_content(
            model_name="gemini-2.5-flash-lite-preview-06-17",
            history=history,
            tools=None,
            config=llm_config
        )
        
        if llm_response.error:
            print(f"❌ QA Check Error: {llm_response.error}")
            return {"has_errors": False, "errors": [], "analysis": f"Analysis failed: {llm_response.error}"}
        
        analysis_text = llm_response.text_content or ""
        
        # Parse the response
        has_errors = "SPELLING_ERRORS_FOUND" in analysis_text
        no_text = "NO_TEXT_VISIBLE" in analysis_text
        
        # Extract specific errors (simple parsing)
        errors = []
        if has_errors:
            lines = analysis_text.split('\n')
            for line in lines:
                if any(keyword in line.lower() for keyword in ['error', 'mistake', 'misspelled', 'incorrect', 'wrong']):
                    errors.append(line.strip())
        
        print(f"🔍 QA Check Result: {'ERRORS FOUND' if has_errors else 'NO ERRORS' if not no_text else 'NO TEXT'}")
        if errors:
            print(f"   Errors: {errors}")
        
        return {
            "has_errors": has_errors,
            "errors": errors,
            "analysis": analysis_text,
            "no_text": no_text
        }
        
    except Exception as e:
        print(f"❌ QA Check Exception: {e}")
        return {"has_errors": False, "errors": [], "analysis": f"QA check failed: {str(e)}"}

async def _generate_images_with_prompts_concurrent(user_number, prompts, model_version="imagen-4.0-generate-preview-06-06", input_images=None, aspect_ratio="16:9", quality="auto", output_format="png", output_compression=100, moderation="auto"):
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
    
    # Strip markdown formatting from all prompts
    cleaned_prompts = [strip_markdown(prompt) for prompt in prompts]
    print(f"🧹 Cleaned {len(prompts)} prompts by removing markdown formatting")
    
    # Use cleaned prompts for generation
    prompts = cleaned_prompts
    
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
        
        async def generate_for_single_prompt_openai_image_api(prompt_text, prompt_idx_openai):
            try:
                print(f"🎯 OpenAI (Image API) Prompt #{prompt_idx_openai}: '{prompt_text[:50]}...'")
                start_time_openai = time.time()
                
                gpt_size = "1024x1024"
                if aspect_ratio == "16:9": gpt_size = "1536x1024"
                elif aspect_ratio == "9:16": gpt_size = "1024x1536"
                elif aspect_ratio == "4:3": gpt_size = "1536x1024" 
                elif aspect_ratio == "3:4": gpt_size = "1024x1536" 
                elif aspect_ratio == "3:2": gpt_size = "1536x1024" 
                elif aspect_ratio == "2:3": gpt_size = "1024x1536"
                elif aspect_ratio == "1:1": gpt_size = "1024x1024"

                # Check if we have input images for this prompt
                input_image_files = []
                if input_images and prompt_idx_openai < len(input_images):
                    current_input_image_sources = input_images[prompt_idx_openai]
                    if not isinstance(current_input_image_sources, list):
                         current_input_image_sources = [current_input_image_sources]

                    for source_index, image_source_url_or_b64 in enumerate(current_input_image_sources):
                        print(f"🖼️ Processing input_image #{source_index} for OpenAI Image API: {str(image_source_url_or_b64)[:70]}...")
                        img_bytes = None
                        
                        try:
                            if str(image_source_url_or_b64).startswith("data:image"):
                                # Extract base64 data from data URL
                                base64_data = image_source_url_or_b64.split(',')[1]
                                img_bytes = base64.b64decode(base64_data)
                            elif str(image_source_url_or_b64).startswith("http://") or str(image_source_url_or_b64).startswith("https://"):
                                resp = await asyncio.to_thread(requests.get, image_source_url_or_b64, timeout=20)
                                resp.raise_for_status()
                                img_bytes = resp.content
                            elif len(str(image_source_url_or_b64)) > 100: # Assume raw base64
                                img_bytes = base64.b64decode(image_source_url_or_b64)
                            else:
                                print(f"⚠️ Invalid input_image format for prompt #{prompt_idx_openai}, source #{source_index}. Skipping.")
                                continue

                            if img_bytes:
                                # Create a BytesIO object for the Image API
                                img_file = BytesIO(img_bytes)
                                img_file.name = f"input_image_{source_index}.png"
                                input_image_files.append(img_file)
                                print(f"✅ Added input image #{source_index} for Image API (size: {len(img_bytes)} bytes)")

                        except Exception as e_proc_img:
                            print(f"⚠️ Failed to process input_image source #{source_index} for prompt #{prompt_idx_openai}: {e_proc_img}")
                
                # 🔍 DEBUG: Log what parameters are being sent to OpenAI Image API
                api_params = {
                    "model": "gpt-image-1",
                    "prompt": prompt_text,
                    "size": gpt_size,
                    "quality": quality if quality != "auto" else "standard",
                    "n": 1
                }
                
                print(f"🔧 OpenAI Image API Parameters being sent:")
                for key, value in api_params.items():
                    if key == "prompt":
                        print(f"   {key}: {value[:100]}..." if len(value) > 100 else f"   {key}: {value}")
                    else:
                        print(f"   {key}: {value}")
                
                # Debug input content
                print(f"📝 Input summary:")
                print(f"   Prompt length: {len(prompt_text)} chars")
                print(f"   Input images: {len(input_image_files)}")
                
                # Check if prompt might be too long or contain problematic content
                if len(prompt_text) > 4000:
                    print(f"⚠️ Warning: Prompt is very long ({len(prompt_text)} chars)")
                
                # Check for potential content issues
                problematic_terms = ["realistic", "photorealistic", "real person", "actual person"]
                for term in problematic_terms:
                    if term.lower() in prompt_text.lower():
                        print(f"⚠️ Warning: Prompt contains potentially problematic term: '{term}'")

                # Call the appropriate API endpoint based on whether we have input images
                if input_image_files:
                    # Use the edits endpoint for image-to-image generation
                    print(f"🔄 Using Image API edits endpoint with {len(input_image_files)} input image(s)")
                    
                    # For edits, we use the first input image as the base
                    base_image = input_image_files[0]
                    base_image.seek(0)  # Reset file pointer
                    
                    response_openai = await asyncio.to_thread(
                        client.images.edit,
                        image=base_image,
                        prompt=prompt_text,
                        model="gpt-image-1",
                        size=gpt_size,
                        n=1
                    )
                else:
                    # Use the generations endpoint for text-to-image
                    print(f"🎨 Using Image API generations endpoint")
                    
                    response_openai = await asyncio.to_thread(
                        client.images.generate,
                        **api_params
                    )

                end_time_openai = time.time()
                duration_openai = end_time_openai - start_time_openai
                print(f"✅ OpenAI Image API CALL COMPLETE - Prompt #{prompt_idx_openai} (took {duration_openai:.2f}s)")

                # Extract the generated image
                if not response_openai.data or len(response_openai.data) == 0:
                    return {"error": f"OpenAI Image API did not return any image data for prompt: {prompt_text[:100]}..."}

                generated_image_b64 = response_openai.data[0].b64_json
                if not generated_image_b64:
                    return {"error": f"OpenAI Image API returned empty image data for prompt: {prompt_text[:100]}..."}

                # Process and save the image
                image_bytes_data = base64.b64decode(generated_image_b64)
                pil_image_obj = Image.open(BytesIO(image_bytes_data))
                
                filename_openai = f"gpt_image_api_{uuid.uuid4().hex[:8]}.png"
                local_path_openai = os.path.join(image_dir, filename_openai)
                await asyncio.to_thread(pil_image_obj.save, local_path_openai, format="PNG")
                
                image_url_openai = f"{DOMAIN}/user_data/{user_number_safe}/images/{filename_openai}"
                print(f"✅ OpenAI (Image API) Success: Prompt #{prompt_idx_openai}. Generated image: {image_url_openai}")
                
                # QA Check for spelling mistakes
                print(f"🔍 Starting QA check for spelling mistakes...")
                qa_result = await qa_check_spelling(image_url_openai, prompt_text)
                
                if qa_result["has_errors"]:
                    print(f"❌ QA Check: Spelling errors detected in image {prompt_idx_openai}")
                    print(f"   Errors: {qa_result['errors']}")
                    print(f"🔄 Regenerating image to fix spelling errors...")
                    
                    # Try regeneration once
                    try:
                        regeneration_prompt = f"{prompt_text}\n\nIMPORTANT: Pay special attention to correct spelling of all text. Double-check every word for spelling accuracy."
                        
                        if input_image_files:
                            # Reset file pointer for regeneration
                            base_image.seek(0)
                            regeneration_response = await asyncio.to_thread(
                                client.images.edit,
                                image=base_image,
                                prompt=regeneration_prompt,
                                model="gpt-image-1",
                                size=gpt_size,
                                n=1
                            )
                        else:
                            regeneration_response = await asyncio.to_thread(
                                client.images.generate,
                                model="gpt-image-1",
                                prompt=regeneration_prompt,
                                size=gpt_size,
                                quality=quality if quality != "auto" else "standard",
                                n=1
                            )
                        
                        if regeneration_response.data and regeneration_response.data[0].b64_json:
                            # Save regenerated image
                            regenerated_image_bytes = base64.b64decode(regeneration_response.data[0].b64_json)
                            regenerated_pil_image = Image.open(BytesIO(regenerated_image_bytes))
                            
                            regenerated_filename = f"gpt_image_api_fixed_{uuid.uuid4().hex[:8]}.png"
                            regenerated_local_path = os.path.join(image_dir, regenerated_filename)
                            await asyncio.to_thread(regenerated_pil_image.save, regenerated_local_path, format="PNG")
                            
                            regenerated_url = f"{DOMAIN}/user_data/{user_number_safe}/images/{regenerated_filename}"
                            print(f"✅ Successfully regenerated image with corrected spelling: {regenerated_url}")
                            
                            # Remove the original image with errors
                            try:
                                os.remove(local_path_openai)
                                print(f"🗑️ Removed original image with spelling errors")
                            except Exception:
                                pass
                            
                            return [regenerated_url]
                        else:
                            print(f"⚠️ Regeneration failed, keeping original image despite spelling errors")
                    except Exception as regen_error:
                        print(f"⚠️ Regeneration failed: {regen_error}, keeping original image")
                else:
                    print(f"✅ QA Check: No spelling errors detected in image {prompt_idx_openai}")
                
                return [image_url_openai]

            except Exception as e_openai:
                error_str_openai = str(e_openai)
                print(f"❌ OpenAI (Image API) Error Type: {type(e_openai).__name__}")
                print(f"❌ OpenAI (Image API) Error: Prompt #{prompt_idx_openai} ('{prompt_text[:30]}...'): {error_str_openai}")
                import traceback
                print(traceback.format_exc())
                return {"error": f"OpenAI image generation via Image API failed for prompt '{prompt_text}': {error_str_openai}"}

        openai_tasks = [generate_for_single_prompt_openai_image_api(p, i) for i, p in enumerate(prompts)]
        
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

    elif model_version == "flux-1.1-pro":
        # --- FLUX 1.1 Pro Logic via Replicate ---
        replicate_api_token = os.environ.get("REPLICATE_API_KEY")
        if not replicate_api_token:
            print("Error: REPLICATE_API_KEY environment variable not set.")
            return {"status": "error", "message": "REPLICATE_API_KEY environment variable not set for flux-1.1-pro model."}
        
        try:
            # Initialize the replicate client with the API token
            replicate_client = replicate.Client(api_token=replicate_api_token)
        except Exception as e:
            print(f"Error initializing Replicate client: {str(e)}")
            return {"status": "error", "message": f"Failed to initialize Replicate client: {str(e)}"}

        all_prompt_results = []
        any_errors_flux = False
        
        async def generate_for_single_prompt_flux(prompt_text, prompt_idx_flux):
            try:
                print(f"🎯 FLUX 1.1 Pro Prompt #{prompt_idx_flux}: '{prompt_text[:50]}...'")
                start_time_flux = time.time()
                
                # Map aspect ratio to FLUX format (FLUX supports standard ratios)
                flux_aspect_ratio = aspect_ratio
                valid_flux_ratios = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"]
                if aspect_ratio not in valid_flux_ratios:
                    flux_aspect_ratio = "16:9"  # Default fallback
                
                # Prepare input for FLUX 1.1 Pro
                flux_input = {
                    "prompt": prompt_text,
                    "aspect_ratio": flux_aspect_ratio,
                    "prompt_upsampling": True,  # Enable prompt enhancement
                    "safety_tolerance": 2,  # Moderate safety filtering
                    "output_format": "jpg",  # FLUX outputs JPG
                    "output_quality": 95  # High quality
                }
                
                # Add image prompt if input_images provided
                if input_images and prompt_idx_flux < len(input_images):
                    current_input_image_sources = input_images[prompt_idx_flux]
                    if not isinstance(current_input_image_sources, list):
                        current_input_image_sources = [current_input_image_sources]
                    
                    # FLUX 1.1 Pro supports image_prompt parameter
                    if current_input_image_sources:
                        image_source = current_input_image_sources[0]  # Use first image as reference
                        print(f"🖼️ Using input image for FLUX: {str(image_source)[:70]}...")
                        flux_input["image_prompt"] = image_source
                
                print(f"🔧 FLUX 1.1 Pro Parameters:")
                for key, value in flux_input.items():
                    if key == "prompt":
                        print(f"   {key}: {value[:100]}..." if len(value) > 100 else f"   {key}: {value}")
                    elif key == "image_prompt":
                        print(f"   {key}: {str(value)[:50]}...")
                    else:
                        print(f"   {key}: {value}")
                
                # Call FLUX 1.1 Pro via Replicate
                response_flux = await asyncio.to_thread(
                    replicate_client.run,
                    "black-forest-labs/flux-1.1-pro",
                    input=flux_input
                )
                
                end_time_flux = time.time()
                duration_flux = end_time_flux - start_time_flux
                print(f"✅ FLUX 1.1 Pro API CALL COMPLETE - Prompt #{prompt_idx_flux} (took {duration_flux:.2f}s)")
                
                # Process the response - FLUX returns a file object
                if not response_flux:
                    return {"error": f"FLUX 1.1 Pro did not return any image data for prompt: {prompt_text[:100]}..."}
                
                # Download the image from the response URL
                try:
                    if hasattr(response_flux, 'read'):
                        # Response is a file-like object
                        image_bytes_data = response_flux.read()
                    elif isinstance(response_flux, str) and response_flux.startswith('http'):
                        # Response is a URL - download it
                        resp = await asyncio.to_thread(requests.get, response_flux, timeout=30)
                        resp.raise_for_status()
                        image_bytes_data = resp.content
                    else:
                        return {"error": f"Unexpected FLUX response format: {type(response_flux)}"}
                    
                    if not image_bytes_data:
                        return {"error": f"FLUX 1.1 Pro returned empty image data for prompt: {prompt_text[:100]}..."}
                    
                    # Process and save the image
                    pil_image_obj = Image.open(BytesIO(image_bytes_data))
                    
                    # Convert to requested format
                    if output_format.lower() == "png":
                        filename_flux = f"flux_11_pro_{uuid.uuid4().hex[:8]}.png"
                        save_format = "PNG"
                    elif output_format.lower() == "webp":
                        filename_flux = f"flux_11_pro_{uuid.uuid4().hex[:8]}.webp"
                        save_format = "WEBP"
                    else:  # Default to JPEG
                        filename_flux = f"flux_11_pro_{uuid.uuid4().hex[:8]}.jpg"
                        save_format = "JPEG"
                        # Convert RGBA to RGB for JPEG
                        if pil_image_obj.mode == "RGBA":
                            rgb_img = Image.new("RGB", pil_image_obj.size, (255, 255, 255))
                            rgb_img.paste(pil_image_obj, mask=pil_image_obj.split()[-1])
                            pil_image_obj = rgb_img
                    
                    local_path_flux = os.path.join(image_dir, filename_flux)
                    
                    # Save with compression settings
                    if save_format == "JPEG":
                        await asyncio.to_thread(
                            pil_image_obj.save, 
                            local_path_flux, 
                            format=save_format, 
                            quality=output_compression, 
                            optimize=True
                        )
                    elif save_format == "WEBP":
                        await asyncio.to_thread(
                            pil_image_obj.save, 
                            local_path_flux, 
                            format=save_format, 
                            quality=output_compression, 
                            optimize=True
                        )
                    else:  # PNG
                        await asyncio.to_thread(pil_image_obj.save, local_path_flux, format=save_format, optimize=True)
                    
                    image_url_flux = f"{DOMAIN}/user_data/{user_number_safe}/images/{filename_flux}"
                    print(f"✅ FLUX 1.1 Pro Success: Prompt #{prompt_idx_flux}. Generated image: {image_url_flux}")
                    
                    # QA Check for spelling mistakes
                    print(f"🔍 Starting QA check for spelling mistakes...")
                    qa_result = await qa_check_spelling(image_url_flux, prompt_text)
                    
                    if qa_result["has_errors"]:
                        print(f"❌ QA Check: Spelling errors detected in image {prompt_idx_flux}")
                        print(f"   Errors: {qa_result['errors']}")
                        print(f"🔄 Regenerating image to fix spelling errors...")
                        
                        # Try regeneration once
                        try:
                            regeneration_prompt = f"{prompt_text}\n\nIMPORTANT: Pay special attention to correct spelling of all text. Double-check every word for spelling accuracy."
                            
                            regeneration_input = flux_input.copy()
                            regeneration_input["prompt"] = regeneration_prompt
                            
                            regeneration_response = await asyncio.to_thread(
                                replicate_client.run,
                                "black-forest-labs/flux-1.1-pro",
                                input=regeneration_input
                            )
                            
                            if regeneration_response:
                                # Process regenerated image
                                if hasattr(regeneration_response, 'read'):
                                    regen_image_bytes = regeneration_response.read()
                                elif isinstance(regeneration_response, str) and regeneration_response.startswith('http'):
                                    regen_resp = await asyncio.to_thread(requests.get, regeneration_response, timeout=30)
                                    regen_resp.raise_for_status()
                                    regen_image_bytes = regen_resp.content
                                else:
                                    raise Exception(f"Unexpected regeneration response format: {type(regeneration_response)}")
                                
                                if regen_image_bytes:
                                    regenerated_pil_image = Image.open(BytesIO(regen_image_bytes))
                                    
                                    regenerated_filename = f"flux_11_pro_fixed_{uuid.uuid4().hex[:8]}.{output_format.lower()}"
                                    regenerated_local_path = os.path.join(image_dir, regenerated_filename)
                                    
                                    # Save regenerated image with same format settings
                                    if save_format == "JPEG" and regenerated_pil_image.mode == "RGBA":
                                        rgb_img = Image.new("RGB", regenerated_pil_image.size, (255, 255, 255))
                                        rgb_img.paste(regenerated_pil_image, mask=regenerated_pil_image.split()[-1])
                                        regenerated_pil_image = rgb_img
                                    
                                    if save_format in ["JPEG", "WEBP"]:
                                        await asyncio.to_thread(
                                            regenerated_pil_image.save, 
                                            regenerated_local_path, 
                                            format=save_format, 
                                            quality=output_compression, 
                                            optimize=True
                                        )
                                    else:
                                        await asyncio.to_thread(regenerated_pil_image.save, regenerated_local_path, format=save_format, optimize=True)
                                    
                                    regenerated_url = f"{DOMAIN}/user_data/{user_number_safe}/images/{regenerated_filename}"
                                    print(f"✅ Successfully regenerated image with corrected spelling: {regenerated_url}")
                                    
                                    # Remove the original image with errors
                                    try:
                                        os.remove(local_path_flux)
                                        print(f"🗑️ Removed original image with spelling errors")
                                    except Exception:
                                        pass
                                    
                                    return [regenerated_url]
                                    
                        except Exception as regen_error:
                            print(f"⚠️ Regeneration failed: {regen_error}, keeping original image")
                    else:
                        print(f"✅ QA Check: No spelling errors detected in image {prompt_idx_flux}")
                    
                    return [image_url_flux]
                    
                except Exception as e_process:
                    return {"error": f"Failed to process FLUX image response: {str(e_process)}"}
                    
            except Exception as e_flux:
                error_str_flux = str(e_flux)
                print(f"❌ FLUX 1.1 Pro Error: Prompt #{prompt_idx_flux} ('{prompt_text[:30]}...'): {error_str_flux}")
                import traceback
                print(traceback.format_exc())
                return {"error": f"FLUX 1.1 Pro generation failed for prompt '{prompt_text}': {error_str_flux}"}

        flux_tasks = [generate_for_single_prompt_flux(p, i) for i, p in enumerate(prompts)]
        
        # Debug: Show batch start time for FLUX
        batch_start_time_flux = time.time()
        batch_start_str_flux = time.strftime("%H:%M:%S", time.localtime(batch_start_time_flux))
        print(f"\n⏱️ FLUX BATCH START [{batch_start_str_flux}] - Launching {len(prompts)} concurrent API calls...")

        results_from_flux = await asyncio.gather(*flux_tasks, return_exceptions=False) # Errors handled within helper

        # Debug: Show batch completion time for FLUX
        batch_end_time_flux = time.time()
        batch_duration_flux = batch_end_time_flux - batch_start_time_flux
        batch_end_str_flux = time.strftime("%H:%M:%S", time.localtime(batch_end_time_flux))
        print(f"\n🏁 FLUX BATCH COMPLETE [{batch_end_str_flux}] - All {len(prompts)} requests finished (total time: {batch_duration_flux:.2f}s)")

        for i_flux, r_flux in enumerate(results_from_flux):
            if isinstance(r_flux, dict) and "error" in r_flux:
                any_errors_flux = True
                all_prompt_results.append(r_flux) 
            elif isinstance(r_flux, list):
                all_prompt_results.append(r_flux)
            else:
                any_errors_flux = True
                error_msg_detail = f"Unexpected result type for FLUX prompt index {i_flux}: {type(r_flux)}"
                print(error_msg_detail)
                all_prompt_results.append({"error": error_msg_detail})
        
        if any_errors_flux:
            # Check if all failed
            if all(isinstance(res, dict) and "error" in res for res in all_prompt_results):
                 return {"status": "error", "message": "All image generations failed with FLUX 1.1 Pro. Check results for details.", "results": all_prompt_results}
            return {"status": "partial_error", "message": "Some images failed to generate with FLUX 1.1 Pro. Check results for details.", "results": all_prompt_results}
        
        return {"status": "success", "results": all_prompt_results}

    elif model_version == "seedream-3":
        # --- SeeDream 3 Logic via Replicate ---
        replicate_api_token = os.environ.get("REPLICATE_API_KEY")
        if not replicate_api_token:
            print("Error: REPLICATE_API_KEY environment variable not set.")
            return {"status": "error", "message": "REPLICATE_API_KEY environment variable not set for seedream-3 model."}
        
        try:
            # Initialize the replicate client with the API token
            replicate_client = replicate.Client(api_token=replicate_api_token)
        except Exception as e:
            print(f"Error initializing Replicate client: {str(e)}")
            return {"status": "error", "message": f"Failed to initialize Replicate client: {str(e)}"}

        all_prompt_results = []
        any_errors_seedream = False
        
        async def generate_for_single_prompt_seedream(prompt_text, prompt_idx_seedream):
            try:
                print(f"🎯 SeeDream 3 Prompt #{prompt_idx_seedream}: '{prompt_text[:50]}...'")
                start_time_seedream = time.time()
                
                # Prepare input for SeeDream 3 - using the exact schema from the documentation
                seedream_input = {
                    "prompt": prompt_text
                }
                
                # Add image input if provided (SeeDream 3 supports image conditioning)
                if input_images and prompt_idx_seedream < len(input_images):
                    current_input_image_sources = input_images[prompt_idx_seedream]
                    if not isinstance(current_input_image_sources, list):
                        current_input_image_sources = [current_input_image_sources]
                    
                    # SeeDream 3 supports image input for conditioning
                    if current_input_image_sources:
                        image_source = current_input_image_sources[0]  # Use first image as reference
                        print(f"🖼️ Using input image for SeeDream 3: {str(image_source)[:70]}...")
                        seedream_input["image"] = image_source
                
                print(f"🔧 SeeDream 3 Parameters:")
                for key, value in seedream_input.items():
                    if key == "prompt":
                        print(f"   {key}: {value[:100]}..." if len(value) > 100 else f"   {key}: {value}")
                    elif key == "image":
                        print(f"   {key}: {str(value)[:50]}...")
                    else:
                        print(f"   {key}: {value}")
                
                # Call SeeDream 3 via Replicate
                response_seedream = await asyncio.to_thread(
                    replicate_client.run,
                    "bytedance/seedream-3",
                    input=seedream_input
                )
                
                end_time_seedream = time.time()
                duration_seedream = end_time_seedream - start_time_seedream
                print(f"✅ SeeDream 3 API CALL COMPLETE - Prompt #{prompt_idx_seedream} (took {duration_seedream:.2f}s)")
                
                # Process the response - SeeDream 3 returns a file object
                if not response_seedream:
                    return {"error": f"SeeDream 3 did not return any image data for prompt: {prompt_text[:100]}..."}
                
                # Download the image from the response
                try:
                    if hasattr(response_seedream, 'read'):
                        # Response is a file-like object
                        image_bytes_data = response_seedream.read()
                    elif isinstance(response_seedream, str) and response_seedream.startswith('http'):
                        # Response is a URL - download it
                        resp = await asyncio.to_thread(requests.get, response_seedream, timeout=30)
                        resp.raise_for_status()
                        image_bytes_data = resp.content
                    else:
                        return {"error": f"Unexpected SeeDream 3 response format: {type(response_seedream)}"}
                    
                    if not image_bytes_data:
                        return {"error": f"SeeDream 3 returned empty image data for prompt: {prompt_text[:100]}..."}
                    
                    # Process and save the image
                    pil_image_obj = Image.open(BytesIO(image_bytes_data))
                    
                    # Convert to requested format
                    if output_format.lower() == "png":
                        filename_seedream = f"seedream3_{uuid.uuid4().hex[:8]}.png"
                        save_format = "PNG"
                    elif output_format.lower() == "webp":
                        filename_seedream = f"seedream3_{uuid.uuid4().hex[:8]}.webp"
                        save_format = "WEBP"
                    else:  # Default to JPEG
                        filename_seedream = f"seedream3_{uuid.uuid4().hex[:8]}.jpg"
                        save_format = "JPEG"
                        # Convert RGBA to RGB for JPEG
                        if pil_image_obj.mode == "RGBA":
                            rgb_img = Image.new("RGB", pil_image_obj.size, (255, 255, 255))
                            rgb_img.paste(pil_image_obj, mask=pil_image_obj.split()[-1])
                            pil_image_obj = rgb_img
                    
                    local_path_seedream = os.path.join(image_dir, filename_seedream)
                    
                    # Save with compression settings
                    if save_format == "JPEG":
                        await asyncio.to_thread(
                            pil_image_obj.save, 
                            local_path_seedream, 
                            format=save_format, 
                            quality=output_compression, 
                            optimize=True
                        )
                    elif save_format == "WEBP":
                        await asyncio.to_thread(
                            pil_image_obj.save, 
                            local_path_seedream, 
                            format=save_format, 
                            quality=output_compression, 
                            optimize=True
                        )
                    else:  # PNG
                        await asyncio.to_thread(pil_image_obj.save, local_path_seedream, format=save_format, optimize=True)
                    
                    image_url_seedream = f"{DOMAIN}/user_data/{user_number_safe}/images/{filename_seedream}"
                    print(f"✅ SeeDream 3 Success: Prompt #{prompt_idx_seedream}. Generated image: {image_url_seedream}")
                    
                    # QA Check for spelling mistakes
                    print(f"🔍 Starting QA check for spelling mistakes...")
                    qa_result = await qa_check_spelling(image_url_seedream, prompt_text)
                    
                    if qa_result["has_errors"]:
                        print(f"❌ QA Check: Spelling errors detected in image {prompt_idx_seedream}")
                        print(f"   Errors: {qa_result['errors']}")
                        print(f"🔄 Regenerating image to fix spelling errors...")
                        
                        # Try regeneration once
                        try:
                            regeneration_prompt = f"{prompt_text}\n\nIMPORTANT: Pay special attention to correct spelling of all text. Double-check every word for spelling accuracy."
                            
                            regeneration_input = seedream_input.copy()
                            regeneration_input["prompt"] = regeneration_prompt
                            
                            regeneration_response = await asyncio.to_thread(
                                replicate_client.run,
                                "bytedance/seedream-3",
                                input=regeneration_input
                            )
                            
                            if regeneration_response:
                                # Process regenerated image
                                if hasattr(regeneration_response, 'read'):
                                    regen_image_bytes = regeneration_response.read()
                                elif isinstance(regeneration_response, str) and regeneration_response.startswith('http'):
                                    regen_resp = await asyncio.to_thread(requests.get, regeneration_response, timeout=30)
                                    regen_resp.raise_for_status()
                                    regen_image_bytes = regen_resp.content
                                else:
                                    raise Exception(f"Unexpected regeneration response format: {type(regeneration_response)}")
                                
                                if regen_image_bytes:
                                    regenerated_pil_image = Image.open(BytesIO(regen_image_bytes))
                                    
                                    regenerated_filename = f"seedream3_fixed_{uuid.uuid4().hex[:8]}.{output_format.lower()}"
                                    regenerated_local_path = os.path.join(image_dir, regenerated_filename)
                                    
                                    # Save regenerated image with same format settings
                                    if save_format == "JPEG" and regenerated_pil_image.mode == "RGBA":
                                        rgb_img = Image.new("RGB", regenerated_pil_image.size, (255, 255, 255))
                                        rgb_img.paste(regenerated_pil_image, mask=regenerated_pil_image.split()[-1])
                                        regenerated_pil_image = rgb_img
                                    
                                    if save_format in ["JPEG", "WEBP"]:
                                        await asyncio.to_thread(
                                            regenerated_pil_image.save, 
                                            regenerated_local_path, 
                                            format=save_format, 
                                            quality=output_compression, 
                                            optimize=True
                                        )
                                    else:
                                        await asyncio.to_thread(regenerated_pil_image.save, regenerated_local_path, format=save_format, optimize=True)
                                    
                                    regenerated_url = f"{DOMAIN}/user_data/{user_number_safe}/images/{regenerated_filename}"
                                    print(f"✅ Successfully regenerated image with corrected spelling: {regenerated_url}")
                                    
                                    # Remove the original image with errors
                                    try:
                                        os.remove(local_path_seedream)
                                        print(f"🗑️ Removed original image with spelling errors")
                                    except Exception:
                                        pass
                                    
                                    return [regenerated_url]
                                    
                        except Exception as regen_error:
                            print(f"⚠️ Regeneration failed: {regen_error}, keeping original image")
                    else:
                        print(f"✅ QA Check: No spelling errors detected in image {prompt_idx_seedream}")
                    
                    return [image_url_seedream]
                    
                except Exception as e_process:
                    return {"error": f"Failed to process SeeDream 3 image response: {str(e_process)}"}
                    
            except Exception as e_seedream:
                error_str_seedream = str(e_seedream)
                print(f"❌ SeeDream 3 Error: Prompt #{prompt_idx_seedream} ('{prompt_text[:30]}...'): {error_str_seedream}")
                import traceback
                print(traceback.format_exc())
                return {"error": f"SeeDream 3 generation failed for prompt '{prompt_text}': {error_str_seedream}"}

        seedream_tasks = [generate_for_single_prompt_seedream(p, i) for i, p in enumerate(prompts)]
        
        # Debug: Show batch start time for SeeDream 3
        batch_start_time_seedream = time.time()
        batch_start_str_seedream = time.strftime("%H:%M:%S", time.localtime(batch_start_time_seedream))
        print(f"\n⏱️ SEEDREAM 3 BATCH START [{batch_start_str_seedream}] - Launching {len(prompts)} concurrent API calls...")

        results_from_seedream = await asyncio.gather(*seedream_tasks, return_exceptions=False) # Errors handled within helper

        # Debug: Show batch completion time for SeeDream 3
        batch_end_time_seedream = time.time()
        batch_duration_seedream = batch_end_time_seedream - batch_start_time_seedream
        batch_end_str_seedream = time.strftime("%H:%M:%S", time.localtime(batch_end_time_seedream))
        print(f"\n🏁 SEEDREAM 3 BATCH COMPLETE [{batch_end_str_seedream}] - All {len(prompts)} requests finished (total time: {batch_duration_seedream:.2f}s)")

        for i_seedream, r_seedream in enumerate(results_from_seedream):
            if isinstance(r_seedream, dict) and "error" in r_seedream:
                any_errors_seedream = True
                all_prompt_results.append(r_seedream) 
            elif isinstance(r_seedream, list):
                all_prompt_results.append(r_seedream)
            else:
                any_errors_seedream = True
                error_msg_detail = f"Unexpected result type for SeeDream 3 prompt index {i_seedream}: {type(r_seedream)}"
                print(error_msg_detail)
                all_prompt_results.append({"error": error_msg_detail})
        
        if any_errors_seedream:
            # Check if all failed
            if all(isinstance(res, dict) and "error" in res for res in all_prompt_results):
                 return {"status": "error", "message": "All image generations failed with SeeDream 3. Check results for details.", "results": all_prompt_results}
            return {"status": "partial_error", "message": "Some images failed to generate with SeeDream 3. Check results for details.", "results": all_prompt_results}
        
        return {"status": "success", "results": all_prompt_results}

    elif model_version == "ideogram-v3-turbo":
        # --- Ideogram V3 Turbo Logic via Replicate ---
        replicate_api_token = os.environ.get("REPLICATE_API_KEY")
        if not replicate_api_token:
            print("Error: REPLICATE_API_KEY environment variable not set.")
            return {"status": "error", "message": "REPLICATE_API_KEY environment variable not set for ideogram-v3-turbo model."}
        
        try:
            # Initialize the replicate client with the API token
            replicate_client = replicate.Client(api_token=replicate_api_token)
        except Exception as e:
            print(f"Error initializing Replicate client: {str(e)}")
            return {"status": "error", "message": f"Failed to initialize Replicate client: {str(e)}"}

        all_prompt_results = []
        any_errors_ideogram = False
        
        async def generate_for_single_prompt_ideogram(prompt_text, prompt_idx_ideogram):
            try:
                print(f"🎯 Ideogram V3 Turbo Prompt #{prompt_idx_ideogram}: '{prompt_text[:50]}...'")
                start_time_ideogram = time.time()
                
                # Map aspect ratio to Ideogram V3 Turbo format
                ideogram_aspect_ratio = aspect_ratio
                valid_ideogram_ratios = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"]
                if aspect_ratio not in valid_ideogram_ratios:
                    ideogram_aspect_ratio = "16:9"  # Default fallback
                
                # Prepare input for Ideogram V3 Turbo
                ideogram_input = {
                    "prompt": prompt_text,
                    "aspect_ratio": ideogram_aspect_ratio,
                    "model": "V_3_TURBO",
                    "magic_prompt_option": "Auto"  # Enable automatic prompt enhancement
                }
                
                # Add image input if provided (Ideogram V3 supports image conditioning)
                if input_images and prompt_idx_ideogram < len(input_images):
                    current_input_image_sources = input_images[prompt_idx_ideogram]
                    if not isinstance(current_input_image_sources, list):
                        current_input_image_sources = [current_input_image_sources]
                    
                    # Ideogram V3 supports image input for conditioning
                    if current_input_image_sources:
                        image_source = current_input_image_sources[0]  # Use first image as reference
                        print(f"🖼️ Using input image for Ideogram V3 Turbo: {str(image_source)[:70]}...")
                        ideogram_input["image"] = image_source
                
                print(f"🔧 Ideogram V3 Turbo Parameters:")
                for key, value in ideogram_input.items():
                    if key == "prompt":
                        print(f"   {key}: {value[:100]}..." if len(value) > 100 else f"   {key}: {value}")
                    elif key == "image":
                        print(f"   {key}: {str(value)[:50]}...")
                    else:
                        print(f"   {key}: {value}")
                
                # Call Ideogram V3 Turbo via Replicate
                response_ideogram = await asyncio.to_thread(
                    replicate_client.run,
                    "ideogram-ai/ideogram-v3-turbo",
                    input=ideogram_input
                )
                
                end_time_ideogram = time.time()
                duration_ideogram = end_time_ideogram - start_time_ideogram
                print(f"✅ Ideogram V3 Turbo API CALL COMPLETE - Prompt #{prompt_idx_ideogram} (took {duration_ideogram:.2f}s)")
                
                # Process the response - Ideogram V3 returns a file object
                if not response_ideogram:
                    return {"error": f"Ideogram V3 Turbo did not return any image data for prompt: {prompt_text[:100]}..."}
                
                # Download the image from the response
                try:
                    if hasattr(response_ideogram, 'read'):
                        # Response is a file-like object
                        image_bytes_data = response_ideogram.read()
                    elif isinstance(response_ideogram, str) and response_ideogram.startswith('http'):
                        # Response is a URL - download it
                        resp = await asyncio.to_thread(requests.get, response_ideogram, timeout=30)
                        resp.raise_for_status()
                        image_bytes_data = resp.content
                    else:
                        return {"error": f"Unexpected Ideogram V3 Turbo response format: {type(response_ideogram)}"}
                    
                    if not image_bytes_data:
                        return {"error": f"Ideogram V3 Turbo returned empty image data for prompt: {prompt_text[:100]}..."}
                    
                    # Process and save the image
                    pil_image_obj = Image.open(BytesIO(image_bytes_data))
                    
                    # Convert to requested format
                    if output_format.lower() == "png":
                        filename_ideogram = f"ideogram_v3_turbo_{uuid.uuid4().hex[:8]}.png"
                        save_format = "PNG"
                    elif output_format.lower() == "webp":
                        filename_ideogram = f"ideogram_v3_turbo_{uuid.uuid4().hex[:8]}.webp"
                        save_format = "WEBP"
                    else:  # Default to JPEG
                        filename_ideogram = f"ideogram_v3_turbo_{uuid.uuid4().hex[:8]}.jpg"
                        save_format = "JPEG"
                        # Convert RGBA to RGB for JPEG
                        if pil_image_obj.mode == "RGBA":
                            rgb_img = Image.new("RGB", pil_image_obj.size, (255, 255, 255))
                            rgb_img.paste(pil_image_obj, mask=pil_image_obj.split()[-1])
                            pil_image_obj = rgb_img
                    
                    local_path_ideogram = os.path.join(image_dir, filename_ideogram)
                    
                    # Save with compression settings
                    if save_format == "JPEG":
                        await asyncio.to_thread(
                            pil_image_obj.save, 
                            local_path_ideogram, 
                            format=save_format, 
                            quality=output_compression, 
                            optimize=True
                        )
                    elif save_format == "WEBP":
                        await asyncio.to_thread(
                            pil_image_obj.save, 
                            local_path_ideogram, 
                            format=save_format, 
                            quality=output_compression, 
                            optimize=True
                        )
                    else:  # PNG
                        await asyncio.to_thread(pil_image_obj.save, local_path_ideogram, format=save_format, optimize=True)
                    
                    image_url_ideogram = f"{DOMAIN}/user_data/{user_number_safe}/images/{filename_ideogram}"
                    print(f"✅ Ideogram V3 Turbo Success: Prompt #{prompt_idx_ideogram}. Generated image: {image_url_ideogram}")
                    
                    # QA Check for spelling mistakes
                    print(f"🔍 Starting QA check for spelling mistakes...")
                    qa_result = await qa_check_spelling(image_url_ideogram, prompt_text)
                    
                    if qa_result["has_errors"]:
                        print(f"❌ QA Check: Spelling errors detected in image {prompt_idx_ideogram}")
                        print(f"   Errors: {qa_result['errors']}")
                        print(f"🔄 Regenerating image to fix spelling errors...")
                        
                        # Try regeneration once
                        try:
                            regeneration_prompt = f"{prompt_text}\n\nIMPORTANT: Pay special attention to correct spelling of all text. Double-check every word for spelling accuracy."
                            
                            regeneration_input = ideogram_input.copy()
                            regeneration_input["prompt"] = regeneration_prompt
                            
                            regeneration_response = await asyncio.to_thread(
                                replicate_client.run,
                                "ideogram-ai/ideogram-v3-turbo",
                                input=regeneration_input
                            )
                            
                            if regeneration_response:
                                # Process regenerated image
                                if hasattr(regeneration_response, 'read'):
                                    regen_image_bytes = regeneration_response.read()
                                elif isinstance(regeneration_response, str) and regeneration_response.startswith('http'):
                                    regen_resp = await asyncio.to_thread(requests.get, regeneration_response, timeout=30)
                                    regen_resp.raise_for_status()
                                    regen_image_bytes = regen_resp.content
                                else:
                                    raise Exception(f"Unexpected regeneration response format: {type(regeneration_response)}")
                                
                                if regen_image_bytes:
                                    regenerated_pil_image = Image.open(BytesIO(regen_image_bytes))
                                    
                                    regenerated_filename = f"ideogram_v3_turbo_fixed_{uuid.uuid4().hex[:8]}.{output_format.lower()}"
                                    regenerated_local_path = os.path.join(image_dir, regenerated_filename)
                                    
                                    # Save regenerated image with same format settings
                                    if save_format == "JPEG" and regenerated_pil_image.mode == "RGBA":
                                        rgb_img = Image.new("RGB", regenerated_pil_image.size, (255, 255, 255))
                                        rgb_img.paste(regenerated_pil_image, mask=regenerated_pil_image.split()[-1])
                                        regenerated_pil_image = rgb_img
                                    
                                    if save_format in ["JPEG", "WEBP"]:
                                        await asyncio.to_thread(
                                            regenerated_pil_image.save, 
                                            regenerated_local_path, 
                                            format=save_format, 
                                            quality=output_compression, 
                                            optimize=True
                                        )
                                    else:
                                        await asyncio.to_thread(regenerated_pil_image.save, regenerated_local_path, format=save_format, optimize=True)
                                    
                                    regenerated_url = f"{DOMAIN}/user_data/{user_number_safe}/images/{regenerated_filename}"
                                    print(f"✅ Successfully regenerated image with corrected spelling: {regenerated_url}")
                                    
                                    # Remove the original image with errors
                                    try:
                                        os.remove(local_path_ideogram)
                                        print(f"🗑️ Removed original image with spelling errors")
                                    except Exception:
                                        pass
                                    
                                    return [regenerated_url]
                                    
                        except Exception as regen_error:
                            print(f"⚠️ Regeneration failed: {regen_error}, keeping original image")
                    else:
                        print(f"✅ QA Check: No spelling errors detected in image {prompt_idx_ideogram}")
                    
                    return [image_url_ideogram]
                    
                except Exception as e_process:
                    return {"error": f"Failed to process Ideogram V3 Turbo image response: {str(e_process)}"}
                    
            except Exception as e_ideogram:
                error_str_ideogram = str(e_ideogram)
                print(f"❌ Ideogram V3 Turbo Error: Prompt #{prompt_idx_ideogram} ('{prompt_text[:30]}...'): {error_str_ideogram}")
                import traceback
                print(traceback.format_exc())
                return {"error": f"Ideogram V3 Turbo generation failed for prompt '{prompt_text}': {error_str_ideogram}"}

        ideogram_tasks = [generate_for_single_prompt_ideogram(p, i) for i, p in enumerate(prompts)]
        
        # Debug: Show batch start time for Ideogram V3 Turbo
        batch_start_time_ideogram = time.time()
        batch_start_str_ideogram = time.strftime("%H:%M:%S", time.localtime(batch_start_time_ideogram))
        print(f"\n⏱️ IDEOGRAM V3 TURBO BATCH START [{batch_start_str_ideogram}] - Launching {len(prompts)} concurrent API calls...")

        results_from_ideogram = await asyncio.gather(*ideogram_tasks, return_exceptions=False) # Errors handled within helper

        # Debug: Show batch completion time for Ideogram V3 Turbo
        batch_end_time_ideogram = time.time()
        batch_duration_ideogram = batch_end_time_ideogram - batch_start_time_ideogram
        batch_end_str_ideogram = time.strftime("%H:%M:%S", time.localtime(batch_end_time_ideogram))
        print(f"\n🏁 IDEOGRAM V3 TURBO BATCH COMPLETE [{batch_end_str_ideogram}] - All {len(prompts)} requests finished (total time: {batch_duration_ideogram:.2f}s)")

        for i_ideogram, r_ideogram in enumerate(results_from_ideogram):
            if isinstance(r_ideogram, dict) and "error" in r_ideogram:
                any_errors_ideogram = True
                all_prompt_results.append(r_ideogram) 
            elif isinstance(r_ideogram, list):
                all_prompt_results.append(r_ideogram)
            else:
                any_errors_ideogram = True
                error_msg_detail = f"Unexpected result type for Ideogram V3 Turbo prompt index {i_ideogram}: {type(r_ideogram)}"
                print(error_msg_detail)
                all_prompt_results.append({"error": error_msg_detail})
        
        if any_errors_ideogram:
            # Check if all failed
            if all(isinstance(res, dict) and "error" in res for res in all_prompt_results):
                 return {"status": "error", "message": "All image generations failed with Ideogram V3 Turbo. Check results for details.", "results": all_prompt_results}
            return {"status": "partial_error", "message": "Some images failed to generate with Ideogram V3 Turbo. Check results for details.", "results": all_prompt_results}
        
        return {"status": "success", "results": all_prompt_results}

    elif model_version == "ideogram-v3-quality":
        # --- Ideogram V3 Quality Logic via Replicate (reusing V3 Turbo code) ---
        replicate_api_token = os.environ.get("REPLICATE_API_KEY")
        if not replicate_api_token:
            print("Error: REPLICATE_API_KEY environment variable not set.")
            return {"status": "error", "message": "REPLICATE_API_KEY environment variable not set for ideogram-v3-quality model."}
        
        try:
            # Initialize the replicate client with the API token
            replicate_client = replicate.Client(api_token=replicate_api_token)
        except Exception as e:
            print(f"Error initializing Replicate client: {str(e)}")
            return {"status": "error", "message": f"Failed to initialize Replicate client: {str(e)}"}

        all_prompt_results = []
        any_errors_ideogram = False
        
        async def generate_for_single_prompt_ideogram_quality(prompt_text, prompt_idx_ideogram):
            try:
                print(f"🎯 Ideogram V3 Quality Prompt #{prompt_idx_ideogram}: '{prompt_text[:50]}...'")
                start_time_ideogram = time.time()
                
                # Map aspect ratio to Ideogram V3 Quality format
                ideogram_aspect_ratio = aspect_ratio
                valid_ideogram_ratios = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"]
                if aspect_ratio not in valid_ideogram_ratios:
                    ideogram_aspect_ratio = "16:9"  # Default fallback
                
                # Prepare input for Ideogram V3 Quality (same as turbo but with V_3 model)
                ideogram_input = {
                    "prompt": prompt_text,
                    "aspect_ratio": ideogram_aspect_ratio,
                    "model": "V_3",  # Quality model instead of V_3_TURBO
                    "magic_prompt_option": "Auto"  # Enable automatic prompt enhancement
                }
                
                # Add image input if provided (Ideogram V3 supports image conditioning)
                if input_images and prompt_idx_ideogram < len(input_images):
                    current_input_image_sources = input_images[prompt_idx_ideogram]
                    if not isinstance(current_input_image_sources, list):
                        current_input_image_sources = [current_input_image_sources]
                    
                    # Ideogram V3 supports image input for conditioning
                    if current_input_image_sources:
                        image_source = current_input_image_sources[0]  # Use first image as reference
                        print(f"🖼️ Using input image for Ideogram V3 Quality: {str(image_source)[:70]}...")
                        ideogram_input["image"] = image_source
                
                print(f"🔧 Ideogram V3 Quality Parameters:")
                for key, value in ideogram_input.items():
                    if key == "prompt":
                        print(f"   {key}: {value[:100]}..." if len(value) > 100 else f"   {key}: {value}")
                    elif key == "image":
                        print(f"   {key}: {str(value)[:50]}...")
                    else:
                        print(f"   {key}: {value}")
                
                # Call Ideogram V3 Quality via Replicate (same endpoint)
                response_ideogram = await asyncio.to_thread(
                    replicate_client.run,
                    "ideogram-ai/ideogram-v3-turbo",  # Same endpoint, different model parameter
                    input=ideogram_input
                )
                
                end_time_ideogram = time.time()
                duration_ideogram = end_time_ideogram - start_time_ideogram
                print(f"✅ Ideogram V3 Quality API CALL COMPLETE - Prompt #{prompt_idx_ideogram} (took {duration_ideogram:.2f}s)")
                
                # Process the response - same as turbo version
                if not response_ideogram:
                    return {"error": f"Ideogram V3 Quality did not return any image data for prompt: {prompt_text[:100]}..."}
                
                # Download the image from the response
                try:
                    if hasattr(response_ideogram, 'read'):
                        # Response is a file-like object
                        image_bytes_data = response_ideogram.read()
                    elif isinstance(response_ideogram, str) and response_ideogram.startswith('http'):
                        # Response is a URL - download it
                        resp = await asyncio.to_thread(requests.get, response_ideogram, timeout=30)
                        resp.raise_for_status()
                        image_bytes_data = resp.content
                    else:
                        return {"error": f"Unexpected Ideogram V3 Quality response format: {type(response_ideogram)}"}
                    
                    if not image_bytes_data:
                        return {"error": f"Ideogram V3 Quality returned empty image data for prompt: {prompt_text[:100]}..."}
                    
                    # Process and save the image
                    pil_image_obj = Image.open(BytesIO(image_bytes_data))
                    
                    # Convert to requested format
                    if output_format.lower() == "png":
                        filename_ideogram = f"ideogram_v3_quality_{uuid.uuid4().hex[:8]}.png"
                        save_format = "PNG"
                    elif output_format.lower() == "webp":
                        filename_ideogram = f"ideogram_v3_quality_{uuid.uuid4().hex[:8]}.webp"
                        save_format = "WEBP"
                    else:  # Default to JPEG
                        filename_ideogram = f"ideogram_v3_quality_{uuid.uuid4().hex[:8]}.jpg"
                        save_format = "JPEG"
                        # Convert RGBA to RGB for JPEG
                        if pil_image_obj.mode == "RGBA":
                            rgb_img = Image.new("RGB", pil_image_obj.size, (255, 255, 255))
                            rgb_img.paste(pil_image_obj, mask=pil_image_obj.split()[-1])
                            pil_image_obj = rgb_img
                    
                    local_path_ideogram = os.path.join(image_dir, filename_ideogram)
                    
                    # Save with compression settings
                    if save_format == "JPEG":
                        await asyncio.to_thread(
                            pil_image_obj.save, 
                            local_path_ideogram, 
                            format=save_format, 
                            quality=output_compression, 
                            optimize=True
                        )
                    elif save_format == "WEBP":
                        await asyncio.to_thread(
                            pil_image_obj.save, 
                            local_path_ideogram, 
                            format=save_format, 
                            quality=output_compression, 
                            optimize=True
                        )
                    else:  # PNG
                        await asyncio.to_thread(pil_image_obj.save, local_path_ideogram, format=save_format, optimize=True)
                    
                    image_url_ideogram = f"{DOMAIN}/user_data/{user_number_safe}/images/{filename_ideogram}"
                    print(f"✅ Ideogram V3 Quality Success: Prompt #{prompt_idx_ideogram}. Generated image: {image_url_ideogram}")
                    
                    # QA Check for spelling mistakes
                    print(f"🔍 Starting QA check for spelling mistakes...")
                    qa_result = await qa_check_spelling(image_url_ideogram, prompt_text)
                    
                    if qa_result["has_errors"]:
                        print(f"❌ QA Check: Spelling errors detected in image {prompt_idx_ideogram}")
                        print(f"   Errors: {qa_result['errors']}")
                        print(f"🔄 Regenerating image to fix spelling errors...")
                        
                        # Try regeneration once
                        try:
                            regeneration_prompt = f"{prompt_text}\n\nIMPORTANT: Pay special attention to correct spelling of all text. Double-check every word for spelling accuracy."
                            
                            regeneration_input = ideogram_input.copy()
                            regeneration_input["prompt"] = regeneration_prompt
                            
                            regeneration_response = await asyncio.to_thread(
                                replicate_client.run,
                                "ideogram-ai/ideogram-v3-turbo",
                                input=regeneration_input
                            )
                            
                            if regeneration_response:
                                # Process regenerated image (same logic as original)
                                if hasattr(regeneration_response, 'read'):
                                    regen_image_bytes = regeneration_response.read()
                                elif isinstance(regeneration_response, str) and regeneration_response.startswith('http'):
                                    regen_resp = await asyncio.to_thread(requests.get, regeneration_response, timeout=30)
                                    regen_resp.raise_for_status()
                                    regen_image_bytes = regen_resp.content
                                else:
                                    raise Exception(f"Unexpected regeneration response format: {type(regeneration_response)}")
                                
                                if regen_image_bytes:
                                    regenerated_pil_image = Image.open(BytesIO(regen_image_bytes))
                                    
                                    regenerated_filename = f"ideogram_v3_quality_fixed_{uuid.uuid4().hex[:8]}.{output_format.lower()}"
                                    regenerated_local_path = os.path.join(image_dir, regenerated_filename)
                                    
                                    # Save regenerated image with same format settings
                                    if save_format == "JPEG" and regenerated_pil_image.mode == "RGBA":
                                        rgb_img = Image.new("RGB", regenerated_pil_image.size, (255, 255, 255))
                                        rgb_img.paste(regenerated_pil_image, mask=regenerated_pil_image.split()[-1])
                                        regenerated_pil_image = rgb_img
                                    
                                    if save_format in ["JPEG", "WEBP"]:
                                        await asyncio.to_thread(
                                            regenerated_pil_image.save, 
                                            regenerated_local_path, 
                                            format=save_format, 
                                            quality=output_compression, 
                                            optimize=True
                                        )
                                    else:
                                        await asyncio.to_thread(regenerated_pil_image.save, regenerated_local_path, format=save_format, optimize=True)
                                    
                                    regenerated_url = f"{DOMAIN}/user_data/{user_number_safe}/images/{regenerated_filename}"
                                    print(f"✅ Successfully regenerated image with corrected spelling: {regenerated_url}")
                                    
                                    # Remove the original image with errors
                                    try:
                                        os.remove(local_path_ideogram)
                                        print(f"🗑️ Removed original image with spelling errors")
                                    except Exception:
                                        pass
                                    
                                    return [regenerated_url]
                                    
                        except Exception as regen_error:
                            print(f"⚠️ Regeneration failed: {regen_error}, keeping original image")
                    else:
                        print(f"✅ QA Check: No spelling errors detected in image {prompt_idx_ideogram}")
                    
                    return [image_url_ideogram]
                    
                except Exception as e_process:
                    return {"error": f"Failed to process Ideogram V3 Quality image response: {str(e_process)}"}
                    
            except Exception as e_ideogram:
                error_str_ideogram = str(e_ideogram)
                print(f"❌ Ideogram V3 Quality Error: Prompt #{prompt_idx_ideogram} ('{prompt_text[:30]}...'): {error_str_ideogram}")
                import traceback
                print(traceback.format_exc())
                return {"error": f"Ideogram V3 Quality generation failed for prompt '{prompt_text}': {error_str_ideogram}"}

        ideogram_tasks = [generate_for_single_prompt_ideogram_quality(p, i) for i, p in enumerate(prompts)]
        
        # Debug: Show batch start time for Ideogram V3 Quality
        batch_start_time_ideogram = time.time()
        batch_start_str_ideogram = time.strftime("%H:%M:%S", time.localtime(batch_start_time_ideogram))
        print(f"\n⏱️ IDEOGRAM V3 QUALITY BATCH START [{batch_start_str_ideogram}] - Launching {len(prompts)} concurrent API calls...")

        results_from_ideogram = await asyncio.gather(*ideogram_tasks, return_exceptions=False) # Errors handled within helper

        # Debug: Show batch completion time for Ideogram V3 Quality
        batch_end_time_ideogram = time.time()
        batch_duration_ideogram = batch_end_time_ideogram - batch_start_time_ideogram
        batch_end_str_ideogram = time.strftime("%H:%M:%S", time.localtime(batch_end_time_ideogram))
        print(f"\n🏁 IDEOGRAM V3 QUALITY BATCH COMPLETE [{batch_end_str_ideogram}] - All {len(prompts)} requests finished (total time: {batch_duration_ideogram:.2f}s)")

        for i_ideogram, r_ideogram in enumerate(results_from_ideogram):
            if isinstance(r_ideogram, dict) and "error" in r_ideogram:
                any_errors_ideogram = True
                all_prompt_results.append(r_ideogram) 
            elif isinstance(r_ideogram, list):
                all_prompt_results.append(r_ideogram)
            else:
                any_errors_ideogram = True
                error_msg_detail = f"Unexpected result type for Ideogram V3 Quality prompt index {i_ideogram}: {type(r_ideogram)}"
                print(error_msg_detail)
                all_prompt_results.append({"error": error_msg_detail})
        
        if any_errors_ideogram:
            # Check if all failed
            if all(isinstance(res, dict) and "error" in res for res in all_prompt_results):
                 return {"status": "error", "message": "All image generations failed with Ideogram V3 Quality. Check results for details.", "results": all_prompt_results}
            return {"status": "partial_error", "message": "Some images failed to generate with Ideogram V3 Quality. Check results for details.", "results": all_prompt_results}
        
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
            # For Google GenAI client, response should contain generated images
            
            # Debug: Check what attributes the response object has
            print(f"🔍 DEBUG: Response type: {type(response)}")
            print(f"🔍 DEBUG: Response attributes: {[attr for attr in dir(response) if not attr.startswith('_')]}")
            
            # Try to print the actual response content for debugging
            try:
                if hasattr(response, '__dict__'):
                    print(f"🔍 DEBUG: Response dict: {response.__dict__}")
                elif hasattr(response, '_pb'):
                    print(f"🔍 DEBUG: Response protobuf available")
            except Exception as debug_error:
                print(f"🔍 DEBUG: Could not inspect response: {debug_error}")
            
            images_list = None
            
            # Try different possible attribute names for the generated images
            if hasattr(response, 'generated_images') and response.generated_images:
                images_list = response.generated_images
                print(f"✅ Found images via 'generated_images' attribute: {len(images_list)} images")
            elif hasattr(response, 'images') and response.images:
                images_list = response.images
                print(f"✅ Found images via 'images' attribute: {len(images_list)} images")
            elif hasattr(response, 'image') and response.image:
                images_list = [response.image]  # Single image
                print(f"✅ Found single image via 'image' attribute")
            elif hasattr(response, 'candidates') and response.candidates:
                # Sometimes the response structure is different
                for candidate in response.candidates:
                    if hasattr(candidate, 'content') and candidate.content:
                        if hasattr(candidate.content, 'parts'):
                            for part in candidate.content.parts:
                                if hasattr(part, 'inline_data') and part.inline_data:
                                    # This might be image data
                                    print(f"✅ Found image data in candidate.content.parts")
                                    # We'll handle this case differently
                                    break
            else:
                print(f"❌ Could not find images in response. Type: {type(response)}")
                print(f"❌ Available attributes: {[attr for attr in dir(response) if not attr.startswith('_')]}")
                return []
            
            if not images_list:
                print(f"❌ No images list found in response")
                return []

            save_tasks = [
                _save_and_process_single_image(img, i)
                for i, img in enumerate(images_list)
            ]
            
            image_url_results = await asyncio.gather(*save_tasks)

            # Filter out None results (errors during saving/processing)
            successful_urls = [url for url in image_url_results if url is not None]
            
            # QA Check each image for spelling mistakes
            final_urls = []
            for url in successful_urls:
                print(f"🔍 Starting QA check for spelling mistakes on image: {url}")
                qa_result = await qa_check_spelling(url, prompt)
                
                if qa_result["has_errors"]:
                    print(f"❌ QA Check: Spelling errors detected in image {url}")
                    print(f"   Errors: {qa_result['errors']}")
                    print(f"🔄 Regenerating image to fix spelling errors...")
                    
                    # Try regeneration once with corrected prompt
                    try:
                        regeneration_prompt = f"{prompt}\n\nIMPORTANT: Pay special attention to correct spelling of all text. Double-check every word for spelling accuracy."
                        
                        # Find the client and project for regeneration (use first available)
                        if generation_clients:
                            regen_project_id, regen_client = generation_clients[0]
                            print(f"🔄 Regenerating with project: {regen_project_id}")
                            
                            # Map aspect ratio for regeneration
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
                                genai_aspect_ratio = "16:9"
                            
                            regen_response = await asyncio.to_thread(
                                regen_client.models.generate_images,
                                model=model_version,
                                prompt=regeneration_prompt,
                                config=types.GenerateImagesConfig(
                                    aspect_ratio=genai_aspect_ratio,
                                    number_of_images=1,
                                    safety_filter_level="BLOCK_MEDIUM_AND_ABOVE",
                                    person_generation="ALLOW_ADULT",
                                )
                            )
                            
                            # Process regenerated image
                            if hasattr(regen_response, 'generated_images') and regen_response.generated_images:
                                regen_image = regen_response.generated_images[0]
                                if hasattr(regen_image, 'image'):
                                    regen_filename = f"img_fixed_{uuid.uuid4().hex[:8]}.png"
                                    regen_local_path = os.path.join(image_dir, regen_filename)
                                    await asyncio.to_thread(regen_image.image.save, regen_local_path)
                                    regen_url = f"{DOMAIN}/user_data/{user_number_safe}/images/{regen_filename}"
                                    
                                    print(f"✅ Successfully regenerated image with corrected spelling: {regen_url}")
                                    
                                    # Remove the original image with errors
                                    try:
                                        original_filename = url.split('/')[-1]
                                        original_path = os.path.join(image_dir, original_filename)
                                        os.remove(original_path)
                                        print(f"🗑️ Removed original image with spelling errors")
                                    except Exception:
                                        pass
                                    
                                    final_urls.append(regen_url)
                                    continue
                                    
                        print(f"⚠️ Regeneration failed, keeping original image despite spelling errors")
                        
                    except Exception as regen_error:
                        print(f"⚠️ Regeneration failed: {regen_error}, keeping original image")
                else:
                    print(f"✅ QA Check: No spelling errors detected in image {url}")
                
                final_urls.append(url)
            
            # Return only the successfully processed URLs (with QA checks and potential regenerations)
            return final_urls

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
    aspect_ratio: str = "16:9",
    quality: str = "auto",
    output_format: str = "png",
    output_compression: int = 100,
    moderation: str = "low"
) -> dict:
    """
    Generate one image for each prompt using Google's Imagen 4.0, OpenAI's GPT-1, Black Forest Labs' FLUX 1.1 Pro, ByteDance's SeeDream 3, or Ideogram's V3 Turbo.
    All images will be generated with the specified aspect ratio (defaults to 16:9).
    
    **NEW: SeeDream 3 Support**
    SeeDream 3 is a cutting-edge text-to-image model from ByteDance offering:
    - Native 2K high-resolution image generation
    - Excellent photorealistic and cinematic quality
    - Fast generation times with superior detail
    - Cost-effective at $0.03 per image
    - Commercial use license
    
    **FLUX 1.1 Pro Support**
    FLUX 1.1 Pro is a state-of-the-art text-to-image model from Black Forest Labs offering:
    - Exceptional image quality and prompt adherence
    - Fast generation times (typically 3-10 seconds)
    - Support for image prompts as visual references
    - Built-in prompt enhancement
    - Commercial use license
    
    **Image Input Support**
    Both GPT-1 and FLUX 1.1 Pro support input images as visual context for generation.
    This is perfect for style transfer, handwriting replication, and reference-based generation.

    Args:
        user_number (str): The user's unique identifier (used for directory structure).
        prompts (list): List of text prompts. Each prompt will generate one image.
        model_version (str): Model version to use. Options:
                           - "imagen-4.0-generate-preview-06-06" (default, Google GenAI client, balanced)
                           - "imagen-4.0-fast-generate-preview-06-06" (Google GenAI client, faster generation)
                           - "imagen-4.0-ultra-generate-preview-06-06" (Google GenAI client, highest quality)
                           - "gpt-image-1" (OpenAI, supports image inputs as context)
                           - "flux-1.1-pro" (Black Forest Labs, fastest & highest quality, supports image prompts)
                           - "seedream-3" (ByteDance, native 2K resolution, photorealistic, $0.03 per image)
                           - "ideogram-v3-turbo" (Ideogram AI, excellent text rendering, magic prompt enhancement, fast)
                           - "ideogram-v3-quality" (Ideogram AI, highest quality text rendering, slower but better)
        input_images (list, optional): List of image URLs or base64 strings to use as context/reference.
                                     Supported by gpt-image-1, flux-1.1-pro, seedream-3, ideogram-v3-turbo, and ideogram-v3-quality. If provided, should match the length 
                                     of prompts list, or provide one image to use for all prompts.
                                     Images are used as visual context for generation.
        aspect_ratio (str): Aspect ratio for generated images. Supported ratios:
                            - "1:1" (square) - 1024x1024 for GPT-1, native for FLUX & Imagen
                            - "16:9" (landscape) - 1536x1024 for GPT-1, native for FLUX & Imagen  
                            - "9:16" (portrait) - 1024x1536 for GPT-1, native for FLUX & Imagen
                            - "4:3" (landscape) - 1536x1024 for GPT-1, native for FLUX & Imagen
                            - "3:4" (portrait) - 1024x1536 for GPT-1, native for FLUX & Imagen
                            - "3:2" (landscape) - 1536x1024 for GPT-1, native for FLUX & Imagen
                            - "2:3" (portrait) - 1024x1536 for GPT-1, native for FLUX & Imagen
                            Defaults to "16:9". GPT-1 uses closest supported size, FLUX & Imagen support exact ratios.
        quality (str): Image quality setting. Options: "auto" (default), "high", "medium", "low".
                      Used by GPT-1 and FLUX (FLUX defaults to high quality).
        output_format (str): Output format. Options: "png", "jpeg" (default), "webp".
                            Supported by GPT-1 and FLUX. Imagen always outputs PNG.
        output_compression (int): Compression level 0-100% for jpeg/webp formats.
                                 Default: 100. Used by GPT-1 and FLUX.
        moderation (str): Content moderation level. Always forced to "low" for GPT-1.
                         FLUX uses moderate safety filtering by default.
                         Ignored for Imagen models.

    Returns:
        dict: {"status": "success", "results": [ [url], ... ]} or {"status": "error", "message": ...}

    **FLUX 1.1 Pro Examples:**
    ```python
    # High-quality text-to-image generation
    result = await generate_images_with_prompts(
        prompts=["A majestic dragon soaring over a medieval castle at sunset"],
        model_version="flux-1.1-pro",
        aspect_ratio="16:9",
        output_format="jpeg"
    )

    # Style transfer with image reference
    result = await generate_images_with_prompts(
        prompts=["Create a portrait in the same artistic style as this reference image"],
        model_version="flux-1.1-pro",
        input_images=["https://example.com/style_reference.jpg"],
        aspect_ratio="3:4"
    )

    # Multiple high-quality images with different aspect ratios
    result = await generate_images_with_prompts(
        prompts=[
            "A cyberpunk cityscape with neon lights",
            "A serene mountain lake at dawn",
            "A vintage car in a retro garage"
        ],
        model_version="flux-1.1-pro",
        aspect_ratio="16:9",
        output_format="png"
    )
    ```

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

    **SeeDream 3 Examples:**
    ```python
    # High-resolution 2K photorealistic generation
    result = await generate_images_with_prompts(
        prompts=["A cinematic portrait of a young woman with platinum hair in golden hour lighting"],
        model_version="seedream-3",
        aspect_ratio="16:9",
        output_format="jpeg"
    )

    # Photorealistic scene with fine details
    result = await generate_images_with_prompts(
        prompts=["A bustling city street at night with neon reflections on wet pavement, ultra detailed"],
        model_version="seedream-3",
        aspect_ratio="9:16"
    )

    # High-quality product photography style
    result = await generate_images_with_prompts(
        prompts=[
            "Professional product photography of a luxury watch on marble surface",
            "Architectural photography of a modern minimalist interior",
            "Food photography of a gourmet dish with dramatic lighting"
        ],
        model_version="seedream-3",
        aspect_ratio="1:1",
        output_format="png"
    )
    ```

    **Image Input Requirements:**
    - **SeeDream 3**: PNG, JPEG, WebP formats; supports image conditioning for style transfer
    - **FLUX 1.1 Pro**: PNG, JPEG, WebP, GIF formats; any reasonable size
    - **GPT-1**: PNG, JPEG, WebP, non-animated GIF; max 50MB per image, max 500 images
    - Images are processed as visual context alongside text prompts
    - Can provide one image for all prompts, or one image per prompt
    
    **Performance & Pricing:**
    - **SeeDream 3**: ~5-15 seconds per image, $0.03 per image, native 2K resolution, commercial license
    - **FLUX 1.1 Pro**: ~3-10 seconds per image, $0.04 per image, commercial license
    - **GPT-1**: ~10-30 seconds per image, varies by OpenAI pricing
    - **Imagen 4.0**: ~5-15 seconds per image, Google Cloud pricing
    """
    # Use default user number if empty
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"
    
    # Force moderation to "low" for GPT-1 models
    if model_version == "gpt-image-1":
        moderation = "low"
        print(f"🔒 Forced moderation to 'low' for GPT-1 model")
    
    # Validate model version
    valid_models = [
        "imagen-4.0-generate-preview-06-06",
        "imagen-4.0-fast-generate-preview-06-06", 
        "imagen-4.0-ultra-generate-preview-06-06",
        "gpt-image-1",  # Added gpt-image-1
        "flux-1.1-pro",  # Added FLUX 1.1 Pro
        "seedream-3",  # Added SeeDream 3
        "ideogram-v3-turbo",  # Added Ideogram V3 Turbo
        "ideogram-v3-quality"  # Added Ideogram V3 Quality
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
    
    return await _generate_images_with_prompts_concurrent(user_number, prompts, model_version, input_images, aspect_ratio, quality, output_format, output_compression, moderation)

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
    output_format: str = "jpeg",
    quality: str = "high",
    output_compression: int = 100,
    size: str = "1024x1536",
    n: int = 1,
    moderation: str = "low"
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
        moderation (str): Content moderation level for gpt-image-1. Always forced to "low" for GPT-1.
                         Ignored for other models.

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
        quality="auto",
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

    # Strip markdown formatting from edit prompt
    cleaned_edit_prompt = strip_markdown(edit_prompt)
    print(f"🧹 Cleaned edit prompt by removing markdown formatting")
    edit_prompt = cleaned_edit_prompt

    # Force moderation to "low" for GPT-1 models
    if model == "gpt-image-1":
        moderation = "low"
        print(f"🔒 Forced moderation to 'low' for GPT-1 image editing")

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
                    
                    # Prepare API call parameters - Only use parameters supported by Images.edit()
                    api_params = {
                        "model": "gpt-image-1",
                        "prompt": edit_prompt,
                        "n": n
                        # Note: Images.edit() doesn't support moderation, output_format, quality, compression, size, background
                    }
                    
                    # Add mask if provided
                    mask_file = None
                    if mask_bytes:
                        mask_file = BytesIO(mask_bytes)
                        mask_file.name = "mask.png"

                    # 🔍 DEBUG: Log what parameters are actually being sent to OpenAI
                    print(f"🔧 OpenAI Images.edit() API Parameters being sent:")
                    for key, value in api_params.items():
                        print(f"   {key}: {value}")
                    if mask_file:
                        print(f"   mask: <mask_file_object>")
                    print(f"📝 Note: Images.edit() API doesn't support moderation parameter")

                    # Make API call - Images.edit() doesn't support output_format, quality, compression, size, background
                    if mask_file:
                        response = await asyncio.to_thread(
                            client.images.edit,
                            image=image_file,
                            mask=mask_file,
                            **api_params
                        )
                    else:
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
                            # Decode base64 image (from OpenAI edit API)
                            edited_img_bytes = base64.b64decode(image_data.b64_json)
                            edited_img = await asyncio.to_thread(Image.open, BytesIO(edited_img_bytes))
                            
                            # Save edited image in requested format
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
                                # Save with compression
                                await asyncio.to_thread(edited_img.save, file_path, format=save_format, quality=output_compression, optimize=True)
                            elif save_format == "WEBP":
                                # Save as WebP with compression
                                await asyncio.to_thread(edited_img.save, file_path, format="WEBP", quality=output_compression, optimize=True)
                            else:
                                # Save as PNG (default)
                                await asyncio.to_thread(edited_img.save, file_path, format="PNG", optimize=True)
                            
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