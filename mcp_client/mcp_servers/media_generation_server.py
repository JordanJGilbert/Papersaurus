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
import vertexai
import time

mcp = FastMCP("Media Generation Server")

print("Media Generation Server ready - Video, Music, and Speech generation tools")



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
        print("Error: No Vertex AI projects configured for video generation.")
        return {"status": "error", "message": "No Vertex AI projects configured for video generation."}

    num_projects = len(vertex_projects)
    print(f"Initialized video generation with {num_projects} Vertex AI projects.")

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
            print(f"Failed to get access token for project {project_id}: {e}")
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
                print(f"Started video generation for project {project_id}: {operation_name}")
                return operation_name, None
            else:
                return None, f"No operation name returned from project {project_id}"
                
        except Exception as e:
            print(f"Error starting video generation for project {project_id}: {e}")
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
                    print(f"Operation {operation_name} completed successfully")
                    
                    if "response" in result:
                        videos = []
                        # Parse the response format for video generation
                        response_data = result["response"]
                        
                        # Handle Veo 2 response format
                        if "videos" in response_data:
                            for idx, video_data in enumerate(response_data["videos"]):
                                if "bytesBase64Encoded" in video_data:
                                    print(f"Found video data in video {idx}")
                                    
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
                                    print(f"Video saved to {file_path}, URL: {video_url}")
                                else:
                                    print(f"No bytesBase64Encoded in video {idx}: {video_data.keys()}")
                        elif "predictions" in response_data:
                            # Fallback to predictions format
                            for idx, prediction in enumerate(response_data["predictions"]):
                                if "bytesBase64Encoded" in prediction:
                                    print(f"Found video data in prediction {idx}")
                                    
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
                                    print(f"Video saved to {file_path}, URL: {video_url}")
                                else:
                                    print(f"No bytesBase64Encoded in prediction {idx}: {prediction.keys()}")
                        else:
                            print(f"No videos or predictions in response data: {response_data.keys()}")
                        
                        if videos:
                            print(f"Successfully parsed {len(videos)} videos from response")
                            return videos, None
                        else:
                            print("No videos found in completed operation response")
                            return [], f"No videos generated on project {project_id}"
                    else:
                        error_info = result.get("error", {})
                        error_msg = error_info.get("message", "Unknown error")
                        print(f"Operation completed with error: {json.dumps(error_info, indent=2)}")
                        return None, f"Video generation failed: {error_msg}"
                
                # Wait before polling again
                await asyncio.sleep(10)
            
            return None, f"Video generation timed out after {max_wait_time} seconds"
            
        except Exception as e:
            print(f"Error polling video operation for project {project_id}: {e}")
            return None, str(e)

    async def generate_video_for_prompt(prompt, idx, project_id, input_image=None):
        """Generate video for a single prompt using specified project."""
        try:
            print(f"Attempting video generation for prompt '{prompt}' (idx: {idx}) with project {project_id}.")
            
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
            
            print(f"Success for prompt '{prompt}' (idx: {idx}) with project {project_id}. Generated {len(video_uris)} videos.")
            return video_uris
            
        except Exception as e:
            error_str = str(e)
            print(f"Error on video generation for prompt '{prompt}' (idx: {idx}) with project {project_id}: {error_str}")
            
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
            print(f"Error reported for video prompt index {i}: {r['error']}")
            final_results.append({"error": r["error"]})
        elif isinstance(r, list):
             final_results.append(r)
        else:
            any_errors = True
            error_message = f"Unexpected result type for video prompt index {i}: {type(r)}"
            print(error_message)
            final_results.append({"error": "Unexpected result type."})

    if any_errors:
         return {"status": "partial_error", "message": "Some videos failed to generate. Check results for details.", "results": final_results}

    return {"status": "success", "results": final_results}

