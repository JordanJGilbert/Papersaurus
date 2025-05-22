# Combined MCP Server

This is a unified MCP (Model Context Protocol) server that combines multiple specialized services into a single, resource-efficient server process.

## Features

- **Image Generation** - Generate images using Google's Imagen model
- **Image Analysis** - Analyze images with bounding boxes and segmentation masks
- **PDF Creation** - Create PDF documents from text prompts
- **Web Search** - Search the web for up-to-date information
- **News Search** - Search for news articles
- **Video Search** - Search for YouTube videos
- **Web App Generation** - (Placeholder) Generate web applications

## Architecture

This implementation follows a modular approach:

1. **Central Server (`main_mcp_server.py`)** - Main entry point that initializes shared resources and API clients
2. **Feature Modules** - Specialized modules for each feature area:
   - `image_gen_module.py` - Image generation tools
   - `image_analysis_module.py` - Image analysis tools
   - `pdf_module.py` - PDF creation tools
   - `search_module.py` - Web, news, and video search tools
   - `web_app_module.py` - Web app generation tools (placeholder)

## Getting Started

### Prerequisites

- Python 3.9+
- MCP Python SDK: `pip install "mcp[cli]"`
- Required environment variables in `.env` file:
  - `GEMINI_API_KEY` - Google Gemini API key
  - `GEMINI_API_KEY_2` - Backup Google Gemini API key (optional)
  - `ANTHROPIC_API_KEY` - Anthropic API key for Claude
  - `BRAVE_API_KEY` - Brave Search API key

### Running the Server

To run the server directly:

```bash
python -m mcp_client.main_mcp_server
```

Or using the MCP CLI:

```bash
mcp run mcp_client.main_mcp_server
```

For development and testing:

```bash
mcp dev mcp_client.main_mcp_server
```

To install in Claude Desktop:

```bash
mcp install mcp_client.main_mcp_server
```

## Benefits of This Approach

- **Resource Efficiency** - Single process and event loop instead of multiple servers
- **Simplified Management** - One server to deploy and maintain
- **Shared Resources** - API clients and other resources initialized once and shared
- **Standardization** - Built on the official MCP SDK for robust protocol handling
- **Modularity** - Logic still organized into specialized modules for maintainability
