
import sys
import os

# Ensure backend works
sys.path.append(os.getcwd())

try:
    from mcp_server import mcp
    print("✅ MCP Server Import Successful")
    # FastMCP stores tools in internal handlers. We can inspect them.
    # Depending on version, it might be mcp.list_tools() (sync) or via ._tools
    # Let's try to just print the object representation or list keys if possible.
    # Checking accessing `_tool_handlers` or `_tools`
    
    # Introspect
    count = 0 
    # This is a hacky way to check registration without running the server
    # But usually mcp object has them registered immediately.
    print("Server object created.")
    
except Exception as e:
    print(f"❌ Failed to import: {e}")
