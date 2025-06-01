#!/usr/bin/env python3
"""
Command-line utility for applying SEARCH/REPLACE blocks.

Usage:
    python apply_blocks.py [options] [input_file]
    
    If no input_file is provided, reads from stdin.
    
Examples:
    # Apply blocks from a file
    python apply_blocks.py ai_output.txt
    
    # Apply blocks from stdin
    cat ai_output.txt | python apply_blocks.py
    
    # Preview changes without applying
    python apply_blocks.py --dry-run ai_output.txt
    
    # Apply without creating backups
    python apply_blocks.py --no-backup ai_output.txt
    
    # Use a different base directory
    python apply_blocks.py --base-dir /path/to/project ai_output.txt
"""

import argparse
import sys
from pathlib import Path

# Add the current directory to the path so we can import search_replace
sys.path.insert(0, str(Path(__file__).parent))

from search_replace import (
    apply_search_replace_blocks,
    preview_search_replace_blocks,
    print_preview
)

def main():
    parser = argparse.ArgumentParser(
        description="Apply SEARCH/REPLACE blocks from AI output to files",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    
    parser.add_argument(
        'input_file',
        nargs='?',
        help='File containing AI output with SEARCH/REPLACE blocks (default: stdin)'
    )
    
    parser.add_argument(
        '--base-dir', '-d',
        default='.',
        help='Base directory for resolving relative file paths (default: current directory)'
    )
    
    parser.add_argument(
        '--dry-run', '-n',
        action='store_true',
        help='Preview changes without applying them'
    )
    
    parser.add_argument(
        '--no-backup',
        action='store_true',
        help='Do not create backup files'
    )
    
    parser.add_argument(
        '--preview-only',
        action='store_true',
        help='Only show preview, do not apply changes'
    )
    
    parser.add_argument(
        '--quiet', '-q',
        action='store_true',
        help='Suppress progress output'
    )
    
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Show detailed output'
    )
    
    args = parser.parse_args()
    
    # Read input
    if args.input_file:
        if not Path(args.input_file).exists():
            print(f"Error: Input file '{args.input_file}' not found", file=sys.stderr)
            return 1
        
        with open(args.input_file, 'r', encoding='utf-8') as f:
            ai_output = f.read()
    else:
        if not args.quiet:
            print("Reading from stdin... (Press Ctrl+D when done)", file=sys.stderr)
        ai_output = sys.stdin.read()
    
    if not ai_output.strip():
        print("Error: No input provided", file=sys.stderr)
        return 1
    
    # Show preview if requested
    if args.preview_only or args.verbose:
        if not args.quiet:
            print("Previewing changes...")
        
        previews = preview_search_replace_blocks(ai_output, base_dir=args.base_dir)
        
        if not previews:
            print("No SEARCH/REPLACE blocks found in input")
            return 0
        
        print_preview(previews)
        
        if args.preview_only:
            return 0
    
    # Apply changes
    if not args.quiet:
        if args.dry_run:
            print("Performing dry run...")
        else:
            print("Applying changes...")
    
    results = apply_search_replace_blocks(
        ai_output,
        base_dir=args.base_dir,
        backup=not args.no_backup,
        dry_run=args.dry_run or args.preview_only
    )
    
    # Return appropriate exit code
    if results['failed'] > 0:
        return 1
    elif results['successful'] == 0 and results['total_blocks'] > 0:
        return 2  # No changes applied
    else:
        return 0  # Success

if __name__ == '__main__':
    sys.exit(main()) 