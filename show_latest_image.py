#!/usr/bin/env python3
import json
import os
import sys

ATTACHMENTS_DIR = "/var/www/flask_app/claude_attachments"
INDEX_FILE = os.path.join(ATTACHMENTS_DIR, "index.json")

def get_latest_image():
    try:
        # Read the index file
        with open(INDEX_FILE, 'r') as f:
            index = json.load(f)
        
        if not index:
            print("No images found in index.json")
            return None
        
        # Find the latest image by timestamp
        latest_key = max(index.keys(), key=lambda k: index[k].get('timestamp', 0))
        latest_image = index[latest_key]
        
        print(f"Latest image: {latest_image['filename']}")
        print(f"Path: {latest_image['path']}")
        print(f"Timestamp: {latest_image['timestamp']}")
        print(f"Description: {latest_image.get('description', 'No description')}")
        
        return latest_image['path']
        
    except FileNotFoundError:
        print(f"Index file not found: {INDEX_FILE}")
        return None
    except Exception as e:
        print(f"Error: {e}")
        return None

if __name__ == "__main__":
    latest_path = get_latest_image()
    if latest_path:
        print(f"\nTo view in Claude Code, use:")
        print(f"Read('{latest_path}')")