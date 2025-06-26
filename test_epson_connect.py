#!/usr/bin/env python3
"""
Simple test script for Epson Connect API functionality
Run this to test the OAuth flow and basic API calls
"""

import requests
import base64
import hashlib
import uuid
import os
import json
from urllib.parse import urlencode

# === EPSON CONNECT API CONSTANTS ===
class EpsonConstants:
    # API Credentials (from your setup)
    CLIENT_ID = "56686329726c4e079b93fd9c4250f7f5"
    CLIENT_SECRET = "0XNAes1BDOfaH4qR2IbhDDz92iIKuIOuCZxdbDo03szzWDLocnQn_T9XIFM-zhsAzabL9WgDGstGNy3wJrSLNA"
    API_KEY = "xbAKo4PujZ79C1t02TAjl8SuazDD7Nyx2UT4kfty"
    #https://auth.epsonconnect.com/auth/authorize?scope=device&client_id=56686329726c4e079b93fd9c4250f7f5&redirect_uri=https%3A%2F%2Fdocs.epsonconnect.com%2Fen%2Foauth-receiver.html&response_type=code&state=jdgbcb3randomj3hbdgy&nonce=kl2tz7frandomd7hx3s4&code_challenge=4FatVDBJKPAo4JgLLaaQFMUcQPn5CrPRvLlaob9PTYc&code_challenge_method=S256&show_dialog=true
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

def generate_pkce_challenge():
    """Generate PKCE code verifier and challenge for OAuth"""
    code_verifier = base64.urlsafe_b64encode(os.urandom(32)).decode('utf-8').rstrip('=')
    code_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(code_verifier.encode('utf-8')).digest()
    ).decode('utf-8').rstrip('=')
    return code_verifier, code_challenge

def get_auth_headers(access_token: str) -> dict:
    """Get headers for authenticated API calls"""
    return {
        'Authorization': f'Bearer {access_token}',
        'x-api-key': EpsonConstants.API_KEY,
        'Content-Type': 'application/json'
    }

def step1_get_authorization_url():
    """Step 1: Generate OAuth authorization URL"""
    print("=== STEP 1: Getting Authorization URL ===")
    
    # Generate PKCE parameters
    code_verifier, code_challenge = generate_pkce_challenge()
    state = str(uuid.uuid4())
    
    # Build authorization URL - using the same format as your working example
    auth_params = {
        'scope': 'device',
        'client_id': EpsonConstants.CLIENT_ID,
        'redirect_uri': 'https://docs.epsonconnect.com/en/oauth-receiver.html',
        'response_type': 'code',
        'state': state,
        'nonce': str(uuid.uuid4())[:16],  # Add nonce like in your example
        'code_challenge': code_challenge,
        'code_challenge_method': 'S256',
        'show_dialog': 'true'
    }
    
    auth_url = f"{EpsonConstants.AUTH_URL}?" + urlencode(auth_params)
    
    print(f"✅ Authorization URL generated!")
    print(f"🔗 URL: {auth_url}")
    print(f"📝 State: {state}")
    print(f"🔑 Code Verifier: {code_verifier}")
    print()
    print("📋 INSTRUCTIONS:")
    print("1. Copy the URL above and open it in your browser")
    print("2. Authorize the application")
    print("3. Copy the authorization code from the browser")
    print("4. Run step2_exchange_code() with the code and code_verifier")
    print()
    
    return {
        "authorization_url": auth_url,
        "state": state,
        "code_verifier": code_verifier
    }

