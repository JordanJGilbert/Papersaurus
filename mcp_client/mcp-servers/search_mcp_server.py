from mcp.server.fastmcp import FastMCP
import os
import aiohttp
import asyncio
from typing import Any, Dict, Optional, List
from pydantic import BaseModel
import sys

# Load environment variables
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

BRAVE_API_KEY = "BSAG37Dcs5QXARJszGB8SaXACtBPndR"

mcp = FastMCP("Search MCP Server")

class Invocation(BaseModel):
    name: str
    arguments: dict[str, Any]

async def brave_search(query: str, count: int = 10, offset: Optional[int] = None, country: str = "us", search_lang: str = "en", freshness: Optional[str] = None, spellcheck: int = 1) -> Dict[str, Any]:
    if not BRAVE_API_KEY:
        return {
            "success": False,
            "error": "No API key available",
            "query": query,
            "web_results": [
                {"title": f"Example result for '{query}'", "url": "https://example.com", "description": "This is a fallback result. Add BRAVE_API_KEY to .env"}
            ]
        }
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
            if count is not None:
                params["count"] = min(count, 20)
            if offset is not None:
                params["offset"] = min(offset, 9)
            if freshness is not None:
                params["freshness"] = freshness
            async with session.get(
                "https://api.search.brave.com/res/v1/web/search",
                headers=headers,
                params=params
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    formatted_results = {
                        "success": True,
                        "query": query,
                        "web_results": []
                    }
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
                    return formatted_results
                else:
                    error_data = await response.text()
                    return {
                        "success": False,
                        "error": f"API returned status code {response.status}",
                        "query": query
                    }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "query": query
        }

async def brave_news_search(query: str, count: int = 10, offset: Optional[int] = None, country: str = "us", search_lang: str = "en", freshness: Optional[str] = None, spellcheck: int = 1) -> Dict[str, Any]:
    if not BRAVE_API_KEY:
        return {
            "success": False,
            "error": "No API key available",
            "query": query,
            "news_articles": [
                {"title": f"Example news about '{query}'", "url": "https://example.com/news", "description": "This is a fallback news result. Add BRAVE_API_KEY to .env"}
            ]
        }
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
                "spellcheck": spellcheck,
                "count": min(count, 20),
                "offset": offset or 0
            }
            if freshness is not None:
                params["freshness"] = freshness
            async with session.get(
                "https://api.search.brave.com/res/v1/news/search",
                headers=headers,
                params=params
            ) as response:
                if response.status == 200:
                    data = await response.json()
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
                                "breaking": article.get("breaking", False)
                            }
                            if "thumbnail" in article and "src" in article["thumbnail"]:
                                news_item["thumbnail"] = article["thumbnail"]["src"]
                            formatted_results["news_articles"].append(news_item)
                    return formatted_results
                else:
                    error_data = await response.text()
                    return {
                        "success": False,
                        "error": f"API returned status code {response.status}",
                        "query": query
                    }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "query": query
        }

async def brave_video_search(query: str, count: int = 10, offset: Optional[int] = None, country: str = "us", search_lang: str = "en", freshness: Optional[str] = None, spellcheck: int = 1) -> Dict[str, Any]:
    if not BRAVE_API_KEY:
        return {
            "success": False,
            "error": "No API key available", 
            "query": query,
            "videos": [
                {"title": f"Example video about '{query}'", "url": "https://example.com/video"}
            ]
        }
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
                "spellcheck": spellcheck,
                "count": min(count, 50)
            }
            if offset is not None:
                params["offset"] = min(offset, 9)
            if freshness is not None:
                params["freshness"] = freshness
            async with session.get(
                "https://api.search.brave.com/res/v1/videos/search",
                headers=headers,
                params=params
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    formatted_results = {
                        "success": True,
                        "query": query,
                        "videos": []
                    }
                    if "results" in data and isinstance(data["results"], list):
                        for video in data["results"]:
                            video_item = {
                                "title": video.get("title", "No title"),
                                "url": video.get("url", "No URL")
                            }
                            if "video" in video:
                                video_item["duration"] = video["video"].get("duration", "")
                                video_item["publisher"] = video["video"].get("publisher", "Unknown")
                                video_item["views"] = video["video"].get("views", "")
                            if "thumbnail" in video and "src" in video["thumbnail"]:
                                video_item["thumbnail"] = video["thumbnail"]["src"]
                            formatted_results["videos"].append(video_item)
                    return formatted_results
                else:
                    error_data = await response.text()
                    return {
                        "success": False,
                        "error": f"API returned status code {response.status}",
                        "query": query
                    }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "query": query
        }

