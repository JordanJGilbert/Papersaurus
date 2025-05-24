#!/bin/bash

# This script automates the setup of the Flask, MCP, AST Chat services, Nginx,
# and Signal REST API Docker container.
# Assumes a YUM-based system like Amazon Linux EC2.
#
# IMPORTANT:
# 1. Run this script from your project\'s root directory (e.g., /var/www/flask_app)
#    OR it will try to cd into it.
# 2. This script will install system packages using sudo yum.
# 3. This script will install NVM and a specific Node.js version.
# 4. This script will install Docker and Docker Compose.
# 5. This script will create a placeholder .env file. You MUST edit it with your
#    actual environment variables.
# 6. This script WILL attempt to overwrite systemd service files, Nginx config files,
#    and the Signal API docker-compose.yml using \'sudo tee\' or by writing directly.
#    Review the heredoc sections for these files before running.
# 7. SSL (Certbot) installation is included, but certificate generation is a manual step
#    to be performed after this script completes and DNS is configured.

set -e # Exit immediately if a command exits with a non-zero status.

# --- Primary Configuration Variables --- 
PROJECT_DIR="/var/www/flask_app" # Ensure this is your correct project root
USER_NAME="ec2-user" # Change if your deployment user is different
GROUP_NAME="ec2-user" # Change if your deployment group is different

# Python/Venv settings
PYTHON_VENV_DIR="${PROJECT_DIR}/.venv"

# Node.js/NVM/AST Chat settings
AST_CHAT_DIR="${PROJECT_DIR}/ast_chat"
NODE_VERSION_TO_INSTALL="v22.14.0" # From previous service file inspection

# Nginx settings
NGINX_DOMAIN_NAME="jordanjohngilbert.link" # <<<< IMPORTANT: SET YOUR DOMAIN NAME HERE
ACME_CHALLENGE_ROOT="/var/www/html" # For Let\'s Encrypt HTTP-01 challenge

# Signal REST API (Docker) settings
SIGNAL_COMPOSE_DIR_PATH="/home/${USER_NAME}/signal-api-compose" # Directory for its docker-compose.yml
SIGNAL_DATA_HOST_PATH="/home/${USER_NAME}/signal_data" # Host path for Signal data persistence
SIGNAL_API_SERVICE_NAME="signal_api_compose.service" # Systemd service name for the Signal API

echo "=== Starting Full Server Setup for EC2 (YUM-based) ==="
echo "Project Directory: $PROJECT_DIR"
echo "User: $USER_NAME, Group: $GROUP_NAME"
echo "Python Virtual Env: $PYTHON_VENV_DIR"
echo "AST Chat Dir: $AST_CHAT_DIR"
echo "Node.js version to be installed via NVM: $NODE_VERSION_TO_INSTALL"
echo "Nginx Domain Name: $NGINX_DOMAIN_NAME"
echo "ACME Challenge Root for Nginx: $ACME_CHALLENGE_ROOT"
echo "Signal API Compose Directory: $SIGNAL_COMPOSE_DIR_PATH"
echo "Signal API Data Host Path: $SIGNAL_DATA_HOST_PATH"
echo "Signal API Systemd Service: $SIGNAL_API_SERVICE_NAME"
echo ""
echo "Review these paths and settings. If they are incorrect, please edit the script."
echo "Press Enter to continue or Ctrl+C to abort."
read -r

# --- 0. System Update and Core Dependencies --- 
# Includes python, git, nginx, docker, docker-compose, certbot
echo ""
echo "--- Updating system and installing core dependencies ---"
sudo yum update -y
sudo yum install -y python3 python3-pip git curl nginx docker

echo "Installing Certbot and Nginx plugin..."
sudo yum install -y certbot python3-certbot-nginx

echo "Enabling and starting Docker service..."
sudo systemctl enable --now docker # For Amazon Linux 2+, older might use `service docker start`

echo "Installing Docker Compose..."
# Check if Docker Compose is already installed
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L \"https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)\" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo "Docker Compose installed to /usr/local/bin/docker-compose"
else
    echo "Docker Compose already installed."
