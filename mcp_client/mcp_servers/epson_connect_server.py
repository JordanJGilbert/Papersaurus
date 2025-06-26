import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from fastmcp import FastMCP
import requests
import base64
import json
import asyncio
from typing import Optional, Dict, List, Any
from datetime import datetime, timedelta
import hashlib
import uuid

# Initialize FastMCP server
mcp = FastMCP("Epson Connect Printing Server")

# === EPSON CONNECT API CONSTANTS ===
class EpsonConstants:
    # API Credentials (from your setup)
    CLIENT_ID = "xbAKo4PujZ79C1t02TAjl8SuazDD7Nyx2UT4kfty"
    CLIENT_SECRET = "0XNAes1BDOfaH4qR2IbhDDz92iIKuIOuCZxdbDo03szzWDLocnQn_T9XIFM-zhsAzabL9WgDGstGNy3wJrSLNA"
    
    # OAuth URLs
    AUTH_URL = "https://auth.epsonconnect.com/auth/authorize"
    TOKEN_URL = "https://auth.epsonconnect.com/auth/token"
    
    # API Base URLs
    API_BASE_URL = "https://api.epsonconnect.com/api/2"
    UPLOAD_BASE_URL = "https://upload.epsonconnect.com"
    
    # Your printer email
    PRINTER_EMAIL = "dah9783y5pgi46@print.epsonconnect.com"
    
    # OAuth Scopes
    SCOPES = ["device"]

# === HELPER FUNCTIONS ===

def generate_pkce_challenge():
    """Generate PKCE code verifier and challenge for OAuth"""
    code_verifier = base64.urlsafe_b64encode(os.urandom(32)).decode('utf-8').rstrip('=')
    code_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(code_verifier.encode('utf-8')).digest()
    ).decode('utf-8').rstrip('=')
    return code_verifier, code_challenge

def get_auth_headers(access_token: str) -> Dict[str, str]:
    """Get headers for authenticated API calls"""
    return {
        'Authorization': f'Bearer {access_token}',
        'x-api-key': EpsonConstants.CLIENT_ID,
        'Content-Type': 'application/json'
    }

# === OAUTH AND TOKEN MANAGEMENT ===

@mcp.tool()
async def get_authorization_url() -> dict:
    """
    Generate OAuth authorization URL for Epson Connect.
    User needs to visit this URL to authorize the application.
    
    Returns:
        dict: Contains authorization URL and state for OAuth flow
    """
    try:
        # Generate PKCE parameters
        code_verifier, code_challenge = generate_pkce_challenge()
        state = str(uuid.uuid4())
        
        # Build authorization URL
        auth_params = {
            'response_type': 'code',
            'client_id': EpsonConstants.CLIENT_ID,
            'redirect_uri': 'urn:ietf:wg:oauth:2.0:oob',  # For desktop/CLI apps
            'scope': ' '.join(EpsonConstants.SCOPES),
            'state': state,
            'code_challenge': code_challenge,
            'code_challenge_method': 'S256'
        }
        
        auth_url = f"{EpsonConstants.AUTH_URL}?" + "&".join([f"{k}={v}" for k, v in auth_params.items()])
        
        return {
            "status": "success",
            "authorization_url": auth_url,
            "state": state,
            "code_verifier": code_verifier,
            "message": "Visit the authorization URL to get the authorization code, then use exchange_authorization_code tool"
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to generate authorization URL: {str(e)}"
        }

