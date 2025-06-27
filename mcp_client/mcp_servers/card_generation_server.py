import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
from fastmcp import FastMCP
import uuid
import json
import requests
import asyncio
import threading
import time
from typing import Dict, List, Any, Optional
from utils.constants import DOMAIN

mcp = FastMCP("Card Generation Server")

print("Card Generation Server ready - handles complete card creation workflow")

# In-memory job storage (for simplicity - could be replaced with Redis/database)
active_jobs: Dict[str, Dict[str, Any]] = {}

def generate_card_complete(job_data: Dict[str, Any]) -> None:
    """
    Complete card generation workflow that runs in background thread.
    This continues even if the user's browser is closed.
    """
    job_id = job_data['job_id']
    
    try:
        # Update job status
        active_jobs[job_id]['status'] = 'processing'
        active_jobs[job_id]['progress'] = 10
        
        # Step 1: Generate AI prompts (similar to existing client logic)
        print(f"Job {job_id}: Generating prompts...")
        prompts = generate_prompts_for_card(job_data)
        active_jobs[job_id]['progress'] = 30
        
        # Step 2: Generate images in parallel
        print(f"Job {job_id}: Generating images...")
        images = generate_images_for_card(prompts, job_data)
        active_jobs[job_id]['progress'] = 80
        
        # Step 3: Store card and get shareable URL
        print(f"Job {job_id}: Storing card...")
        card_url = store_card_data(images, job_data)
        active_jobs[job_id]['progress'] = 90
        
        # Step 4: Send email to user
        print(f"Job {job_id}: Sending email...")
        send_completion_email(job_data['userEmail'], job_data['selectedType'], card_url)
        
        # Mark job as completed
        active_jobs[job_id]['status'] = 'completed'
        active_jobs[job_id]['progress'] = 100
        active_jobs[job_id]['card_url'] = card_url
        active_jobs[job_id]['images'] = images
        
        print(f"Job {job_id}: Complete! Card available at {card_url}")
        
    except Exception as e:
        print(f"Job {job_id}: Error - {str(e)}")
        active_jobs[job_id]['status'] = 'failed'
        active_jobs[job_id]['error'] = str(e)

def generate_prompts_for_card(job_data: Dict[str, Any]) -> Dict[str, str]:
    """Generate AI prompts for each card section"""
    # This would contain the logic from the frontend's prompt generation
    # For now, using simplified prompts
    
    card_type = job_data.get('selectedType', 'birthday')
    tone = job_data.get('selectedTone', 'heartfelt')
    prompt = job_data.get('prompt', '')
    custom_style = job_data.get('customStyleDescription', '')
    
    base_style = f"in {custom_style}" if custom_style else "in beautiful artistic style"
    
    return {
        'frontCover': f"Create a beautiful {card_type} card front cover {base_style}. {prompt}",
        'backCover': f"Create a simple, elegant back cover for a {card_type} card {base_style}",
        'leftInterior': f"Create decorative left interior page for {card_type} card {base_style}",
        'rightInterior': f"Create right interior page with space for message, {card_type} card {base_style}"
    }

def generate_images_for_card(prompts: Dict[str, str], job_data: Dict[str, Any]) -> Dict[str, str]:
    """Generate images for all card sections"""
    images = {}
    
    # Call the existing image generation tool for each section
    for section, prompt in prompts.items():
        try:
            # Make request to existing image generation endpoint
            response = requests.post(f'{DOMAIN}/internal/call_mcp_tool', json={
                'tool_name': 'generate_images_with_prompts',
                'arguments': {
                    'user_number': '+17145986105',  # Default user for server-side generation
                    'prompts': [prompt],
                    'model_version': job_data.get('selectedImageModel', 'gpt-image-1'),
                    'aspect_ratio': '2:3',  # 1024x1536 portrait for greeting cards
                    'quality': 'high',
                    'output_format': 'jpeg',
                    'output_compression': 100,
                    'moderation': 'auto'
                }
            })
            
            if response.ok:
                result = response.json()
                parsed_result = json.loads(result['result'])
                if parsed_result['status'] == 'success':
                    image_url = parsed_result['results'][0]
                    images[section] = image_url
                    print(f"Generated {section}: {image_url[:50]}...")
                else:
                    raise Exception(f"Image generation failed for {section}")
            else:
                raise Exception(f"HTTP error {response.status_code} for {section}")
                
        except Exception as e:
            print(f"Error generating {section}: {e}")
            # Use placeholder or retry logic here
            images[section] = "https://via.placeholder.com/500x700/cccccc/000000?text=Error"
    
    return images

def store_card_data(images: Dict[str, str], job_data: Dict[str, Any]) -> str:
    """Store card data and return shareable URL"""
    try:
        card_data = {
            'prompt': job_data.get('prompt', ''),
            'frontCover': images.get('frontCover', ''),
            'backCover': images.get('backCover', ''),
            'leftPage': images.get('leftInterior', ''),
            'rightPage': images.get('rightInterior', '')
        }
        
        response = requests.post(f'{DOMAIN}/api/cards/store', json=card_data)
        
        if response.ok:
            result = response.json()
            return result['share_url']
        else:
            raise Exception(f"Failed to store card: {response.status_code}")
            
    except Exception as e:
        print(f"Error storing card: {e}")
        return f"{DOMAIN}/card/error"