fi
# Add ec2-user to docker group to run docker commands without sudo (requires logout/login or new shell to take effect for user)
# This script will still use `sudo docker-compose` for reliability during initial setup.
if ! getent group docker > /dev/null; then
    sudo groupadd docker
fi
sudo usermod -aG docker "${USER_NAME}"
echo "User ${USER_NAME} added to docker group. A new login session may be needed for this user to run docker without sudo."


# --- Install NVM (Node Version Manager) and specific Node.js version ---
echo ""
echo "--- Installing NVM and Node.js ${NODE_VERSION_TO_INSTALL} ---"
# Check if NVM is already installed to avoid re-running the install script unnecessarily
# Run NVM steps as the target user if possible, or ensure $HOME is correct
# For simplicity in this script, assuming it runs as or can act on behalf of USER_NAME for NVM install path
NVM_HOME_DIR="/home/${USER_NAME}/.nvm" # NVM installs to user\'s home by default
if [ -d "$NVM_HOME_DIR" ]; then
    echo "NVM already installed in $NVM_HOME_DIR. Sourcing it."
else
    echo "Installing NVM for user ${USER_NAME} in ${NVM_HOME_DIR}..."
    sudo -u "${USER_NAME}" bash -c \
    "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
fi

# Source NVM - this makes nvm command available to the current script session
# Important: This sources NVM for the *current script execution*. 
# The PATH for systemd services is set explicitly later.
export NVM_DIR="$NVM_HOME_DIR"
[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \\. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

echo "Installing Node.js ${NODE_VERSION_TO_INSTALL} using NVM..."
nvm install "${NODE_VERSION_TO_INSTALL}" # This will run as the user executing the script
nvm use "${NODE_VERSION_TO_INSTALL}"
nvm alias default "${NODE_VERSION_TO_INSTALL}"

# Define NPM_PATH and NODE_PATH_ENV based on the NVM-installed version
# This needs to be the path that systemd services will use for the specified USER_NAME
# For systemd services, we often need to use the full explicit path derived from NVM\'s structure
NODE_PATH_ENV="${NVM_HOME_DIR}/versions/node/${NODE_VERSION_TO_INSTALL}/bin"
NPM_PATH="${NODE_PATH_ENV}/npm"

echo "Node Path for services: $NODE_PATH_ENV"
echo "NPM executable: $NPM_PATH"
if [ ! -f "$NPM_PATH" ]; then
    echo "Error: npm executable not found after NVM install. Path was $NPM_PATH. Please check NVM setup for user ${USER_NAME}."
    exit 1
fi

# --- 1. Navigate to Project Directory and Git Pull ---
echo ""
echo "--- Navigating to project directory and pulling latest code ---"
if [ ! -d "$PROJECT_DIR" ]; then
  echo "Project directory $PROJECT_DIR does not exist. Creating it."
  sudo mkdir -p "$PROJECT_DIR"
  sudo chown "$USER_NAME:$GROUP_NAME" "$PROJECT_DIR"
  echo "Cloning repository into $PROJECT_DIR..."
  echo "Placeholder: \'git clone YOUR_GIT_REPO_URL \"${PROJECT_DIR}\"\' would go here."
  echo "If this is a fresh server, ensure the repo is cloned here first."
fi
cd "$PROJECT_DIR"
echo "Changed directory to $PROJECT_DIR"

echo "Attempting to pull latest changes from git..."
git pull
echo "Git pull completed."


# --- 2. Set Up Python Virtual Environment and Install Dependencies ---
echo ""
echo "--- Setting up Python environment ---"
if [ ! -d "$PYTHON_VENV_DIR" ]; then
  echo "Creating Python virtual environment at $PYTHON_VENV_DIR..."
  sudo -u "${USER_NAME}" python3 -m venv "$PYTHON_VENV_DIR"
else
  echo "Python virtual environment already exists."
fi

echo "Installing Python dependencies from requirements.txt..."
"$PYTHON_VENV_DIR/bin/pip" install -r requirements.txt # Assumes script runner has venv access or use sudo -u
echo "Python dependencies installed."

# --- 3. Set Up Node.js Frontend (ast_chat) ---
echo ""
echo "--- Setting up AST Chat (Node.js frontend) ---"
cd "$AST_CHAT_DIR"
echo "Changed directory to $AST_CHAT_DIR"

echo "Installing Node.js dependencies for ast_chat using $NPM_PATH..."
# Run npm install as the project user to avoid permission issues with node_modules
sudo -u "${USER_NAME}" "$NPM_PATH" install
echo "Node.js dependencies installed."

echo "Building ast_chat Next.js application for production..."
sudo -u "${USER_NAME}" "$NPM_PATH" run build
echo "ast_chat application built."

cd "$PROJECT_DIR"
echo "Returned to $PROJECT_DIR"

# --- 4. Create/Verify .env File ---
echo ""
echo "--- Setting up .env file ---"
ENV_FILE="${PROJECT_DIR}/.env"
if [ -f "$ENV_FILE" ]; then
  echo "$ENV_FILE already exists. Please ensure it contains all necessary variables."
  echo "Remember to prefix any variables needed by the ast_chat frontend in the browser with NEXT_PUBLIC_"
else
  echo "Creating a placeholder $ENV_FILE..."
  sudo -u "${USER_NAME}" touch "$ENV_FILE" # Create as user
  sudo -u "${USER_NAME}" bash -c \
  "{
    echo \"# Please populate this .env file with your actual environment variables.\"
    echo \"# Example:\"
    echo \"# FLASK_APP=app.py\"
    echo \"# FLASK_ENV=production\"
    echo \"# SECRET_KEY=your_very_secret_key\"
    echo \"# OPENAI_API_KEY=your_openai_key\"
    echo \"# GEMINI_API_KEY=your_gemini_key\"
    echo \"# ANTHROPIC_API_KEY=your_anthropic_key\"
    echo \"\"
    echo \"# For Next.js (ast_chat) variables needed in the browser, prefix with NEXT_PUBLIC_\"
    echo \"# NEXT_PUBLIC_API_BASE_URL=http://${NGINX_DOMAIN_NAME}\" # Example using the domain
    echo \"\"
  } >> \"$ENV_FILE\""
  echo "IMPORTANT: You MUST edit $ENV_FILE with your actual production environment variables."
