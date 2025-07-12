#!/usr/bin/env python3
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
from fastmcp import FastMCP, Context
import uuid
import re
import json
import requests
import base64
import filetype
import csv
import io
from googleapiclient.discovery import build
from google.oauth2 import service_account
from utils.constants import DOMAIN
from system_prompts import PDF_HTML_SYSTEM_PROMPT
from utils.tools import write_data
import weasyprint
from google import genai
from google.genai import types
from PIL import Image
from io import BytesIO
import asyncio
import hashlib
from typing import List, Optional, Dict, Tuple, Any, Annotated, Literal
import logging
from email.mime.text import MIMEText
from googleapiclient.http import MediaIoBaseUpload
from llm_adapters import (
    get_llm_adapter,
    StandardizedMessage,
    StandardizedLLMConfig,
    AttachmentPart
)
from playwright.async_api import async_playwright
from pydantic import Field
import datetime

# Import the new robust search/replace functionality
from utils.search_replace import (
    SearchReplaceBlockParser,
    SearchReplaceApplicator,
    apply_search_replace_blocks,
    flexible_search_and_replace,
    editblock_strategies
)

logging.basicConfig(stream=sys.stderr, level=logging.WARNING, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def clean_json_response(text):
    """
    Clean JSON response by removing leading non-JSON characters and other common issues.
    """
    if not text:
        return text
        
    # Remove leading/trailing whitespace
    text = text.strip()
    
    # Remove leading non-JSON characters (like ! or other prefixes before {)
    if text and not text.startswith('{'):
        # Find the first { character
        start_idx = text.find('{')
        if start_idx > 0:
            text = text[start_idx:]
    
    return text

mcp = FastMCP("Document Generation Server")

# --- Supported LLM Models ---
MODELS_LITERAL = Literal[
    "gemini-2.5-flash-preview-05-20",
    "gemini-2.5-flash-lite-preview-06-17",
    "gemini-2.5-pro-preview-05-06",
    "gemini-2.5-pro-preview-06-05",
    "gemini-2.5-pro",
    "models/gemini-2.0-flash",
    "gemini-2.0-flash",
    "claude-3-7-sonnet-latest",
    "gpt-4.1-2025-04-14",
    "o4-mini-2025-04-16"
]
SUPPORTED_MODELS_TUPLE = (
    "gemini-2.5-flash-preview-05-20",
    "gemini-2.5-flash-lite-preview-06-17",
    "gemini-2.5-pro-preview-05-06",
    "gemini-2.5-pro-preview-06-05",
    "gemini-2.5-pro",
    "models/gemini-2.0-flash",
    "gemini-2.0-flash",
    "claude-3-7-sonnet-latest",
    "gpt-4.1-2025-04-14",
    "o4-mini-2025-04-16"
)

async def download_and_create_attachment_part(url: str) -> Optional[AttachmentPart]:
    """Download a URL and convert it to an AttachmentPart for AI processing."""
    try:
        print(f"Downloading attachment: {url}")
        response = await asyncio.to_thread(requests.get, url, timeout=10)
        response.raise_for_status()
        
        content_type = response.headers.get('Content-Type', '')
        
        # Check if it's an image
        if content_type.startswith('image/'):
            print(f"Successfully downloaded image: {url} ({content_type}, {len(response.content)} bytes)")
            return AttachmentPart(
                mime_type=content_type,
                data=response.content,
                name=url.split('/')[-1].split('?')[0] or "image"
            )
        else:
            print(f"Skipping non-image attachment: {url} (type: {content_type})")
            return None
            
    except Exception as e:
        print(f"Failed to download attachment {url}: {e}")
        return None

# --- System Prompts for Editing ---
EDIT_WEB_APP_SYSTEM_PROMPT = """You will be given the complete original content of an HTML file and a user's request describing desired modifications.

Once you understand the request:

1. Think step-by-step and explain the needed changes in a few short sentences.

2. Provide each change using SEARCH/REPLACE blocks in standard markdown format.

You can format your response naturally - the system will automatically parse and extract the search/replace blocks from your response, whether they're in ```html code blocks or plain text.

# Example conversations:

## USER: Add a dark mode toggle button to the header

## ASSISTANT: I need to add a dark mode toggle button to the header section and implement the toggle functionality.

Here are the *SEARCH/REPLACE* blocks:

```html
<<<<<<< SEARCH
    <header class="bg-white shadow-sm">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h1 class="text-2xl font-bold text-gray-900">My App</h1>
        </div>
    </header>
=======
    <header class="bg-white dark:bg-gray-900 shadow-sm">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">My App</h1>
            <button id="darkModeToggle" class="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                🌙
            </button>
        </div>
    </header>
>>>>>>> REPLACE
```

```html
<<<<<<< SEARCH
    <script>
        // Existing JavaScript
    </script>
=======
    <script>
        // Dark mode toggle functionality
        const darkModeToggle = document.getElementById('darkModeToggle');
        darkModeToggle.addEventListener('click', () => {
            document.documentElement.classList.toggle('dark');
            const isDark = document.documentElement.classList.contains('dark');
            darkModeToggle.textContent = isDark ? '☀️' : '🌙';
            localStorage.setItem('darkMode', isDark);
        });

        // Existing JavaScript
    </script>
>>>>>>> REPLACE
```

# *SEARCH/REPLACE block* Rules:

Every *SEARCH/REPLACE block* must use this format:
1. The opening fence and code language: ```html
2. The start of search block: <<<<<<< SEARCH
3. A contiguous chunk of lines to search for in the existing source code
4. The dividing line: =======
5. The lines to replace into the source code
6. The end of the replace block: >>>>>>> REPLACE
7. The closing fence: ```

Every *SEARCH* section must *EXACTLY MATCH* the existing file content, character for character, including all comments, docstrings, etc.
If the file contains code or other data wrapped/escaped in json/xml/quotes or other containers, you need to propose edits to the literal contents of the file, including the container markup.

*SEARCH/REPLACE* blocks will *only* replace the first match occurrence.
Include multiple unique *SEARCH/REPLACE* blocks if needed.
Include enough lines in each SEARCH section to uniquely match each set of lines that need to change.

Keep *SEARCH/REPLACE* blocks concise.
Break large *SEARCH/REPLACE* blocks into a series of smaller blocks that each change a small portion of the file.
Include just the changing lines, and a few surrounding lines if needed for uniqueness.
Do not include long runs of unchanging lines in *SEARCH/REPLACE* blocks.

To move code within a file, use 2 *SEARCH/REPLACE* blocks: 1 to delete it from its current location, 1 to insert it in the new location.

Pay careful attention to the scope of the user's request.
Do what they ask, but no more.

IMPORTANT EDITING GUIDELINES:
1. Use precise SEARCH/REPLACE blocks for targeted edits
2. Preserve all existing functionality unless explicitly asked to change it
3. Make minimal changes necessary to implement the request
4. Maintain code structure, styling, and architecture
5. Keep responsive design and accessibility features intact
6. Preserve any localStorage, API calls, or MCP tool integrations
7. Follow all web development principles

The system will automatically extract your search/replace blocks regardless of markdown formatting, so focus on providing clear, accurate edits."""

def sanitize_for_path(name_part: str) -> str:
    """Sanitizes a string to be safe for use as part of a directory or file name."""
    if not isinstance(name_part, str):
        name_part = str(name_part)

    # Check if it looks like a phone number (e.g., starts with '+')
    # to apply phone-specific sanitization for consistency with signal_bot.py
    is_phone_number_like = name_part.startswith('+')
    
    if is_phone_number_like:
        # Remove leading '+' and then all other non-alphanumeric characters.
        # This makes it consistent with re.sub(r'\\W+', '', sender_number) used elsewhere for phone numbers.
        temp_name_part = name_part[1:] # Remove leading '+'
        name_part = re.sub(r'\W+', '', temp_name_part) # \W matches any non-word character (letters, numbers, underscore)
                                                      # For a typical phone number string like "1 (714) 555-1212",
                                                      # this will become "17145551212"
    else:
        # Existing general sanitization for app_names, doc_names, group_ids etc.
        # Hash group IDs for consistent, short, safe names
        if name_part.startswith('group_'):
            group_id_val = name_part[len('group_'):]
            hash_val = hashlib.md5(group_id_val.encode()).hexdigest()[:12] # Slightly longer hash
            name_part = f"group_{hash_val}"
        
        name_part = re.sub(r'[^\w.-]', '_', name_part) # Allow word chars, dots, hyphens; replace others with underscore
        name_part = re.sub(r'_+', '_', name_part) # Collapse multiple underscores
        name_part = name_part.strip('_.- ') # Strip leading/trailing problematic chars

    if not name_part: # Fallback for empty string after sanitization (applies to both paths)
        return f"sanitized_{uuid.uuid4().hex[:8]}"
    return name_part

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

def process_attachments(attachments):
    """
    Processes a list of attachments (URL strings or base64-encoded strings) and returns a list:
    processed_attachments: list of dicts with 'url' or 'base64', and 'content_type' (inferred via HEAD request or filetype)
    """
    processed_attachments = []
    if attachments and isinstance(attachments, list):
        for i, item in enumerate(attachments):
            content_type = ''
            # URL string
            if isinstance(item, str) and item.startswith(('http://', 'https://')):
                try:
                    resp = requests.head(item, allow_redirects=True, timeout=5)
                    content_type = resp.headers.get('Content-Type', '')
                except Exception:
                    content_type = '' # Keep content_type empty if HEAD request fails
                processed_attachments.append({'url': item, 'content_type': content_type})
            # If item is not a valid URL string, log a warning and skip it.
            elif isinstance(item, str): # It's a string, but not a http/https URL
                print(f"Skipping attachment item: '{item[:100]}...' as it is not a valid HTTP/HTTPS URL. Only URL attachments are supported.")
                continue
            else: # Not a string or not a URL
                print(f"Skipping non-string or invalid attachment item (type: {type(item)}): '{str(item)[:100]}...'. Only URL attachments are supported.")
                continue
    return processed_attachments

def prepare_standardized_attachments(processed_attachments: list) -> List[AttachmentPart]:
    attachment_parts = []
    for att in processed_attachments:
        data_bytes = None
        mime_type = att.get('content_type', '')
        name = att.get('url', None) # Use URL as name if available

        if 'url' in att:
            url = att['url']
            try:
                # Skip PDF download for LLM, URL is usually sufficient for context
                if mime_type == 'application/pdf':
                    # print(f"Skipping download of PDF attachment {url} for LLM, will pass URL if needed in prompt.")
                    # Optionally, you could still add a marker or basic info if PDFs are to be "mentioned"
                    continue 
                
                resp = requests.get(url, timeout=10)
                resp.raise_for_status()
                data_bytes = resp.content
                if not mime_type: # If HEAD request failed to get content_type
                    mime_type = resp.headers.get('Content-Type', '')
                
                # Guess mime_type if it's generic or missing
                if not mime_type or mime_type == 'application/octet-stream':
                    kind = filetype.guess(data_bytes)
                    if kind: mime_type = kind.mime
                    else: mime_type = 'application/octet-stream' # fallback
            
            except requests.exceptions.RequestException as e:
                print(f"Warning: Could not download attachment from {url} for LLM: {e}")
                continue
            except Exception as e:
                print(f"Warning: Error processing URL attachment {url} for LLM: {e}")
                continue
        
        if data_bytes and mime_type:
            # The adapter will handle images. PDFs are generally not sent as raw bytes to Gemini chat models.
            if mime_type.startswith('image/'):
                 attachment_parts.append(AttachmentPart(mime_type=mime_type, data=data_bytes, name=name))
            # else:
                # print(f"Skipping attachment with mime_type {mime_type} for LLM as it's not an image.")
        elif data_bytes and not mime_type:
             print(f"Warning: Could not determine mime_type for an attachment, skipping for LLM.")
             
    return attachment_parts

import datetime
current_date = datetime.datetime.now().strftime("%Y-%m-%d")
WEB_APP_PROMPT = """You're an expert web developer.
Current date: """ + current_date + """

In your code follow the principle of least surprise. Try to do things in the obvious way.
# Website Design Requirements
Inspired by Apple, Steve Jobs, Jony Ive, and Dieter Rams

## Implementation Philosophy
- Implement EXACTLY what the user requests - nothing more, nothing less
- Remember Jobs' philosophy: "Design is not just what it looks like and feels like. Design is how it works."

## Core Design Principles

1. Simplicity & Clarity
- Clean, uncluttered layout
- Intuitive navigation
- Minimal visual distractions
- Purpose-driven design elements

2. Visual Aesthetics
- Refined, neutral color palette
- Subtle accent colors
- Effective use of white space
- Clear, modern typography
- Glassmorphism and blur effects where appropriate

3. Functional Design
- Usability first approach
- Clear visual hierarchy
- Intuitive call-to-actions
- Self-explanatory UI elements

4. Attention to Detail
- Precise element placement
- Consistent spacing
- Thoughtful interactions
- Cohesive design language
- Polish in every aspect

## Dark Mode Implementation
- ALWAYS implement system-based dark mode support for all web apps
- Use Tailwind's built-in dark mode functionality that automatically detects system preferences
- Add the following to your HTML head to enable system preference detection:
  ```html
  <script>
    // On page load or when changing themes, best practice to add both dark class and colorScheme
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
  </script>
  ```
- Use Tailwind's dark mode variant for styling: 
  - Example: `<div class="bg-white text-gray-800 dark:bg-gray-900 dark:text-white">`
- Ensure sufficient contrast in both modes
- Test all interactive elements in both light and dark modes
- For Apple-inspired dark mode, use subtle dark backgrounds (not pure black) and softer whites
- Be thoughtful with shadows and borders which may need different treatment in dark mode

## Mobile-First Design Requirements
- ALWAYS design for mobile screens first, then scale up to larger screens. Ensure looks good on desktop as well, but mobile first.
- VERY IMPORTANT: Prevent horizontal scrolling at ALL costs - this is critical for user experience
- Implement proper viewport meta tag: <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
- Ensure touch targets are setup for mobile devices
- Stack elements vertically on mobile instead of using horizontal layouts
- Use appropriate spacing between interactive elements
- Implement collapsible navigation for mobile screens when necessary

## Production Reliability Guidelines
- ALWAYS choose the most reliable implementation approach
- These applications go directly to production - any bugs are catastrophic
- Prefer proven, well-tested methods over experimental techniques
- When faced with multiple implementation options, choose the one most likely to work across all environments

## Database Storage Guidelines
- For persistent data storage use local storage.

## Implementation Guidelines
- ALWAYS use Tailwind CSS CDN via script tag
  Example: `<script src="https://cdn.tailwindcss.com"></script>`
- Maintain code simplicity and elegance
- Incorporate glassmorphism thoughtfully
- Focus on minimalist solutions
- ALWAYS implement responsive behavior with mobile-first approach
- ALWAYS include appropriate meta tags and Open Graph tags for social sharing
- NEVER use static image URLs, placeholder images, or third-party image services

## JavaScript Libraries and Frameworks
- **FIRST STEP: Always evaluate existing solutions** - Before writing any custom JavaScript functionality, think through if there are well-established libraries that already solve the problem
- Don't reinvent the wheel - Leverage existing, tested, and maintained solutions rather than building from scratch
- ALWAYS consider if JavaScript libraries would enhance the user experience or simplify implementation
- Popular libraries to consider when relevant:
  - **Three.js**: For 3D graphics, WebGL scenes, interactive 3D visualizations
  - **Chart.js**: For data visualization, charts, graphs, and analytics dashboards
  - **D3.js**: For complex data visualizations and interactive graphics
  - **Anime.js**: For smooth animations and micro-interactions
  - **Lottie**: For high-quality animations from After Effects
  - **Particles.js**: For particle systems and background effects
  - **AOS (Animate On Scroll)**: For scroll-triggered animations
  - **Swiper.js**: For touch sliders, carousels, and galleries
  - **GSAP**: For advanced animations and timeline control
  - **Socket.io**: For real-time communication features
  - **Marked.js**: For markdown parsing and rendering
  - **Highlight.js**: For syntax highlighting of code blocks
  - **QR Code libraries**: For generating QR codes
  - **Canvas libraries**: For drawing, image manipulation, or creative tools
  - **Sortable.js**: For drag-and-drop functionality
  - **Moment.js/Day.js**: For date manipulation and formatting
  - **Lodash**: For utility functions and data manipulation
  - **Axios**: For HTTP requests and API calls
  - **Toastify/Notyf**: For notifications and toast messages
  - **SweetAlert2**: For beautiful alert dialogs and confirmations
  - **Flatpickr**: For date/time pickers with extensive customization
  - **Choices.js**: For enhanced select dropdowns and multi-select
  - **Fuse.js**: For fuzzy search functionality
  - **Clipboard.js**: For copy-to-clipboard functionality
  - **Dropzone.js**: For drag-and-drop file uploads
  - **Vanilla-tilt.js**: For tilt hover effects
  - **Intersection Observer polyfill**: For scroll-based triggers
  - **Masonry/Isotope**: For grid layouts and filtering
  - **Lightbox libraries (Fancybox, GLightbox)**: For image galleries
  - **Progress bars (NProgress, ProgressBar.js)**: For loading indicators
  - **Color picker libraries (Pickr)**: For color selection interfaces
  - **Rich text editors (Quill, TinyMCE)**: For content editing
  - **PDF.js**: For displaying PDF documents in browser
  - **Howler.js**: For audio playback and sound effects
  - **Virtual scrolling libraries**: For handling large lists efficiently
  - These are just a few examples, there are many more libraries that can be used.
- **Decision Process**: 
  1. Identify the functionality needed
  2. Think if there are existing libraries that provide this functionality
  3. Only write custom code if no suitable library exists or if the requirement is very simple
- Include libraries via CDN for reliability and ease of implementation
- Choose libraries that are:
  - Well-maintained and widely used
  - Lightweight and performant
  - Compatible with mobile browsers
  - Easy to implement without complex build processes
- **Remember**: A few lines of library code can often replace hundreds of lines of custom implementation

## JavaScript Security and Escaping Guidelines

### CRITICAL: Template Literal Syntax Rules
**ALWAYS use proper template literal syntax to avoid JavaScript errors:**

1. **Use backticks (`) for template literals, NOT escaped backticks (\`)**
   - ✅ CORRECT: `Hello ${name}`
   - ❌ WRONG: \`Hello \${name}\`

2. **Use ${variable} for variable interpolation, NOT \${variable}**
   - ✅ CORRECT: `The topic is ${topic}`
   - ❌ WRONG: \`The topic is \${topic}\`

3. **Common template literal patterns:**
   ```javascript
   // ✅ CORRECT examples:
   const message = `Hello ${userName}!`;
   const html = `<div class="item">${content}</div>`;
   const url = `https://api.example.com/users/${userId}`;
   img.alt = `Image for ${topic} - Item ${index}`;
   
   // ❌ WRONG examples (will cause syntax errors):
   const message = \`Hello \${userName}!\`;
   const html = \`<div class="item">\${content}</div>\`;
   img.alt = \`Image for \${topic} - Item \${index}\`;
   ```

4. **When template literals contain HTML with quotes:**
   ```javascript
   // ✅ CORRECT:
   element.innerHTML = `<p class="error">Error: ${errorMessage}</p>`;
   
   // ✅ CORRECT with mixed quotes:
   element.innerHTML = `<p class='error'>Error: ${errorMessage}</p>`;
   
   // ❌ WRONG:
   element.innerHTML = \`<p class="error">Error: \${errorMessage}</p>\`;
   ```

5. **Multi-line template literals:**
   ```javascript
   // ✅ CORRECT:
   const template = `
     <div class="card">
       <h3>${title}</h3>
       <p>${description}</p>
     </div>
   `;
   
   // ❌ WRONG:
   const template = \`
     <div class="card">
       <h3>\${title}</h3>
       <p>\${description}</p>
     </div>
   \`;
   ```

### Other JavaScript Security Guidelines
- Escape closing script tags inside template literals or string literals by using <\/script> instead of </script>
- Properly escape special characters in JavaScript strings and template literals:
  - Use \' for single quotes within single-quoted strings
  - Use \" for double quotes within double-quoted strings
  - Use \\ for backslashes

### Template Literal Best Practices
- Always use template literals for string interpolation instead of concatenation
- Use template literals for multi-line strings
- Be consistent with quote usage inside template literals
- Test template literals in browser console if unsure about syntax

## SEO and Social Media Integration
1. ALWAYS include these essential meta tags and Open Graph tags in the head:
   ```html
   <!-- Essential Meta Tags -->
   <meta charset="UTF-8">
   <meta name="viewport" content="width=device-width, initial-scale=1.0">
   <meta name="description" content="Concise description of the page content">
   
   <!-- Open Graph Tags for Social Media Sharing -->
   <meta property="og:title" content="Page Title - Engaging and Descriptive">
   <meta property="og:description" content="Compelling description for social media sharing">
   <meta property="og:url" content="Canonical URL of this page">
   <meta property="og:type" content="website">
   ```
   

## Favicon Implementation
1. ALWAYS include a favicon using SVG with an emoji character:
   - The emoji should be contextually relevant to the web app's purpose

OPTIMIZE FOR MOBILE FIRST design unless otherwise specified.
1. Design for the smallest screen first, then progressively enhance for larger screens
2. Ensure NO horizontal scrolling occurs on any screen size
3. Use flexible layouts that adapt to different screen sizes
4. Implement appropriate touch targets and spacing for mobile users

## Working with Visual References

When images are provided as attachments, use them to:
- **Design Recreation**: Analyze layouts, colors, typography, and component arrangements to recreate similar designs
- **Visual Debugging**: Compare current implementation with reference images to identify and fix visual discrepancies  
- **Style Matching**: Extract design patterns, color schemes, and visual elements to apply consistently
- **Layout Analysis**: Study spacing, proportions, and visual hierarchy to improve the user interface
- **Component Inspiration**: Identify UI elements, buttons, forms, and navigation patterns to implement
- **Color Palette**: Extract colors from reference images and apply them to CSS variables and design elements
- **Content Structure**: Understand how information is organized and presented in the reference

Pay close attention to:
- Specific UI components visible in the images
- Color schemes and gradients used
- Typography styles and font hierarchies  
- Spacing and padding patterns
- Interactive elements like buttons, forms, menus
- Overall layout structure and responsive design
- Visual effects like shadows, borders, animations

When implementing based on visual references, describe what you see in the images and how you're translating those visual elements into working code.

## Perfect Web App Template Example

Here's a comprehensive example of a simple "Hello World" web application that meets ALL requirements:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <!-- Essential Meta Tags -->
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <meta name="description" content="A beautifully designed Hello World web application showcasing modern web development principles">
    
    <!-- Open Graph Tags for Social Media Sharing -->
    <meta property="og:title" content="Hello World - Modern Web App">
    <meta property="og:description" content="Experience a minimalist, Apple-inspired Hello World application with dark mode support">
    <meta property="og:type" content="website">
    
    <!-- Favicon using SVG with emoji -->
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>👋</text></svg>">
    
    <title>Hello World - Modern Web App</title>
    
    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    
    <!-- Dark mode detection script -->
    <script>
        // On page load or when changing themes, best practice to add both dark class and colorScheme
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.classList.add('dark');
            document.documentElement.style.colorScheme = 'dark';
        } else {
            document.documentElement.classList.remove('dark');
            document.documentElement.style.colorScheme = 'light';
        }
    </script>
    
    <!-- Custom Tailwind Configuration -->
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: {
                        'sans': ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'Roboto', 'sans-serif'],
                    },
                    animation: {
                        'fade-in': 'fadeIn 0.8s ease-in-out',
                        'slide-up': 'slideUp 0.6s ease-out',
                    }
                }
            }
        }
    </script>
    
    <style>
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        @keyframes slideUp {
            from { 
                opacity: 0; 
                transform: translateY(20px); 
            }
            to { 
                opacity: 1; 
                transform: translateY(0); 
            }
        }
        
        /* Glassmorphism effect */
        .glass {
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.18);
        }
        
        .dark .glass {
            background: rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
    </style>
</head>
<body class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-purple-900 transition-colors duration-300">
    
    <!-- Main Container -->
    <div class="min-h-screen flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden">
        
        <!-- Background decoration -->
        <div class="absolute inset-0 overflow-hidden pointer-events-none">
            <div class="absolute -top-40 -right-40 w-80 h-80 bg-purple-300 dark:bg-purple-600 rounded-full mix-blend-multiply dark:mix-blend-normal filter blur-xl opacity-20 animate-pulse"></div>
            <div class="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-300 dark:bg-blue-600 rounded-full mix-blend-multiply dark:mix-blend-normal filter blur-xl opacity-20 animate-pulse animation-delay-2000"></div>
        </div>
        
        <!-- Main Content Card -->
        <main class="relative z-10 w-full max-w-md mx-auto">
            <div class="glass rounded-3xl p-8 sm:p-10 shadow-2xl animate-fade-in">
                
                <!-- Header -->
                <header class="text-center mb-8">
                    <div class="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg animate-slide-up">
                        <span class="text-3xl">👋</span>
                    </div>
                    
                    <h1 class="text-3xl sm:text-4xl font-light text-gray-900 dark:text-white mb-3 animate-slide-up animation-delay-200">
                        Hello World
                    </h1>
                    
                    <p class="text-gray-600 dark:text-gray-300 text-lg font-light animate-slide-up animation-delay-400">
                        Welcome to a beautifully crafted web experience
                    </p>
                </header>
                
                <!-- Content -->
                <section class="text-center space-y-6">
                    <div class="animate-slide-up animation-delay-600">
                        <p class="text-gray-700 dark:text-gray-200 leading-relaxed">
                            This application demonstrates modern web development principles with 
                            <span class="font-medium text-blue-600 dark:text-blue-400">clean design</span>, 
                            <span class="font-medium text-purple-600 dark:text-purple-400">responsive layout</span>, 
                            and <span class="font-medium text-green-600 dark:text-green-400">accessibility</span>.
                        </p>
                    </div>
                    
                    <!-- Interactive Elements -->
                    <div class="flex flex-col sm:flex-row gap-4 animate-slide-up animation-delay-800">
                        <button 
                            onclick="showMessage()"
                            class="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium py-3 px-6 rounded-xl transition-all duration-200 transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl touch-manipulation"
                        >
                            Say Hello
                        </button>
                        
                        <button 
                            onclick="toggleTheme()"
                            class="flex-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium py-3 px-6 rounded-xl transition-all duration-200 transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl touch-manipulation"
                            aria-label="Toggle dark mode"
                        >
                            <span class="dark:hidden">🌙 Dark</span>
                            <span class="hidden dark:inline">☀️ Light</span>
                        </button>
                    </div>
                </section>
                
                <!-- Message Display -->
                <div id="message" class="hidden mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-xl text-green-800 dark:text-green-200 text-center animate-slide-up">
                    <p class="font-medium">Hello from the modern web! 🎉</p>
                </div>
                
            </div>
        </main>
        
        <!-- Footer -->
        <footer class="relative z-10 mt-8 text-center">
            <p class="text-sm text-gray-500 dark:text-gray-400 animate-fade-in animation-delay-1000">
                Built with ❤️ using modern web standards
            </p>
        </footer>
        
    </div>
    
    <script>
        // Message interaction
        function showMessage() {
            const messageEl = document.getElementById('message');
            messageEl.classList.remove('hidden');
            
            // Auto-hide after 3 seconds
            setTimeout(() => {
                messageEl.classList.add('hidden');
            }, 3000);
        }
        
        // Theme toggle functionality
        function toggleTheme() {
            const html = document.documentElement;
            const isDark = html.classList.contains('dark');
            
            if (isDark) {
                html.classList.remove('dark');
                html.style.colorScheme = 'light';
                localStorage.setItem('theme', 'light');
            } else {
                html.classList.add('dark');
                html.style.colorScheme = 'dark';
                localStorage.setItem('theme', 'dark');
            }
        }
        
        // Restore theme preference on load
        document.addEventListener('DOMContentLoaded', () => {
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme) {
                if (savedTheme === 'dark') {
                    document.documentElement.classList.add('dark');
                    document.documentElement.style.colorScheme = 'dark';
                } else {
                    document.documentElement.classList.remove('dark');
                    document.documentElement.style.colorScheme = 'light';
                }
            }
        });
        
        // Add staggered animation delays
        document.addEventListener('DOMContentLoaded', () => {
            const elements = document.querySelectorAll('.animation-delay-200');
            elements.forEach(el => el.style.animationDelay = '200ms');
            
            const elements400 = document.querySelectorAll('.animation-delay-400');
            elements400.forEach(el => el.style.animationDelay = '400ms');
            
            const elements600 = document.querySelectorAll('.animation-delay-600');
            elements600.forEach(el => el.style.animationDelay = '600ms');
            
            const elements800 = document.querySelectorAll('.animation-delay-800');
            elements800.forEach(el => el.style.animationDelay = '800ms');
            
            const elements1000 = document.querySelectorAll('.animation-delay-1000');
            elements1000.forEach(el => el.style.animationDelay = '1000ms');
        });
        
        // Accessibility: Respect reduced motion preferences
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            document.documentElement.style.setProperty('--animation-duration', '0.01ms');
        }
        
        // Touch-friendly interactions for mobile
        const buttons = document.querySelectorAll('button');
        buttons.forEach(button => {
            button.addEventListener('touchstart', () => {
                button.style.transform = 'scale(0.95)';
            });
            
            button.addEventListener('touchend', () => {
                setTimeout(() => {
                    button.style.transform = '';
                }, 100);
            });
        });
    </script>
    
</body>
</html>
```

This example demonstrates:
- ✅ Tailwind CSS CDN implementation
- ✅ System-based dark mode with manual toggle
- ✅ Mobile-first responsive design
- ✅ Apple-inspired minimalist aesthetics
- ✅ Proper meta tags and Open Graph
- ✅ SVG emoji favicon
- ✅ Glassmorphism effects
- ✅ Smooth animations and micro-interactions
- ✅ Touch-friendly buttons for mobile
- ✅ Accessibility considerations
- ✅ No horizontal scrolling
- ✅ Progressive enhancement
- ✅ Clean, purposeful design
- ✅ CORRECT template literal syntax

Use this as a reference template for creating web applications that meet all requirements.

# Calling Backend MCP Tools from JavaScript

If the web application needs to trigger backend MCP tools (from the tool information provided above, or other known tools), you can generate JavaScript to make an HTTP POST request to the `/internal/call_mcp_tool` endpoint on the main application server.

**Request Format:**
-   **URL:** `/internal/call_mcp_tool` (This is a relative path to an endpoint on the same server hosting the web app. The server will proxy this to the MCP service and handle authentication.)
-   **Method:** `POST`
-   **Headers:** `{'Content-Type': 'application/json'}` (Do NOT include `X-Internal-API-Key` here; the server handles it.)
-   **Body (JSON):**
    ```json
    {
        "tool_name": "ACTUAL_TOOL_NAME",
        "arguments": { "arg1": "value1", "arg2": 123 }, // The actual arguments object for the tool
    }
    ```
    -   Replace `ACTUAL_TOOL_NAME` with the exact name of the MCP tool you want to call.
    -   The `arguments` field should be a direct JSON object expected by the tool.

**Response Handling:**
-   The `/internal/call_mcp_tool` endpoint will respond with the direct JSON output from the MCP tool call:
    ```json
    {
        "result": "STRINGIFIED_JSON_OR_PLAIN_TEXT_RESULT_FROM_TOOL", // This is the primary payload from the tool
        "error": "OPTIONAL_ERROR_MESSAGE" // Check this for tool execution errors
    }
    ```
-   Your JavaScript should check for `response.error`.
-   If no error, `response.result` contains the tool's output. If this output is expected to be JSON (common for many tools), your JavaScript should parse `response.result` (e.g., `JSON.parse(response.result)`). If it's plain text, use it directly.
-   Remember these are asynchronous calls (`fetch().then(...)` or `async/await`). Update the DOM *after* receiving and processing the response.

**Example JavaScript Snippet (Conceptual):**
```javascript
// Super simple MCP tool calling - AI should use this pattern!
async function callTool(toolName, args = {}) {
    try {
        const response = await fetch('/internal/call_mcp_tool', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tool_name: toolName,
                arguments: args,
            })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        if (data.error && data.error !== "None" && data.error !== null) throw new Error(data.error);
        
        // Parse result if it's JSON, otherwise return as string
        try {
            return JSON.parse(data.result);
        } catch {
            return data.result;
        }
    } catch (error) {
        console.error(`Tool ${toolName} failed:`, error);
        throw error;
    }
}

// Usage examples with CORRECT template literal syntax:
// const images = await callTool('generate_images_with_prompts', {prompts: ['a cat', 'a dog']});
// const analysis = await callTool('analyze_images', {urls: ['http://...'], analysis_prompt: 'What is this?'});
// const webApp = await callTool('create_web_app', {description: 'A todo app', mcp_tool_names: ['save_file']});
```

## AI Chat Integration

Web applications can integrate conversational AI using the `ai_chat` tool. This enables powerful AI-powered features like chatbots, content generation, code assistance, and data analysis.

**AI Chat Helper Function:**
```javascript
// AI Chat Helper - Add this to web apps that need AI capabilities
async function chatWithAI(userMessage, options = {}) {
    const {
        systemPrompt = null,
        model = 'gemini-2.5-flash-preview-05-20',
        includeThoughts = false,
        jsonSchema = null,  // Optional JSON schema for structured responses
        attachments = null  // NEW: Optional array of image URLs
    } = options;
    
    try {
        const response = await fetch('/internal/call_mcp_tool', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tool_name: 'ai_chat',
                arguments: {
                    messages: userMessage,
                    system_prompt: systemPrompt,
                    model: model,
                    include_thoughts: includeThoughts,
                    json_schema: jsonSchema,  // Pass JSON schema
                    attachments: attachments  // NEW: Pass image URLs
                }
            })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        if (data.error && data.error !== "None" && data.error !== null) {
            throw new Error(data.error);
        }
        
        // Handle ai_chat result - it's already parsed JSON, not a string
        let result;
        if (typeof data.result === 'string') {
            try {
                result = JSON.parse(data.result);
            } catch {
                result = { status: 'error', message: 'Invalid JSON response' };
            }
        } else {
            result = data.result; // Already an object
        }
        
        if (result.status === 'error') {
            throw new Error(result.message);
        }
        
        // IMPORTANT: result.response is already parsed when using json_schema
        // Do NOT call JSON.parse() on it again - it's already an object
        return result.response; // Return the AI's response (text or structured JSON)
        
    } catch (error) {
        console.error('AI chat failed:', error);
        throw error;
    }
}

// Advanced AI Chat with conversation history
async function chatWithAIAdvanced(messages, options = {}) {
    const {
        systemPrompt = null,
        model = 'gemini-2.5-flash-preview-05-20',
        includeThoughts = false
    } = options;
    
    // Convert message array to conversation format if needed
    let conversationText = '';
    if (Array.isArray(messages)) {
        conversationText = messages.map(msg => 
            `${msg.role || 'user'}: ${msg.content}`
        ).join('\n');
    } else {
        conversationText = messages;
    }
    
    return await chatWithAI(conversationText, options);
}

// Usage examples with CORRECT template literal syntax:
// Simple AI chat (returns string)
// const response = await chatWithAI("Hello, how are you?");
// console.log(typeof response); // "string"

// AI with custom system prompt (returns string)
// const response = await chatWithAI("Analyze this data", {
//     systemPrompt: "You are a data analysis expert. Provide clear insights.",
//     model: "gemini-2.5-pro-preview-05-06"
// });

// AI with image analysis (returns string)
// const analysis = await chatWithAI("What do you see in this image?", {
//     attachments: ["https://example.com/image.jpg"]
// });

// AI with multiple images (returns string)
// const comparison = await chatWithAI("Compare these two images", {
//     attachments: [
//         "https://example.com/image1.jpg", 
//         "https://example.com/image2.png"
//     ]
// });

// Structured JSON response (returns object - DO NOT parse again!)
// const analysisResult = await chatWithAI("Analyze this image", {
//     jsonSchema: {
//         type: "object",
//         properties: {
//             analysis: { type: "string" },
//             confidence: { type: "number" }
//         }
//     }
// });
// console.log(typeof analysisResult); // "object"
// console.log(analysisResult.analysis); // Direct access - already parsed!

// Multi-turn conversation
// const conversation = [
//     { role: 'user', content: 'What is Python?' },
//     { role: 'assistant', content: 'Python is a programming language...' },
//     { role: 'user', content: 'Show me a simple example' }
// ];
// const response = await chatWithAIAdvanced(conversation);

// Code assistance
// const codeHelp = await chatWithAI("Write a function to sort an array", {
//     systemPrompt: "You are a helpful coding assistant. Provide clean, well-commented code.",
//     model: "claude-3-7-sonnet-latest"
// });

// NEW: Structured JSON responses with schema
// Extract structured data from text
// const userInfo = await chatWithAI("My name is John, I'm 25 years old, and I live in New York", {
//     jsonSchema: {
//         type: "object",
//         properties: {
//             name: { type: "string" },
//             age: { type: "number" },
//             location: { type: "string" }
//         },
//         required: ["name", "age", "location"]
//     }
// });
// // Returns: { name: "John", age: 25, location: "New York" }

// Extract structured data from images (returns object)
// const chartData = await chatWithAI("Extract the data from this chart", {
//     attachments: ["https://example.com/chart.png"],
//     jsonSchema: {
//         type: "object",
//         properties: {
//             title: { type: "string" },
//             data_points: { type: "array", items: { type: "number" } },
//             insights: { type: "array", items: { type: "string" } }
//         },
//         required: ["title", "data_points"]
//     }
// });
// // Returns: { title: "Sales Chart", data_points: [100, 150, 200], insights: ["Steady growth"] }

// Generate structured content
// const blogPost = await chatWithAI("Write a blog post about AI", {
//     jsonSchema: {
//         type: "object",
//         properties: {
//             title: { type: "string" },
//             summary: { type: "string" },
//             content: { type: "string" },
//             tags: { type: "array", items: { type: "string" } },
//             readTime: { type: "number" }
//         },
//         required: ["title", "content"]
//     }
// });

// Form validation and processing
// const formAnalysis = await chatWithAI("Check if this email is valid: test@example.com", {
//     jsonSchema: {
//         type: "object",
//         properties: {
//             isValid: { type: "boolean" },
//             issues: { type: "array", items: { type: "string" } },
//             suggestions: { type: "string" }
//         },
//         required: ["isValid"]
//     }
// });

// Data analysis with structured output
// const analysis = await chatWithAI("Analyze this sales data: [100, 200, 150, 300]", {
//     jsonSchema: {
//         type: "object",
//         properties: {
//             total: { type: "number" },
//             average: { type: "number" },
//             trend: { type: "string", enum: ["increasing", "decreasing", "stable"] },
//             insights: { type: "array", items: { type: "string" } }
//         },
//         required: ["total", "average", "trend"]
//     }
// });
```

**AI Chat Use Cases:**
- **Chatbots**: Customer service, FAQ answering, general conversation
- **Content Generation**: Blog posts, product descriptions, creative writing
- **Code Assistants**: Explain code, generate functions, debug help
- **Data Analysis**: Analyze uploaded data, generate insights and reports
- **Smart Forms**: AI-powered form validation and intelligent suggestions
- **Educational Tools**: Tutoring, explanations, interactive learning
- **Creative Tools**: Story writing, brainstorming, idea generation
- **Language Translation**: Real-time translation between languages
- **Technical Support**: Troubleshooting, documentation assistance
- **Structured Data Extraction**: Extract specific information from text into JSON format
- **Form Processing**: Validate and process form data with AI intelligence
- **API Response Generation**: Create structured API responses based on user queries

Use this pattern to enable dynamic interactions with backend tools. Make sure your JavaScript handles the asynchronous nature of these calls and updates the web page appropriately.

ALWAYS BE SURE TO SUPPORT BOTH ANDROID AND APPLE PHONES EVERYTIME. THIS IS VERY IMPORTANT TO BE SURE THAT ANDROID COMPATIBILITY IS INCLUDED.

Create a complete implementation that captures the essence of the user's request. Make it beautiful and modern.

ALWAYS BE SURE TO SUPPORT BOTH ANDROID AND APPLE PHONES EVERYTIME. THIS IS VERY IMPORTANT TO BE SURE THAT ANDROID COMPATIBILITY IS INCLUDED.
"""

WEB_APP_PROMPT_OUTPUT_FORMAT = """You must format the output as a complete HTML document like this:

Output Format Example:
webapp.html
```
<!DOCTYPE html>
<html>
<head>
    <title>Web App Title</title>
    <!-- CSS styling here -->
</head>
<body>
    <!-- Complete HTML content here -->
    <script>
    // JavaScript here - ALWAYS use proper template literal syntax:
    // ✅ CORRECT: `Hello ${name}`
    // ❌ WRONG: \`Hello \${name}\`
    </script>
</body>
</html>
```

## HTML Output Format
When generating HTML code, use standard markdown formatting:
- Wrap your HTML in ```html code blocks
- Include any brief explanations before or after the code block as needed
- The system will automatically extract and parse the HTML content from the code blocks
"""

@mcp.tool()
async def create_web_app(
    ctx: Context,
    project_spec: Annotated[str, Field(
        description="A detailed description/specification of the web application to create. This should describe the functionality, features, design requirements, and any specific needs. The AI will use this to generate the complete HTML application."
    )],
    user_number: Annotated[str, Field(
        description="The user's unique identifier (e.g., phone number), used for directory structuring. This is typically provided by the backend system and should not be solicited from the end-user by the LLM."
    )] = "+17145986105",
    app_name: Annotated[Optional[str], Field(
        description="The desired name for the web application. If not provided, a relevant name will be automatically generated. Use underscores for spaces (e.g., 'my_cool_app'). The LLM should choose a short, concise name relevant to the request if one isn't given by the user."
    )] = None, 
    attachments: Annotated[Optional[List[str]], Field(
        description="A list of attachment URLs. These will be processed and potentially included or referenced in the web application. Provide the full URLS here."
    )] = None,
    model: Annotated[MODELS_LITERAL, Field(
        description="The LLM model to use for HTML generation. If user does not specify, use gemini-2.5-pro-preview-05-06."
    )] = "gemini-2.5-pro-preview-05-06",
    mcp_tool_names: Annotated[Optional[List[str]], Field(
        description="Pass a list of relevant MCP tool names that the generated web application should use. The system will fetch their schemas.",
        default=None
    )] = None,
    additional_context: Annotated[Optional[str], Field(
        description="Optional additional context, like previous tool call summaries if relevant.",
        default=None
    )] = None
) -> dict:
    """
    Creates a custom web application from a project specification using AI generation.
    
    This tool:
    - Takes a project specification describing the desired web application
    - Uses AI to generate complete HTML content based on the specification
    - Sets up directory structure and versioning
    - Creates metadata and commit summaries
    - Handles attachments and MCP tool integration
    
    The AI generation follows modern web development best practices including:
    - Mobile-first responsive design
    - Dark mode support
    - Apple-inspired aesthetics
    - Tailwind CSS styling
    - JavaScript interactivity
    - MCP tool integration when requested

    Returns:
        dict: A dictionary with the following structure:
        
        For successful implementation:
        {
            "status": "success",
            "message": str,
            "url": str,
            "app_name": str,
            "html_content": str
        }
        
        For errors:
        {
            "status": "error",
            "message": str
        }
    """
    print("DEBUG: INSIDE OF CREATE_WEB_APP - Generating web app from project specification")
    # Use default user number if empty
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105" # Default user_id

    # --- Sanitize inputs ---
    user_id_safe = sanitize_for_path(user_number)
    app_name = app_name or f"web-app-{str(uuid.uuid4())[:8]}"
    app_name_safe = sanitize_for_path(app_name)

    # Use project_spec as the main context
    main_request = project_spec  # Use the project specification directly

    # --- IMPLEMENTATION PHASE ---
    print(f"Proceeding with AI generation for '{app_name_safe}' based on project specification.")

    # --- Attachment Handling ---
    attachment_info_for_prompt = []
    attachment_parts = []
    if attachments and isinstance(attachments, list):
        for url in attachments:
            if isinstance(url, str) and url.startswith(('http://', 'https://')):
                if url.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg')):
                    mime_type = 'image/*'
                elif url.lower().endswith('.pdf'):
                    mime_type = 'application/pdf'
                else:
                    mime_type = 'unknown'
                attachment_info_for_prompt.append({"url": url, "mime_type": mime_type})
                
                # Download attachment for AI processing
                attachment_part = await download_and_create_attachment_part(url)
                if attachment_part:
                    attachment_parts.append(attachment_part)
            else:
                print(f"Skipping invalid URL in attachments: {url}")

    # --- Tool Schema Context ---
    tool_schemas_context = ""
    if mcp_tool_names:
        tool_schemas_context = await fetch_tool_schemas_for_tools(mcp_tool_names)

    # --- AI Generation using ctx.sample ---
    try:
        # Build comprehensive prompt
        prompt_parts = []
        
        # Add the main project specification
        prompt_parts.append(f"Create a web application based on this specification:\n{project_spec}")
        
        # Add attachment context if available
        if attachment_info_for_prompt:
            attachment_context = "\n\nAttachments provided:\n"
            for att in attachment_info_for_prompt:
                attachment_context += f"- {att['url']} (type: {att['mime_type']})\n"
            prompt_parts.append(attachment_context)
        
        # Add tool integration context if available
        if tool_schemas_context:
            prompt_parts.append(tool_schemas_context)
        
        # Add additional context if provided
        if additional_context:
            prompt_parts.append(f"\nAdditional Context:\n{additional_context}")
        
        # Add output format instruction
        prompt_parts.append("\nProvide the complete HTML application as a single file, wrapped in ```html code blocks.")
        
        final_prompt = "\n".join(prompt_parts)
        
        print(f"Generating web app with model: {model}")
        print(f"Prompt length: {len(final_prompt)} characters")
        
        # Use ctx.sample to generate the web app
        response = await ctx.sample(
            messages=final_prompt,
            system_prompt=WEB_APP_PROMPT + WEB_APP_PROMPT_OUTPUT_FORMAT,
            model_preferences=[model]
        )
        
        # Extract HTML content from response
        html_content = ""
        if hasattr(response, 'text') and response.text:
            html_content = response.text
        elif hasattr(response, 'content') and response.content:
            html_content = response.content
        else:
            response_str = str(response)
            if 'text=' in response_str:
                import re
                text_match = re.search(r'text=[\'"](.*?)[\'"]', response_str, re.DOTALL)
                if text_match:
                    html_content = text_match.group(1)
                    html_content = html_content.replace('\\\\n', '\n').replace('\\"', '"').replace("\\'", "'")
        
        if not html_content:
            return {"status": "error", "message": "Failed to generate HTML content from AI response"}
        
        # Extract HTML from code blocks if present
        import re
        html_match = re.search(r'```html\s*(.*?)\s*```', html_content, re.DOTALL)
        if html_match:
            html_content = html_match.group(1).strip()
        
        print(f"Generated HTML content for '{app_name_safe}'. Length: {len(html_content)} characters")
        
    except Exception as e:
        print(f"Error generating web app with AI: {str(e)}")
        return {"status": "error", "message": f"Failed to generate web application: {str(e)}"}

    # Validate that html_content was generated
    if not html_content:
        print(f"Error for '{app_name_safe}': No HTML content was generated.")
        return {"status": "error", "message": "Failed to generate HTML content from project specification."}
            
    # --- Save HTML to user directory with versioning (using the provided html_content) ---
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    user_specific_data_dir = os.path.join(base_dir, user_id_safe)
    app_dir = os.path.join(user_specific_data_dir, "web_apps", app_name_safe)
    versions_dir = os.path.join(app_dir, "versions")
    os.makedirs(versions_dir, exist_ok=True)

    # Load existing metadata
    metadata_path = os.path.join(app_dir, "app.json")
    metadata = await load_app_metadata(metadata_path)
    
    # Determine new version number
    current_version = metadata.get("current_version", 0)
    new_version = current_version + 1
    
    # Load previous version content for commit summary generation
    previous_version_content = None
    if current_version > 0:
        # This logic might be less relevant for a direct HTML provision for v1,
        # but good to keep for future if create_web_app is called to overwrite (though it shouldn't be)
        try:
            previous_version_path = os.path.join(versions_dir, f"v{current_version}.html")
            if os.path.exists(previous_version_path):
                with open(previous_version_path, 'r', encoding='utf-8') as f:
                    previous_version_content = f.read()
        except Exception as e:
            print(f"Warning: Could not load previous version content: {e}")

    # Save new version file
    version_filename = f"v{new_version}.html"
    version_path = os.path.join(versions_dir, version_filename)
    
    try:
        with open(version_path, 'w', encoding='utf-8') as f:
            await asyncio.to_thread(f.write, html_content)
    except Exception as e:
        return {"status": "error", "message": f"Failed to save web app version: {str(e)}"}

    # NEW: Use placeholder commit summary initially
    placeholder_commit_summary = f"🔄 {'Created' if new_version == 1 else 'Updated'} web application: {main_request[:80]}..."
    
    # Update metadata with placeholder first
    now = datetime.datetime.now().isoformat()
    if not metadata:
        metadata = {
            "app_name": app_name,
            "created_at": now,
            "last_updated": now,
            "description": f"{main_request[:250]}", # Use main_request for description
            "current_version": new_version,
            "versions": []
        }
    else:
        metadata["last_updated"] = now
        metadata["current_version"] = new_version

    # Add version entry with placeholder
    version_entry = {
        "version": new_version,
        "timestamp": now,
        "file": f"versions/{version_filename}",
        "user_request": main_request,
        "commit_summary": placeholder_commit_summary,
        "size": len(html_content),
        "line_count": len(html_content.splitlines()),  # NEW: Add line count
        "generating_summary": True  # Flag to indicate summary is being generated
    }
    metadata["versions"].append(version_entry)

    # Save metadata with placeholder
    try:
        await save_app_metadata(metadata_path, metadata)
    except Exception as e:
        return {"status": "error", "message": f"Failed to save app metadata: {str(e)}"}

    # Create current.html symlink (THIS WAS MISSING!)
    current_path = os.path.join(app_dir, "current.html")
    try:
        if os.path.exists(current_path) or os.path.islink(current_path):
            os.remove(current_path)
        # Create relative symlink for portability
        os.symlink(f"versions/{version_filename}", current_path)
    except Exception as e:
        print(f"Warning: Could not create current.html symlink: {e}")
        # Fallback: copy file instead of symlink
        try:
            import shutil
            shutil.copy2(version_path, current_path)
        except Exception as e2:
            return {"status": "error", "message": f"Failed to create current app file: {str(e2)}"}

    # Update serve URL to point to current.html
    serve_url = f"{DOMAIN}/user_data/{user_id_safe}/web_apps/{app_name_safe}/current.html"

    # NEW: Start background task to generate real commit summary
    asyncio.create_task(update_commit_summary_background(
        metadata_path, new_version, main_request, html_content, 
        previous_version_content, metadata.get("versions", [])
    ))

    # Return immediately with placeholder
    return {
        "status": "success",
        "message": f"Web app '{app_name}' created successfully. Access it at {serve_url}",
        "url": serve_url,
        "html_content": html_content,
        "app_name": app_name,
        "commit_summary": placeholder_commit_summary,  # Return placeholder
    }

# NEW: Background function to update commit summary
async def update_commit_summary_background(
    metadata_path: str, 
    version_number: int, 
    request_for_summary: str, # Renamed from user_request to avoid confusion
    html_content_for_summary: str, # Renamed for clarity
    previous_version_content_for_summary: str, # Renamed
    commit_history_for_summary: List[Dict] # Renamed
):
    """Update the commit summary in the background after the tool has already returned."""
    try:
        # Generate the real commit summary
        real_commit_summary = await generate_commit_summary(
            request_for_summary, html_content_for_summary, previous_version_content_for_summary, commit_history_for_summary
        )
        
        # Load current metadata
        metadata = await load_app_metadata(metadata_path)
        if not metadata:
            return
        
        # Find and update the version entry
        for version_entry in metadata.get("versions", []):
            if version_entry.get("version") == version_number:
                version_entry["commit_summary"] = real_commit_summary
                version_entry.pop("generating_summary", None)  # Remove the flag
                break
        
        # Save updated metadata
        await save_app_metadata(metadata_path, metadata)
        print(f"Background commit summary updated for version {version_number}: {real_commit_summary}")
        
    except Exception as e:
        print(f"Warning: Failed to update commit summary in background: {e}")
        # If background generation fails, we could update with a fallback message
        try:
            metadata = await load_app_metadata(metadata_path)
            if metadata:
                for version_entry in metadata.get("versions", []):
                    if version_entry.get("version") == version_number and version_entry.get("generating_summary"):
                        version_entry["commit_summary"] = f"🔄 {'Initial version' if version_number == 1 else 'Updated version'}: {request_for_summary[:80]}..."
                        version_entry.pop("generating_summary", None)
                        break
                await save_app_metadata(metadata_path, metadata)
        except:
            pass  # If even the fallback fails, just leave the placeholder

@mcp.tool()
async def list_web_apps(
    user_number: Annotated[str, Field(
        description="The user's unique identifier, used to locate their web app data. Typically provided by the backend."
    )] = "+17145986105",
    limit: Annotated[int, Field(
        description="Maximum number of web apps to return in the list.",
        ge=1 
    )] = 10
) -> dict:
    """
    Lists web applications previously created by the specified user.

    Returns a list of web application details, each including 'app_name', 'url', 'current_version', and metadata.
    """
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105" # Default user_id

    user_id_safe = sanitize_for_path(user_number)

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    apps_dir = os.path.join(base_dir, user_id_safe, "web_apps")

    if not await asyncio.to_thread(os.path.exists, apps_dir) or not await asyncio.to_thread(os.path.isdir, apps_dir):
        print(f"Web apps directory not found for user {user_id_safe} at {apps_dir}. Returning empty list.")
        return {"web_apps": []}

    web_apps_list = []
    try:
        app_names = await asyncio.to_thread(os.listdir, apps_dir)
        app_dirs = [name for name in app_names if os.path.isdir(os.path.join(apps_dir, name))]
        app_dirs = sorted(app_dirs, reverse=True)  # Sort by name

        for app_name in app_dirs:
            if len(web_apps_list) >= limit:
                break
            
            app_dir = os.path.join(apps_dir, app_name)
            metadata_path = os.path.join(app_dir, "app.json")
            
            # Load metadata for this app
            metadata = await load_app_metadata(metadata_path)
            
            if metadata:
                serve_url = f"{DOMAIN}/user_data/{user_id_safe}/web_apps/{app_name}/current.html"
                
                # Get latest version info
                latest_version = None
                if metadata.get("versions"):
                    latest_version = metadata["versions"][-1]
                
                web_app_info = {
                    "app_name": app_name,
                    "url": serve_url,
                    "current_version": metadata.get("current_version", 1),
                    "created_at": metadata.get("created_at"),
                    "last_updated": metadata.get("last_updated"),
                    "description": metadata.get("description", ""),
                    "total_versions": len(metadata.get("versions", []))
                }
                
                if latest_version:
                    web_app_info["latest_commit_summary"] = latest_version.get("commit_summary", "")
                
                web_apps_list.append(web_app_info)
            else:
                # Fallback for apps without metadata (legacy apps)
                current_html_path = os.path.join(app_dir, "current.html")
                if os.path.exists(current_html_path):
                    serve_url = f"{DOMAIN}/user_data/{user_id_safe}/web_apps/{app_name}/current.html"
                    web_apps_list.append({
                        "app_name": app_name,
                                "url": serve_url,
                                "current_version": 1,
                                "description": "Legacy web app (no version history)",
                                "total_versions": 1
                    })
        
        return {"web_apps": web_apps_list}

    except Exception as e:
        print(f"Error listing web apps for user {user_id_safe}: {e}")
        return {"status": "error", "message": f"Failed to list web apps: {str(e)}"}

@mcp.tool()
async def get_app_versions(
    user_number: Annotated[str, Field(
        description="The user's unique identifier, used to locate their web app data."
    )] = "+17145986105",
    app_name: Annotated[str, Field(
        description="The name of the web application to get version history for."
    )] = None,
) -> dict:
    """
    Get complete version history for a specific web application.
    
    Returns detailed information about all versions including commit summaries.
    """
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"

    user_id_safe = sanitize_for_path(user_number)
    app_name_safe = sanitize_for_path(app_name)

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    app_dir = os.path.join(base_dir, user_id_safe, "web_apps", app_name_safe)
    metadata_path = os.path.join(app_dir, "app.json")

    if not await asyncio.to_thread(os.path.exists, metadata_path):
        return {"status": "error", "message": f"App '{app_name}' not found or has no version history."}

    try:
        metadata = await load_app_metadata(metadata_path)
        
        return {
                    "status": "success",
            "app_name": app_name,
            "current_version": metadata.get("current_version", 1),
            "total_versions": len(metadata.get("versions", [])),
            "created_at": metadata.get("created_at"),
            "last_updated": metadata.get("last_updated"),
            "description": metadata.get("description", ""),
            "versions": metadata.get("versions", [])
        }
        
    except Exception as e:
        return {"status": "error", "message": f"Failed to load version history: {str(e)}"}

@mcp.tool()
async def edit_web_app(
    ctx: Context,
    app_name: Annotated[str, Field(description="The name of the web application to edit.")],
    project_spec: Annotated[str, Field(
        description="A detailed description of the changes to make to the web application. Describe what functionality to add, modify, or remove. The AI will generate appropriate search/replace blocks to implement these changes."
    )],
    user_number: Annotated[str, Field(description="The user's unique identifier, used to locate their web app data.")] = "+17145986105",
    model: Annotated[MODELS_LITERAL, Field(description="The LLM model to use for generating the edit. If user does not specify, use gemini-2.5-pro-preview-05-06.")] = "gemini-2.5-pro-preview-05-06",
    attachments: Annotated[Optional[List[str]], Field(
        description="A list of attachment URLs that may be relevant for the changes."
    )] = None,
    mcp_tool_names: Annotated[Optional[List[str]], Field(
        description="Pass a list of relevant MCP tool names that the web application should use.",
        default=None
    )] = None,
    additional_context: Annotated[Optional[str], Field(
        description="Optional additional context for the edit.",
        default=None
    )] = None
) -> dict:
    """
    Edits an existing web application using AI-generated search/replace blocks based on a project specification.

    This tool:
    - Takes a description of the changes needed (project_spec)
    - Analyzes the current web application content
    - Uses AI to generate appropriate search/replace blocks
    - Applies the changes to create an updated version
    
    The AI analyzes the existing code and generates precise search/replace blocks that:
    - Preserve existing functionality unless explicitly changed
    - Make minimal necessary changes to implement the request
    - Maintain code structure, styling, and architecture
    - Keep responsive design and accessibility features intact
    - Preserve any localStorage, API calls, or MCP tool integrations
    - Follow web development best practices
    
    The tool handles:
    - Loading the current web app content
    - Processing attachments for context
    - Generating search/replace blocks using AI
    - Applying changes with robust search/replace logic
    - Creating new versions with proper metadata
    - Updating symlinks and commit summaries
    
    USAGE:
    Simply describe what changes you want to make in natural language.
    Examples:
    - "Add a dark mode toggle button to the header"
    - "Create a contact form with name, email, and message fields"
    - "Add a sidebar with navigation links"
    - "Implement local storage for user preferences"
    - "Add animation effects to the buttons"
    """
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"

    # Validate input parameters
    if not project_spec:
        return {
            "status": "error",
            "message": "The 'project_spec' parameter is required and must describe the changes to make."
        }

    user_id_safe = sanitize_for_path(user_number)
    app_name_safe = sanitize_for_path(app_name)

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    app_dir = os.path.join(base_dir, user_id_safe, "web_apps", app_name_safe)
    current_path = os.path.join(app_dir, "current.html")

    # Check if app exists
    if not await asyncio.to_thread(os.path.exists, current_path):
        return {
            "status": "error", 
            "message": f"Web app '{app_name}' not found. Use 'create_web_app' to create a new application, or check the app name and try again.",
            "suggestion": "create_web_app"
        }

    try:
        # Load current HTML content
        with open(current_path, 'r', encoding='utf-8') as f:
            current_html = await asyncio.to_thread(f.read)

        # Load existing metadata for commit history context
        metadata_path = os.path.join(app_dir, "app.json")
        metadata = await load_app_metadata(metadata_path)
        
        # --- Attachment Handling ---
        attachment_info_for_prompt = []
        attachment_parts = []
        if attachments and isinstance(attachments, list):
            for url in attachments:
                if isinstance(url, str) and url.startswith(('http://', 'https://')):
                    if url.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg')):
                        mime_type = 'image/*'
                    elif url.lower().endswith('.pdf'):
                        mime_type = 'application/pdf'
                    else:
                        mime_type = 'unknown'
                    attachment_info_for_prompt.append({"url": url, "mime_type": mime_type})
                    
                    # Download attachment for AI processing
                    attachment_part = await download_and_create_attachment_part(url)
                    if attachment_part:
                        attachment_parts.append(attachment_part)
                else:
                    print(f"Skipping invalid URL in attachments: {url}")

        # --- Tool Schema Context ---
        tool_schemas_context = ""
        if mcp_tool_names:
            tool_schemas_context = await fetch_tool_schemas_for_tools(mcp_tool_names)
        
        # Extract existing tool names from current HTML
        existing_tool_names = extract_mcp_tool_names_from_html(current_html)
        if existing_tool_names:
            print(f"Found existing MCP tool usage: {existing_tool_names}")
            if not mcp_tool_names:
                mcp_tool_names = existing_tool_names
            else:
                # Combine requested tools with existing tools
                mcp_tool_names = list(set(mcp_tool_names + existing_tool_names))
                tool_schemas_context = await fetch_tool_schemas_for_tools(mcp_tool_names)

        # --- AI Generation of Search/Replace Blocks ---
        try:
            # Build comprehensive prompt for AI to generate search/replace blocks
            prompt_parts = []
            
            # Add the current HTML content for context
            prompt_parts.append(f"Current web application content:\n\n```html\n{current_html}\n```")
            
            # Add the edit specification
            prompt_parts.append(f"\nEdit Request: {project_spec}")
            
            # Add attachment context if available
            if attachment_info_for_prompt:
                attachment_context = "\n\nAttachments provided:\n"
                for att in attachment_info_for_prompt:
                    attachment_context += f"- {att['url']} (type: {att['mime_type']})\n"
                prompt_parts.append(attachment_context)
            
            # Add tool integration context if available
            if tool_schemas_context:
                prompt_parts.append(tool_schemas_context)
            
            # Add additional context if provided
            if additional_context:
                prompt_parts.append(f"\nAdditional Context:\n{additional_context}")
            
            final_prompt = "\n".join(prompt_parts)
            
            print(f"Generating search/replace blocks with model: {model}")
            print(f"Prompt length: {len(final_prompt)} characters")
            
            # Use ctx.sample to generate search/replace blocks
            response = await ctx.sample(
                messages=final_prompt,
                system_prompt=WEB_APP_PROMPT + EDIT_WEB_APP_SYSTEM_PROMPT,
                model_preferences=[model]
            )
            
            # Extract search/replace blocks from response
            search_replace_output = ""
            if hasattr(response, 'text') and response.text:
                search_replace_output = response.text
            elif hasattr(response, 'content') and response.content:
                search_replace_output = response.content
            else:
                response_str = str(response)
                if 'text=' in response_str:
                    import re
                    text_match = re.search(r'text=[\'"](.*?)[\'"]', response_str, re.DOTALL)
                    if text_match:
                        search_replace_output = text_match.group(1)
                        search_replace_output = search_replace_output.replace('\\\\n', '\n').replace('\\"', '"').replace("\\'", "'")
            
            if not search_replace_output:
                return {"status": "error", "message": "Failed to generate search/replace blocks from AI response"}
            
            # Ensure filename is prepended
            if not search_replace_output.startswith("current.html"):
                search_replace_output = "current.html\n" + search_replace_output
            
            edit_description = project_spec  # Use the project spec as the edit description
            
            print(f"Generated search/replace blocks for '{app_name_safe}'. Length: {len(search_replace_output)} characters")
            
        except Exception as e:
            print(f"Error generating search/replace blocks with AI: {str(e)}")
            return {"status": "error", "message": f"Failed to generate edit instructions: {str(e)}"}

        # STEP 3: Use SearchReplaceBlockParser and apply directly to string (no temp files needed)
        
        # Parse search/replace blocks using the robust parser
        parser = SearchReplaceBlockParser()
        blocks = parser.parse_blocks(search_replace_output) # search_replace_output now always has current.html prepended
        
        if not blocks:
            return {
                "status": "error",
                "message": "No valid search/replace blocks found in input. Please check the format of your search/replace blocks."
            }
        
        # Apply search/replace blocks directly to the HTML string
        modified_html = current_html
        successful_blocks = 0
        failed_blocks = 0
        failed_details = []
        
        for i, (file_path, search_text, replace_text) in enumerate(blocks):
            # Ensure proper newline handling for search/replace processing
            if not search_text.endswith('\n'):
                search_text += '\n'
            if not replace_text.endswith('\n'):
                replace_text += '\n'
            if not modified_html.endswith('\n'):
                modified_html += '\n'
            
            # Apply using the robust flexible search and replace strategies
            texts = (search_text, replace_text, modified_html)
            result = flexible_search_and_replace(texts, editblock_strategies)
            
            if result is not None:
                modified_html = result
                successful_blocks += 1
                print(f"✓ Successfully applied block {i+1}/{len(blocks)}")
            else:
                failed_blocks += 1
                failed_details.append(f"Block {i+1}: Search text not found or couldn't be applied")
                print(f"✗ Failed to apply block {i+1}/{len(blocks)}")
        
        # Create results summary
        sr_results = {
            'total_blocks': len(blocks),
            'successful': successful_blocks,
            'failed': failed_blocks,
            'failed_details': failed_details
        }
        
        # Check if any edits were successful
        if sr_results['successful'] == 0:
            return {
                "status": "error", 
                "message": f"All {sr_results['total_blocks']} search/replace blocks failed to apply. The search text may not match the current content exactly.",
                "search_replace_results": sr_results
            }

        # STEP 4: Save as new version with updated metadata
        # Load existing metadata
        metadata_path = os.path.join(app_dir, "app.json")
        metadata = await load_app_metadata(metadata_path)
        
        # Determine new version number based on total existing versions
        # This ensures we never overwrite existing versions when branching from old versions
        existing_versions = metadata.get("versions", [])
        current_version = metadata.get("current_version", 0)
        new_version = len(existing_versions) + 1  # Always increment from total versions
        
        # Load previous version content for commit summary generation
        previous_version_content = current_html
        
        # Save new version file
        versions_dir = os.path.join(app_dir, "versions")
        os.makedirs(versions_dir, exist_ok=True)
        version_filename = f"v{new_version}.html"
        version_path = os.path.join(versions_dir, version_filename)
        
        try:
            with open(version_path, 'w', encoding='utf-8') as f:
                await asyncio.to_thread(f.write, modified_html)
        except Exception as e:
            return {"status": "error", "message": f"Failed to save web app version: {str(e)}"}

        # Generate AI-powered commit summary
        try:
            # Determine if we're branching from an older version
            is_branching = current_version < len(existing_versions)
            branch_context = f" (branched from v{current_version})" if is_branching else ""
            
            # Use edit_description (derived from user_request or a default) for the commit summary generation
            commit_summary = await generate_commit_summary(
                edit_description + branch_context, modified_html, previous_version_content, metadata.get("versions", [])
            )
        except Exception as e:
            print(f"Warning: Failed to generate commit summary: {e}")
            commit_summary = f"🔄 Edited web application: {edit_description[:80]}..."

        # Update current.html symlink
        try:
            if os.path.exists(current_path) or os.path.islink(current_path):
                os.remove(current_path)
            # Create relative symlink for portability
            os.symlink(f"versions/{version_filename}", current_path)
        except Exception as e:
            print(f"Warning: Could not create/update current.html symlink: {e}")
            # Fallback: copy file instead of symlink
            try:
                import shutil
                shutil.copy2(version_path, current_path)
            except Exception as e2:
                return {"status": "error", "message": f"Failed to create current app file: {str(e2)}"}

        # Update metadata
        now = datetime.datetime.now().isoformat()
        if not metadata:
            # Shouldn't happen for edits, but handle gracefully
            metadata = {
                "app_name": app_name,
                "created_at": now,
                "last_updated": now,
                "description": f"Edited from: {edit_description[:100]}",
                "current_version": new_version,
                "versions": []
            }
        else:
            metadata["last_updated"] = now
            metadata["current_version"] = new_version

        # Add version entry
        version_entry = {
            "version": new_version,
            "timestamp": now,
            "file": f"versions/{version_filename}",
            "user_request": edit_description,
            "commit_summary": commit_summary,
            "size": len(modified_html),
            "line_count": len(modified_html.splitlines()),  # NEW: Add line count
            "edit_type": "direct_search_replace",
            "search_replace_results": sr_results
        }
        
        # Add branching information if this is a branch from an older version
        if is_branching:
            version_entry["branched_from"] = current_version
            version_entry["is_branch"] = True
        
        metadata["versions"].append(version_entry)

        # Save updated metadata
        try:
            await save_app_metadata(metadata_path, metadata)
        except Exception as e:
            return {"status": "error", "message": f"Failed to save app metadata: {str(e)}"}

        # Generate response
        serve_url = f"{DOMAIN}/user_data/{user_id_safe}/web_apps/{app_name_safe}/current.html"

        edit_mode = "direct_search_replace" # Only mode now
        return {
            "status": "success",
            "message": f"Web app '{app_name}' edited successfully using {sr_results['successful']} {edit_mode} changes. Access it at {serve_url}",
            "url": serve_url,
            "app_name": app_name,
            "commit_summary": commit_summary,
            "search_replace_results": sr_results,
            "edit_mode": edit_mode
        }
        
    except Exception as e:
        return {"status": "error", "message": f"Failed to edit web app: {str(e)}"}

@mcp.tool()
async def delete_web_app(
    app_name: Annotated[str, Field(description="The name of the web application to delete.")],
    user_number: Annotated[str, Field(description="The user's unique identifier, used to locate their web app data.")] = "+17145986105",
    confirm: Annotated[bool, Field(description="Confirmation flag - must be True to actually delete the app.")] = False
) -> dict:
    """
    Delete a web application and all its associated files (versions, metadata, design docs).
    
    IMPORTANT: This action is irreversible. All versions and history will be permanently lost.
    
    Args:
        app_name: Name of the web application to delete
        user_number: User's unique identifier
        confirm: Must be set to True to actually perform the deletion
        
    Returns:
        dict: Status and details of the deletion operation
    """
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"

    user_id_safe = sanitize_for_path(user_number)
    app_name_safe = sanitize_for_path(app_name)

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    app_dir = os.path.join(base_dir, user_id_safe, "web_apps", app_name_safe)

    # Check if app exists
    if not await asyncio.to_thread(os.path.exists, app_dir):
        return {
            "status": "error",
            "message": f"Web app '{app_name}' not found."
        }

    # Safety check - require explicit confirmation
    if not confirm:
        return {
            "status": "confirmation_required",
            "message": f"Web app '{app_name}' exists and can be deleted. Set 'confirm=True' to proceed with deletion.",
            "app_directory": app_dir,
            "warning": "This action is irreversible. All versions and history will be permanently lost."
        }

    try:
        # Get app info before deletion for the response
        metadata_path = os.path.join(app_dir, "app.json")
        metadata = await load_app_metadata(metadata_path)
        
        app_info = {
            "app_name": app_name,
            "versions_count": len(metadata.get("versions", [])),
            "created_at": metadata.get("created_at"),
            "last_updated": metadata.get("last_updated")
        }

        # Delete the entire app directory and all contents
        import shutil
        await asyncio.to_thread(shutil.rmtree, app_dir)

        return {
            "status": "success",
            "message": f"Web app '{app_name}' has been permanently deleted.",
            "deleted_app_info": app_info
        }

    except Exception as e:
        return {
            "status": "error", 
            "message": f"Failed to delete web app '{app_name}': {str(e)}"
        }

@mcp.tool()
async def switch_web_app_version(
    app_name: Annotated[str, Field(description="The name of the web application to switch versions for.")],
    target_version: Annotated[int, Field(description="The version number to switch to (e.g., 1, 2, 3).")],
    user_number: Annotated[str, Field(description="The user's unique identifier, used to locate their web app data.")] = "+17145986105"
) -> dict:
    """
    Switch the current version of a web application to a specific existing version.
    
    This allows you to revert to a previous version or switch between different versions
    without creating a new version. The selected version becomes the "current" version
    that is served at the main URL.
    
    Args:
        app_name: Name of the web application
        target_version: Version number to switch to
        user_number: User's unique identifier
        
    Returns:
        dict: Status and details of the version switch operation
    """
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"

    user_id_safe = sanitize_for_path(user_number)
    app_name_safe = sanitize_for_path(app_name)

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    app_dir = os.path.join(base_dir, user_id_safe, "web_apps", app_name_safe)
    current_path = os.path.join(app_dir, "current.html")
    metadata_path = os.path.join(app_dir, "app.json")

    # Check if app exists
    if not await asyncio.to_thread(os.path.exists, app_dir):
        return {
            "status": "error",
            "message": f"Web app '{app_name}' not found."
        }

    try:
        # Load metadata to get version information
        metadata = await load_app_metadata(metadata_path)
        
        if not metadata:
            return {
                "status": "error",
                "message": f"No version metadata found for web app '{app_name}'."
            }

        versions = metadata.get("versions", [])
        current_version = metadata.get("current_version", 1)
        
        # Validate target version exists
        if target_version < 1 or target_version > len(versions):
            return {
                "status": "error",
                "message": f"Version {target_version} does not exist. Available versions: 1-{len(versions)}."
            }
        
        # Check if we're already on the target version
        if target_version == current_version:
            return {
                "status": "success",
                "message": f"Web app '{app_name}' is already on version {target_version}.",
                "current_version": current_version,
                "no_change_needed": True
            }

        # Find the target version info
        target_version_info = None
        for version_data in versions:
            if version_data.get("version") == target_version:
                target_version_info = version_data
                break
        
        if not target_version_info:
            return {
                "status": "error", 
                "message": f"Version {target_version} metadata not found in version history."
            }

        # Get the target version file path
        versions_dir = os.path.join(app_dir, "versions")
        target_version_filename = f"v{target_version}.html"
        target_version_path = os.path.join(versions_dir, target_version_filename)
        
        # Check if the target version file exists
        if not await asyncio.to_thread(os.path.exists, target_version_path):
            return {
                "status": "error",
                "message": f"Version {target_version} file not found at {target_version_path}."
            }

        # Update the current.html symlink to point to the target version
        try:
            if os.path.exists(current_path) or os.path.islink(current_path):
                os.remove(current_path)
            # Create relative symlink for portability
            os.symlink(f"versions/{target_version_filename}", current_path)
        except Exception as e:
            print(f"Warning: Could not create/update current.html symlink: {e}")
            # Fallback: copy file instead of symlink
            try:
                import shutil
                shutil.copy2(target_version_path, current_path)
            except Exception as e2:
                return {"status": "error", "message": f"Failed to update current app file: {str(e2)}"}

        # Update metadata to reflect the new current version
        now = datetime.datetime.now().isoformat()
        metadata["current_version"] = target_version
        metadata["last_updated"] = now
        
        # Add a note about the version switch (without creating a new version)
        if "version_switches" not in metadata:
            metadata["version_switches"] = []
        
        metadata["version_switches"].append({
            "timestamp": now,
            "from_version": current_version,
            "to_version": target_version,
            "reason": "Manual version switch"
        })

        # Save updated metadata
        await save_app_metadata(metadata_path, metadata)

        # Generate response
        serve_url = f"{DOMAIN}/user_data/{user_id_safe}/web_apps/{app_name_safe}/current.html"
        
        return {
            "status": "success",
            "message": f"Successfully switched web app '{app_name}' from version {current_version} to version {target_version}.",
            "url": serve_url,
            "app_name": app_name,
            "previous_version": current_version,
            "new_current_version": target_version,
            "target_version_info": {
                "version": target_version,
                "timestamp": target_version_info.get("timestamp"),
                "commit_summary": target_version_info.get("commit_summary"),
                "user_request": target_version_info.get("user_request"),
                "size": target_version_info.get("size")
            }
        }

    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to switch web app version: {str(e)}"
        }

