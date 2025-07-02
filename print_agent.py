#!/usr/bin/env python3
"""
Remote Print Agent
Monitors the EC2 server for print jobs and executes them on the local printer.
"""

import requests
import subprocess
import time
import os
import sys
from urllib.parse import urlparse
import tempfile
import signal
import atexit

# Configuration
EC2_BASE_URL = "https://vibecarding.com"  # Replace with your actual domain
PRINTER_NAME = "EPSON_ET_8550_Series"  # Replace with your actual printer name
POLL_INTERVAL = 3  # seconds
MAX_RETRIES = 3

# Global variable to track caffeinate process
caffeinate_process = None

def prevent_sleep():
    """Prevent system sleep on macOS"""
    global caffeinate_process
    try:
        # Start caffeinate to prevent sleep
        caffeinate_process = subprocess.Popen(['caffeinate', '-d'], 
                                            stdout=subprocess.DEVNULL, 
                                            stderr=subprocess.DEVNULL)
        print("☕ Sleep prevention activated (caffeinate)")
        return True
    except Exception as e:
        print(f"⚠️ Could not prevent sleep: {e}")
        return False

def cleanup_caffeinate():
    """Clean up caffeinate process"""
    global caffeinate_process
    if caffeinate_process:
        try:
            caffeinate_process.terminate()
            caffeinate_process.wait(timeout=5)
            print("☕ Sleep prevention deactivated")
        except:
            try:
                caffeinate_process.kill()
            except:
                pass
        caffeinate_process = None

# Register cleanup function
atexit.register(cleanup_caffeinate)

def signal_handler(sig, frame):
    """Handle interrupt signals"""
    print("\n\n🛑 Print agent stopping...")
    cleanup_caffeinate()
    sys.exit(0)

# Register signal handler
signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

