import os

# Shared constants used across multiple modules

# Signal Config
SIGNAL_NUMBER = "+16504441293"
ALLOWED_SENDERS = ["+17145986105", "+15108290931", "+16503829987"]
SIGNAL_API_URL = "http://127.0.0.1:8080"
DOMAIN = os.getenv("DOMAIN")  # Production domain. Fallback if not in .env

# Database Config
MESSAGE_DB_PREFIX = "signal-messages"  # Used for storing user messages
APP_DB_PREFIX = "apps"  # Used for storing user-created applications
REMINDER_DB_PREFIX = "reminders"  # Used for user reminders
MAGIC_LINKS_DB_KEY = "magic-links"  # Used for magic links storage

# Other Config
TEMPLATES_DIR = 'templates'
TTS_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
DEFAULT_VOICE = "alloy"
MAGIC_LINK_EXPIRY = 10/60  # 10 seconds (expressed in minutes)
MAX_LINK_USES = 1  # Track number of times link is used
MAX_CONVERSATION_HISTORY = 10