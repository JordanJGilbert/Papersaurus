
from fastmcp import FastMCP
import llm_adapters  # This import causes issues

mcp = FastMCP("test_server")

@mcp.tool()
def test_tool():
    return "test"

if __name__ == "__main__":
    print("Starting FastMCP server with llm_adapters import...")
    mcp.run()
