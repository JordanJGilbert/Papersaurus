#!/bin/bash

# Claude Code Notification Script with Speech
# Configure your ntfy topic here
NTFY_TOPIC="jordanpapersaurusroar"  # Your unique Claude notification topic!

# Get the type of operation from first argument (optional)
OPERATION="${1:-response}"

# Function to send notification
send_notification() {
    local title="$1"
    local message="$2"
    local priority="$3"
    local tags="$4"
    
    # Send notification with text-to-speech action
    curl -s \
        -H "Title: $title" \
        -H "Priority: $priority" \
        -H "Tags: $tags" \
        -d "$message" \
        "https://ntfy.sh/$NTFY_TOPIC" > /dev/null
}

# Different notifications based on operation type
case "$OPERATION" in
    "response")
        send_notification \
            "🤖 Claude AI" \
            "Your AI assistant has finished responding" \
            "high" \
            "robot,white_check_mark"
        ;;
    
    "error")
        send_notification \
            "⚠️ Claude Error" \
            "An error occurred during processing" \
            "urgent" \
            "warning,x"
        ;;
    
    "long_task")
        send_notification \
            "⏰ Long Task Complete" \
            "Claude has finished a long running task" \
            "urgent" \
            "alarm_clock,tada"
        ;;
    
    "file_write")
        send_notification \
            "📝 File Updated" \
            "Claude has modified your files" \
            "default" \
            "pencil,page_facing_up"
        ;;
    
    *)
        send_notification \
            "🔔 Claude Notification" \
            "$OPERATION" \
            "default" \
            "bell"
        ;;
esac

# Also echo to terminal for visual confirmation
echo "📱 Notification sent to ntfy.sh/$NTFY_TOPIC"