def download_file(url, local_path):
    """Download a file from URL to local path"""
    try:
        print(f"📥 Downloading: {url}")
        response = requests.get(url, stream=True, timeout=30)
        response.raise_for_status()
        
        with open(local_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        print(f"✅ Downloaded to: {local_path}")
        return True
    except Exception as e:
        print(f"❌ Download failed: {e}")
        return False

def print_file(file_path, settings):
    """Print a file using the local printer"""
    try:
        # Build lp command
        cmd = ['lp', '-d', PRINTER_NAME]
        
        # Handle different paper sizes based on server settings
        paper_size = settings.get('paper_size', 'standard')
        
        if paper_size == 'compact':
            # 4×6 card (8×6 print layout)
            cmd.extend(['-o', 'media=Custom.8x6in'])
        elif paper_size == 'a6':
            # A6 card (8.3×5.8 print layout)
            cmd.extend(['-o', 'media=Custom.8.3x5.8in'])
        else:
            # Default: standard 5×7 card (10×7 print layout)
            cmd.extend(['-o', 'media=Custom.7x10in'])
        
        # Set duplex and orientation based on card type
        if settings.get('duplex', False):
            cmd.extend(['-o', 'sides=two-sided-long-edge'])
        else:
            cmd.extend(['-o', 'sides=one-sided'])
        
        # Landscape orientation for card layouts
        cmd.extend(['-o', 'orientation-requested=4'])
        
        # Only allow copies setting from server
        if settings.get('copies', 1) > 1:
            cmd.extend(['-n', str(settings['copies'])])
        
        # Add the file
        cmd.append(file_path)
        
        print(f"🖨️ Executing: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            print(f"✅ Print command successful")
            return True, None
        else:
            error_msg = f"Print command failed: {result.stderr}"
            print(f"❌ {error_msg}")
            return False, error_msg
            
    except subprocess.TimeoutExpired:
        error_msg = "Print command timed out"
        print(f"❌ {error_msg}")
        return False, error_msg
    except Exception as e:
        error_msg = f"Print error: {str(e)}"
        print(f"❌ {error_msg}")
        return False, error_msg

def process_print_job(job):
    """Process a single print job"""
    job_id = job['id']
    file_url = job['file_url']
    job_name = job['job_name']
    settings = job['settings']
    
    print(f"\n📋 Processing job: {job_name} (ID: {job_id[:8]}...)")
    
    # Determine file extension from URL
    parsed_url = urlparse(file_url)
    file_ext = os.path.splitext(parsed_url.path)[1] or '.pdf'
    
    # Create temporary file
    with tempfile.NamedTemporaryFile(suffix=file_ext, delete=False) as temp_file:
        temp_path = temp_file.name
    
    try:
        # Download file
        if not download_file(file_url, temp_path):
            return False, "Failed to download file"
        
        # Print file
        success, error_msg = print_file(temp_path, settings)
        return success, error_msg
        
    finally:
        # Clean up temporary file
        try:
            os.unlink(temp_path)
        except:
            pass

def mark_job_complete(job_id, success, error_message=None):
    """Mark a job as completed on the server"""
    try:
        url = f"{EC2_BASE_URL}/api/print-complete/{job_id}"
        data = {
            'success': success,
            'error_message': error_message
        }
        
        response = requests.post(url, json=data, timeout=10)
        response.raise_for_status()
        
        print(f"✅ Marked job {job_id[:8]}... as {'completed' if success else 'failed'}")
        return True
        
    except Exception as e:
        print(f"❌ Failed to mark job complete: {e}")
        return False

def get_pending_jobs():
    """Get pending print jobs from the server"""
    try:
        response = requests.get(f"{EC2_BASE_URL}/api/print-queue", timeout=10)
        response.raise_for_status()
        
        data = response.json()
        if data['status'] == 'success':
            return data['jobs']
        else:
            print(f"❌ Server error: {data}")
            return []
            
    except Exception as e:
        print(f"❌ Failed to get print queue: {e}")
        return []

def main():
    """Main print agent loop"""
    print("🖨️ Remote Print Agent Started")
    print(f"📡 Monitoring: {EC2_BASE_URL}")
    print(f"🖨️ Printer: {PRINTER_NAME}")
    print(f"⏱️ Poll interval: {POLL_INTERVAL} seconds")
    print("=" * 50)
    
    # Prevent system sleep
    prevent_sleep()
    
    # Test printer connection
    try:
        result = subprocess.run(['lpstat', '-p', PRINTER_NAME], 
                              capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            print(f"✅ Printer '{PRINTER_NAME}' is available")
        else:
            print(f"⚠️ Warning: Printer '{PRINTER_NAME}' may not be available")
            print(f"   You can list available printers with: lpstat -p")
    except Exception as e:
        print(f"⚠️ Could not check printer status: {e}")
    
    print("🔄 Starting monitoring loop...\n")
    
    while True:
        try:
            jobs = get_pending_jobs()
            
            if jobs:
                print(f"📋 Found {len(jobs)} pending job(s)")
                
                for job in jobs:
                    job_id = job['id']
                    
                    # Process the job
                    success, error_msg = process_print_job(job)
                    
                    # Mark as complete with retry logic
                    marked_complete = False
                    for retry in range(MAX_RETRIES):
                        if mark_job_complete(job_id, success, error_msg):
                            marked_complete = True
                            break
                        else:
                            print(f"⚠️ Retry {retry + 1}/{MAX_RETRIES} marking job complete...")
                            time.sleep(2)
                    
                    if success:
                        if marked_complete:
                            print(f"🎉 Job completed successfully!")
                        else:
                            print(f"⚠️ Job printed but couldn't mark complete on server (will retry next poll)")
                    else:
                        print(f"💥 Job failed: {error_msg}")
            else:
                print("💤 No pending jobs", end='\r')
            
            time.sleep(POLL_INTERVAL)
            
        except KeyboardInterrupt:
            print("\n\n🛑 Print agent stopped by user")
            break
        except Exception as e:
            print(f"\n❌ Unexpected error: {e}")
            print("🔄 Continuing in 30 seconds...")
            time.sleep(30)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        if sys.argv[1] == '--help':
            print("Remote Print Agent")
            print("Usage: python3 print_agent.py")
            print("\nBefore running:")
            print("1. Update EC2_BASE_URL with your domain")
            print("2. Update PRINTER_NAME with your printer name")
            print("3. Ensure 'lp' command is available (CUPS)")
            print("4. Test printer with: lpstat -p")
            sys.exit(0)
    
    # Validate configuration
    if EC2_BASE_URL == "https://your-domain.com":
        print("❌ Please update EC2_BASE_URL in the script with your actual domain")
        sys.exit(1)
    
    main() 