@mcp.tool()
async def web_search(
    query: str,
    count: int = 10,
    offset: Optional[int] = None,
    country: str = "us",
    search_lang: str = "en",
    freshness: Optional[str] = None,
    spellcheck: int = 1
) -> dict:
    """
    Search the web for current, up-to-date information on any topic.

    When to use:
    - For time-sensitive, recent, or potentially outdated information.
    - For news, current events, statistics, prices, or anything that may have changed since your training data.
    - For queries about "latest", "current", "best right now", or similar.
    - For news queries (this tool is preferred for news as well).

    CRITICAL: For comprehensive or comparative queries, you MUST execute multiple parallel searches, each targeting a different sub-aspect or entity. Do NOT make sequential calls.
    
    Example: "What are the latest AI models?" you MUST run at least 3-5 parallel searches, such as:
      - "Latest OpenAI models 2025"
      - "Anthropic Claude models 2025"
      - "Google Gemini models 2025"
      - "Meta AI models 2025"
      - "DeepSeek models 2025"
    
    For industry overviews, competitive comparisons, or multi-faceted issues, always submit 3-5 focused queries in parallel.

    Tip: Using a count of at least 10 is generally recommended for more comprehensive results.

    Parameters:
        query: The search query to look up on the web.
        count: Maximum number of results to return (default 10, max 20).
        offset: Pagination offset for results (optional).
        country: Country code for localization (default "us").
        search_lang: Search language (default "en").
        freshness: Filter for result freshness (optional).
        spellcheck: Enable spellcheck corrections (default 1).
    """
    results = await brave_search(query, count, offset, country, search_lang, freshness, spellcheck)
    return results

@mcp.tool()
async def news_search(
    query: str,
    count: int = 10,
    offset: Optional[int] = None,
    country: str = "us",
    search_lang: str = "en",
    freshness: Optional[str] = None,
    spellcheck: int = 1
) -> dict:
    """
    Search for news articles on a specific topic using Brave News.

    When to use:
    - For up-to-date news coverage, breaking news, or recent developments on a topic.
    - For event timelines, news comparisons, or to gather multiple perspectives on a story.

    Best practices:
    - For broad topics, run several parallel queries targeting different subtopics, regions, or sources.
    - For example, to cover "AI regulation news 2025", run parallel queries for different regions or organizations (e.g., "AI regulation EU 2025", "AI regulation US 2025", "AI regulation China 2025").

    Tip: Using a count of at least 10 is generally recommended for more comprehensive results.

    Parameters:
    - query (str, required): The news search query.
    - count (int, optional): Number of articles to return (max: 20, default: 10).
    - offset (int, optional): Pagination offset (default: 0).
    - country (str, optional): Two-letter country code for localized news (default: 'us').
    - search_lang (str, optional): Language code for news results (default: 'en').
    - freshness (str, optional): Time filter for news (e.g., 'pd', 'pw', 'pm', 'py', or date range).
    - spellcheck (int, optional): Whether to enable spellcheck (default: 1).

    Returns:
    - dict: {"success": bool, "query": str, "news_articles": [ {"title": str, "url": str, "description": str, ...}, ... ]}

    Example usage (parallel):
    >>> results = await asyncio.gather(
    ...     news_search(query="AI regulation EU 2025", count=10),
    ...     news_search(query="AI regulation US 2025", count=10),
    ...     news_search(query="AI regulation China 2025", count=10)
    ... )
    """
    return await brave_news_search(query, count, offset, country, search_lang, freshness, spellcheck)

@mcp.tool()
async def video_search(
    query: str,
    count: int = 10,
    offset: Optional[int] = None,
    country: str = "us",
    search_lang: str = "en",
    freshness: Optional[str] = None,
    spellcheck: int = 1
) -> dict:
    """
    Search for videos on a specific topic using Brave Video (YouTube-focused).

    When to use:
    - For finding recent or relevant videos about a topic, event, or product.
    - For video comparisons, reviews, or tutorials.

    Best practices:
    - For broad or comparative topics, run several parallel queries for different brands, products, or perspectives.
    - Example: For "AI model demos 2025", run parallel queries for "OpenAI model demo 2025", "Anthropic model demo 2025", etc.

    Tip: Using a count of at least 10 is generally recommended for more comprehensive results.

    Parameters:
    - query (str, required): The video search query.
    - count (int, optional): Number of videos to return (max: 50, default: 10).
    - offset (int, optional): Pagination offset (default: 0).
    - country (str, optional): Two-letter country code for localized results (default: 'us').
    - search_lang (str, optional): Language code for video results (default: 'en').
    - freshness (str, optional): Time filter for videos (e.g., 'pd', 'pw', 'pm', 'py', or date range).
    - spellcheck (int, optional): Whether to enable spellcheck (default: 1).

    Returns:
    - dict: {"success": bool, "query": str, "videos": [ {"title": str, "url": str, ...}, ... ]}

    Example usage (parallel):
    >>> results = await asyncio.gather(
    ...     video_search(query="OpenAI model demo 2025", count=10),
    ...     video_search(query="Anthropic model demo 2025", count=10),
    ...     video_search(query="Google Gemini model demo 2025", count=10)
    ... )
    """
    return await brave_video_search(query, count, offset, country, search_lang, freshness, spellcheck)

