#!/usr/bin/env python3
import sys, os
sys.path.append('.venv/lib/python3.12/site-packages')
from mcp.types import Tool as MCPTool, ToolAnnotations
print("=== MCP Tool Attributes ===")
for field_name, field_info in MCPTool.model_fields.items(): print(f"  {field_name}: {field_info.annotation}")
