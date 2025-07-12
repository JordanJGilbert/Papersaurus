#!/usr/bin/env python3
import requests
import json

# Test image analysis with the fixed attachment handling
def test_image_analysis():
    url = "http://localhost:5001/internal/call_mcp_tool"
    
    # Use a test image URL that exists
    test_image_url = "https://vibecarding.com/serve_image?key=attachment_f4523927-23b6-4bbc-827d-7002edc8266b&type=image/png"
    
    payload = {
        "tool_name": "ai_chat",
        "arguments": {
            "messages": "Analyze this image and describe what you see in detail. Who is in the image? What are they wearing? What's the setting?",
            "system_prompt": "You are analyzing an image. Be specific and detailed.",
            "model": "gemini-2.5-pro",
            "attachments": [test_image_url],
            "user_number": "17145986105"
        }
    }
    
    headers = {
        "Content-Type": "application/json",
        "X-Internal-API-Key": "sk-test-internal-mcp-key"
    }
    
    try:
        print("Sending request to analyze image...")
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        
        result = response.json()
        print("\nResponse:")
        print(json.dumps(result, indent=2))
        
        if result.get("status") == "success":
            print("\n✅ SUCCESS: Image was analyzed!")
            print("\nAnalysis:", result.get("response", "No response"))
        else:
            print("\n❌ ERROR:", result.get("message", "Unknown error"))
            
    except Exception as e:
        print(f"\n❌ Error: {e}")

if __name__ == "__main__":
    test_image_analysis()