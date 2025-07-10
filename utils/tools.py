import aiohttp
import os
# from utils.constants import DOMAIN, APP_DB_PREFIX # DOMAIN will be fetched by os.getenv directly
from utils.constants import APP_DB_PREFIX
from utils.signal_utils import send_signal_message, save_ai_response
from system_prompts import PROFESSIONAL_PROMPT
from datetime import datetime, timezone
import uuid
from database import write_data
import re
import asyncio
import json
import subprocess
import sys
import base64

BRAVE_API_KEY = os.getenv('BRAVE_API_KEY')  # Add this to your .env file
# Replace both search functions with a single unified search function
async def brave_search(query, count=10, offset=None, country="us", search_lang="en", 
                       freshness=None, spellcheck=1):
    """
    Perform a comprehensive search using Brave Search API
    
    Args:
        query (str): The search query
        count (int, optional): Number of results to return (max 20, default 20)
        offset (int, optional): Zero-based offset for pagination (max 9, default 0)
        country (str): Country code for localized results (default: "us")
        search_lang (str): Language code for search results (default: "en")
        freshness (str, optional): Time filter e.g. "pd" (24h), "pw" (week), "pm" (month)
        spellcheck (int): Whether to check spelling (default: 1)
        
    Returns:
        dict: Formatted search results or error information
    """
    try:
        async with aiohttp.ClientSession() as session:
            headers = {
                "Accept": "application/json",
                "Accept-Encoding": "gzip",
                "X-Subscription-Token": BRAVE_API_KEY
            }
            
            params = {
                "q": query,
                "country": country,
                "search_lang": search_lang,
                "spellcheck": spellcheck
            }
            
            # Add optional parameters if specified
            if count is not None:
                params["count"] = min(count, 20)
            
            if offset is not None:
                params["offset"] = min(offset, 9)  # Max offset is 9
                
            if freshness is not None:
                params["freshness"] = freshness
            
            print(f"Making Brave Search API request for: {query}")
            params["count"] = 6
            async with session.get(
                "https://api.search.brave.com/res/v1/web/search",
                headers=headers,
                params=params
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"[DEBUG] Brave search raw response received for: {query}")
                    
                    # Format the response data
                    formatted_results = {
                        "success": True,
                        "query": query,
                        "web_results": []
                    }
                    
                    # Extract web results if available
                    if "web" in data and "results" in data["web"]:
                        for result in data["web"]["results"]:
                            web_item = {
                                "title": result.get("title", ""),
                                "url": result.get("url", ""),
                                "description": result.get("description", ""),
                                "age": result.get("age", ""),
                                "language": result.get("language", "")
                            }
                                
                            formatted_results["web_results"].append(web_item)
                    
                    # Add news results if available
                    if "news" in data and "results" in data["news"]:
                        formatted_results["news_results"] = []
                        for news in data["news"]["results"]:
                            news_item = {
                                "title": news.get("title", ""),
                                "url": news.get("url", ""),
                                "description": news.get("description", ""),
                                "age": news.get("age", ""),
                                "source": news.get("source", "")
                            }   
                            formatted_results["news_results"].append(news_item)
                    
                    # Add video results if available
                    if "videos" in data and "results" in data["videos"]:
                        formatted_results["video_results"] = []
                        for video in data["videos"]["results"]:
                            video_item = {
                                "title": video.get("title", ""),
                                "url": video.get("url", "")
                            }
                            
                            if "video" in video:
                                video_item["duration"] = video["video"].get("duration", "")
                                video_item["publisher"] = video["video"].get("publisher", "")
                                
                            if "thumbnail" in video and "src" in video["thumbnail"]:
                                video_item["thumbnail"] = video["thumbnail"]["src"]
                                
                            formatted_results["video_results"].append(video_item)
                    
                    # Add FAQ results if available
                    if "faq" in data and "results" in data["faq"]:
                        formatted_results["faq_results"] = []
                        for faq in data["faq"]["results"]:
                            faq_item = {
                                "question": faq.get("question", ""),
                                "answer": faq.get("answer", ""),
                                "url": faq.get("url", "")
                            }
                            formatted_results["faq_results"].append(faq_item)
                    
                    print(f"Brave Search API response: {len(formatted_results.get('results', []))} results, {len(formatted_results.get('faq_results', []))} FAQs")
                    return formatted_results
                else:
                    error_data = await response.text()
                    print(f"Brave Search API error: {response.status} - {error_data}")
                    return {
                        "success": False,
                        "error": f"API returned status code {response.status}",
                        "query": query
                    }
    except Exception as e:
        print(f"Error in Brave Search: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "query": query
        }


