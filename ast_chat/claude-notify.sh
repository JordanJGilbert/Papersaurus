#!/bin/bash

# Claude Code notification script for SSH sessions
# This script sends notifications when Claude is waiting for input

# Show topic URL for easy access
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔔 CLAUDE CODE IS WAITING FOR YOUR INPUT! 🔔"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Subscribe at: https://ntfy.sh/claude-ec2-notify-$(whoami)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Method 1: Use terminal bell (works in most SSH clients)
send_terminal_bell() {
    echo -e "\a"
    # Send multiple bells for emphasis
    for i in {1..3}; do
        echo -e "\a"
        sleep 0.5
    done
}

# Method 2: Send notification via SSH to local machine (requires SSH key setup)
# Replace LOCAL_USER and LOCAL_HOST with your local machine details
send_ssh_notification() {
    LOCAL_USER="your_local_username"
    LOCAL_HOST="your_local_ip"
    
    # macOS notification
    ssh $LOCAL_USER@$LOCAL_HOST "osascript -e 'display notification \"Claude Code is waiting for input\" with title \"Claude Code\"'"
    
    # Linux notification (uncomment if using Linux)
    # ssh $LOCAL_USER@$LOCAL_HOST "notify-send 'Claude Code' 'Waiting for input'"
    
    # Windows notification (uncomment if using Windows with WSL)
    # ssh $LOCAL_USER@$LOCAL_HOST "powershell.exe -Command \"New-BurntToastNotification -Text 'Claude Code', 'Waiting for input'\""
}

# Method 3: Use pushover API (requires account)
send_pushover_notification() {
    TOKEN="your_pushover_app_token"
    USER_KEY="your_pushover_user_key"
    
    curl -s \
        --form-string "token=$TOKEN" \
        --form-string "user=$USER_KEY" \
        --form-string "message=Claude Code is waiting for input" \
        --form-string "title=Claude Code" \
        https://api.pushover.net/1/messages.json
}

# Method 4: Use ntfy.sh (free, no account needed)
send_ntfy_notification() {
    # Choose a unique topic name (e.g., your-name-claude-notify)
    TOPIC="claude-ec2-notify-$(whoami)"
    
    # Send notification with priority and tags
    curl -H "Priority: high" \
         -H "Tags: robot,bell" \
         -d "Claude Code is waiting for input on EC2" \
         ntfy.sh/$TOPIC
}

# Method 5: Write to a log file that you can monitor
log_notification() {
    echo "[$(date)] Claude Code waiting for input" >> ~/claude-notifications.log
}

# Execute notification methods (uncomment the ones you want to use)
send_terminal_bell
log_notification
# send_ssh_notification
# send_pushover_notification
send_ntfy_notification  # Enabled ntfy.sh notifications

# Optional: Play a sound on the EC2 server (if speakers connected)
# paplay /usr/share/sounds/freedesktop/stereo/message.oga 2>/dev/null || true