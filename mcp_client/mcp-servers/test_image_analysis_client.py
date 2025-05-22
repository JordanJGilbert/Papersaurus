import requests
import json
import os
from dotenv import load_dotenv

# Load .env file from the project root (assuming this script is run from a subdirectory)
# Adjust the path to .env if necessary, e.g., load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))

# URL of your MCP service's /analyze_images endpoint
# Make sure your mcp_service.py is running and accessible at this address.
BASE_DOMAIN = os.getenv("DOMAIN")
SERVER_URL = f"{BASE_DOMAIN}/analyze_images"

# Updated sample data: Three dog images
# These URLs should also ideally be constructed dynamically if they depend on the DOMAIN
IMAGE_URLS = [
    f"{BASE_DOMAIN}/user_data/17145986105/images/img_b22c847a.png",
    f"{BASE_DOMAIN}/user_data/17145986105/images/img_e09c1fa0.png",
    f"{BASE_DOMAIN}/user_data/17145986105/images/img_5920a2f6.png"
]
ANALYSIS_PROMPT = "describe in 3 words"

def test_analyze_images():
    payload = {
        "urls": IMAGE_URLS,
        "analysis_prompt": ANALYSIS_PROMPT
    }

    print(f"Sending request to: {SERVER_URL}")
    print(f"Payload: {json.dumps(payload, indent=2)}")

    try:
        response = requests.post(SERVER_URL, json=payload, timeout=60) # Increased timeout for potentially long analysis

        print(f"\nResponse Status Code: {response.status_code}")

        if response.status_code == 200:
            try:
                response_data = response.json()
                print("Response JSON:")
                print(json.dumps(response_data, indent=2))

                if response_data.get("status") == "success":
                    print("\n--- Test Result: SUCCESS ---")
                    for result in response_data.get("results", []):
                        if result.get("status") == "success":
                            print(f"  Analysis for {result.get('url')}: {result.get('analysis')[:100]}...") # Print first 100 chars
                        else:
                            print(f"  Error analyzing {result.get('url')}: {result.get('message')}")
                elif response_data.get("status") == "partial_error":
                    print("\n--- Test Result: PARTIAL ERROR ---")
                    print(f"Overall message: {response_data.get('message')}")
                    for result in response_data.get("results", []):
                        if result.get("status") == "success":
                            print(f"  Analysis for {result.get('url')}: {result.get('analysis')[:100]}...")
                        else:
                            print(f"  Error analyzing {result.get('url')}: {result.get('message')}")
                else:
                    print("\n--- Test Result: FAILED (Server reported error) ---")
                    print(f"  Server message: {response_data.get('message')}")

            except json.JSONDecodeError:
                print("\n--- Test Result: FAILED (Could not decode JSON response) ---")
                print("Raw Response Text:")
                print(response.text)
        else:
            print("\n--- Test Result: FAILED (HTTP Error) ---")
            try:
                # Try to print JSON error from server if available
                error_data = response.json()
                print("Error Response JSON:")
                print(json.dumps(error_data, indent=2))
            except json.JSONDecodeError:
                print("Raw Error Response Text:")
                print(response.text)

    except requests.exceptions.ConnectionError as e:
        print(f"\n--- Test Result: FAILED (Connection Error) ---")
        print(f"Could not connect to the server at {SERVER_URL}.")
        print(f"Please ensure your mcp_service.py is running and accessible.")
        print(f"Error details: {e}")
    except requests.exceptions.Timeout:
        print(f"\n--- Test Result: FAILED (Request Timed Out) ---")
        print(f"The request to {SERVER_URL} timed out after 60 seconds.")
    except Exception as e:
        print(f"\n--- Test Result: FAILED (An unexpected error occurred) ---")
        print(f"Error: {e}")

if __name__ == "__main__":
    test_analyze_images()

# To run this test:
# 1. Make sure your mcp_service.py is running and accessible (not image_services_server.py directly).
# 2. Open a new terminal in the mcp_client/mcp-servers/ directory.
# 3. Run: python test_image_analysis_client.py