async def brave_video_search(query, count=10, offset=None, country="us", search_lang="en",
                            freshness=None, spellcheck=1):
    """
    Perform a video search using Brave Video Search API
    
    Args:
        query (str): The search query
        count (int, optional): Number of results to return (max 50, default 20)
        offset (int, optional): Zero-based offset for pagination (max 9, default 0)
        country (str): Country code for localized results (default: "us")
        search_lang (str): Language code for search results (default: "en")
        freshness (str, optional): Time filter e.g. "pd" (24h), "pw" (week), "pm" (month)
        spellcheck (int): Whether to check spelling (default: 1)
        
    Returns:
        dict: Formatted video search results or error information
    """
    try:
        async with aiohttp.ClientSession() as session:
            headers = {
                "Accept": "application/json",
                "Accept-Encoding": "gzip",
                "X-Subscription-Token": BRAVE_API_KEY
            }
            
            params = {
                "q": query + " site:youtube.com",
                "country": country,
                "search_lang": search_lang,
                "spellcheck": spellcheck
            }
            
            # Add optional parameters if specified
            if count is not None:
                params["count"] = min(count, 50)  # Video search max is 50
            
            if offset is not None:
                params["offset"] = min(offset, 9)  # Max offset is 9
                
            if freshness is not None:
                params["freshness"] = freshness
            
            print(f"Making Brave Video Search API request for: {query}")
            
            async with session.get(
                "https://api.search.brave.com/res/v1/videos/search",
                headers=headers,
                params=params
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"Received raw video search results for: {query}")
                    
                    # Format the video search results
                    formatted_results = {
                        "success": True,
                        "query": query,
                        "videos": []
                    }
                    
                    if "results" in data and isinstance(data["results"], list):
                        for video in data["results"]:
                            video_item = {
                                "title": video.get("title", "No title"),
                                "url": video.get("url", "No URL"),
                                "thumbnail": video.get("thumbnail", {}).get("src", "")
                            }
                            
                            # Add video metadata if available
                            if "video" in video:
                                video_item["duration"] = video["video"].get("duration", "")
                                video_item["publisher"] = video["video"].get("publisher", "Unknown")
                                video_item["views"] = video["video"].get("views", "")
                                
                            formatted_results["videos"].append(video_item)
                            
                        # Print debug information
                        print(f"\n=== BRAVE API: Formatted {len(formatted_results['videos'])} video results for '{query}' ===")
                    
                    return formatted_results
                else:
                    error_data = await response.text()
                    print(f"Brave Video Search API error: {response.status} - {error_data}")
                    return {
                        "success": False,
                        "error": f"API returned status code {response.status}",
                        "query": query
                    }
    except Exception as e:
        print(f"Error in Brave Video Search: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "query": query
        }

async def brave_image_search(query, count=None, country="us", search_lang="en", spellcheck=1):
    """
    Perform an image search using Brave Image Search API
    
    Args:
        query (str): The search query
        count (int, optional): Number of results to return (max 100, default 50)
        country (str): Country code for localized results (default: "us")
        search_lang (str): Language code for search results (default: "en")
        spellcheck (int): Whether to check spelling (default: 1)
        
    Returns:
        dict: Raw API response or error information
    """
    try:
        async with aiohttp.ClientSession() as session:
            headers = {
                "Accept": "application/json",
                "Accept-Encoding": "gzip",
                "X-Subscription-Token": BRAVE_API_KEY
            }
            
            params = {
                "q": query,
                "country": country,
                "search_lang": search_lang,
                "spellcheck": spellcheck
            }
            
            # Add count if specified
            if count is not None:
                params["count"] = min(count, 100)  # Image search max is 100
            
            print(f"Making Brave Image Search API request for: {query}")
            
            async with session.get(
                "https://api.search.brave.com/res/v1/images/search",
                headers=headers,
                params=params
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"Received raw image search results for: {query}")
                    return {
                        "success": True,
                        "results": data,  # Return raw API response
                        "query": query
                    }
                else:
                    error_data = await response.text()
                    print(f"Brave Image Search API error: {response.status} - {error_data}")
                    return {
                        "success": False,
                        "error": f"API returned status code {response.status}",
                        "query": query
                    }
    except Exception as e:
        print(f"Error in Brave Image Search: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "query": query
        }

