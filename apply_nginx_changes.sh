#!/bin/bash

# Script to apply nginx configuration changes

echo "Backing up current nginx config..."
sudo cp /etc/nginx/conf.d/flask_app.conf /etc/nginx/conf.d/flask_app.conf.backup

echo "Applying new nginx config..."
sudo cp /tmp/flask_app_new.conf /etc/nginx/conf.d/flask_app.conf

echo "Testing nginx configuration..."
sudo nginx -t

if [ $? -eq 0 ]; then
    echo "Nginx configuration is valid. Reloading nginx..."
    sudo systemctl reload nginx
    echo "Done! The card app should now be available at https://vibecarding.com"
else
    echo "Nginx configuration test failed. Rolling back..."
    sudo cp /etc/nginx/conf.d/flask_app.conf.backup /etc/nginx/conf.d/flask_app.conf
    echo "Rollback complete. Please check the configuration."
fi