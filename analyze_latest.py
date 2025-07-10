#!/usr/bin/env python3
import json
import os

ATTACHMENTS_DIR = "/var/www/flask_app/claude_attachments"
INDEX_FILE = os.path.join(ATTACHMENTS_DIR, "index.json")

def get_latest_image_path():
    try:
        with open(INDEX_FILE, 'r') as f:
            index = json.load(f)
        
        if not index:
            return None
        
        # Find the latest image by timestamp
        latest_key = max(index.keys(), key=lambda k: index[k].get('timestamp', 0))
        return index[latest_key]['path']
        
    except:
        return None

# Print the path for Claude to use
path = get_latest_image_path()
if path:
    print(path)