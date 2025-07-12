#!/usr/bin/env python3
"""
Test script to verify the API flow for card generation
"""

import requests
import json
import time
import uuid
from datetime import datetime

BASE_URL = "http://localhost:5000"

def test_draft_generation():
    """Test the draft card generation API"""
    print("\n=== Testing Draft Generation ===")
    
    job_id = str(uuid.uuid4())
    
    # Prepare request data
    data = {
        "jobId": job_id,
        "cardType": "birthday",
        "tone": "funny",
        "userEmail": "test@example.com",
        "message": "Happy Birthday! Hope your day is amazing!",
        "toField": "John",
        "fromField": "Jane",
        "prompt": "A fun birthday card with balloons and cake",
        "config": {
            "modelVersion": "gpt-image-1",
            "aspectRatio": "9:16",
            "dimensions": "1024x1536",
            "numberOfDrafts": 5
        }
    }
    
    print(f"Job ID: {job_id}")
    print(f"Request data: {json.dumps(data, indent=2)}")
    
    try:
        # Make request
        response = requests.post(f"{BASE_URL}/api/generate-draft-cards-async", json=data)
        print(f"\nResponse status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            print("✅ Draft generation started successfully")
            return job_id
        else:
            print("❌ Draft generation failed")
            return None
            
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return None

def test_final_generation():
    """Test the final card generation API"""
    print("\n=== Testing Final Card Generation ===")
    
    job_id = str(uuid.uuid4())
    
    # Prepare request data with all required prompts
    data = {
        "jobId": job_id,
        "prompts": {
            "frontCover": "A vibrant birthday card featuring colorful balloons floating against a sunny sky, with 'Happy Birthday John!' in festive lettering",
            "backCover": "Simple elegant design with small birthday cake icon and 'Made with love' text",
            "leftInterior": "Decorative border with party streamers and confetti",
            "rightInterior": "Happy Birthday! Hope your day is amazing! - Jane"
        },
        "config": {
            "userNumber": "+17145986105",
            "modelVersion": "gpt-image-1",
            "aspectRatio": "9:16",
            "quality": "high",
            "outputFormat": "jpeg",
            "outputCompression": 100,
            "dimensions": "1024x1536",
            "isFrontBackOnly": False,
            "userEmail": "test@example.com",
            "cardType": "birthday",
            "toField": "John",
            "fromField": "Jane",
            "isDraftMode": False
        }
    }
    
    print(f"Job ID: {job_id}")
    print(f"Request data: {json.dumps(data, indent=2)}")
    
    try:
        # Make request
        response = requests.post(f"{BASE_URL}/api/generate-card-async", json=data)
        print(f"\nResponse status: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            print("✅ Final card generation started successfully")
            return job_id
        else:
            print("❌ Final card generation failed")
            return None
            
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return None

def check_job_status(job_id):
    """Check the status of a job"""
    print(f"\n=== Checking Job Status: {job_id} ===")
    
    try:
        response = requests.get(f"{BASE_URL}/api/job-status/{job_id}")
        print(f"Response status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Job status: {data.get('status')}")
            print(f"Progress: {data.get('progress', 'N/A')}")
            print(f"Message: {data.get('message', 'N/A')}")
            return data
        else:
            print("❌ Failed to get job status")
            return None
            
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return None

def test_websocket_connection():
    """Test WebSocket connection"""
    print("\n=== Testing WebSocket Connection ===")
    
    try:
        import socketio
        
        sio = socketio.Client()
        connected = False
        
        @sio.event
        def connect():
            nonlocal connected
            connected = True
            print("✅ WebSocket connected")
        
        @sio.event
        def disconnect():
            print("WebSocket disconnected")
        
        @sio.event
        def job_update(data):
            print(f"Job update received: {json.dumps(data, indent=2)}")
        
        # Try to connect
        sio.connect(BASE_URL)
        time.sleep(1)
        
        if connected:
            print("✅ WebSocket connection successful")
            sio.disconnect()
        else:
            print("❌ WebSocket connection failed")
            
    except ImportError:
        print("⚠️  python-socketio not installed. Run: pip install python-socketio")
    except Exception as e:
        print(f"❌ Error: {str(e)}")

def main():
    """Run all tests"""
    print("VibeCarding API Test Suite")
    print("=" * 50)
    print(f"Testing against: {BASE_URL}")
    print(f"Time: {datetime.now()}")
    
    # Test WebSocket
    test_websocket_connection()
    
    # Test draft generation
    draft_job_id = test_draft_generation()
    if draft_job_id:
        time.sleep(2)
        check_job_status(draft_job_id)
    
    # Test final generation
    final_job_id = test_final_generation()
    if final_job_id:
        time.sleep(2)
        check_job_status(final_job_id)
    
    print("\n" + "=" * 50)
    print("Test suite completed")

if __name__ == "__main__":
    main()