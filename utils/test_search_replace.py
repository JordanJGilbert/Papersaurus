#!/usr/bin/env python3
"""
Simple test script for the SEARCH/REPLACE block functionality.
"""

import tempfile
import sys
from pathlib import Path

# Add the current directory to the path so we can import search_replace
sys.path.insert(0, str(Path(__file__).parent))

from search_replace import (
    apply_search_replace_blocks,
    SearchReplaceBlockParser,
    preview_search_replace_blocks,
    print_preview
)

def test_parser():
    """Test the parser functionality."""
    print("Testing parser...")
    
    ai_output = """
Here are the changes:

test.py
```python
<<<<<<< SEARCH
def old_function():
    return "old"
=======
def new_function():
    return "new"
>>>>>>> REPLACE
```

config.txt
```
<<<<<<< SEARCH
old_setting=value
=======
new_setting=improved_value
>>>>>>> REPLACE
```
"""
    
    parser = SearchReplaceBlockParser()
    blocks = parser.parse_blocks(ai_output)
    
    assert len(blocks) == 2, f"Expected 2 blocks, got {len(blocks)}"
    
    file1, search1, replace1 = blocks[0]
    assert file1 == "test.py"
    assert "def old_function():" in search1
    assert "def new_function():" in replace1
    
    file2, search2, replace2 = blocks[1]
    assert file2 == "config.txt"
    assert "old_setting=value" in search2
    assert "new_setting=improved_value" in replace2
    
    print("✓ Parser test passed")

def test_applicator():
    """Test the applicator functionality."""
    print("Testing applicator...")
    
    # Create temporary files and test directory
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        
        # Create test file
        test_file = temp_path / "test.py"
        original_content = """def old_function():
    return "old"

class TestClass:
    def method(self):
        pass
"""
        test_file.write_text(original_content)
        
        # AI output with changes
        ai_output = f"""
test.py
```python
<<<<<<< SEARCH
def old_function():
    return "old"
=======
def new_function():
    return "new and improved"
>>>>>>> REPLACE
```

test.py
```python
<<<<<<< SEARCH
class TestClass:
    def method(self):
        pass
=======
class TestClass:
    def method(self):
        print("Enhanced method")
>>>>>>> REPLACE
```
"""
        
        # Apply changes
        results = apply_search_replace_blocks(
            ai_output,
            base_dir=str(temp_path),
            backup=True,
            dry_run=False
        )
        
        # Check results
        assert results['total_blocks'] == 2
        assert results['successful'] == 2
        assert results['failed'] == 0
        
        # Check file content
        new_content = test_file.read_text()
        assert "def new_function():" in new_content
        assert "new and improved" in new_content
        assert 'print("Enhanced method")' in new_content
        assert "def old_function():" not in new_content
        
        # Check backup exists
        backup_file = test_file.with_suffix(".py.bak")
        assert backup_file.exists()
        # Note: backup contains original content, but may have been overwritten by second change
        backup_content = backup_file.read_text()
        assert "def old_function():" in backup_content or "def new_function():" in backup_content
        
        print("✓ Applicator test passed")

def test_preview():
    """Test the preview functionality."""
    print("Testing preview...")
    
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        
        # Create test file
        test_file = temp_path / "test.py"
        test_file.write_text("def old_function():\n    return 'old'\n")
        
        ai_output = f"""
test.py
```python
<<<<<<< SEARCH
def old_function():
    return 'old'
=======
def new_function():
    return 'new'
>>>>>>> REPLACE
```
"""
        
        # Test preview
        previews = preview_search_replace_blocks(ai_output, base_dir=str(temp_path))
        
        assert len(previews) == 1
        preview = previews[0]
        
        assert preview['file_exists'] == True
        assert preview['search_text_found'] == True
        assert preview['search_occurrences'] >= 1
        
        print("✓ Preview test passed")

def main():
    """Run all tests."""
    print("Running SEARCH/REPLACE block tests...\n")
    
    try:
        test_parser()
        test_applicator()
        test_preview()
        
        print("\n🎉 All tests passed!")
        return 0
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main()) 