async def brave_news_search(query, count=10, offset=0, country="us", search_lang="en",
                           freshness=None, spellcheck=1):
    """
    Perform a news search using Brave News Search API
    
    Args:
        query (str): The search query
        count (int, optional): Number of results to return (max 50, default 20)
        offset (int, optional): Zero-based offset for pagination (max 9, default 0)
        country (str): Country code for localized results (default: "us")
        search_lang (str): Language code for search results (default: "en")
        freshness (str, optional): Time filter e.g. "pd" (24h), "pw" (week), "pm" (month)
        spellcheck (int): Whether to check spelling (default: 1)
        
    Returns:
        dict: Formatted news search results or error information
    """
    try:
        async with aiohttp.ClientSession() as session:
            headers = {
                "Accept": "application/json",
                "Accept-Encoding": "gzip",
                "X-Subscription-Token": BRAVE_API_KEY
            }
            
            # Ensure default values are used if None is passed
            if count is None:
                count = 10
            if offset is None:
                offset = 0
            if country is None:
                country = "us"
            if search_lang is None:
                search_lang = "en"
            if spellcheck is None:
                spellcheck = 1
            
            params = {
                "q": query,
                "country": country,
                "search_lang": search_lang,
                "spellcheck": spellcheck,
                "count": count,
                "offset": offset
            }

            params["count"] = 6
            
            # Only add freshness if it's not None
            if freshness is not None:
                params["freshness"] = freshness
                
            print(f"Brave News Search API params: {params}")
            
            print(f"Making Brave News Search API request for: {query}")
            
            async with session.get(
                "https://api.search.brave.com/res/v1/news/search",
                headers=headers,
                params=params
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"Received raw news search results for: {query}")
                    
                    # Format the news search results
                    formatted_results = {
                        "success": True,
                        "query": query,
                        "news_articles": []
                    }
                    
                    if "results" in data and isinstance(data["results"], list):
                        for article in data["results"]:
                            news_item = {
                                "title": article.get("title", "No title"),
                                "url": article.get("url", "No URL"),
                                "description": article.get("description", ""),
                                "source": article.get("source", "Unknown source"),
                                "age": article.get("age", ""),
                                "breaking": article.get("breaking", False),
                                "is_live": article.get("is_live", False)
                            }
                            
                            # Add thumbnail if available
                            if "thumbnail" in article and "src" in article["thumbnail"]:
                                news_item["thumbnail"] = article["thumbnail"]["src"]
                                
                                
                            formatted_results["news_articles"].append(news_item)
                            
                        # Print debug information
                        print(f"\n=== BRAVE API: Formatted {len(formatted_results['news_articles'])} news results for '{query}' ===")
                    
                    return formatted_results
                else:
                    error_data = await response.text()
                    print(f"Brave News Search API error: {response.status} - {error_data}")
                    return {
                        "success": False,
                        "error": f"API returned status code {response.status}",
                        "query": query
                    }
    except Exception as e:
        print(f"Error in Brave News Search: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "query": query
        }

async def generate_image_and_get_url(prompt, num_images=1):
    """
    Generate an image with Imagen based on a text prompt and return a URL to access it
    
    Args:
        prompt (str): The text description to generate an image from
        num_images (int, optional): Number of images to generate (default: 1)
    
    Returns:
        dict: A dictionary containing success status and URLs to access the generated images
    """
    try:
        # Import here to avoid circular imports
        from utils.ai_models import AIModelHandler
        
        # Generate the image using Imagen
        results = await AIModelHandler.generate_image(prompt, model="imagen", num_images=1)
        
        if not results:
            return {
                "success": False,
                "error": "Failed to generate image",
                "prompt": prompt
            }
        
        # Create URLs for each generated image
        image_urls = []
        for idx, (image_base64, img_prompt) in enumerate(results):
            # Generate a unique key for this image
            key = f"imagen_{uuid.uuid4()}"
            
            try:
                # Store the image data in the database
                await write_data(key, image_base64)
                
                # Create URL to access the image via serve_image endpoint
                current_domain = os.getenv("DOMAIN") # Get domain from .env
                image_url = f"{current_domain}/serve_image?key={key}&type=image/jpeg"
                image_urls.append(image_url)
                print(f"Created image URL: {image_url}")
            except Exception as e:
                print(f"Error storing image {idx}: {str(e)}")
        
        return {
            "success": True,
            "urls": image_urls,
            "prompt": prompt,
            "count": len(image_urls)
        }
        
    except Exception as e:
        print(f"Error in generate_image_and_get_url: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "prompt": prompt
        }
    
async def generate_app_name(prompt):
    """Generate a meaningful app name using AI based on the app description"""
    try:
        naming_prompt = """
        Generate a short, catchy name for a web app based on this description:
        
        Description: {prompt}
        
        Requirements for the name:
        - Keep it concise (1-3 words)
        - Make it relevant to the app's purpose
        - Use a clear, memorable name
        - Don't use generic terms like "App" or "Web App"
        - Don't include words like "Simple", "Basic", etc.
        - Don't use quotes or special characters
        
        Return ONLY the name, nothing else.
        """
        
        app_name = await AIModelHandler.chat_completion(
            prompt=naming_prompt.format(prompt=prompt),
            model="gemini"
        )
        app_name = app_name[0]

        return app_name
    except Exception as e:
        print(f"Error generating app name: {e}")
        return None

