#!/bin/bash
# Monitor Claude Code notifications in a separate terminal

echo "Monitoring Claude Code notifications..."
echo "Keep this running in a separate terminal/tmux pane"
echo "=========================================="

# Monitor the notification file
while true; do
    if [ -f "/var/www/flask_app/.claude/last_notification.txt" ]; then
        # Check if file was modified in the last 2 seconds
        if [ "$(find /var/www/flask_app/.claude/last_notification.txt -mtime -2s 2>/dev/null)" ]; then
            clear
            echo -e "\033[1;31m🔔 ALERT! CLAUDE CODE NEEDS YOUR INPUT! 🔔\033[0m"
            echo "=========================================="
            cat /var/www/flask_app/.claude/last_notification.txt
            echo "=========================================="
            # Remove the file so we don't alert again
            rm -f /var/www/flask_app/.claude/last_notification.txt
        fi
    fi
    sleep 1
done