@mcp.tool()
async def exchange_authorization_code(
    authorization_code: str,
    code_verifier: str,
    state: str = None
) -> dict:
    """
    Exchange authorization code for access token.
    
    Args:
        authorization_code: The code received from the authorization URL
        code_verifier: The PKCE code verifier from get_authorization_url
        state: The state parameter for verification (optional)
    
    Returns:
        dict: Contains access token, refresh token, and expiry information
    """
    try:
        token_data = {
            'grant_type': 'authorization_code',
            'client_id': EpsonConstants.CLIENT_ID,
            'client_secret': EpsonConstants.CLIENT_SECRET,
            'code': authorization_code,
            'redirect_uri': 'urn:ietf:wg:oauth:2.0:oob',
            'code_verifier': code_verifier
        }
        
        response = await asyncio.to_thread(
            requests.post,
            EpsonConstants.TOKEN_URL,
            data=token_data,
            headers={'Content-Type': 'application/x-www-form-urlencoded'}
        )
        
        if response.status_code == 200:
            token_info = response.json()
            return {
                "status": "success",
                "access_token": token_info.get('access_token'),
                "refresh_token": token_info.get('refresh_token'),
                "expires_in": token_info.get('expires_in'),
                "token_type": token_info.get('token_type'),
                "scope": token_info.get('scope'),
                "message": "Successfully obtained access token"
            }
        else:
            return {
                "status": "error",
                "message": f"Token exchange failed: {response.status_code} - {response.text}"
            }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to exchange authorization code: {str(e)}"
        }

@mcp.tool()
async def get_device_info(access_token: str) -> dict:
    """
    Get information about the connected Epson printer.
    
    Args:
        access_token: Valid access token for the device
    
    Returns:
        dict: Device information including product name, serial number, and connection status
    """
    try:
        headers = get_auth_headers(access_token)
        
        response = await asyncio.to_thread(
            requests.get,
            f"{EpsonConstants.API_BASE_URL}/printing/devices/info",
            headers=headers
        )
        
        if response.status_code == 200:
            device_info = response.json()
            return {
                "status": "success",
                "device_info": device_info,
                "message": "Successfully retrieved device information"
            }
        else:
            return {
                "status": "error",
                "message": f"Failed to get device info: {response.status_code} - {response.text}"
            }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to get device info: {str(e)}"
        }

@mcp.tool()
async def get_setup_instructions() -> dict:
    """
    Get step-by-step setup instructions for using Epson Connect API.
    
    Returns:
        dict: Complete setup guide
    """
    instructions = {
        "status": "success",
        "setup_steps": [
            {
                "step": 1,
                "title": "Get Authorization URL",
                "description": "Call get_authorization_url() to get the OAuth URL",
                "action": "Run: get_authorization_url()"
            },
            {
                "step": 2,
                "title": "Visit Authorization URL",
                "description": "Open the authorization URL in your browser and authorize the application",
                "action": "Copy the authorization_url from step 1 and open in browser"
            },
            {
                "step": 3,
                "title": "Get Authorization Code",
                "description": "Copy the authorization code from the browser",
                "action": "Look for the code parameter in the final URL or page"
            },
            {
                "step": 4,
                "title": "Exchange for Access Token",
                "description": "Use the authorization code to get access token",
                "action": "Run: exchange_authorization_code(code, code_verifier)"
            },
            {
                "step": 5,
                "title": "Test Connection",
                "description": "Verify connection with your printer",
                "action": "Run: get_device_info(access_token)"
            }
        ],
        "credentials": {
            "client_id": EpsonConstants.CLIENT_ID,
            "printer_email": EpsonConstants.PRINTER_EMAIL,
            "note": "Client secret is configured in the server"
        },
        "supported_file_types": [
            "PDF (.pdf)",
            "JPEG (.jpg, .jpeg)",
            "PNG (.png)",
            "Microsoft Word (.doc, .docx)",
            "Microsoft Excel (.xls, .xlsx)",
            "Microsoft PowerPoint (.ppt, .pptx)",
            "Plain Text (.txt)"
        ]
    }
    
    return instructions

print("Epson Connect MCP Server ready - OAuth flow and basic printing supported")

if __name__ == "__main__":
    # Check if we should use HTTP transport
    transport = os.getenv("FASTMCP_TRANSPORT", "stdio")
    
    if transport == "streamable-http":
        host = os.getenv("FASTMCP_HOST", "127.0.0.1")
        port = int(os.getenv("FASTMCP_PORT", "9001"))
        print(f"Starting Epson Connect server with streamable-http transport on {host}:{port}")
        mcp.run(transport="streamable-http", host=host, port=port)
    else:
        print("Starting Epson Connect server with stdio transport")
        mcp.run() 