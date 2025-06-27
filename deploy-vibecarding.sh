#!/bin/bash

# VibeCarding Deployment Script
echo "🎨 Deploying VibeCarding App..."

# Stop the current service
echo "Stopping current service..."
sudo systemctl stop ast-chatbot.service

# Copy the new service file
echo "Updating systemd service..."
sudo cp vibecarding.service /etc/systemd/system/vibecarding.service

# Remove old service if it exists
sudo systemctl disable ast-chatbot.service 2>/dev/null || true

# Reload systemd and enable new service
sudo systemctl daemon-reload
sudo systemctl enable vibecarding.service

# Build the Next.js app
echo "Building VibeCarding app..."
cd /var/www/flask_app/ast_chat
npm run build

# Start the new service
echo "Starting VibeCarding service..."
sudo systemctl start vibecarding.service

# Check status
echo "Service status:"
sudo systemctl status vibecarding.service --no-pager

echo "🎉 VibeCarding deployment complete!"
echo "📊 Check logs with: sudo journalctl -u vibecarding.service -f" 