@mcp.tool(
    annotations={
        "outputSchema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["success", "partial_error", "error"],
                    "description": "Overall video generation status"
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
                                "description": "Array of generated video URLs"
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

@mcp.tool(
    annotations={
        "outputSchema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["success", "error"],
                    "description": "Overall music generation status"
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
                                "description": "Individual music generation status"
                            },
                            "music_url": {
                                "type": "string",
                                "format": "uri",
                                "description": "URL to the generated music file"
                            },
                            "prompt": {
                                "type": "string",
                                "description": "The prompt used for this music generation"
                            },
                            "duration": {
                                "type": "number",
                                "description": "Duration of the generated music in seconds"
                            },
                            "message": {
                                "type": "string",
                                "description": "Error message if generation failed"
                            }
                        },
                        "required": ["status", "prompt"],
                        "description": "Music generation result"
                    },
                    "description": "Array of music generation results"
                }
            },
            "required": ["status", "results"]
        }
    }
)
async def generate_music_with_lyria(
    user_number: str = "+17145986105",
    prompts: list = None,
    duration_seconds: float = 30.0,
    bpm: int = 120,
    scale: str = "SCALE_UNSPECIFIED",
    guidance: float = 4.0,
    density: float = 0.5,
    brightness: float = 0.5,
    temperature: float = 1.1,
    mute_bass: bool = False,
    mute_drums: bool = False,
    only_bass_and_drums: bool = False
) -> dict:
    """
    Generate instrumental music using Google's Lyria RealTime model.
    Creates high-quality, AI-generated music based on text prompts.
    
    **Multi-API-Key Support:**
    - Automatically cycles between multiple Gemini API keys to handle rate limits
    - Set GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3, etc. in environment
    - Distributes prompts across available keys for better reliability
    - If one API key fails, automatically tries the next until one succeeds

    **Smart Caching System:**
    - Automatically caches generated music based on ALL parameters (prompts, BPM, scale, etc.)
    - Identical parameters = instant cache hit (no API call needed)
    - Cache key includes: prompts, duration, BPM, scale, guidance, density, brightness, 
      temperature, mute settings - any change creates new music
    - Returns cached files with message: "Music retrieved from cache"
    - Saves time, API costs, and provides consistent results for same inputs

    Args:
        user_number (str): The user's unique identifier (used for directory structure).
        prompts (list): List of weighted prompts. Each can be a string or dict with 'text' and 'weight'.
                       Examples: ["minimal techno", "piano meditation", "upbeat jazz"]
                       Or: [{"text": "Piano", "weight": 2.0}, {"text": "Meditation", "weight": 0.5}]
        duration_seconds (float): Duration of music to generate (5-300 seconds, default: 30).
        bpm (int): Beats per minute (60-200, default: 120).
        scale (str): Musical scale/key. Options: "C_MAJOR_A_MINOR", "D_MAJOR_B_MINOR", etc.
                    Use "SCALE_UNSPECIFIED" to let the model decide.
        guidance (float): How strictly to follow prompts (0.0-6.0, default: 4.0).
                         Higher values = more adherence but less smooth transitions.
        density (float): Musical density (0.0-1.0, default: 0.5). Higher = busier music.
        brightness (float): Tonal brightness (0.0-1.0, default: 0.5). Higher = brighter sound.
        temperature (float): Creativity/randomness (0.0-3.0, default: 1.1).
        mute_bass (bool): Reduce bass output (default: False).
        mute_drums (bool): Reduce drum output (default: False).
        only_bass_and_drums (bool): Generate only bass and drums (default: False).

    Returns:
        dict: {"status": "success", "results": [{"music_url": "...", "prompt": "...", ...}]}

    **API Key Cycling & Fallback:**
    - Uses GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3, GEMINI_API_KEY_4, GEMINI_API_KEY_5
    - Automatically distributes prompts across available keys to avoid quota limits
    - If one key fails (quota/rate limit), automatically retries with next available key
    - Only fails if ALL API keys are exhausted
    - Provides detailed logging about which key is used for each generation
    
    **Caching Examples:**
    ```python
    # First call - generates new music
    result1 = await generate_music_with_lyria(prompts=["jazz piano"], bpm=120)
    # → API call made, music generated and cached
    
    # Second call with SAME parameters - instant cache hit
    result2 = await generate_music_with_lyria(prompts=["jazz piano"], bpm=120)  
    # → Returns cached music instantly, no API call
    
    # Third call with DIFFERENT BPM - generates new music
    result3 = await generate_music_with_lyria(prompts=["jazz piano"], bpm=140)
    # → API call made for new variation, cached separately
    ```
    
    **Prompt Examples:**
    - Instruments: "Piano", "Guitar", "Violin", "808 Hip Hop Beat", "Moog Oscillations"
    - Genres: "Minimal Techno", "Jazz Fusion", "Lo-Fi Hip Hop", "Classical", "Ambient"
    - Moods: "Chill", "Upbeat", "Dreamy", "Energetic", "Meditative", "Dark"
    - Combinations: "Acoustic guitar with subtle strings", "Funky bass with jazz drums"

    **Technical Specs:**
    - Output: 48kHz stereo WAV files
    - Model: Lyria RealTime (experimental)
    - Instrumental only (no vocals)
    - Includes AI watermarking
    - Deterministic caching based on parameter hash
    - Automatic fallback across multiple API keys
    """
    from google import genai
    from google.genai import types
    import wave
    import struct
    import os
    import hashlib
    import re
    import uuid
    
    # Use default user number if empty
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"
    
    # Validation
    if not prompts:
        return {"status": "error", "message": "At least one prompt is required.", "results": []}
    
    if not isinstance(prompts, list):
        return {"status": "error", "message": "Prompts must be a list.", "results": []}
    
    if duration_seconds < 5 or duration_seconds > 300:
        return {"status": "error", "message": "Duration must be between 5 and 300 seconds.", "results": []}
    
    if bpm < 60 or bpm > 200:
        return {"status": "error", "message": "BPM must be between 60 and 200.", "results": []}
    
    # Sanitize user number for directory
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
    music_dir = os.path.join(base_dir, user_number_safe, "music")
    os.makedirs(music_dir, exist_ok=True)

    # Convert scale string to enum if needed
    scale_map = {
        "C_MAJOR_A_MINOR": types.Scale.C_MAJOR_A_MINOR,
        "D_FLAT_MAJOR_B_FLAT_MINOR": types.Scale.D_FLAT_MAJOR_B_FLAT_MINOR,
        "D_MAJOR_B_MINOR": types.Scale.D_MAJOR_B_MINOR,
        "E_FLAT_MAJOR_C_MINOR": types.Scale.E_FLAT_MAJOR_C_MINOR,
        "E_MAJOR_D_FLAT_MINOR": types.Scale.E_MAJOR_D_FLAT_MINOR,
        "F_MAJOR_D_MINOR": types.Scale.F_MAJOR_D_MINOR,
        "G_FLAT_MAJOR_E_FLAT_MINOR": types.Scale.G_FLAT_MAJOR_E_FLAT_MINOR,
        "G_MAJOR_E_MINOR": types.Scale.G_MAJOR_E_MINOR,
        "A_FLAT_MAJOR_F_MINOR": types.Scale.A_FLAT_MAJOR_F_MINOR,
        "A_MAJOR_G_FLAT_MINOR": types.Scale.A_MAJOR_G_FLAT_MINOR,
        "B_FLAT_MAJOR_G_MINOR": types.Scale.B_FLAT_MAJOR_G_MINOR,
        "B_MAJOR_A_FLAT_MINOR": types.Scale.B_MAJOR_A_FLAT_MINOR,
        "SCALE_UNSPECIFIED": types.Scale.SCALE_UNSPECIFIED
    }
    
    scale_enum = scale_map.get(scale, types.Scale.SCALE_UNSPECIFIED)

    async def generate_music_for_prompt_group(prompt_group, group_idx):
        """Generate music for a group of prompts (or single prompt)."""
        # --- Multiple API Key Configuration ---
        gemini_api_keys = [
            os.getenv('GEMINI_API_KEY'),
            os.getenv('GEMINI_API_KEY_2'),
            os.getenv('GEMINI_API_KEY_3'),
            os.getenv('GEMINI_API_KEY_4'),
            os.getenv('GEMINI_API_KEY_5'),
        ]
        
        # Filter out None values (unset API keys)
        available_keys = [key for key in gemini_api_keys if key]
        
        if not available_keys:
            return {"status": "error", "prompt": str(prompt_group), "message": "No GEMINI_API_KEY environment variables set"}
        
        print(f"🎵 Music generation for prompt group {group_idx}: Will try up to {len(available_keys)} API keys if needed")
        
        # Create a cache key based on all synthesis parameters
        cache_params = {
            "prompts": prompt_group,
            "duration_seconds": duration_seconds,
            "bpm": bpm,
            "scale": scale,
            "guidance": guidance,
            "density": density,
            "brightness": brightness,
            "temperature": temperature,
            "mute_bass": mute_bass,
            "mute_drums": mute_drums,
            "only_bass_and_drums": only_bass_and_drums
        }
        
        # Create a deterministic hash of the parameters
        import json
        cache_key_str = json.dumps(cache_params, sort_keys=True)
        cache_hash = hashlib.md5(cache_key_str.encode()).hexdigest()[:12]  # 12 chars for shorter filenames
        
        # Check if cached file exists
        cached_filename = f"music_{cache_hash}.wav"
        cached_file_path = os.path.join(music_dir, cached_filename)
        
        if os.path.exists(cached_file_path):
            # Return cached result
            music_url = f"{DOMAIN}/user_data/{user_number_safe}/music/{cached_filename}"
            prompt_text = ", ".join([p.get('text', str(p)) if isinstance(p, dict) else str(p) for p in prompt_group])
            
            print(f"🔄 Using cached music for prompts: {prompt_text} -> {music_url}")
            
            # Get actual duration from the cached file
            try:
                with wave.open(cached_file_path, 'rb') as wav_file:
                    frames = wav_file.getnframes()
                    sample_rate = wav_file.getframerate()
                    actual_duration = frames / sample_rate
            except:
                actual_duration = duration_seconds  # Fallback to expected duration
            
            return {
                "status": "success", 
                "music_url": music_url, 
                "prompt": prompt_text,
                "duration": actual_duration,
                "message": "Music retrieved from cache"
            }
        
        # Try each API key in sequence until one succeeds
        last_error_message = ""
        failed_keys = []
        
        for attempt, key_index in enumerate(range(len(available_keys))):
            # Start with preferred key (round-robin based on group_idx), then try others
            actual_key_index = (group_idx + attempt) % len(available_keys)
            selected_key = available_keys[actual_key_index]
            
            try:
                print(f"🔄 Attempt {attempt + 1}/{len(available_keys)}: Trying API key #{actual_key_index + 1} for prompt group {group_idx}")
                
                # Initialize Gemini client with selected API key
                client = genai.Client(api_key=selected_key, http_options={'api_version': 'v1alpha'})
                
                # Convert prompts to WeightedPrompt objects
                weighted_prompts = []
                for prompt in prompt_group:
                    if isinstance(prompt, str):
                        weighted_prompts.append(types.WeightedPrompt(text=prompt, weight=1.0))
                    elif isinstance(prompt, dict) and 'text' in prompt:
                        weight = prompt.get('weight', 1.0)
                        weighted_prompts.append(types.WeightedPrompt(text=prompt['text'], weight=weight))
                    else:
                        print(f"Warning: Invalid prompt format: {prompt}")
                        continue
                
                if not weighted_prompts:
                    return {"status": "error", "prompt": str(prompt_group), "message": "No valid prompts found"}
                
                # Audio collection
                audio_chunks = []
                sample_rate = 48000
                channels = 2
                target_samples = int(duration_seconds * sample_rate * channels)
                collected_samples = 0
                
                print(f"🎵 Starting music generation for prompts: {[p.text for p in weighted_prompts]} with API key #{actual_key_index + 1}")
                
                async def collect_audio(session):
                    """Collect audio chunks until we reach the target duration."""
                    nonlocal collected_samples
                    async for message in session.receive():
                        if hasattr(message, 'server_content') and hasattr(message.server_content, 'audio_chunks'):
                            for audio_chunk in message.server_content.audio_chunks:
                                if hasattr(audio_chunk, 'data'):
                                    audio_chunks.append(audio_chunk.data)
                                    # Estimate samples (16-bit stereo)
                                    chunk_samples = len(audio_chunk.data) // 2
                                    collected_samples += chunk_samples
                                    
                                    if collected_samples >= target_samples:
                                        return  # We have enough audio
                        await asyncio.sleep(0.001)  # Small delay to prevent busy waiting

                # Connect to Lyria RealTime and generate music
                async with client.aio.live.music.connect(model='models/lyria-realtime-exp') as session:
                    # Set up task to collect audio
                    collect_task = asyncio.create_task(collect_audio(session))
                    
                    # Configure the session
                    await session.set_weighted_prompts(prompts=weighted_prompts)
                    
                    music_config = types.LiveMusicGenerationConfig(
                        bpm=bpm,
                        scale=scale_enum,
                        guidance=guidance,
                        density=density,
                        brightness=brightness,
                        temperature=temperature,
                        mute_bass=mute_bass,
                        mute_drums=mute_drums,
                        only_bass_and_drums=only_bass_and_drums
                    )
                    await session.set_music_generation_config(config=music_config)
                    
                    # Start music generation
                    await session.play()
                    
                    # Wait for audio collection to complete or timeout
                    try:
                        await asyncio.wait_for(collect_task, timeout=duration_seconds + 30)
                    except asyncio.TimeoutError:
                        print(f"⏰ Music generation timed out after {duration_seconds + 30} seconds with API key #{actual_key_index + 1}")
                        raise Exception(f"Music generation timed out after {duration_seconds + 30} seconds")
                    
                    # Stop the session
                    await session.stop()
                
                if not audio_chunks:
                    raise Exception("No audio data received from Lyria")
                
                # Combine audio chunks into a single audio stream
                combined_audio = b''.join(audio_chunks)
                
                # Trim to exact duration if we have extra
                target_bytes = target_samples * 2  # 16-bit samples
                if len(combined_audio) > target_bytes:
                    combined_audio = combined_audio[:target_bytes]
                
                # Save as WAV file
                filename = f"music_{cache_hash}.wav"  # Use cache hash instead of random UUID
                file_path = os.path.join(music_dir, filename)
                
                # Create WAV file
                with wave.open(file_path, 'wb') as wav_file:
                    wav_file.setnchannels(channels)  # Stereo
                    wav_file.setsampwidth(2)  # 16-bit
                    wav_file.setframerate(sample_rate)  # 48kHz
                    wav_file.writeframes(combined_audio)
                
                music_url = f"{DOMAIN}/user_data/{user_number_safe}/music/{filename}"
                prompt_text = ", ".join([p.text for p in weighted_prompts])
                
                print(f"✅ Successfully generated music with API key #{actual_key_index + 1}: {music_url}")
                
                return {
                    "status": "success", 
                    "music_url": music_url, 
                    "prompt": prompt_text,
                    "duration": len(combined_audio) / (sample_rate * channels * 2),  # Actual duration
                    "message": f"Music generated successfully using API key #{actual_key_index + 1}"
                }
                
            except Exception as e:
                error_str = str(e)
                failed_keys.append(f"API key #{actual_key_index + 1}")
                
                # Check if it's a quota/rate limit error
                is_quota_error = False
                if "quota" in error_str.lower() or "billing" in error_str.lower() or "1011" in error_str:
                    is_quota_error = True
                
                if is_quota_error:
                    print(f"🚨 Quota/billing limit hit on API key #{actual_key_index + 1}/{len(available_keys)} - trying next key...")
                    last_error_message = f"Quota/billing limit hit on API key #{actual_key_index + 1}"
                else:
                    print(f"❌ Error with API key #{actual_key_index + 1}/{len(available_keys)}: {error_str}")
                    last_error_message = f"API key #{actual_key_index + 1} failed: {error_str}"
                
                # If this is the last key to try, we'll return the error
                if attempt == len(available_keys) - 1:
                    break
        
        # All API keys failed
        failed_keys_str = ", ".join(failed_keys)
        error_message = f"❌ All API keys failed for prompt '{prompt_group}'. Failed keys: {failed_keys_str}. Last error: {last_error_message}"
        print(error_message)
        
        return {"status": "error", "prompt": str(prompt_group), "message": error_message}

    # For now, treat each prompt as a separate generation
    # In the future, could support combining multiple prompts into one generation
    tasks = []
    for idx, prompt in enumerate(prompts):
        # Each prompt generates its own music file
        tasks.append(generate_music_for_prompt_group([prompt], idx))
    
    print(f"🎵 Distributing {len(prompts)} music prompts across available API keys...")
    
    # Run all music generations concurrently
    results = await asyncio.gather(*tasks, return_exceptions=False)
    
    # Check if any succeeded
    successful_results = [r for r in results if r.get("status") == "success"]
    failed_results = [r for r in results if r.get("status") == "error"]
    
    if successful_results and not failed_results:
        status = "success"
        message = f"Successfully generated {len(successful_results)} music file(s)"
    elif successful_results and failed_results:
        status = "partial_error"
        message = f"Generated {len(successful_results)} music file(s), {len(failed_results)} failed"
    else:
        status = "error"
        message = "All music generations failed"
    
    return {
        "status": status,
        "message": message,
        "results": results
    }

