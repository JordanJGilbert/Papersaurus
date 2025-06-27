#!/bin/bash

echo "🎨 VibeCarding Service Status Check"
echo "=================================="

# Check if service is running
if systemctl is-active --quiet vibecarding.service; then
    echo "✅ VibeCarding service is RUNNING"
else
    echo "❌ VibeCarding service is NOT running"
fi

echo ""
echo "📊 Service Status:"
sudo systemctl status vibecarding.service --no-pager -l

echo ""
echo "🔗 Service is configured to run on port 3000"
echo "🌐 Access at: http://$(curl -s ifconfig.me):3000"

echo ""
echo "📋 Recent logs (last 10 lines):"
sudo journalctl -u vibecarding.service -n 10 --no-pager

echo ""
echo "💡 Useful commands:"
echo "   Restart: sudo systemctl restart vibecarding.service"
echo "   Stop:    sudo systemctl stop vibecarding.service"
echo "   Logs:    sudo journalctl -u vibecarding.service -f" 