def send_completion_email(email: str, card_type: str, card_url: str) -> None:
    """Send completion email to user"""
    try:
        response = requests.post('https://16504442930.work/send_email_with_attachments', json={
            'to': email,
            'from': 'vibecarding@ast.engineer',
            'subject': f'Your {card_type} card is ready! 🎉',
            'body': f"""Hi there!

Your beautiful {card_type} card has been created and is ready for you!

View your card: {card_url}

Even though you may have closed your browser, we continued working on your card in the background. We hope you love how it turned out!

If you have any questions or feedback, feel free to reach out to us.

Happy card making! ✨

Best regards,
The VibeCarding Team
vibecarding@ast.engineer""",
            'url': card_url
        })
        
        if response.ok:
            print(f"Completion email sent to {email}")
        else:
            print(f"Failed to send email: {response.status_code}")
            
    except Exception as e:
        print(f"Error sending email: {e}")

@mcp.tool()
def submit_card_generation(
    prompt: str,
    userEmail: str,
    selectedType: str = "birthday",
    selectedTone: str = "heartfelt",
    customCardType: str = "",
    selectedImageModel: str = "gpt-image-1",
    customStyleDescription: str = "",
    numberOfCards: int = 1,
    finalCardMessage: str = "",
    toField: str = "",
    fromField: str = "",
    isFrontBackOnly: bool = False,
    selectedPaperSize: str = "standard"
) -> Dict[str, Any]:
    """
    Submit a card generation job that will run in the background.
    Returns immediately with a job ID, while card generation continues server-side.
    
    Args:
        prompt: Description of the card to create
        userEmail: Email address to send completed card to
        selectedType: Type of card (birthday, thank-you, etc.)
        selectedTone: Tone of the card (funny, heartfelt, etc.)
        customCardType: Custom card type if selectedType is "custom"
        selectedImageModel: AI model to use for image generation
        customStyleDescription: Custom artistic style description
        numberOfCards: Number of card variations to generate
        finalCardMessage: Message to include in the card
        toField: "To" field for the card
        fromField: "From" field for the card
        isFrontBackOnly: Whether to generate only front/back (no interior)
        selectedPaperSize: Paper size configuration
    
    Returns:
        Dict with job_id and status
    """
    
    if not prompt.strip():
        return {
            "status": "error",
            "message": "Card description is required"
        }
    
    if not userEmail.strip():
        return {
            "status": "error", 
            "message": "Email address is required"
        }
    
    # Generate unique job ID
    job_id = str(uuid.uuid4())
    
    # Store job data
    job_data = {
        'job_id': job_id,
        'prompt': prompt,
        'userEmail': userEmail,
        'selectedType': selectedType,
        'selectedTone': selectedTone,
        'customCardType': customCardType,
        'selectedImageModel': selectedImageModel,
        'customStyleDescription': customStyleDescription,
        'numberOfCards': numberOfCards,
        'finalCardMessage': finalCardMessage,
        'toField': toField,
        'fromField': fromField,
        'isFrontBackOnly': isFrontBackOnly,
        'selectedPaperSize': selectedPaperSize,
        'created_at': time.time()
    }
    
    # Initialize job status
    active_jobs[job_id] = {
        'status': 'pending',
        'progress': 0,
        'data': job_data
    }
    
    # Start background processing thread
    thread = threading.Thread(target=generate_card_complete, args=(job_data,))
    thread.daemon = True
    thread.start()
    
    print(f"Started card generation job {job_id} for {userEmail}")
    
    return {
        "status": "success",
        "job_id": job_id,
        "message": f"Card generation started! You'll receive an email at {userEmail} when ready."
    }

@mcp.tool()
def get_job_status(job_id: str) -> Dict[str, Any]:
    """
    Get the status of a card generation job.
    
    Args:
        job_id: The job ID returned from submit_card_generation
    
    Returns:
        Dict with job status, progress, and results if completed
    """
    
    if job_id not in active_jobs:
        return {
            "status": "error",
            "message": "Job not found"
        }
    
    job = active_jobs[job_id]
    
    result = {
        "status": job['status'],
        "progress": job['progress']
    }
    
    if job['status'] == 'completed':
        result['card_url'] = job.get('card_url')
        result['images'] = job.get('images')
    elif job['status'] == 'failed':
        result['error'] = job.get('error')
    
    return result

@mcp.tool()
def list_active_jobs() -> Dict[str, Any]:
    """
    List all active card generation jobs (for monitoring/debugging).
    
    Returns:
        Dict with list of active jobs
    """
    
    jobs = []
    for job_id, job in active_jobs.items():
        jobs.append({
            'job_id': job_id,
            'status': job['status'],
            'progress': job['progress'],
            'email': job['data'].get('userEmail', 'unknown'),
            'card_type': job['data'].get('selectedType', 'unknown'),
            'created_at': job['data'].get('created_at', 0)
        })
    
    return {
        "status": "success",
        "active_jobs": jobs,
        "total_jobs": len(jobs)
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