fi
echo "Action required: Manually verify and populate $ENV_FILE with your environment variables."
echo "Press Enter to continue after you\'ve checked/edited the .env file (if necessary)..."
read -r

# --- 5. Create/Update Systemd Service Files ---
echo ""
echo "--- Creating/Updating systemd service files ---"
echo "Press Enter to review and confirm writing service files or Ctrl+C to abort."
read -r

# signal_api_compose.service
SIGNAL_API_SERVICE_CONTENT="[Unit]
Description=Signal REST API Docker Compose Service
Requires=docker.service
After=docker.service network-online.target

[Service]
User=${USER_NAME}
Group=${GROUP_NAME}
WorkingDirectory=${SIGNAL_COMPOSE_DIR_PATH}
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/bin/docker-compose -f ${SIGNAL_COMPOSE_DIR_PATH}/docker-compose.yml up -d --remove-orphans
ExecStop=/usr/local/bin/docker-compose -f ${SIGNAL_COMPOSE_DIR_PATH}/docker-compose.yml down
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target"
echo "--- Content for ${SIGNAL_API_SERVICE_NAME} ---"; echo "$SIGNAL_API_SERVICE_CONTENT"; echo "-----"
echo "$SIGNAL_API_SERVICE_CONTENT" | sudo tee /etc/systemd/system/"${SIGNAL_API_SERVICE_NAME}" > /dev/null
echo "Wrote /etc/systemd/system/${SIGNAL_API_SERVICE_NAME}"