@mcp.tool()
async def search_batch_tool(
    names: List[str],
    arguments_list: List[Any]
) -> dict:
    """
    Invoke multiple search tool calls in parallel and return all results in a single response.

    When to use:
    - For comprehensive answers requiring multiple perspectives or sources.
    - For comparing products, companies, or news from different regions.
    - For any query where you would otherwise make several parallel tool calls (e.g., "latest AI models" across different companies).

    Best practices:
    - Always use this tool to batch 3-5 parallel searches for complex or comparative queries.
    - Each entry in 'names' should be a valid tool name (e.g., 'web_search', 'news_search', 'video_search').
    - Each entry in 'arguments_list' should be a dictionary of arguments for the corresponding tool.
    - Both lists must be the same length.

    Tip: Using a count of at least 10 for each search is generally recommended for more comprehensive results.

    Example: To get the latest AI models from multiple companies, call:
    >>> await search_batch_tool(
    ...     names=["web_search", "web_search", "web_search", "web_search", "web_search"],
    ...     arguments_list=[
    ...         {"query": "Latest OpenAI models 2025", "count": 10},
    ...         {"query": "Anthropic Claude models 2025", "count": 10},
    ...         {"query": "Google Gemini models 2025", "count": 10},
    ...         {"query": "Meta AI models 2025", "count": 10},
    ...         {"query": "DeepSeek models 2025", "count": 10}
    ...     ]
    ... )

    Returns:
    - dict: {"batch_results": [result1, result2, ...]} where each result is the output of the corresponding tool call.
    - If a tool name is unknown or arguments are invalid, the result will include an error message for that entry.
    """
    results = []
    tasks = []
    tool_map = {
        "web_search": web_search,
        "news_search": news_search,
        "video_search": video_search,
    }
    
    for name, arguments in zip(names, arguments_list):
        tool_func = tool_map.get(name)
        if not tool_func:
            results.append({"success": False, "error": f"Unknown tool: {name}"})
            continue
            
        try:
            # Process arguments - handle special case for "any_key" parameter
            processed_args = {}
            if isinstance(arguments, dict):
                # If arguments contains "any_key", parse it for web_search parameters
                if "any_key" in arguments:
                    any_key_value = arguments["any_key"]
                    if isinstance(any_key_value, str):
                        # Parse query string format like "query:Latest OpenAI models 2025,count:3,..."
                        # or "query: Latest OpenAI models 2025, count: 3, ..."
                        params = any_key_value.split(',')
                        for param in params:
                            if ':' in param:
                                key, value = param.split(':', 1)
                                # Strip whitespace and remove quotes from both key and value
                                key = key.strip()
                                value = value.strip()
                                
                                # Convert numeric values
                                if value.isdigit():
                                    processed_args[key] = int(value)
                                else:
                                    processed_args[key] = value
                    else:
                        # If any_key isn't a string, add an error and continue
                        results.append({"success": False, "error": f"Invalid any_key format for {name}: {any_key_value}"})
                        continue
                else:
                    # Use arguments directly if no any_key
                    processed_args = arguments
            else:
                # If arguments isn't a dict, add an error and continue
                results.append({"success": False, "error": f"Invalid arguments format for {name}: {arguments}"})
                continue
                
            # Log the processed arguments for debugging
            print(f"[DEBUG] Calling {name} with processed arguments: {processed_args}", file=sys.stderr)
            
            # Add the task with processed arguments
            tasks.append(tool_func(**processed_args))
        except Exception as e:
            print(f"[ERROR] Exception preparing {name} task: {str(e)}", file=sys.stderr)
            results.append({"success": False, "error": f"Error preparing {name} task: {str(e)}"})
    
    if tasks:
        try:
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Process results, converting exceptions to error messages
            for result in batch_results:
                if isinstance(result, Exception):
                    results.append({"success": False, "error": f"Tool execution failed: {str(result)}"})
                else:
                    # If the result is not a dict, wrap it
                    if isinstance(result, dict):
                        results.append(result)
                    else:
                        results.append({"success": True, "result": result})
        except Exception as e:
            print(f"[ERROR] Exception in batch execution: {str(e)}", file=sys.stderr)
            results.append({"success": False, "error": f"Batch execution failed: {str(e)}"})
    
    return {"batch_results": results}

if __name__ == "__main__":
    mcp.run()