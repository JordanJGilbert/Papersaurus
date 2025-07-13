#!/usr/bin/env python3
"""
SSH-friendly notification hook that uses visual indicators when Claude Code needs input.
Works over SSH by using terminal bells and visual markers.
"""

import sys
import json
import os
from datetime import datetime

def create_visual_notification():
    """Create visual notification in terminal"""
    # Terminal bell (works over SSH if terminal supports it)
    print('\a', end='', flush=True)
    
    # Create a highly visible notification
    print("\n" + "="*60, file=sys.stderr)
    print("🔔 CLAUDE CODE NEEDS YOUR INPUT! 🔔", file=sys.stderr)
    print("="*60 + "\n", file=sys.stderr)
    
    # Write to a file that you can monitor
    notification_file = "/var/www/flask_app/.claude/last_notification.txt"
    os.makedirs(os.path.dirname(notification_file), exist_ok=True)
    
    with open(notification_file, "w") as f:
        f.write(f"Claude Code needs input at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

def main():
    # Read the JSON payload from stdin
    try:
        payload = json.load(sys.stdin)
        message = payload.get("message", "")
        
        # Check if Claude is waiting for user input
        if "waiting" in message.lower() or "input" in message.lower() or "respond" in message.lower():
            create_visual_notification()
            
            # Log to a separate notification log
            log_file = "/var/www/flask_app/.claude/notification_log.txt"
            with open(log_file, "a") as f:
                f.write(f"[{datetime.now().isoformat()}] {message}\n")
        
        # Return success
        print(json.dumps({
            "timestamp": payload.get("timestamp", ""),
            "message": message,
            "notified": True
        }))
        
    except Exception as e:
        print(f"Error in notification hook: {e}", file=sys.stderr)
        sys.exit(1)
    
    sys.exit(0)

if __name__ == "__main__":
    main()