async def create_web_app(prompt, attachments=None, sender="+17145986105", app_name=None, model='sonnet'):
    """Handle creation of a custom web application
    
    Args:
        prompt (str): Description of the desired web application
        attachments (list, optional): List of attachment information (URLs and descriptions)
        sender (str, optional): ID of the sender/user requesting the app
        app_name (str, optional): Custom name for the app, will be AI-generated if not provided
        
    Returns:
        dict: A dictionary with app creation status, URL, app ID, app name, and cost information
    """
    try:
        # Send initial status message

        app_id = str(uuid.uuid4())[:10]  # Generate short unique ID
        app_key = f"app-{app_id}"
        
        # If no app name provided, generate one with AI
        if not app_name:
            ai_generated_name = await generate_app_name(prompt)
            if ai_generated_name:
                app_name = ai_generated_name
            else:
                # Fallback if AI name generation fails
                app_name = f"App {app_id}"
        
        # Create a basic HTML template to start with
        basic_template = """<!DOCTYPE html>
<html>
<head>
    <title>Web App</title>
</head>
<body>
    <!-- Content will be generated here -->
</body>
</html>"""

        # Format attachments information for the edit request if provided
        attachment_context = ""
        if attachments and isinstance(attachments, list):
            attachment_context = "\n\nAttachments:\n"
            for i, attachment in enumerate(attachments):
                attachment_context += f"{i+1}. {attachment}\n"
                
        # Prepare the complete edit request with prompt and additional context
        edit_request = prompt + attachment_context
        
        # Use the editor directly instead of the streaming endpoint
        from app import editor  # Import the editor instance from app.py
                
        # Use the editor to generate the full HTML content with optional image reference
        edit_result = await editor.edit_file(
            file_content=basic_template,
            edit_request=f"Create a web application based on this description: {edit_request}",
            filename="app.html",
            model=model
        )

        # Extract cost information (defaults to 0.0 if not present)
        message_cost = edit_result.get('message_cost', 0.0)
        session_cost = edit_result.get('session_cost', 0.0)

        # Check for success before accessing modified_content
        if not edit_result.get('success'):
             # Log or handle the error appropriately
             error_detail = edit_result.get('error', 'Unknown editor error')
             print(f"Aider editing failed: {error_detail}")
             # Return an error status or raise an exception
             return {
                 "status": "error",
                 "message": f"Failed to generate HTML content: {error_detail}",
                 "message_cost": message_cost,
                 "session_cost": session_cost
             }

        html_content = edit_result['modified_content']

        # Check content length *after* confirming success
        if not html_content or len(html_content) < 20:
            # This might indicate an issue even if aider reported success
            print(f"Warning: Generated HTML content seems too short. Aider output: {edit_result.get('output','')}")
            return {
                "status": "error",
                "message": "Failed to generate sufficient HTML content",
                "message_cost": message_cost,
                "session_cost": session_cost
            }
        
        print(f"Generated HTML content: {html_content[:500]}")
        print(f"App creation costs: ${message_cost:.4f} message, ${session_cost:.4f} session")
        
        # Create editor script with a more robust approach
        editor_js = f"""
        document.addEventListener('keydown', function(e) {{
            if (e.ctrlKey && e.key === 'e') {{
                e.preventDefault();
                window.location.href = '{os.getenv("DOMAIN")}/editor?key={app_key}';
            }}
        }});
        """

        # Wrap script in proper tags
        wrapped_script = f"""
        <script>
            (function() {{
                {editor_js}
            }})();
        </script>
        """

        # Inject the script before closing body tag
        if '</body>' in html_content:
            html_content = html_content.replace('</body>', f'{wrapped_script}</body>')
        else:
            html_content = f"""
                {html_content.rstrip()}
                {wrapped_script}
            </body>
            </html>
            """

        # Calculate line count
        line_count = html_content.count('\n') + 1
        
        # Save the app to database with additional debug info and context
        app_data = {
            "html": html_content,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "app_name": app_name,
            "message_cost": message_cost,
            "session_cost": session_cost
        }
        
        write_result = await write_data(app_key, app_data, app_name=app_name)
        if write_result['status'] != 'success':
            raise Exception("Failed to save app")

        # Generate serve URL
        serve_url = f"{os.getenv("DOMAIN")}/serve?key={app_key}"
        
        # Save to user's app collection
        from database import save_user_app
        await save_user_app(sender, app_name, app_id, app_key, serve_url)
        
        return {
            "status": "success",
            "url": serve_url,
            "app_id": app_id,
            "app_key": app_key,
            "app_name": app_name,
            "line_count": line_count,  # Add the line count directly
            "message_cost": message_cost,
            "session_cost": session_cost,
            "total_cost": message_cost + session_cost
        }

    except Exception as e:
        print(f"Error creating app: {e}")

        return {
            "status": "error",
            "message": str(e),
            "message_cost": 0.0,
            "session_cost": 0.0,
            "total_cost": 0.0
        }
