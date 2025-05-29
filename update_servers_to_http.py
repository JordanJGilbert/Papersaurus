#!/usr/bin/env python3
"""
Script to update all MCP server files to support HTTP transport
"""
import os
import glob

def update_server_file(filepath):
    """Update a single server file to support HTTP transport"""
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Check if already updated
    if 'FASTMCP_TRANSPORT' in content:
        print(f"Skipping {filepath} - already updated")
        return
    
    # Find the if __name__ == "__main__": block
    if 'if __name__ == "__main__":' not in content:
        print(f"Skipping {filepath} - no main block found")
        return
    
    # Replace the mcp.run() line with transport-aware code
    old_pattern = 'if __name__ == "__main__":\n    mcp.run()'
    new_pattern = '''if __name__ == "__main__":
    # Check if we should use HTTP transport
    transport = os.getenv("FASTMCP_TRANSPORT", "stdio")
    
    if transport == "streamable-http":
        host = os.getenv("FASTMCP_HOST", "127.0.0.1")
        port = int(os.getenv("FASTMCP_PORT", "9000"))
        logger.info(f"Starting server with streamable-http transport on {host}:{port}")
        mcp.run(transport="streamable-http", host=host, port=port)
    else:
        logger.info("Starting server with stdio transport")
        mcp.run()'''
    
    # Also handle case with existing spacing/indentation variations
    if old_pattern in content:
        new_content = content.replace(old_pattern, new_pattern)
    else:
        # More flexible replacement
        import re
        pattern = r'if __name__ == "__main__":\s*\n\s*mcp\.run\(\)'
        if re.search(pattern, content):
            new_content = re.sub(pattern, new_pattern, content)
        else:
            print(f"Warning: Could not find pattern to replace in {filepath}")
            return
    
    # Ensure logger is imported if not already
    if 'import logging' not in new_content:
        # Add logging import after other imports
        lines = new_content.split('\n')
        import_index = 0
        for i, line in enumerate(lines):
            if line.startswith('import') or line.startswith('from'):
                import_index = i
        lines.insert(import_index + 1, 'import logging')
        lines.insert(import_index + 2, '')
        lines.insert(import_index + 3, 'logging.basicConfig(stream=sys.stderr, level=logging.INFO)')
        lines.insert(import_index + 4, 'logger = logging.getLogger(__name__)')
        new_content = '\n'.join(lines)
    elif 'logger = logging.getLogger' not in new_content:
        # Just add logger definition
        lines = new_content.split('\n')
        for i, line in enumerate(lines):
            if 'logging.basicConfig' in line:
                lines.insert(i + 1, 'logger = logging.getLogger(__name__)')
                break
        new_content = '\n'.join(lines)
    
    # Write updated content
    with open(filepath, 'w') as f:
        f.write(new_content)
    
    print(f"Updated {filepath}")

def main():
    """Update all server files in the mcp_client/mcp_servers directory"""
    server_dir = "mcp_client/mcp_servers"
    pattern = os.path.join(server_dir, "*.py")
    
    server_files = glob.glob(pattern)
    print(f"Found {len(server_files)} server files to update")
    
    for filepath in server_files:
        if filepath.endswith('__init__.py'):
            continue
        update_server_file(filepath)

if __name__ == "__main__":
    main() 