def step2_exchange_code(authorization_code: str, code_verifier: str):
    """Step 2: Exchange authorization code for access token"""
    print("=== STEP 2: Exchanging Authorization Code ===")
    
    token_data = {
        'grant_type': 'authorization_code',
        'code': authorization_code,
        'redirect_uri': 'https://docs.epsonconnect.com/en/oauth-receiver.html',
        'code_verifier': code_verifier
    }
    
    # Use Basic Auth for client credentials
    import base64
    auth_string = f"{EpsonConstants.CLIENT_ID}:{EpsonConstants.CLIENT_SECRET}"
    auth_bytes = auth_string.encode('ascii')
    auth_b64 = base64.b64encode(auth_bytes).decode('ascii')
    
    try:
        response = requests.post(
            EpsonConstants.TOKEN_URL,
            data=token_data,
            headers={
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': f'Basic {auth_b64}'
            }
        )
        
        print(f"📡 Token request status: {response.status_code}")
        
        if response.status_code == 200:
            token_info = response.json()
            print("✅ Token exchange successful!")
            print(f"🎫 Access Token: {token_info.get('access_token', 'N/A')[:50]}...")
            print(f"🔄 Refresh Token: {token_info.get('refresh_token', 'N/A')[:50]}...")
            print(f"⏰ Expires In: {token_info.get('expires_in', 'N/A')} seconds")
            print(f"🏷️ Token Type: {token_info.get('token_type', 'N/A')}")
            print(f"🎯 Scope: {token_info.get('scope', 'N/A')}")
            print()
            print("💾 Save this access token for the next steps!")
            return token_info
        else:
            print(f"❌ Token exchange failed!")
            print(f"📄 Response: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Error during token exchange: {e}")
        return None

def step3_test_device_info(access_token: str):
    """Step 3: Test device connection"""
    print("=== STEP 3: Testing Device Connection ===")
    
    try:
        headers = get_auth_headers(access_token)
        
        response = requests.get(
            f"{EpsonConstants.API_BASE_URL}/printing/devices/info",
            headers=headers
        )
        
        print(f"📡 Device info request status: {response.status_code}")
        
        if response.status_code == 200:
            device_info = response.json()
            print("✅ Device connection successful!")
            print(f"🖨️ Product Name: {device_info.get('productName', 'N/A')}")
            print(f"🔢 Serial Number: {device_info.get('serialNumber', 'N/A')}")
            print(f"🔗 Connected: {device_info.get('connected', 'N/A')}")
            print()
            return device_info
        else:
            print(f"❌ Device connection failed!")
            print(f"📄 Response: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Error during device info request: {e}")
        return None

def step4_get_capabilities(access_token: str, print_mode: str = "document"):
    """Step 4: Get printing capabilities with detailed duplex info"""
    print(f"=== STEP 4: Getting Print Capabilities ({print_mode}) ===")
    
    try:
        headers = get_auth_headers(access_token)
        
        response = requests.get(
            f"{EpsonConstants.API_BASE_URL}/printing/capability/{print_mode}",
            headers=headers
        )
        
        print(f"📡 Capabilities request status: {response.status_code}")
        
        if response.status_code == 200:
            capabilities = response.json()
            print("✅ Capabilities retrieved successfully!")
            
            # Print raw JSON for debugging
            print(f"📄 RAW CAPABILITIES JSON:")
            print(json.dumps(capabilities, indent=2))
            print()
            
            # Print color modes
            color_modes = capabilities.get('colorModes', [])
            print(f"🎨 Color Modes: {', '.join(color_modes)}")
            
            # Print resolutions
            resolutions = capabilities.get('resolutions', [])
            print(f"📐 Resolutions: {', '.join(map(str, resolutions))}")
            
            # Check for duplex capabilities
            duplex_modes = capabilities.get('duplexModes', [])
            if duplex_modes:
                print(f"🔄 Duplex Modes: {', '.join(duplex_modes)}")
            else:
                print("❌ No duplex modes found in capabilities")
            
            # Check for 2-sided options
            two_sided = capabilities.get('2_sided', [])
            if two_sided:
                print(f"📑 2-Sided Options: {', '.join(two_sided)}")
            
            # Print paper sizes
            paper_sizes = capabilities.get('paperSizes', [])
            if paper_sizes:
                print(f"📄 Available Paper Sizes:")
                for paper in paper_sizes:
                    size = paper.get('paperSize', 'Unknown')
                    types = [pt.get('paperType', 'Unknown') for pt in paper.get('paperTypes', [])]
                    print(f"   • {size}: {', '.join(types)}")
            
            print()
            return capabilities
        else:
            print(f"❌ Capabilities request failed!")
            print(f"📄 Response: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Error during capabilities request: {e}")
        return None