# mcp_service.service
MCP_SERVICE_CONTENT="[Unit]
Description=MCP Service
After=network.target ${SIGNAL_API_SERVICE_NAME}
Requires=${SIGNAL_API_SERVICE_NAME}

[Service]
User=${USER_NAME}
Group=${GROUP_NAME}
WorkingDirectory=${PROJECT_DIR}
EnvironmentFile=${PROJECT_DIR}/.env
Environment=\\"PATH=${PYTHON_VENV_DIR}/bin:${NODE_PATH_ENV}:/usr/local/bin:/usr/bin:/bin\\"
Environment=PYTHONUNBUFFERED=1
ExecStart=${PYTHON_VENV_DIR}/bin/python ${PROJECT_DIR}/mcp_service.py 5001
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
TimeoutStartSec=300
TimeoutStopSec=300

[Install]
WantedBy=multi-user.target"
echo "--- Content for mcp_service.service ---"; echo "$MCP_SERVICE_CONTENT"; echo "-----"
echo "$MCP_SERVICE_CONTENT" | sudo tee /etc/systemd/system/mcp_service.service > /dev/null
echo "Wrote /etc/systemd/system/mcp_service.service"

# flask_app.service
FLASK_APP_SERVICE_CONTENT="[Unit]
Description=Gunicorn instance to serve flask_app
After=network.target ${SIGNAL_API_SERVICE_NAME}
Requires=${SIGNAL_API_SERVICE_NAME}

[Service]
User=${USER_NAME}
Group=${GROUP_NAME}
WorkingDirectory=${PROJECT_DIR}
EnvironmentFile=${PROJECT_DIR}/.env
Environment=\\"PATH=${PYTHON_VENV_DIR}/bin:${NODE_PATH_ENV}:/usr/local/bin:/usr/bin:/bin\\"
Environment=PYTHONUNBUFFERED=1
ExecStart=${PYTHON_VENV_DIR}/bin/gunicorn --worker-class gevent --workers 1 --bind 0.0.0.0:5000 wsgi:app --log-level info --capture-output --timeout 300
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
TimeoutStartSec=300
TimeoutStopSec=300

[Install]
WantedBy=multi-user.target"
echo "--- Content for flask_app.service ---"; echo "$FLASK_APP_SERVICE_CONTENT"; echo "-----"
echo "$FLASK_APP_SERVICE_CONTENT" | sudo tee /etc/systemd/system/flask_app.service > /dev/null
echo "Wrote /etc/systemd/system/flask_app.service"

# ast_chat.service
AST_CHAT_SERVICE_CONTENT="[Unit]
Description=AST Chat Frontend (Production)
After=network.target

[Service]
User=${USER_NAME}
Group=${GROUP_NAME}
WorkingDirectory=${AST_CHAT_DIR}
EnvironmentFile=${PROJECT_DIR}/.env
Environment=\\"PATH=${NODE_PATH_ENV}:/usr/local/bin:/usr/bin:/bin\\"
Environment=NODE_ENV=production
ExecStart=${NODE_PATH_ENV}/npm start
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
TimeoutStartSec=60
TimeoutStopSec=60

[Install]
WantedBy=multi-user.target"
echo "--- Content for ast_chat.service ---"; echo "$AST_CHAT_SERVICE_CONTENT"; echo "-----"
echo "$AST_CHAT_SERVICE_CONTENT" | sudo tee /etc/systemd/system/ast_chat.service > /dev/null
echo "Wrote /etc/systemd/system/ast_chat.service"

# --- 6. Setup Nginx Configuration ---
echo ""
echo "--- Setting up Nginx ---"
NGINX_CONF_PATH="/etc/nginx/conf.d/flask_app.conf"
if [ ! -d "$ACME_CHALLENGE_ROOT" ]; then
    echo "Creating ACME challenge root directory: $ACME_CHALLENGE_ROOT"
    sudo mkdir -p "$ACME_CHALLENGE_ROOT"
    sudo chown "nginx:nginx" "$ACME_CHALLENGE_ROOT" # Nginx usually runs as nginx user
fi