@mcp.tool()
async def view_web_app_version(
    app_name: Annotated[str, Field(description="The name of the web application to view.")],
    version_number: Annotated[Optional[int], Field(description="The version number to view (e.g., 1, 2, 3). If not provided, returns the current/latest version.")] = None,
    user_number: Annotated[str, Field(description="The user's unique identifier, used to locate their web app data.")] = "+17145986105",
    include_content: Annotated[bool, Field(description="Whether to include the full HTML content in the response. Set to False for just metadata.")] = True
) -> dict:
    """
    View the content and metadata of a specific version without switching to it.
    
    This allows you to inspect past versions, compare content, or examine version history
    without changing the current active version. Think of it as 'git show' for web apps.
    
    Args:
        app_name: Name of the web application
        version_number: Version number to view (if None, returns current version)
        user_number: User's unique identifier  
        include_content: Whether to include full HTML content (can be large)
        
    Returns:
        dict: Version information including metadata and optionally full content
    """
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"

    user_id_safe = sanitize_for_path(user_number)
    app_name_safe = sanitize_for_path(app_name)

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    app_dir = os.path.join(base_dir, user_id_safe, "web_apps", app_name_safe)
    metadata_path = os.path.join(app_dir, "app.json")

    # Check if app exists
    if not await asyncio.to_thread(os.path.exists, app_dir):
        return {
            "status": "error",
            "message": f"Web app '{app_name}' not found."
        }

    try:
        # Load metadata to get version information
        metadata = await load_app_metadata(metadata_path)
        
        if not metadata:
            return {
                "status": "error",
                "message": f"No version metadata found for web app '{app_name}'."
            }

        versions = metadata.get("versions", [])
        current_version = metadata.get("current_version", 1)
        
        # If no version specified, use current version
        if version_number is None:
            version_number = current_version
        
        # Validate version exists
        if version_number < 1 or version_number > len(versions):
            return {
                "status": "error",
                "message": f"Version {version_number} does not exist. Available versions: 1-{len(versions)}."
            }

        # Find the version info
        version_info = None
        for version_data in versions:
            if version_data.get("version") == version_number:
                version_info = version_data
                break
        
        if not version_info:
            return {
                "status": "error", 
                "message": f"Version {version_number} metadata not found in version history."
            }

        # Get the version file path
        versions_dir = os.path.join(app_dir, "versions")
        version_filename = f"v{version_number}.html"
        version_path = os.path.join(versions_dir, version_filename)
        
        # Check if the version file exists
        if not await asyncio.to_thread(os.path.exists, version_path):
            return {
                "status": "error",
                "message": f"Version {version_number} file not found at {version_path}."
            }

        # Prepare the response
        response = {
            "status": "success",
            "app_name": app_name,
            "version_number": version_number,
            "is_current_version": version_number == current_version,
            "current_version": current_version,
            "total_versions": len(versions),
            "version_info": {
                "version": version_info.get("version"),
                "timestamp": version_info.get("timestamp"),
                "commit_summary": version_info.get("commit_summary"),
                "user_request": version_info.get("user_request"),
                "size": version_info.get("size"),
                "edit_type": version_info.get("edit_type"),
                "branched_from": version_info.get("branched_from"),
                "is_branch": version_info.get("is_branch", False)
            }
        }

        # Include content if requested
        if include_content:
            try:
                with open(version_path, 'r', encoding='utf-8') as f:
                    html_content = await asyncio.to_thread(f.read)
                response["html_content"] = html_content
                response["content_length"] = len(html_content)
                
                # Add content preview (first 200 chars)
                response["content_preview"] = html_content[:200] + ("..." if len(html_content) > 200 else "")
            except Exception as e:
                return {
                    "status": "error",
                    "message": f"Failed to read version {version_number} content: {str(e)}"
                }
        else:
            response["content_included"] = False
            response["note"] = "Set include_content=True to get full HTML content"

        # Add preview URL (even though it's not the current version)
        serve_url = f"{DOMAIN}/user_data/{user_id_safe}/web_apps/{app_name_safe}/versions/{version_filename}"
        response["version_direct_url"] = serve_url
        response["current_app_url"] = f"{DOMAIN}/user_data/{user_id_safe}/web_apps/{app_name_safe}/current.html"

        return response

    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to view web app version: {str(e)}"
        }