def step5_upload_file_to_job(upload_uri: str, file_path: str, file_extension: str = "txt"):
    """Step 5a: Upload a file to the print job"""
    print(f"=== STEP 5a: Uploading File '{file_path}' ===")
    
    try:
        if not os.path.exists(file_path):
            print(f"❌ File not found: {file_path}")
            return None
        
        # Build upload URL with file extension
        if "?" in upload_uri:
            upload_url = f"{upload_uri}&File=1.{file_extension}"
        else:
            upload_url = f"{upload_uri}?File=1.{file_extension}"
        
        # Read file data
        with open(file_path, 'rb') as f:
            file_data = f.read()
        
        print(f"📁 File size: {len(file_data)} bytes")
        print(f"📤 Upload URL: {upload_url}")
        
        # Upload file
        response = requests.post(
            upload_url,
            data=file_data,
            headers={'Content-Type': 'application/octet-stream'}
        )
        
        print(f"📡 File upload status: {response.status_code}")
        
        if response.status_code == 200:
            print("✅ File uploaded successfully!")
            return True
        else:
            print(f"❌ File upload failed!")
            print(f"📄 Response: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Error during file upload: {e}")
        return None

def step5b_start_print_job(access_token: str, job_id: str):
    """Step 5b: Start the print job"""
    print(f"=== STEP 5b: Starting Print Job '{job_id}' ===")
    
    try:
        headers = get_auth_headers(access_token)
        
        response = requests.post(
            f"{EpsonConstants.API_BASE_URL}/printing/jobs/{job_id}/print",
            headers=headers
        )
        
        print(f"📡 Print start status: {response.status_code}")
        
        if response.status_code == 202:
            print("✅ Print job started successfully!")
            print("🖨️ Your printer should start printing now!")
            return True
        else:
            print(f"❌ Failed to start print job!")
            print(f"📄 Response: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Error starting print job: {e}")
        return None

def step5c_check_print_status(access_token: str, job_id: str):
    """Step 5c: Check print job status"""
    print(f"=== STEP 5c: Checking Print Job Status ===")
    
    try:
        headers = get_auth_headers(access_token)
        
        response = requests.get(
            f"{EpsonConstants.API_BASE_URL}/printing/jobs/{job_id}",
            headers=headers
        )
        
        print(f"📡 Status check response: {response.status_code}")
        
        if response.status_code == 200:
            status_info = response.json()
            print("✅ Status retrieved successfully!")
            print(f"📊 Status: {status_info.get('status', 'Unknown')}")
            print(f"📝 Job Name: {status_info.get('jobName', 'Unknown')}")
            print(f"📄 Total Pages: {status_info.get('totalPages', 'Unknown')}")
            print(f"🕐 Start Date: {status_info.get('startDate', 'Not started')}")
            print(f"🕑 Update Date: {status_info.get('updateDate', 'Unknown')}")
            return status_info
        else:
            print(f"❌ Failed to get status!")
            print(f"📄 Response: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Error checking status: {e}")
        return None

