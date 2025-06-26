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

# Configuration
EC2_BASE_URL = "https://vibecarding.com "  # Your actual domain
PRINTER_NAME = "ET-8550"  # Replace with your actual printer name
POLL_INTERVAL = 10  # seconds
MAX_RETRIES = 3

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
        
        # Add print settings
        if settings.get('duplex'):
            # For greeting cards, use short-edge binding (flip on short edge)
            if settings.get('paper_type') == 'cardstock' or settings.get('type') == 'card':
                cmd.extend(['-o', 'sides=two-sided-short-edge'])
                print("📄 Using duplex: flip on short edge (for greeting cards)")
            else:
                cmd.extend(['-o', 'sides=two-sided-long-edge'])
                print("📄 Using duplex: flip on long edge (for documents)")
        else:
            print("📄 Using single-sided printing")
        
        if settings.get('copies', 1) > 1:
            cmd.extend(['-n', str(settings['copies'])])
            print(f"📄 Copies: {settings['copies']}")
        
        if settings.get('color_mode') == 'mono':
            cmd.extend(['-o', 'ColorModel=Gray'])
            print("📄 Color mode: Grayscale")
        else:
            print("📄 Color mode: Color")
        
        # Quality settings
        if settings.get('quality') == 'high':
            cmd.extend(['-o', 'print-quality=5'])
            print("📄 Quality: High")
        elif settings.get('quality') == 'draft':
            cmd.extend(['-o', 'print-quality=3'])
            print("📄 Quality: Draft")
        else:
            print("📄 Quality: Normal")
        
        # Paper size
        paper_size = settings.get('paper_size', 'letter')
        if paper_size != 'letter':  # Only specify if not default
            cmd.extend(['-o', f'PageSize={paper_size}'])
            print(f"📄 Paper size: {paper_size}")
        
        # Add the file
        cmd.append(file_path)
        
        print(f"🖨️ Executing: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
        if result.returncode == 0:
            print(f"✅ Print command successful")
            if result.stdout:
                print(f"📋 Print job ID: {result.stdout.strip()}")
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
                    
                    # Mark as complete
                    mark_job_complete(job_id, success, error_msg)
                    
                    if success:
                        print(f"🎉 Job completed successfully!")
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