NGINX_HTTP_CONF_CONTENT="server {
    listen 80;
    server_name ${NGINX_DOMAIN_NAME};

    location ~ /.well-known/acme-challenge/ {
        allow all;
        root ${ACME_CHALLENGE_ROOT};
    }
    
    location /chat/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host \\\\\\$host;
        proxy_set_header X-Real-IP \\\\\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\\\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\\\\$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\\\\\$http_upgrade;
        proxy_set_header Connection \\\\\\"upgrade\\\\\";
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_redirect off;
        proxy_buffering off;
    }

    location /_next/ {
        proxy_pass http://127.0.0.1:3000/_next/;
        proxy_set_header Host \\\\\\$host;
        proxy_set_header X-Real-IP \\\\\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\\\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\\\\$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\\\\\$http_upgrade;
        proxy_set_header Connection \\\\\\"upgrade\\\\\";
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_redirect off;
        proxy_buffering off;
    }

    location = /chat {
        return 301 /chat/;
    }

    location / {
        proxy_pass http://127.0.0.1:5000; # Flask/Gunicorn
        # If Signal API is needed by Flask at /api/signal or similar:
        # location /api/signal/ {
        #     proxy_pass http://127.0.0.1:8080/;
        #     proxy_set_header Host \\\\\\$host;
        # }
        proxy_set_header Host \\\\\\$host;
        proxy_set_header X-Real-IP \\\\\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\\\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\\\\$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\\\\\$http_upgrade; # Usually not needed for typical Flask API
        proxy_set_header Connection \\\\\\"upgrade\\\\\"; # Usually not needed for typical Flask API
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_redirect off;
        # proxy_buffering on; # Often better for APIs unless streaming
    }
    
    client_max_body_size 100m;
}"
echo "--- Content for initial Nginx config ${NGINX_CONF_PATH} (for HTTP) ---"; echo "$NGINX_HTTP_CONF_CONTENT"; echo "-----"
echo "Press Enter to write Nginx config or Ctrl+C to abort."
read -r
echo "$NGINX_HTTP_CONF_CONTENT" | sudo tee "${NGINX_CONF_PATH}" > /dev/null
echo "Wrote initial Nginx configuration to ${NGINX_CONF_PATH}"

sudo systemctl enable nginx
sudo systemctl restart nginx
echo "Nginx enabled and (re)started."

echo ""
echo "IMPORTANT: SSL CERTIFICATE SETUP (Manual Step)"
echo "1. Ensure \'${NGINX_DOMAIN_NAME}\' points to this server\'s public IP."
echo "2. Run: sudo certbot --nginx -d ${NGINX_DOMAIN_NAME} --non-interactive --agree-tos -m YOUR_EMAIL@example.com"
echo "   (Replace YOUR_EMAIL@example.com with your email)"
echo "Press Enter to continue..."
read -r

# --- 8. Reload Systemd and Start Application Services ---
echo ""
echo "--- Reloading systemd and starting/restarting application services ---"
sudo systemctl daemon-reload
SERVICES_TO_MANAGE="mcp_service.service flask_app.service ast_chat.service"
for service_name in $SERVICES_TO_MANAGE; do
  sudo systemctl enable "$service_name"
  sudo systemctl restart "$service_name"
  echo "$service_name (re)started."
done

echo ""
echo "--- Setup Complete ---"
SERVICES_TO_CHECK="mcp_service.service flask_app.service ast_chat.service nginx.service"
echo "Docker Signal API status: sudo docker ps -f name=signal-api"
echo "You should now verify the status of the services:"
for service_name in $SERVICES_TO_CHECK; do echo "  sudo systemctl status $service_name"; done
echo ""
echo "Also, check logs if needed:"
for service_name in $SERVICES_TO_CHECK; do echo "  sudo journalctl -u $service_name -n 20 --no-pager"; done
echo "  sudo docker logs signal-api --tail 20"
echo ""
echo "FINAL STEP (if not done): Secure your site with SSL using the Certbot command provided earlier."