@mcp.tool()
async def compare_web_app_versions(
    app_name: Annotated[str, Field(description="The name of the web application to compare versions for.")],
    version_a: Annotated[int, Field(description="First version number to compare (e.g., 1, 2, 3).")],
    version_b: Annotated[int, Field(description="Second version number to compare (e.g., 1, 2, 3).")],
    user_number: Annotated[str, Field(description="The user's unique identifier, used to locate their web app data.")] = "+17145986105",
    diff_type: Annotated[str, Field(description="Type of diff to generate: 'summary' (changes overview), 'lines' (line-by-line), or 'both'.")] = "summary"
) -> dict:
    """
    Compare two versions of a web application to see what changed between them.
    
    This tool helps you understand the evolution of your web app by showing differences
    between any two versions. Useful for code review, debugging, or understanding changes.
    
    Args:
        app_name: Name of the web application
        version_a: First version to compare (will be shown as "from")
        version_b: Second version to compare (will be shown as "to") 
        user_number: User's unique identifier
        diff_type: Type of comparison to perform
        
    Returns:
        dict: Comparison results with differences, metadata, and statistics
    """
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"

    user_id_safe = sanitize_for_path(user_number)
    app_name_safe = sanitize_for_path(app_name)

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    app_dir = os.path.join(base_dir, user_id_safe, "web_apps", app_name_safe)
    metadata_path = os.path.join(app_dir, "app.json")

    # Check if app exists
    if not await asyncio.to_thread(os.path.exists, app_dir):
        return {
            "status": "error",
            "message": f"Web app '{app_name}' not found."
        }

    try:
        # Load metadata
        metadata = await load_app_metadata(metadata_path)
        
        if not metadata:
            return {
                "status": "error",
                "message": f"No version metadata found for web app '{app_name}'."
            }

        versions = metadata.get("versions", [])
        
        # Validate both versions exist
        if version_a < 1 or version_a > len(versions):
            return {
                "status": "error",
                "message": f"Version {version_a} does not exist. Available versions: 1-{len(versions)}."
            }
        
        if version_b < 1 or version_b > len(versions):
            return {
                "status": "error",
                "message": f"Version {version_b} does not exist. Available versions: 1-{len(versions)}."
            }

        # Get version file paths
        versions_dir = os.path.join(app_dir, "versions")
        version_a_path = os.path.join(versions_dir, f"v{version_a}.html")
        version_b_path = os.path.join(versions_dir, f"v{version_b}.html")
        
        # Check if version files exist
        if not await asyncio.to_thread(os.path.exists, version_a_path):
            return {
                "status": "error",
                "message": f"Version {version_a} file not found."
            }
        
        if not await asyncio.to_thread(os.path.exists, version_b_path):
            return {
                "status": "error",
                "message": f"Version {version_b} file not found."
            }

        # Read both versions
        with open(version_a_path, 'r', encoding='utf-8') as f:
            content_a = await asyncio.to_thread(f.read)
        
        with open(version_b_path, 'r', encoding='utf-8') as f:
            content_b = await asyncio.to_thread(f.read)

        # Get version metadata
        version_a_info = next((v for v in versions if v.get("version") == version_a), {})
        version_b_info = next((v for v in versions if v.get("version") == version_b), {})

        # Prepare basic comparison data
        comparison = {
            "status": "success",
            "app_name": app_name,
            "comparison": {
                "from_version": version_a,
                "to_version": version_b,
                "from_info": {
                    "timestamp": version_a_info.get("timestamp"),
                    "commit_summary": version_a_info.get("commit_summary"),
                    "size": len(content_a)
                },
                "to_info": {
                    "timestamp": version_b_info.get("timestamp"),
                    "commit_summary": version_b_info.get("commit_summary"),
                    "size": len(content_b)
                }
            },
            "statistics": {
                "size_change": len(content_b) - len(content_a),
                "identical": content_a == content_b
            }
        }

        # If versions are identical, return early
        if content_a == content_b:
            comparison["message"] = f"Versions {version_a} and {version_b} are identical."
            return comparison

        # Generate diff based on requested type
        if diff_type in ["summary", "both"]:
            # Simple summary of changes
            lines_a = content_a.splitlines()
            lines_b = content_b.splitlines()
            
            comparison["summary"] = {
                "lines_added": len(lines_b) - len(lines_a),
                "total_lines_a": len(lines_a),
                "total_lines_b": len(lines_b),
                "has_differences": True
            }

        if diff_type in ["lines", "both"]:
            # Line-by-line diff using Python's difflib
            import difflib
            
            lines_a = content_a.splitlines(keepends=True)
            lines_b = content_b.splitlines(keepends=True)
            
            # Generate unified diff
            diff_lines = list(difflib.unified_diff(
                lines_a, 
                lines_b, 
                fromfile=f"v{version_a}.html",
                tofile=f"v{version_b}.html",
                n=3  # 3 lines of context
            ))
            
            comparison["diff"] = {
                "format": "unified",
                "lines": diff_lines[:100],  # Limit to first 100 lines to avoid huge responses
                "truncated": len(diff_lines) > 100,
                "total_diff_lines": len(diff_lines)
            }

        # Add direct URLs for viewing both versions
        comparison["urls"] = {
            "version_a_url": f"{DOMAIN}/user_data/{user_id_safe}/web_apps/{app_name_safe}/versions/v{version_a}.html",
            "version_b_url": f"{DOMAIN}/user_data/{user_id_safe}/web_apps/{app_name_safe}/versions/v{version_b}.html",
            "current_app_url": f"{DOMAIN}/user_data/{user_id_safe}/web_apps/{app_name_safe}/current.html"
        }

        return comparison

    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to compare web app versions: {str(e)}"
        }