@mcp.tool(
    annotations={
        "outputSchema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["success", "error"],
                    "description": "Overall speech synthesis status"
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
                                "description": "Individual speech synthesis status"
                            },
                            "speech_url": {
                                "type": "string",
                                "format": "uri",
                                "description": "URL to the generated speech file"
                            },
                            "text": {
                                "type": "string",
                                "description": "The text that was synthesized"
                            },
                            "voice": {
                                "type": "string",
                                "description": "The voice used for synthesis"
                            },
                            "duration": {
                                "type": "number",
                                "description": "Duration of the generated speech in seconds"
                            },
                            "message": {
                                "type": "string",
                                "description": "Error message if synthesis failed"
                            }
                        },
                        "required": ["status", "text"],
                        "description": "Speech synthesis result"
                    },
                    "description": "Array of speech synthesis results"
                }
            },
            "required": ["status", "results"]
        }
    }
)
async def generate_speech_with_chirp3(
    user_number: str = "+17145986105",
    texts: list = None,
    voice_name: str = "en-US-Chirp3-HD-Charon",
    language_code: str = "en-US",
    speaking_rate: float = 1.0,
    use_markup: bool = False,
    audio_format: str = "MP3",
    custom_pronunciations: list = None
) -> dict:
    """
    Generate high-quality speech using Google Cloud Text-to-Speech Chirp 3: HD voices.
    Creates extremely realistic AI voices with emotional resonance.

    Args:
        user_number (str): The user's unique identifier (used for directory structure).
        texts (list): List of texts to synthesize. Each text generates a separate audio file.
        voice_name (str): Chirp 3 HD voice name. Popular options:
                         - "en-US-Chirp3-HD-Charon" (Male, deep voice)
                         - "en-US-Chirp3-HD-Aoede" (Female, warm voice)
                         - "en-US-Chirp3-HD-Puck" (Male, energetic voice)
                         - "en-US-Chirp3-HD-Kore" (Female, clear voice)
                         - "en-US-Chirp3-HD-Zephyr" (Female, gentle voice)
        language_code (str): Language code (e.g., "en-US", "es-US", "fr-FR", "de-DE").
        speaking_rate (float): Speech speed (0.25-2.0). 1.0 = normal, <1.0 = slower, >1.0 = faster.
        use_markup (bool): Enable pause control with [pause], [pause short], [pause long] tags.
        audio_format (str): Output format: "MP3", "WAV", "OGG_OPUS".
        custom_pronunciations (list): List of pronunciation overrides.
                                    Format: [{"phrase": "word", "pronunciation": "phonetic"}]

    Returns:
        dict: {"status": "success", "results": [{"speech_url": "...", "text": "...", ...}]}

    **Available Voices (en-US):**
    - **Male**: Charon, Puck, Achird, Algenib, Algieba, Alnilam, Enceladus, Iapetus, 
                Rasalgethi, Sadachbia, Sadaltager, Schedar, Umbriel, Zubenelgenubi
    - **Female**: Aoede, Kore, Leda, Zephyr, Autonoe, Callirrhoe, Despina, Erinome, 
                  Gacrux, Laomedeia, Pulcherrima, Sulafat, Vindemiatrix, Achernar

    **Supported Languages:**
    - English: en-US, en-AU, en-GB, en-IN
    - Spanish: es-US, es-ES  
    - German: de-DE, French: fr-FR, fr-CA
    - Hindi: hi-IN, Portuguese: pt-BR
    - Arabic: ar-XA, Italian: it-IT
    - Japanese: ja-JP, Korean: ko-KR
    - Chinese: cmn-CN, And many more...

    **Markup Examples (when use_markup=True):**
    - "Hello there. [pause long] How are you today?"
    - "Let me think... [pause] Yes, that's correct."
    - "Welcome [pause short] to our service."

    **Custom Pronunciation Examples:**
    - [{"phrase": "read1", "pronunciation": "rɛd"}, {"phrase": "read2", "pronunciation": "riːd"}]
    - Text: "I read1 a book, and I will now read2 it to you."

    **Voice Characteristics:**
    - Charon: Deep, authoritative male voice
    - Aoede: Warm, friendly female voice  
    - Puck: Energetic, youthful male voice
    - Kore: Clear, professional female voice
    - Zephyr: Gentle, soothing female voice
    """
    from google.cloud import texttospeech
    import os
    import hashlib
    import re
    import uuid
    import json
    import wave
    import mutagen.mp3
    import mutagen.oggvorbis
    
    # Use default user number if empty
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"
    
    # Validation
    if not texts:
        return {"status": "error", "message": "At least one text is required.", "results": []}
    
    if not isinstance(texts, list):
        return {"status": "error", "message": "Texts must be a list.", "results": []}
    
    if speaking_rate < 0.25 or speaking_rate > 2.0:
        return {"status": "error", "message": "Speaking rate must be between 0.25 and 2.0.", "results": []}
    
    # Sanitize user number for directory
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
    speech_dir = os.path.join(base_dir, user_number_safe, "speech")
    os.makedirs(speech_dir, exist_ok=True)

    # Audio format mapping
    format_map = {
        "MP3": texttospeech.AudioEncoding.MP3,
        "WAV": texttospeech.AudioEncoding.LINEAR16,
        "OGG_OPUS": texttospeech.AudioEncoding.OGG_OPUS
    }
    
    if audio_format not in format_map:
        return {"status": "error", "message": f"Unsupported audio format: {audio_format}. Use MP3, WAV, or OGG_OPUS.", "results": []}
    
    file_extension = {"MP3": ".mp3", "WAV": ".wav", "OGG_OPUS": ".ogg"}[audio_format]

    async def synthesize_text(text, text_idx):
        """Synthesize speech for a single text."""
        try:
            # Create a cache key based on all synthesis parameters
            cache_params = {
                "text": text,
                "voice_name": voice_name,
                "language_code": language_code,
                "speaking_rate": speaking_rate,
                "use_markup": use_markup,
                "audio_format": audio_format,
                "custom_pronunciations": custom_pronunciations or []
            }
            
            # Create a deterministic hash of the parameters
            cache_key_str = json.dumps(cache_params, sort_keys=True)
            cache_hash = hashlib.md5(cache_key_str.encode()).hexdigest()[:12]
            
            # Check if cached file exists
            cached_filename = f"speech_{cache_hash}{file_extension}"
            cached_file_path = os.path.join(speech_dir, cached_filename)
            
            if os.path.exists(cached_file_path):
                # Return cached result
                speech_url = f"{DOMAIN}/user_data/{user_number_safe}/speech/{cached_filename}"
                
                print(f"Using cached speech for text: '{text[:50]}...' -> {speech_url}")
                
                # Get actual duration from the cached file
                try:
                    if audio_format == "MP3":
                        audio_file = mutagen.mp3.MP3(cached_file_path)
                        actual_duration = audio_file.info.length
                    elif audio_format == "WAV":
                        with wave.open(cached_file_path, 'rb') as wav_file:
                            frames = wav_file.getnframes()
                            sample_rate = wav_file.getframerate()
                            actual_duration = frames / sample_rate
                    elif audio_format == "OGG_OPUS":
                        audio_file = mutagen.oggvorbis.OggVorbis(cached_file_path)
                        actual_duration = audio_file.info.length
                    else:
                        actual_duration = 0  # Fallback
                except:
                    actual_duration = 0  # Fallback
                
                return {
                    "status": "success", 
                    "speech_url": speech_url, 
                    "text": text,
                    "voice": voice_name,
                    "duration": actual_duration,
                    "message": "Speech retrieved from cache"
                }
            
            # Initialize Google Cloud TTS client
            try:
                client = texttospeech.TextToSpeechClient()
            except Exception as e:
                return {"status": "error", "text": text, "message": f"Failed to initialize TTS client: {e}"}
            
            # Prepare synthesis input
            if use_markup:
                synthesis_input = texttospeech.SynthesisInput(markup=text)
            else:
                synthesis_input = texttospeech.SynthesisInput(text=text)
            
            # Add custom pronunciations if provided
            if custom_pronunciations:
                pronunciations = []
                for cp in custom_pronunciations:
                    if isinstance(cp, dict) and "phrase" in cp and "pronunciation" in cp:
                        pronunciations.append(
                            texttospeech.CustomPronunciations(
                                phrase=cp["phrase"],
                                phonetic_encoding=texttospeech.CustomPronunciations.PhoneticEncoding.PHONETIC_ENCODING_IPA,
                                pronunciation=cp["pronunciation"]
                            )
                        )
                
                if pronunciations:
                    synthesis_input.custom_pronunciations.extend(pronunciations)
            
            # Voice selection
            voice = texttospeech.VoiceSelectionParams(
                language_code=language_code,
                name=voice_name
            )
            
            # Audio configuration
            audio_config = texttospeech.AudioConfig(
                audio_encoding=format_map[audio_format],
                speaking_rate=speaking_rate
            )
            
            print(f"Synthesizing speech for text: '{text[:50]}...' with voice {voice_name}")
            
            # Perform the text-to-speech request
            response = await asyncio.to_thread(
                client.synthesize_speech,
                input=synthesis_input,
                voice=voice,
                audio_config=audio_config
            )
            
            if not response.audio_content:
                return {"status": "error", "text": text, "message": "No audio content received from TTS service"}
            
            # Save the audio file with cache hash
            filename = f"speech_{cache_hash}{file_extension}"
            file_path = os.path.join(speech_dir, filename)
            
            with open(file_path, "wb") as out:
                out.write(response.audio_content)
            
            speech_url = f"{DOMAIN}/user_data/{user_number_safe}/speech/{filename}"
            
            # Calculate duration
            try:
                if audio_format == "MP3":
                    audio_file = mutagen.mp3.MP3(file_path)
                    actual_duration = audio_file.info.length
                elif audio_format == "WAV":
                    with wave.open(file_path, 'rb') as wav_file:
                        frames = wav_file.getnframes()
                        sample_rate = wav_file.getframerate()
                        actual_duration = frames / sample_rate
                elif audio_format == "OGG_OPUS":
                    audio_file = mutagen.oggvorbis.OggVorbis(file_path)
                    actual_duration = audio_file.info.length
                else:
                    actual_duration = 0
            except:
                actual_duration = 0
            
            print(f"Successfully generated speech: {speech_url}")
            
            return {
                "status": "success", 
                "speech_url": speech_url, 
                "text": text,
                "voice": voice_name,
                "duration": actual_duration,
                "message": "Speech generated successfully"
            }
            
        except Exception as e:
            error_str = str(e)
            print(f"Error synthesizing speech for text '{text[:50]}...': {error_str}")
            return {"status": "error", "text": text, "message": f"Speech synthesis failed: {error_str}"}

    # Run all speech synthesis tasks concurrently
    tasks = [synthesize_text(text, idx) for idx, text in enumerate(texts)]
    results = await asyncio.gather(*tasks, return_exceptions=False)
    
    # Check results
    successful_results = [r for r in results if r.get("status") == "success"]
    failed_results = [r for r in results if r.get("status") == "error"]
    
    if successful_results and not failed_results:
        status = "success"
        message = f"Successfully generated {len(successful_results)} speech file(s)"
    elif successful_results and failed_results:
        status = "partial_error"
        message = f"Generated {len(successful_results)} speech file(s), {len(failed_results)} failed"
    else:
        status = "error"
        message = "All speech synthesis failed"
    
    return {
        "status": status,
        "message": message,
        "results": results
    }
if __name__ == "__main__":
    # Check if we should use HTTP transport
    transport = os.getenv("FASTMCP_TRANSPORT", "stdio")
    
    if transport == "streamable-http":
        host = os.getenv("FASTMCP_HOST", "127.0.0.1")
        port = int(os.getenv("FASTMCP_PORT", "9001"))  # Different port
        print(f"Starting media generation server with streamable-http transport on {host}:{port}")
        mcp.run(transport="streamable-http", host=host, port=port)
    else:
        print("Starting media generation server with stdio transport")
        mcp.run() 