def step5_create_duplex_print_job(access_token: str, job_name: str = "Duplex Test Job", duplex_mode: str = "long_edge"):
    """Step 5: Create a duplex print job using EXACT working structure"""
    print(f"=== STEP 5: Creating Duplex Print Job '{job_name}' ===")
    
    try:
        headers = get_auth_headers(access_token)
        
        # EXACT COPY of working simple job structure
        job_data = {
            "jobName": job_name,
            "printMode": "document",
            "printSettings": {
                "paperSize": "ps_letter",  # US Letter 8.5 x 11 inches
                "paperType": "pt_plainpaper",
                "borderless": False,
                "printQuality": "normal",
                "paperSource": "rear",  # Force rear tray for Letter paper
                "colorMode": "color",
                "doubleSided": duplex_mode,  # Use the mode directly: "none", "long_edge", "short_edge"
                "reverseOrder": False,
                "copies": 1,
                "collate": True
            }
        }
        
        print(f"🔄 Duplex Mode: {duplex_mode}")
        print(f"📋 Print Settings: {json.dumps(job_data['printSettings'], indent=2)}")
        
        response = requests.post(
            f"{EpsonConstants.API_BASE_URL}/printing/jobs",
            headers=headers,
            json=job_data
        )
        
        print(f"📡 Duplex print job creation status: {response.status_code}")
        
        if response.status_code == 201:
            job_info = response.json()
            print("✅ Duplex print job created successfully!")
            print(f"🆔 Job ID: {job_info.get('jobId')}")
            print(f"📤 Upload URI: {job_info.get('uploadUri')}")
            print(f"🔄 Duplex Setting: {duplex_mode}")
            print()
            print("📋 Next steps:")
            print("1. Upload a multi-page file using the upload URI")
            print("2. Start the duplex print job")
            return job_info
        else:
            print(f"❌ Failed to create duplex print job!")
            print(f"📄 Response: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Error creating duplex print job: {e}")
        return None

def step5_create_simple_print_job(access_token: str, job_name: str = "Test Print Job"):
    """Step 5: Create a simple print job"""
    print(f"=== STEP 5: Creating Print Job '{job_name}' ===")
    
    try:
        headers = get_auth_headers(access_token)
        
        job_data = {
            "jobName": job_name,
            "printMode": "document",
            "printSettings": {
                "paperSize": "ps_a4",
                "paperType": "pt_plainpaper",
                "borderless": False,
                "printQuality": "normal",
                "paperSource": "auto",
                "colorMode": "color",
                "doubleSided": "none",
                "reverseOrder": False,
                "copies": 1,
                "collate": True
            }
        }
        
        response = requests.post(
            f"{EpsonConstants.API_BASE_URL}/printing/jobs",
            headers=headers,
            json=job_data
        )
        
        print(f"📡 Print job creation status: {response.status_code}")
        
        if response.status_code == 201:
            job_info = response.json()
            print("✅ Print job created successfully!")
            print(f"🆔 Job ID: {job_info.get('jobId', 'N/A')}")
            print(f"📤 Upload URI: {job_info.get('uploadUri', 'N/A')}")
            print()
            print("📋 Next steps:")
            print("1. Upload a file using the upload URI")
            print("2. Start the print job")
            return job_info
        else:
            print(f"❌ Print job creation failed!")
            print(f"📄 Response: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Error during print job creation: {e}")
        return None

def complete_duplex_test(access_token: str, file_path: str, job_name: str = "Duplex Print Test", duplex_mode: str = "long_edge"):
    """Complete duplex printing workflow: Create duplex job -> Upload file -> Start printing -> Check status"""
    print("=" * 60)
    print("🔄 COMPLETE DUPLEX PRINT TEST WORKFLOW")
    print("=" * 60)
    
    # Step 1: Create duplex print job
    job_info = step5_create_duplex_print_job(access_token, job_name, duplex_mode)
    if not job_info:
        return None
    
    job_id = job_info.get('jobId')
    upload_uri = job_info.get('uploadUri')
    
    # Step 2: Upload file
    file_ext = os.path.splitext(file_path)[1].lower().lstrip('.')
    if not file_ext:
        file_ext = "pdf"
    
    upload_success = step5_upload_file_to_job(upload_uri, file_path, file_ext)
    if not upload_success:
        return None
    
    # Step 3: Start printing
    print_success = step5b_start_print_job(access_token, job_id)
    if not print_success:
        return None
    
    # Step 4: Check initial status
    import time
    print("⏱️ Waiting 3 seconds before checking status...")
    time.sleep(3)
    status_info = step5c_check_print_status(access_token, job_id)
    
    print()
    print("🎉 DUPLEX PRINT TEST COMPLETED!")
    print(f"🔄 Duplex Mode: {duplex_mode}")
    print(f"📄 Check your printer for the duplex document: '{job_name}'")
    print("📋 Expected Result: 4 pages printed on 2 sheets (front and back)")
    
    return {
        'job_id': job_id,
        'status': status_info,
        'duplex_mode': duplex_mode
    }