# --- Helper functions for versioned web app storage ---
async def load_app_metadata(metadata_path: str) -> dict:
    """Load app metadata from JSON file, return empty dict if file doesn't exist"""
    try:
        if os.path.exists(metadata_path):
            with open(metadata_path, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        print(f"Error loading app metadata from {metadata_path}: {e}")
    return {}

async def save_app_metadata(metadata_path: str, metadata: dict) -> None:
    """Save app metadata to JSON file"""
    try:
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving app metadata to {metadata_path}: {e}")
        raise

# --- Helper functions for PDF document storage ---
async def load_pdf_metadata(metadata_path: str) -> dict:
    """Load PDF document metadata from JSON file, return empty dict if file doesn't exist"""
    try:
        if os.path.exists(metadata_path):
            with open(metadata_path, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        print(f"Error loading PDF metadata from {metadata_path}: {e}")
    return {}

async def save_pdf_metadata(metadata_path: str, metadata: dict) -> None:
    """Save PDF document metadata to JSON file"""
    try:
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving PDF metadata to {metadata_path}: {e}")
        raise

async def update_pdf_commit_summary_background(
    metadata_path: str, 
    version_number: int, 
    request_for_summary: str,
    html_content_for_summary: str,
    previous_version_content_for_summary: str,
    commit_history_for_summary: List[Dict]
):
    """Update the commit summary for PDF documents in the background after the tool has already returned."""
    try:
        # Generate the real commit summary
        real_commit_summary = await generate_commit_summary(
            request_for_summary, html_content_for_summary, previous_version_content_for_summary, commit_history_for_summary
        )
        
        # Load current metadata
        metadata = await load_pdf_metadata(metadata_path)
        if not metadata:
            return
        
        # Find and update the version entry
        for version_entry in metadata.get("versions", []):
            if version_entry.get("version") == version_number:
                version_entry["commit_summary"] = real_commit_summary
                version_entry.pop("generating_summary", None)  # Remove the flag
                break
        
        # Save updated metadata
        await save_pdf_metadata(metadata_path, metadata)
        print(f"Background commit summary updated for PDF version {version_number}: {real_commit_summary}")
        
    except Exception as e:
        print(f"Warning: Failed to update PDF commit summary in background: {e}")
        # If background generation fails, we could update with a fallback message
        try:
            metadata = await load_pdf_metadata(metadata_path)
            if metadata:
                for version_entry in metadata.get("versions", []):
                    if version_entry.get("version") == version_number and version_entry.get("generating_summary"):
                        version_entry["commit_summary"] = f"📄 {'Initial version' if version_number == 1 else 'Updated version'}: {request_for_summary[:80]}..."
                        version_entry.pop("generating_summary", None)
                        break
                await save_pdf_metadata(metadata_path, metadata)
        except:
            pass  # If even the fallback fails, just leave the placeholder

async def generate_commit_summary(request_for_summary: str, html_content_for_summary: str, previous_version_content_for_summary: str = None, commit_history_for_summary: List[Dict] = None) -> str:
    """Generate AI-powered commit summary for this version using fast model and commit history context"""
    # Always use Flash Lite for commit summaries - fastest and most efficient
    model = "gemini-2.5-flash-lite-preview-06-17"
    
    try:
        # Build context from commit history
        history_context = ""
        if commit_history_for_summary and len(commit_history_for_summary) > 0:
            history_context = "\n\nPrevious Commits:\n"
            # Show last 5 commits for context (most recent first)
            recent_commits = commit_history_for_summary[-5:] if len(commit_history_for_summary) > 5 else commit_history_for_summary
            for i, commit in enumerate(reversed(recent_commits), 1):
                history_context += f"{i}. {commit.get('commit_summary', 'No summary')}\n"
            history_context += "\n"

        if previous_version_content_for_summary:
            prompt = f"""Analyze the changes made to this web application and generate a concise commit summary.

User Request/Edit Description: {request_for_summary}

Previous Version Length: {len(previous_version_content_for_summary)} characters
New Version Length: {len(html_content_for_summary)} characters{history_context}
Please generate a commit summary that:
1. Starts with an appropriate emoji
2. Summarizes the key changes made
3. Mentions any new features, UI changes, or functionality added
4. Is concise but informative (1-2 sentences)
5. Uses active voice and present tense
6. Considers the context of previous commits to avoid repetition

Examples:
- "🎯 Initial Release: Created responsive todo application with core CRUD operations..."
- "🏷️ Category System: Added comprehensive category management with color-coded labels..."
- "🎨 UI Refresh: Redesigned interface with improved mobile responsiveness and new color scheme..."
- "🔧 Bug Fixes: Resolved localStorage issues and improved form validation..."

Generate only the commit summary, no additional text."""
        else:
            prompt = f"""Generate a commit summary for the initial version of this web application.

User Request/App Description: {request_for_summary}
App Content Length: {len(html_content_for_summary)} characters

Please generate a commit summary that:
1. Starts with 🎯 emoji for initial release
2. Summarizes the main features and capabilities
3. Mentions key technical aspects (responsive design, dark mode, etc.)
4. Is concise but comprehensive (1-2 sentences)

Generate only the commit summary, no additional text."""

        # Use LLM adapter directly for faster processing without thinking
        from llm_adapters import get_llm_adapter, StandardizedMessage, StandardizedLLMConfig
        
        adapter = get_llm_adapter(model)
        
        # Configure for fast, no-thinking generation
        config = StandardizedLLMConfig(
            include_thoughts=False,  # Explicitly disable thinking for speed
        )
        
        # Structure the prompt as a standardized message
        messages = [StandardizedMessage.from_text("user", prompt)]
        
        # Generate directly using the adapter
        response = await adapter.generate_content(
            model_name=model,
            history=messages,
            tools=None,
            config=config
        )
        
        if response.error:
            print(f"Error generating commit summary with adapter: {response.error}")
            return f"🔄 {'Initial version' if not previous_version_content_for_summary else 'Updated version'}: {request_for_summary[:80]}..."
        
        return response.text_content.strip() if response.text_content else f"🔄 {'Initial version' if not previous_version_content_for_summary else 'Updated version'}: {request_for_summary[:80]}..."
            
    except Exception as e:
        print(f"Error generating commit summary: {e}")
        return f"🔄 {'Initial version' if not previous_version_content_for_summary else 'Updated version'}: {request_for_summary[:80]}..."

@mcp.tool()
async def ai_chat(
    messages: Annotated[str, Field(
        description="The user's message or conversation to send to the AI"
    )],
    system_prompt: Annotated[Optional[str], Field(
        description="Optional system prompt to guide the AI's behavior"
    )] = None,
    model: Annotated[MODELS_LITERAL, Field(
        description="The AI model to use for the response"
    )] = "gemini-2.5-flash-lite-preview-06-17",
    include_thoughts: Annotated[bool, Field(
        description="Whether to include the AI's thinking process in the response"
    )] = False,
    user_number: Annotated[str, Field(
        description="The user's unique identifier, used for consistency with other tools. Not used by ai_chat but required by the system."
    )] = "+17145986105",
    json_schema: Annotated[Optional[dict], Field(
        description="Optional JSON schema that the AI response must follow. When provided, the AI will return structured data instead of free text."
    )] = None,
    attachments: Annotated[Optional[List[str]], Field(
        description="A list of image URLs to include with the message. Supports common image formats (PNG, JPEG, GIF, WebP, SVG)."
    )] = None
) -> dict:
    """
    Send a message to an AI model and get a response using direct Gemini API calls.
    
    This allows web applications to have conversational AI capabilities
    by sending user messages to various AI models and receiving responses.
    Enables chatbots, content generation, code assistance, and other AI-powered features.
    
    ## Image Support
    
    The tool supports sending images along with text messages by providing image URLs
    in the attachments parameter. Supported formats include PNG, JPEG, GIF, WebP, and SVG.
    
    ### Image Examples:
    
    ```javascript
    // Analyze an image
    const analysis = await chatWithAI("What do you see in this image?", {
        attachments: ["https://example.com/image.jpg"]
    });
    
    // Multiple images
    const comparison = await chatWithAI("Compare these two images", {
        attachments: [
            "https://example.com/image1.jpg",
            "https://example.com/image2.png"
        ]
    });
    
    // Image with structured output
    const imageData = await chatWithAI("Extract information from this chart", {
        attachments: ["https://example.com/chart.png"],
        jsonSchema: {
            type: "object",
            properties: {
                title: {type: "string"},
                data_points: {type: "array", items: {type: "number"}},
                insights: {type: "array", items: {type: "string"}}
            }
        }
    });
    ```
    
    ## JSON Schema Usage
    
    When json_schema is provided, the AI will return structured data matching the schema
    instead of free-form text. This is useful for data extraction, form processing, 
    content generation with specific structure, and API-like responses.
    
    ### JSON Schema Examples:
    
    **Example 1: Extract user information**
    ```python
    json_schema = {
        "type": "object",
        "properties": {
            "name": {"type": "string"},
            "age": {"type": "number"},
            "location": {"type": "string"},
            "interests": {
                "type": "array", 
                "items": {"type": "string"}
            }
        },
        "required": ["name", "age"]
    }
    
    # Call: ai_chat(messages="Hi, I'm John, 25 years old from NYC. I love coding and music.", json_schema=json_schema)
    # Returns: {"name": "John", "age": 25, "location": "NYC", "interests": ["coding", "music"]}
    ```
    
    **Example 2: Generate structured content**
    ```python
    json_schema = {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "summary": {"type": "string"},
            "content": {"type": "string"},
            "tags": {
                "type": "array",
                "items": {"type": "string"}
            },
            "readTime": {"type": "number"}
        },
        "required": ["title", "content"]
    }
    
    # Call: ai_chat(messages="Write a blog post about AI", json_schema=json_schema)
    # Returns: {"title": "...", "summary": "...", "content": "...", "tags": [...], "readTime": 5}
    ```
    
    **Example 3: Form validation**
    ```python
    json_schema = {
        "type": "object",
        "properties": {
            "isValid": {"type": "boolean"},
            "errors": {
                "type": "array",
                "items": {"type": "string"}
            },
            "suggestions": {"type": "string"}
        },
        "required": ["isValid"]
    }
    
    # Call: ai_chat(messages="Validate email: invalid-email", json_schema=json_schema)
    # Returns: {"isValid": false, "errors": ["Invalid format"], "suggestions": "Use format: user@domain.com"}
    ```
    
    **Example 4: Data analysis**
    ```python
    json_schema = {
        "type": "object",
        "properties": {
            "total": {"type": "number"},
            "average": {"type": "number"},
            "trend": {
                "type": "string",
                "enum": ["increasing", "decreasing", "stable"]
            },
            "insights": {
                "type": "array",
                "items": {"type": "string"}
            }
        },
        "required": ["total", "average", "trend"]
    }
    
    # Call: ai_chat(messages="Analyze sales: [100, 200, 150, 300]", json_schema=json_schema)
    # Returns: {"total": 750, "average": 187.5, "trend": "increasing", "insights": ["Strong finish", "Volatile middle period"]}
    ```
    
    ### Response Format:
    
    **Without json_schema:**
    ```python
    {
        "status": "success",
        "response": "AI's text response here...",  # String
        "response_type": "text"
    }
    ```
    
    **With json_schema:**
    ```python
    {
        "status": "success", 
        "response": {"structured": "data", "matching": "schema"},  # Parsed JSON object
        "response_type": "json",
        "schema_provided": True
    }
    ```
    
    ### JavaScript Usage in Web Apps:
    
    ```javascript
    // Simple text chat
    const textResponse = await chatWithAI("Hello, how are you?");
    console.log(textResponse); // "I'm doing well, thank you! How can I help you today?"
    
    // Structured data extraction
    const userInfo = await chatWithAI("My name is Alice, I'm 30, from London", {
        jsonSchema: {
            type: "object",
            properties: {
                name: {type: "string"},
                age: {type: "number"}, 
                location: {type: "string"}
            },
            required: ["name", "age", "location"]
        }
    });
    console.log(userInfo); // {name: "Alice", age: 30, location: "London"}
    ```
    
    ### Error Handling:
    
    If the AI fails to generate valid JSON matching the schema, the response will be:
    ```python
    {
        "status": "error",
        "message": "AI response is not valid JSON: ...",
        "raw_response": "The actual AI response text",
        "json_error_detail": "Specific parsing error"
    }
    ```
    """
    try:
        # Process attachments if provided
        attachment_parts = []
        if attachments and isinstance(attachments, list):
            print(f"DEBUG: Processing {len(attachments)} attachments for ai_chat")
            for url in attachments:
                if isinstance(url, str) and url.startswith(('http://', 'https://')):
                    # Check if URL ends with common image extensions OR contains serve_image (for our dynamic URLs)
                    if (url.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg')) or 
                        'serve_image' in url or 'claude_attachments' in url):
                        # Download attachment for AI processing
                        attachment_part = await download_and_create_attachment_part(url)
                        if attachment_part:
                            attachment_parts.append(attachment_part)
                            print(f"DEBUG: Successfully downloaded image: {url}")
                        else:
                            print(f"WARNING: Failed to download image: {url}")
                    else:
                        print(f"WARNING: Unsupported file type for attachment: {url}")
                else:
                    print(f"WARNING: Invalid URL in attachments: {url}")
        
        # Use the LLM adapter to call Gemini directly
        adapter = get_llm_adapter(model)
        
        # Create standardized message with attachments
        user_message = StandardizedMessage.from_text("user", messages)
        if attachment_parts:
            user_message.attachments = attachment_parts
        
        standardized_messages = [user_message]
        
        # Create standardized config
        config = StandardizedLLMConfig(
            system_prompt=system_prompt,
            include_thoughts=include_thoughts,
            json_schema=json_schema
        )
        
        print(f"DEBUG: ai_chat calling Gemini directly with model: {model}")
        print(f"DEBUG: JSON schema provided: {json_schema is not None}")
        print(f"DEBUG: Attachments processed: {len(attachment_parts)}")
        
        # Call Gemini directly through the adapter
        llm_response = await adapter.generate_content(
            model_name=model,
            history=standardized_messages,
            tools=None,
            config=config
        )
        
        # Check for errors
        if llm_response.error:
            return {
                "status": "error",
                "message": f"Gemini API error: {llm_response.error}"
            }
        
        # Handle structured output (when json_schema is provided)
        if json_schema and llm_response.parsed is not None:
            # For structured output, Gemini returns parsed JSON directly
            print(f"DEBUG: Using parsed structured output from Gemini")
            return {
                "status": "success",
                "response": llm_response.parsed,  # Already parsed JSON object
                "response_type": "json",
                "model_used": model,
                "message_length": len(messages),
                "response_length": len(str(llm_response.parsed)),
                "schema_provided": True,
                "parsed_from": "gemini_structured_output"
            }
        
        # Handle regular text response
        ai_response = llm_response.text_content or ""
        
        # If JSON schema was requested but we didn't get structured output, try to parse manually
        if json_schema:
            json_match = None
            try:
                # Extract JSON from code blocks (more reliable)
                import re
                json_match = re.search(r'```json\s*(.*?)\s*```', ai_response, re.DOTALL)
                
                if json_match:
                    json_text = json_match.group(1).strip()
                    # Clean JSON text before parsing
                    json_text = clean_json_response(json_text)
                    parsed_response = json.loads(json_text)
                else:
                    # Fallback: try to parse the entire response as JSON (without code blocks)
                    cleaned_response = clean_json_response(ai_response.strip())
                    parsed_response = json.loads(cleaned_response)
                
                # Basic schema validation (check if required fields exist)
                if "properties" in json_schema and "required" in json_schema:
                    required_fields = json_schema.get("required", [])
                    missing_fields = [field for field in required_fields if field not in parsed_response]
                    if missing_fields:
                        return {
                            "status": "error",
                            "message": f"JSON response missing required fields: {missing_fields}",
                            "raw_response": ai_response,
                            "expected_fields": required_fields
                        }
                
                return {
                    "status": "success",
                    "response": parsed_response,  # Structured JSON response
                    "response_type": "json",
                    "model_used": model,
                    "message_length": len(messages),
                    "response_length": len(ai_response),
                    "schema_provided": True,
                    "parsed_from": "code_block" if json_match else "direct"
                }
                
            except json.JSONDecodeError as e:
                return {
                    "status": "error",
                    "message": f"AI response is not valid JSON: {str(e)}",
                    "raw_response": ai_response,
                    "parsing_method": "code_block" if json_match else "direct",
                    "json_error_detail": str(e)
                }
        else:
            # Return text response
            result = {
                "status": "success",
                "response": ai_response,  # Text response
                "response_type": "text",
                "model_used": model,
                "message_length": len(messages),
                "response_length": len(ai_response),
                "schema_provided": False
            }
            
            # Include usage metadata if available
            if llm_response.usage_metadata:
                result["usage_metadata"] = llm_response.usage_metadata
                
            return result
        
    except Exception as e:
        print(f"ERROR in ai_chat: {str(e)}")
        return {
            "status": "error",
            "message": f"AI chat failed: {str(e)}"
        }

@mcp.tool()
async def create_pdf_document(
    ctx: Context,
    project_spec: Annotated[str, Field(
        description="A detailed description/specification of the PDF document to create. This should describe the content, structure, design requirements, and any specific needs. The AI will use this to generate the complete HTML content optimized for PDF conversion."
    )],
    user_number: Annotated[str, Field(
        description="The user's unique identifier (e.g., phone number), used for directory structuring."
    )] = "+17145986105",
    doc_name: Annotated[Optional[str], Field(
        description="The desired name for the PDF document. If not provided, a relevant name will be automatically generated."
    )] = None, 
    attachments: Annotated[Optional[List[str]], Field(
        description="A list of attachment URLs for reference."
    )] = None,
    model: Annotated[MODELS_LITERAL, Field(
        description="The LLM model to use for HTML generation. If user does not specify, use gemini-2.5-pro-preview-05-06."
    )] = "gemini-2.5-pro-preview-05-06",
    additional_context: Annotated[Optional[str], Field(
        description="Optional additional context for document generation."
    )] = None
) -> dict:
    """
    Creates a PDF document from a project specification using AI generation.
    
    This tool:
    - Takes a project specification describing the desired PDF document
    - Uses AI to generate complete HTML content optimized for PDF conversion
    - Converts HTML to PDF using weasyprint
    - Sets up directory structure and versioning
    - Creates metadata and commit summaries
    - Handles attachments for context
    
    The AI generation follows best practices for PDF documents including:
    - Print-optimized layouts and styling
    - Proper page breaks and margins
    - Professional typography
    - Clean, readable design
    - Structured content organization
    """
    print("DEBUG: INSIDE OF CREATE_PDF_DOCUMENT - Generating PDF from project specification")
    
    # Use default user number if empty
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"

    # Sanitize inputs
    user_id_safe = sanitize_for_path(user_number)
    doc_name = doc_name or f"pdf-doc-{str(uuid.uuid4())[:8]}"
    doc_name_safe = sanitize_for_path(doc_name)

    main_request = project_spec  # Use the project specification directly

    print(f"Creating PDF document '{doc_name_safe}' from project specification.")

    # --- Attachment Handling ---
    attachment_info_for_prompt = []
    attachment_parts = []
    if attachments and isinstance(attachments, list):
        for url in attachments:
            if isinstance(url, str) and url.startswith(('http://', 'https://')):
                if url.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg')):
                    mime_type = 'image/*'
                elif url.lower().endswith('.pdf'):
                    mime_type = 'application/pdf'
                else:
                    mime_type = 'unknown'
                attachment_info_for_prompt.append({"url": url, "mime_type": mime_type})
                
                # Download attachment for AI processing
                attachment_part = await download_and_create_attachment_part(url)
                if attachment_part:
                    attachment_parts.append(attachment_part)
            else:
                print(f"Skipping invalid URL in attachments: {url}")

    # --- AI Generation using ctx.sample ---
    try:
        # Build comprehensive prompt for PDF document generation
        prompt_parts = []
        
        # Add the main project specification
        prompt_parts.append(f"Create a PDF document based on this specification:\n{project_spec}")
        
        # Add attachment context if available
        if attachment_info_for_prompt:
            attachment_context = "\n\nAttachments provided:\n"
            for att in attachment_info_for_prompt:
                attachment_context += f"- {att['url']} (type: {att['mime_type']})\n"
            prompt_parts.append(attachment_context)
        
        # Add additional context if provided
        if additional_context:
            prompt_parts.append(f"\nAdditional Context:\n{additional_context}")
        
        # Add PDF-specific output format instruction
        prompt_parts.append("\nProvide the complete HTML document optimized for PDF conversion, wrapped in ```html code blocks.")
        
        final_prompt = "\n".join(prompt_parts)
        
        print(f"Generating PDF document with model: {model}")
        print(f"Prompt length: {len(final_prompt)} characters")
        
        # Use ctx.sample to generate the PDF document HTML
        response = await ctx.sample(
            messages=final_prompt,
            system_prompt=PDF_HTML_SYSTEM_PROMPT,
            model_preferences=[model]
        )
        
        # Extract HTML content from response
        html_content = ""
        if hasattr(response, 'text') and response.text:
            html_content = response.text
        elif hasattr(response, 'content') and response.content:
            html_content = response.content
        else:
            response_str = str(response)
            if 'text=' in response_str:
                import re
                text_match = re.search(r'text=[\'"](.*?)[\'"]', response_str, re.DOTALL)
                if text_match:
                    html_content = text_match.group(1)
                    html_content = html_content.replace('\\\\n', '\n').replace('\\"', '"').replace("\\'", "'")
        
        if not html_content:
            return {"status": "error", "message": "Failed to generate HTML content from AI response"}
        
        # Extract HTML from code blocks if present
        import re
        html_match = re.search(r'```html\s*(.*?)\s*```', html_content, re.DOTALL)
        if html_match:
            html_content = html_match.group(1).strip()
        
        print(f"Generated HTML content for '{doc_name_safe}'. Length: {len(html_content)} characters")
        
    except Exception as e:
        print(f"Error generating PDF document with AI: {str(e)}")
        return {"status": "error", "message": f"Failed to generate PDF document: {str(e)}"}

    # Validate that html_content was generated
    if not html_content:
        print(f"Error for '{doc_name_safe}': No HTML content was generated.")
        return {"status": "error", "message": "Failed to generate HTML content from project specification."}
            
    # Set up directory structure
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    user_specific_data_dir = os.path.join(base_dir, user_id_safe)
    doc_dir = os.path.join(user_specific_data_dir, "pdf_documents", doc_name_safe)
    versions_dir = os.path.join(doc_dir, "versions")
    os.makedirs(versions_dir, exist_ok=True)

    # Load existing metadata
    metadata_path = os.path.join(doc_dir, "doc.json")
    metadata = await load_pdf_metadata(metadata_path)
    
    # Determine new version number
    current_version = metadata.get("current_version", 0)
    new_version = current_version + 1
    
    # Generate PDF from HTML
    try:
        # Save HTML version
        html_filename = f"v{new_version}.html"
        html_path = os.path.join(versions_dir, html_filename)
        
        with open(html_path, 'w', encoding='utf-8') as f:
            await asyncio.to_thread(f.write, html_content)
        
        # Convert HTML to PDF
        pdf_filename = f"v{new_version}.pdf"
        pdf_path = os.path.join(versions_dir, pdf_filename)
        
        # Use weasyprint to convert HTML to PDF
        import weasyprint
        pdf_document = await asyncio.to_thread(weasyprint.HTML, string=html_content)
        await asyncio.to_thread(pdf_document.write_pdf, pdf_path)
        
        print(f"Successfully generated PDF: {pdf_path}")
        
    except Exception as e:
        return {"status": "error", "message": f"Failed to generate PDF: {str(e)}"}

    # Create placeholder commit summary
    placeholder_commit_summary = f"📄 {'Created' if new_version == 1 else 'Updated'} PDF document: {main_request[:80]}..."
    
    # Update metadata
    now = datetime.datetime.now().isoformat()
    if not metadata:
        metadata = {
            "doc_name": doc_name,
            "created_at": now,
            "last_updated": now,
            "description": f"{main_request[:250]}",
            "current_version": new_version,
            "versions": []
        }
    else:
        metadata["last_updated"] = now
        metadata["current_version"] = new_version

    # Add version entry
    pdf_size = os.path.getsize(pdf_path) if os.path.exists(pdf_path) else 0
    version_entry = {
        "version": new_version,
        "timestamp": now,
        "html_file": f"versions/{html_filename}",
        "pdf_file": f"versions/{pdf_filename}",
        "user_request": main_request,
        "commit_summary": placeholder_commit_summary,
        "html_size": len(html_content),
        "pdf_size": pdf_size,
        "line_count": len(html_content.splitlines()),
        "generating_summary": True
    }
    metadata["versions"].append(version_entry)

    # Save metadata
    try:
        await save_pdf_metadata(metadata_path, metadata)
    except Exception as e:
        return {"status": "error", "message": f"Failed to save document metadata: {str(e)}"}

    # Create current symlinks
    current_html_path = os.path.join(doc_dir, "current.html")
    current_pdf_path = os.path.join(doc_dir, "current.pdf")
    
    try:
        # Remove existing symlinks
        for current_path, target_filename in [(current_html_path, html_filename), (current_pdf_path, pdf_filename)]:
            if os.path.exists(current_path) or os.path.islink(current_path):
                os.remove(current_path)
            os.symlink(f"versions/{target_filename}", current_path)
    except Exception as e:
        print(f"Warning: Could not create current symlinks: {e}")
        # Fallback: copy files
        try:
            import shutil
            shutil.copy2(html_path, current_html_path)
            shutil.copy2(pdf_path, current_pdf_path)
        except Exception as e2:
            return {"status": "error", "message": f"Failed to create current document files: {str(e2)}"}

    # Generate URLs
    pdf_url = f"{DOMAIN}/user_data/{user_id_safe}/pdf_documents/{doc_name_safe}/current.pdf"
    html_url = f"{DOMAIN}/user_data/{user_id_safe}/pdf_documents/{doc_name_safe}/current.html"

    # Start background task to generate real commit summary
    asyncio.create_task(update_pdf_commit_summary_background(
        metadata_path, new_version, main_request, html_content, 
        None, metadata.get("versions", [])
    ))

    return {
        "status": "success",
        "message": f"PDF document '{doc_name}' created successfully. Access PDF at {pdf_url}",
        "pdf_url": pdf_url,
        "html_url": html_url,
        "doc_name": doc_name,
        "commit_summary": placeholder_commit_summary,
        "pdf_size": pdf_size
    }

@mcp.tool()
async def edit_pdf_document(
    ctx: Context,
    doc_name: Annotated[str, Field(description="The name of the PDF document to edit.")],
    project_spec: Annotated[str, Field(
        description="A detailed description of the changes to make to the PDF document. Describe what content to add, modify, or remove. The AI will generate appropriate search/replace blocks to implement these changes on the HTML content, then regenerate the PDF."
    )],
    user_number: Annotated[str, Field(description="The user's unique identifier.")] = "+17145986105",
    model: Annotated[MODELS_LITERAL, Field(description="The LLM model to use for generating the edit.")] = "gemini-2.5-pro-preview-05-06",
    attachments: Annotated[Optional[List[str]], Field(description="A list of attachment URLs that may be relevant for the changes.")] = None,
    additional_context: Annotated[Optional[str], Field(description="Optional additional context for the edit.")] = None
) -> dict:
    """
    Edits an existing PDF document using AI-generated search/replace blocks based on a project specification.
    
    This tool:
    - Takes a description of the changes needed (project_spec)
    - Analyzes the current PDF document's HTML content
    - Uses AI to generate appropriate search/replace blocks
    - Applies the changes to the HTML content
    - Regenerates the PDF from the updated HTML
    
    The AI analyzes the existing content and generates precise search/replace blocks that:
    - Preserve existing content unless explicitly changed
    - Make minimal necessary changes to implement the request
    - Maintain document structure and formatting
    - Keep PDF-optimized styling and layout
    - Follow document design best practices
    """
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"

    # Validate input
    if not project_spec:
        return {
            "status": "error",
            "message": "The 'project_spec' parameter is required and must describe the changes to make."
        }
    
    user_id_safe = sanitize_for_path(user_number)
    doc_name_safe = sanitize_for_path(doc_name)

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    doc_dir = os.path.join(base_dir, user_id_safe, "pdf_documents", doc_name_safe)
    current_html_path = os.path.join(doc_dir, "current.html")

    # Check if document exists
    if not await asyncio.to_thread(os.path.exists, current_html_path):
        return {
            "status": "error", 
            "message": f"PDF document '{doc_name}' not found. Use 'create_pdf_document' to create a new document.",
            "suggestion": "create_pdf_document"
        }

    try:
        # Load current HTML content
        with open(current_html_path, 'r', encoding='utf-8') as f:
            current_html = await asyncio.to_thread(f.read)

        # Load existing metadata
        metadata_path = os.path.join(doc_dir, "doc.json")
        metadata = await load_pdf_metadata(metadata_path)
        
        # --- Attachment Handling ---
        attachment_info_for_prompt = []
        attachment_parts = []
        if attachments and isinstance(attachments, list):
            for url in attachments:
                if isinstance(url, str) and url.startswith(('http://', 'https://')):
                    if url.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg')):
                        mime_type = 'image/*'
                    elif url.lower().endswith('.pdf'):
                        mime_type = 'application/pdf'
                    else:
                        mime_type = 'unknown'
                    attachment_info_for_prompt.append({"url": url, "mime_type": mime_type})
                    
                    # Download attachment for AI processing
                    attachment_part = await download_and_create_attachment_part(url)
                    if attachment_part:
                        attachment_parts.append(attachment_part)
                else:
                    print(f"Skipping invalid URL in attachments: {url}")

        # --- AI Generation of Search/Replace Blocks ---
        try:
            # Build comprehensive prompt for AI to generate search/replace blocks
            prompt_parts = []
            
            # Add the current HTML content for context
            prompt_parts.append(f"Current PDF document HTML content:\n\n```html\n{current_html}\n```")
            
            # Add the edit specification
            prompt_parts.append(f"\nEdit Request: {project_spec}")
            
            # Add attachment context if available
            if attachment_info_for_prompt:
                attachment_context = "\n\nAttachments provided:\n"
                for att in attachment_info_for_prompt:
                    attachment_context += f"- {att['url']} (type: {att['mime_type']})\n"
                prompt_parts.append(attachment_context)
            
            # Add additional context if provided
            if additional_context:
                prompt_parts.append(f"\nAdditional Context:\n{additional_context}")
            
            final_prompt = "\n".join(prompt_parts)
            
            print(f"Generating search/replace blocks for PDF document with model: {model}")
            print(f"Prompt length: {len(final_prompt)} characters")
            
            # Use ctx.sample to generate search/replace blocks
            response = await ctx.sample(
                messages=final_prompt,
                system_prompt=EDIT_WEB_APP_SYSTEM_PROMPT,  # Reuse the same edit system prompt
                model_preferences=[model]
            )
            
            # Extract search/replace blocks from response
            search_replace_output = ""
            if hasattr(response, 'text') and response.text:
                search_replace_output = response.text
            elif hasattr(response, 'content') and response.content:
                search_replace_output = response.content
            else:
                response_str = str(response)
                if 'text=' in response_str:
                    import re
                    text_match = re.search(r'text=[\'"](.*?)[\'"]', response_str, re.DOTALL)
                    if text_match:
                        search_replace_output = text_match.group(1)
                        search_replace_output = search_replace_output.replace('\\\\n', '\n').replace('\\"', '"').replace("\\'", "'")
            
            if not search_replace_output:
                return {"status": "error", "message": "Failed to generate search/replace blocks from AI response"}
            
            # Ensure filename is prepended
            if not search_replace_output.startswith("current.html"):
                search_replace_output = "current.html\n" + search_replace_output
            
            edit_description = project_spec  # Use the project spec as the edit description
            
            print(f"Generated search/replace blocks for PDF '{doc_name_safe}'. Length: {len(search_replace_output)} characters")
            
        except Exception as e:
            print(f"Error generating search/replace blocks with AI: {str(e)}")
            return {"status": "error", "message": f"Failed to generate edit instructions: {str(e)}"}
        
        # Parse and apply search/replace blocks
        parser = SearchReplaceBlockParser()
        blocks = parser.parse_blocks(search_replace_output)
        
        if not blocks:
            return {
                "status": "error",
                "message": "No valid search/replace blocks found in input."
            }
        
        # Apply changes to HTML
        modified_html = current_html
        successful_blocks = 0
        failed_blocks = 0
        failed_details = []
        
        for i, (file_path, search_text, replace_text) in enumerate(blocks):
            if not search_text.endswith('\n'):
                search_text += '\n'
            if not replace_text.endswith('\n'):
                replace_text += '\n'
            if not modified_html.endswith('\n'):
                modified_html += '\n'
            
            texts = (search_text, replace_text, modified_html)
            result = flexible_search_and_replace(texts, editblock_strategies)
            
            if result is not None:
                modified_html = result
                successful_blocks += 1
                print(f"✓ Successfully applied block {i+1}/{len(blocks)}")
            else:
                failed_blocks += 1
                failed_details.append(f"Block {i+1}: Search text not found")
                print(f"✗ Failed to apply block {i+1}/{len(blocks)}")
        
        sr_results = {
            'total_blocks': len(blocks),
            'successful': successful_blocks,
            'failed': failed_blocks,
            'failed_details': failed_details
        }
        
        if sr_results['successful'] == 0:
            return {
                "status": "error", 
                "message": f"All {sr_results['total_blocks']} search/replace blocks failed to apply.",
                "search_replace_results": sr_results
            }

        # Save new version
        existing_versions = metadata.get("versions", [])
        new_version = len(existing_versions) + 1
        
        versions_dir = os.path.join(doc_dir, "versions")
        os.makedirs(versions_dir, exist_ok=True)
        
        html_filename = f"v{new_version}.html"
        pdf_filename = f"v{new_version}.pdf"
        html_path = os.path.join(versions_dir, html_filename)
        pdf_path = os.path.join(versions_dir, pdf_filename)
        
        # Save HTML
        with open(html_path, 'w', encoding='utf-8') as f:
            await asyncio.to_thread(f.write, modified_html)
        
        # Generate new PDF
        import weasyprint
        pdf_document = await asyncio.to_thread(weasyprint.HTML, string=modified_html)
        await asyncio.to_thread(pdf_document.write_pdf, pdf_path)
        
        # Generate commit summary
        try:
            commit_summary = await generate_commit_summary(
                edit_description, modified_html, current_html, metadata.get("versions", [])
            )
        except Exception as e:
            print(f"Warning: Failed to generate commit summary: {e}")
            commit_summary = f"📄 Edited PDF document: {edit_description[:80]}..."

        # Update current symlinks
        current_html_path = os.path.join(doc_dir, "current.html")
        current_pdf_path = os.path.join(doc_dir, "current.pdf")
        
        try:
            for current_path, target_filename in [(current_html_path, html_filename), (current_pdf_path, pdf_filename)]:
                if os.path.exists(current_path) or os.path.islink(current_path):
                    os.remove(current_path)
                os.symlink(f"versions/{target_filename}", current_path)
        except Exception as e:
            print(f"Warning: Could not update symlinks: {e}")
            import shutil
            shutil.copy2(html_path, current_html_path)
            shutil.copy2(pdf_path, current_pdf_path)

        # Update metadata
        now = datetime.datetime.now().isoformat()
        if not metadata:
            metadata = {
                "doc_name": doc_name,
                "created_at": now,
                "last_updated": now,
                "description": f"Edited: {edit_description[:100]}",
                "current_version": new_version,
                "versions": []
            }
        else:
            metadata["last_updated"] = now
            metadata["current_version"] = new_version

        # Add version entry
        pdf_size = os.path.getsize(pdf_path) if os.path.exists(pdf_path) else 0
        version_entry = {
            "version": new_version,
            "timestamp": now,
            "html_file": f"versions/{html_filename}",
            "pdf_file": f"versions/{pdf_filename}",
            "user_request": edit_description,
            "commit_summary": commit_summary,
            "html_size": len(modified_html),
            "pdf_size": pdf_size,
            "line_count": len(modified_html.splitlines()),
            "edit_type": "direct_search_replace",
            "search_replace_results": sr_results
        }
        metadata["versions"].append(version_entry)

        # Save updated metadata
        try:
            await save_pdf_metadata(metadata_path, metadata)
        except Exception as e:
            return {"status": "error", "message": f"Failed to save document metadata: {str(e)}"}

        # Generate response URLs
        pdf_url = f"{DOMAIN}/user_data/{user_id_safe}/pdf_documents/{doc_name_safe}/current.pdf"
        html_url = f"{DOMAIN}/user_data/{user_id_safe}/pdf_documents/{doc_name_safe}/current.html"

        return {
            "status": "success",
            "message": f"PDF document '{doc_name}' edited successfully using {sr_results['successful']} changes. Access PDF at {pdf_url}",
            "pdf_url": pdf_url,
            "html_url": html_url,
            "doc_name": doc_name,
            "commit_summary": commit_summary,
            "search_replace_results": sr_results,
            "edit_mode": "direct_search_replace",
            "pdf_size": pdf_size
        }
        
    except Exception as e:
        return {"status": "error", "message": f"Failed to edit PDF document: {str(e)}"}

@mcp.tool()
async def list_pdf_documents(
    user_number: Annotated[str, Field(
        description="The user's unique identifier, used to locate their PDF documents."
    )] = "+17145986105",
    limit: Annotated[int, Field(
        description="Maximum number of PDF documents to return in the list.",
        ge=1 
    )] = 10
) -> dict:
    """
    Lists PDF documents previously created by the specified user.
    """
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"

    user_id_safe = sanitize_for_path(user_number)

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    docs_dir = os.path.join(base_dir, user_id_safe, "pdf_documents")

    if not await asyncio.to_thread(os.path.exists, docs_dir) or not await asyncio.to_thread(os.path.isdir, docs_dir):
        print(f"PDF documents directory not found for user {user_id_safe} at {docs_dir}. Returning empty list.")
        return {"pdf_documents": []}

    pdf_docs_list = []
    try:
        doc_names = await asyncio.to_thread(os.listdir, docs_dir)
        doc_dirs = [name for name in doc_names if os.path.isdir(os.path.join(docs_dir, name))]
        doc_dirs = sorted(doc_dirs, reverse=True)  # Sort by name

        for doc_name in doc_dirs:
            if len(pdf_docs_list) >= limit:
                break
            
            doc_dir = os.path.join(docs_dir, doc_name)
            metadata_path = os.path.join(doc_dir, "doc.json")
            
            # Load metadata for this document
            metadata = await load_pdf_metadata(metadata_path)
            
            if metadata:
                pdf_url = f"{DOMAIN}/user_data/{user_id_safe}/pdf_documents/{doc_name}/current.pdf"
                html_url = f"{DOMAIN}/user_data/{user_id_safe}/pdf_documents/{doc_name}/current.html"
                
                # Get latest version info
                latest_version = None
                if metadata.get("versions"):
                    latest_version = metadata["versions"][-1]
                
                pdf_doc_info = {
                    "doc_name": doc_name,
                    "pdf_url": pdf_url,
                    "html_url": html_url,
                    "current_version": metadata.get("current_version", 1),
                    "created_at": metadata.get("created_at"),
                    "last_updated": metadata.get("last_updated"),
                    "description": metadata.get("description", ""),
                    "total_versions": len(metadata.get("versions", []))
                }
                
                if latest_version:
                    pdf_doc_info["latest_commit_summary"] = latest_version.get("commit_summary", "")
                    pdf_doc_info["pdf_size"] = latest_version.get("pdf_size", 0)
                
                pdf_docs_list.append(pdf_doc_info)
            else:
                # Fallback for documents without metadata
                current_pdf_path = os.path.join(doc_dir, "current.pdf")
                if os.path.exists(current_pdf_path):
                    pdf_url = f"{DOMAIN}/user_data/{user_id_safe}/pdf_documents/{doc_name}/current.pdf"
                    pdf_docs_list.append({
                        "doc_name": doc_name,
                        "pdf_url": pdf_url,
                        "current_version": 1,
                        "description": "Legacy PDF document (no version history)",
                        "total_versions": 1
                    })
        
        return {"pdf_documents": pdf_docs_list}

    except Exception as e:
        print(f"Error listing PDF documents for user {user_id_safe}: {e}")
        return {"status": "error", "message": f"Failed to list PDF documents: {str(e)}"}

@mcp.tool()
async def get_pdf_versions(
    user_number: Annotated[str, Field(
        description="The user's unique identifier, used to locate their PDF documents."
    )] = "+17145986105",
    doc_name: Annotated[str, Field(
        description="The name of the PDF document to get version history for."
    )] = None,
) -> dict:
    """
    Get complete version history for a specific PDF document.
    """
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"

    user_id_safe = sanitize_for_path(user_number)
    doc_name_safe = sanitize_for_path(doc_name)

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    doc_dir = os.path.join(base_dir, user_id_safe, "pdf_documents", doc_name_safe)
    metadata_path = os.path.join(doc_dir, "doc.json")

    if not await asyncio.to_thread(os.path.exists, metadata_path):
        return {"status": "error", "message": f"PDF document '{doc_name}' not found or has no version history."}

    try:
        metadata = await load_pdf_metadata(metadata_path)
        
        return {
            "status": "success",
            "doc_name": doc_name,
            "current_version": metadata.get("current_version", 1),
            "total_versions": len(metadata.get("versions", [])),
            "created_at": metadata.get("created_at"),
            "last_updated": metadata.get("last_updated"),
            "description": metadata.get("description", ""),
            "versions": metadata.get("versions", [])
        }
        
    except Exception as e:
        return {"status": "error", "message": f"Failed to load version history: {str(e)}"}

@mcp.tool()
async def clone_web_app(
    source_app_name: Annotated[str, Field(description="The name of the source web application to clone.")],
    new_app_name: Annotated[str, Field(description="The name for the new cloned web application.")],
    user_number: Annotated[str, Field(description="The user's unique identifier, used to locate their web app data.")] = "+17145986105",
    source_version: Annotated[Optional[int], Field(description="Specific version to clone. If not provided, clones the current version.")] = None,
    description_override: Annotated[Optional[str], Field(description="Custom description for the cloned app. If not provided, generates a clone description.")] = None
) -> dict:
    """
    Clone an existing web application to create an exact copy without AI regeneration.
    
    This directly copies the HTML content from the source app, preserving exact functionality
    and styling. Much faster and more reliable than regenerating with AI.
    
    Args:
        source_app_name: Name of the app to clone from
        new_app_name: Name for the new cloned app
        user_number: User's unique identifier
        source_version: Specific version to clone (defaults to current version)
        description_override: Custom description for clone
        
    Returns:
        dict: Clone operation results with new app URL and metadata
    """
    if not user_number or user_number == "--user_number_not_needed--":
        user_number = "+17145986105"

    user_id_safe = sanitize_for_path(user_number)
    source_app_name_safe = sanitize_for_path(source_app_name)
    new_app_name_safe = sanitize_for_path(new_app_name)

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../user_data'))
    source_app_dir = os.path.join(base_dir, user_id_safe, "web_apps", source_app_name_safe)
    new_app_dir = os.path.join(base_dir, user_id_safe, "web_apps", new_app_name_safe)

    # Check if source app exists
    source_metadata_path = os.path.join(source_app_dir, "app.json")
    if not await asyncio.to_thread(os.path.exists, source_metadata_path):
        return {
            "status": "error",
            "message": f"Source web app '{source_app_name}' not found."
        }

    # Check if new app name already exists
    if await asyncio.to_thread(os.path.exists, new_app_dir):
        return {
            "status": "error",
            "message": f"App with name '{new_app_name}' already exists. Choose a different name."
        }

    try:
        # Load source app metadata
        source_metadata = await load_app_metadata(source_metadata_path)
        
        if not source_metadata:
            return {
                "status": "error",
                "message": f"Source app '{source_app_name}' has no metadata. Cannot clone."
            }

        # Determine which version to clone
        if source_version is None:
            clone_version = source_metadata.get("current_version", 1)
        else:
            clone_version = source_version
            # Validate the specified version exists
            versions = source_metadata.get("versions", [])
            if clone_version < 1 or clone_version > len(versions):
                return {
                    "status": "error",
                    "message": f"Version {clone_version} does not exist in source app. Available versions: 1-{len(versions)}."
                }

        # Get the source content
        source_versions_dir = os.path.join(source_app_dir, "versions")
        source_version_path = os.path.join(source_versions_dir, f"v{clone_version}.html")
        
        if not await asyncio.to_thread(os.path.exists, source_version_path):
            return {
                "status": "error",
                "message": f"Source version {clone_version} file not found."
            }

        # Read the source HTML content
        with open(source_version_path, 'r', encoding='utf-8') as f:
            html_content = await asyncio.to_thread(f.read)

        # Create new app directory structure
        new_versions_dir = os.path.join(new_app_dir, "versions")
        os.makedirs(new_versions_dir, exist_ok=True)

        # Save cloned content as v1 of new app
        new_version_filename = "v1.html"
        new_version_path = os.path.join(new_versions_dir, new_version_filename)
        
        with open(new_version_path, 'w', encoding='utf-8') as f:
            await asyncio.to_thread(f.write, html_content)

        # Create current.html symlink
        new_current_path = os.path.join(new_app_dir, "current.html")
        try:
            os.symlink(f"versions/{new_version_filename}", new_current_path)
        except Exception as e:
            print(f"Warning: Could not create current.html symlink: {e}")
            # Fallback: copy file instead of symlink
            import shutil
            shutil.copy2(new_version_path, new_current_path)

        # Create new app metadata
        now = datetime.datetime.now().isoformat()
        
        # Get source version info for clone description
        source_version_info = None
        for version_data in source_metadata.get("versions", []):
            if version_data.get("version") == clone_version:
                source_version_info = version_data
                break

        # Generate description
        if description_override:
            description = description_override
        elif source_version_info:
            description = f"Clone of '{source_app_name}' v{clone_version}: {source_version_info.get('commit_summary', 'No summary')}"
        else:
            description = f"Clone of '{source_app_name}' v{clone_version}"

        new_metadata = {
            "app_name": new_app_name,
            "created_at": now,
            "last_updated": now,
            "description": description,
            "current_version": 1,
            "cloned_from": {
                "source_app": source_app_name,
                "source_version": clone_version,
                "clone_timestamp": now,
                "source_commit_summary": source_version_info.get("commit_summary") if source_version_info else None
            },
            "versions": [
                {
                    "version": 1,
                    "timestamp": now,
                    "file": f"versions/{new_version_filename}",
                    "user_request": f"Clone from {source_app_name} v{clone_version}",
                    "commit_summary": f"🔄 Cloned from '{source_app_name}' v{clone_version}",
                    "size": len(html_content),
                    "edit_type": "clone"
                }
            ]
        }

        # Save new app metadata
        new_metadata_path = os.path.join(new_app_dir, "app.json")
        await save_app_metadata(new_metadata_path, new_metadata)

        # Generate serve URL
        serve_url = f"{DOMAIN}/user_data/{user_id_safe}/web_apps/{new_app_name_safe}/current.html"

        return {
            "status": "success",
            "message": f"Web app '{new_app_name}' cloned successfully from '{source_app_name}' v{clone_version}. Access it at {serve_url}",
            "url": serve_url,
            "app_name": new_app_name,
            "cloned_from": {
                "source_app": source_app_name,
                "source_version": clone_version
            },
            "clone_info": {
                "content_size": len(html_content),
                "clone_timestamp": now
            }
        }

    except Exception as e:
        # Clean up if there was an error and directories were created
        try:
            if await asyncio.to_thread(os.path.exists, new_app_dir):
                import shutil
                await asyncio.to_thread(shutil.rmtree, new_app_dir)
        except:
            pass
        
        return {
            "status": "error",
            "message": f"Failed to clone web app: {str(e)}"
        }


# --- Helper functions for versioned web app storage ---

async def fetch_tool_schemas_for_tools(mcp_tool_names: List[str]) -> str:
    """
    Fetch and format tool schemas for the specified MCP tool names.
    Returns formatted context string for system prompt.
    """
    if not mcp_tool_names:
        return ""
    
    print(f"DEBUG: mcp_tool_names provided: {mcp_tool_names}")
    tool_schemas_context = ""
    
    try:
        mcp_service_tools_url = f"http://localhost:5001/tools/all"
        print(f"DEBUG: Fetching tool schemas from {mcp_service_tools_url}")
        response = await asyncio.to_thread(requests.get, mcp_service_tools_url, timeout=10)
        response.raise_for_status()
        print(f"DEBUG: Tool schemas fetch response status: {response.status_code}")
        all_tools_data = response.json()
        print(f"DEBUG: Total tools received: {len(all_tools_data.get('tools', []))}")
        
        available_tools_details = all_tools_data.get("tools", [])
        
        if available_tools_details:
            tool_schemas_context += "\n\n# Available MCP System Tools\n"
            tool_schemas_context += "The broader system has access to the following tools. You can design the web application to leverage these capabilities by making HTTP POST requests to `/internal/call_mcp_tool` as described in the system prompt. Each tool below includes its complete input and output schemas:\n"
            
            matched_tools_count = 0
            for tool_detail in available_tools_details:
                if tool_detail.get("name") in mcp_tool_names:
                    print(f"DEBUG: Found matching tool: {tool_detail.get('name')}")
                    print(f"DEBUG: Tool has output_schema: {tool_detail.get('output_schema') is not None}")
                    if tool_detail.get('output_schema'):
                        print(f"DEBUG: Output schema keys: {list(tool_detail.get('output_schema', {}).keys())}")
                    
                    tool_schemas_context += f"\n## Tool: {tool_detail.get('name')}\n"
                    tool_schemas_context += f"   Description: {tool_detail.get('description')}\n"
                    tool_schemas_context += f"   Input Schema: {json.dumps(tool_detail.get('input_schema', {}), indent=2)}\n"
                    
                    output_schema = tool_detail.get('output_schema')
                    if output_schema:
                        tool_schemas_context += f"   Output Schema: {json.dumps(output_schema, indent=2)}\n"
                        tool_schemas_context += f"   Note: This tool returns structured data matching the output schema above.\n"
                    else:
                        tool_schemas_context += f"   Output Schema: Not defined (tool may return plain text or unstructured data)\n"
                    
                    tool_schemas_context += f"   JavaScript Usage Example:\n"
                    tool_schemas_context += f"   ```javascript\n"
                    tool_schemas_context += f"   const result = await callTool('{tool_detail.get('name')}', {{ /* arguments */ }});\n"
                    tool_schemas_context += f"   ```\n"
                    
                    matched_tools_count += 1
            
            print(f"DEBUG: Matched {matched_tools_count} tools out of {len(mcp_tool_names)} requested")
                    
    except Exception as e:
        print(f"DEBUG: Exception during tool schema fetch: {str(e)}")
        print(f"DEBUG: Exception type: {type(e).__name__}")
        tool_schemas_context += f"\n\n# Available MCP System Tools\nError fetching tool schemas: {str(e)}. Proceeding without specific tool context.\n"

    print(f"DEBUG: Tool schemas context length: {len(tool_schemas_context)} characters")
    return tool_schemas_context

def extract_mcp_tool_names_from_html(html_content: str) -> List[str]:
    """
    Extract MCP tool names that are already being used in the web app.
    This helps preserve existing tool integrations during edits.
    """
    import re
    tool_names = []
    
    # Look for callTool function calls
    call_tool_pattern = r"callTool\s*\(\s*['\"]([^'\"]+)['\"]"
    matches = re.findall(call_tool_pattern, html_content)
    tool_names.extend(matches)
    
    # Look for tool_name in fetch requests
    tool_name_pattern = r"tool_name['\"]?\s*:\s*['\"]([^'\"]+)['\"]"
    matches = re.findall(tool_name_pattern, html_content)
    tool_names.extend(matches)
    
    # Remove duplicates and return
    return list(set(tool_names))

@mcp.tool()
async def get_tool_schemas(
    tool_names: Annotated[List[str], Field(
        description="List of MCP tool names to get schemas for. Use this before writing JavaScript that calls /internal/call_mcp_tool to ensure accurate tool integration."
    )],
    user_number: Annotated[str, Field(
        description="The user's unique identifier (typically provided by the system)."
    )] = "+17145986105"
) -> dict:
    """
    Get complete input and output schemas for specified MCP tools.
    
    This tool is essential for web app development when you need to write JavaScript 
    that calls backend MCP tools via /internal/call_mcp_tool. It provides:
    
    - Complete input schema (parameter structure)
    - Complete output schema (return value structure) 
    - Tool descriptions and usage notes
    - JavaScript integration examples
    
    USAGE WORKFLOW:
    1. Call this tool first with the names of tools you plan to use
    2. Study the returned schemas carefully
    3. Write JavaScript code that matches the exact input schema
    4. Handle responses according to the output schema
    
    Returns:
        dict: Complete schema information for the requested tools including:
        - input_schema: Parameter structure for tool calls
        - output_schema: Expected return value structure  
        - description: Tool functionality description
        - javascript_example: Ready-to-use JavaScript code snippet
    """
    print(f"DEBUG: get_tool_schemas called with tools: {tool_names}")
    
    if not tool_names:
        return {
            "status": "error",
            "message": "No tool names provided. Please specify which tools you need schemas for."
        }
    
    try:
        # Fetch all available tools from the MCP service
        mcp_service_tools_url = "http://localhost:5001/tools/all"
        print(f"DEBUG: Fetching tool schemas from {mcp_service_tools_url}")
        
        response = await asyncio.to_thread(requests.get, mcp_service_tools_url, timeout=10)
        response.raise_for_status()
        
        all_tools_data = response.json()
        available_tools = all_tools_data.get("tools", [])
        
        print(f"DEBUG: Found {len(available_tools)} total tools available")
        
        # Find matching tools and build schema response
        tool_schemas = {}
        found_tools = []
        missing_tools = []
        
        for tool_name in tool_names:
            tool_found = False
            for tool_detail in available_tools:
                if tool_detail.get("name") == tool_name:
                    tool_found = True
                    found_tools.append(tool_name)
                    
                    # Build comprehensive schema information
                    input_schema = tool_detail.get("input_schema", {})
                    output_schema = tool_detail.get("output_schema")
                    description = tool_detail.get("description", "")
                    
                    # Generate JavaScript example
                    js_example = f"""// Example usage for {tool_name}
const result = await callTool('{tool_name}', {{
    // Add required parameters based on input_schema:
    // {', '.join([f"{prop}: 'value'" for prop in input_schema.get('properties', {}).keys()][:3])}
}});

// Handle result based on output_schema:
if (result.status === 'success') {{
    // Process successful result
    console.log('Tool result:', result);
}} else {{
    // Handle error
    console.error('Tool error:', result.message || result.error);
}}"""
                    
                    # Build detailed parameter info
                    param_info = {}
                    if input_schema.get("properties"):
                        for param_name, param_def in input_schema["properties"].items():
                            param_info[param_name] = {
                                "type": param_def.get("type", "unknown"),
                                "description": param_def.get("description", ""),
                                "required": param_name in input_schema.get("required", []),
                                "default": param_def.get("default"),
                                "enum": param_def.get("enum"),
                                "format": param_def.get("format")
                            }
                    
                    tool_schemas[tool_name] = {
                        "description": description,
                        "input_schema": input_schema,
                        "output_schema": output_schema,
                        "parameter_details": param_info,
                        "javascript_example": js_example,
                        "required_parameters": input_schema.get("required", []),
                        "optional_parameters": [
                            prop for prop in input_schema.get("properties", {}).keys() 
                            if prop not in input_schema.get("required", [])
                        ]
                    }
                    break
            
            if not tool_found:
                missing_tools.append(tool_name)
        
        print(f"DEBUG: Found schemas for {len(found_tools)} tools, missing {len(missing_tools)} tools")
        
        result = {
            "status": "success" if found_tools else "partial_success" if tool_schemas else "error",
            "message": f"Retrieved schemas for {len(found_tools)} tools" + (f", {len(missing_tools)} not found" if missing_tools else ""),
            "tool_schemas": tool_schemas,
            "found_tools": found_tools,
            "missing_tools": missing_tools,
            "usage_notes": {
                "javascript_integration": "Use the provided javascript_example as a starting point. Modify the parameters based on parameter_details.",
                "error_handling": "Always check result.status or result.error before processing the response",
                "parameter_types": "Ensure JavaScript values match the expected types in input_schema",
                "endpoint": "All tool calls should be made to /internal/call_mcp_tool with POST method"
            }
        }
        
        # Add general JavaScript helper if any tools were found
        if tool_schemas:
            result["general_helper_function"] = """// General MCP tool calling helper function
async function callTool(toolName, args = {}) {
    try {
        const response = await fetch('/internal/call_mcp_tool', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tool_name: toolName,
                arguments: args,
            })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        if (data.error && data.error !== "None" && data.error !== null) throw new Error(data.error);
        
        // Parse result if it's JSON, otherwise return as string
        try {
            return JSON.parse(data.result);
        } catch {
            return data.result;
        }
    } catch (error) {
        console.error(`Tool ${toolName} failed:`, error);
        throw error;
    }
}"""
        
        return result
        
    except Exception as e:
        print(f"ERROR in get_tool_schemas: {str(e)}")
        return {
            "status": "error",
            "message": f"Failed to fetch tool schemas: {str(e)}",
            "tool_schemas": {},
            "found_tools": [],
            "missing_tools": tool_names
        }

# --- Helper functions for versioned web app storage ---

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
        