def complete_print_test(access_token: str, file_path: str, job_name: str = "Complete Print Test"):
    """Complete printing workflow: Create job -> Upload file -> Start printing -> Check status"""
    print("=" * 60)
    print("🖨️ COMPLETE PRINT TEST WORKFLOW")
    print("=" * 60)
    
    # Step 1: Create print job
    job_info = step5_create_simple_print_job(access_token, job_name)
    if not job_info:
        return None
    
    job_id = job_info.get('jobId')
    upload_uri = job_info.get('uploadUri')
    
    # Step 2: Upload file
    file_ext = os.path.splitext(file_path)[1].lower().lstrip('.')
    if not file_ext:
        file_ext = "txt"
    
    upload_success = step5_upload_file_to_job(upload_uri, file_path, file_ext)
    if not upload_success:
        return None
    
    # Step 3: Start printing
    print_success = step5b_start_print_job(access_token, job_id)
    if not print_success:
        return None
    
    # Step 4: Check initial status
    import time
    print("⏱️ Waiting 2 seconds before checking status...")
    time.sleep(2)
    status_info = step5c_check_print_status(access_token, job_id)
    
    print()
    print("🎉 PRINT TEST COMPLETED!")
    print(f"📄 Check your printer for the printed document: '{job_name}'")
    
    return {
        'job_id': job_id,
        'status': status_info
    }

def show_setup_guide():
    """Show the complete setup guide"""
    print("=" * 60)
    print("🖨️  EPSON CONNECT API TEST SCRIPT")
    print("=" * 60)
    print()
    print("📋 Your Configured Settings:")
    print(f"   Client ID: {EpsonConstants.CLIENT_ID}")
    print(f"   Printer Email: {EpsonConstants.PRINTER_EMAIL}")
    print()
    print("🚀 Quick Start Guide:")
    print("1. Run: step1_get_authorization_url()")
    print("2. Visit the URL in your browser and authorize")
    print("3. Copy the authorization code")
    print("4. Run: step2_exchange_code(code, code_verifier)")
    print("5. Copy the access token")
    print("6. Run: step3_test_device_info(access_token)")
    print("7. Run: step4_get_capabilities(access_token)")
    print("8. Run: step5_create_simple_print_job(access_token)")
    print()
    print("💡 Example Usage:")
    print("   auth_data = step1_get_authorization_url()")
    print("   # Visit URL, get code")
    print("   token_data = step2_exchange_code('your_code', auth_data['code_verifier'])")
    print("   device_info = step3_test_device_info(token_data['access_token'])")
    print()

if __name__ == "__main__":
    show_setup_guide()
    
    # Interactive mode
    print("🎮 Interactive Mode:")
    print("You can now call the functions manually, or uncomment the lines below for auto-run")
    print()
    
    # Uncomment these lines to run automatically:
    # print("🤖 Starting automatic flow...")
    # auth_data = step1_get_authorization_url()
    # print("⏸️  Pausing here - you need to visit the URL and get the authorization code")
    # print("💡 After getting the code, run:")
    # print(f"   step2_exchange_code('YOUR_CODE', '{auth_data['code_verifier']}')") 