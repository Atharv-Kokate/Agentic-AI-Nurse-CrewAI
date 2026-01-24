import asyncio
import sys
import json
import os
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# Define path to server script
# We define command to run relative to this script
SERVER_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mcp_server.py")

async def run_client():
    # Configure the server process parameters
    # We run "python mcp_server.py"
    server_params = StdioServerParameters(
        command="python",
        args=[SERVER_SCRIPT],
        env=os.environ.copy() # Inherit environment variables (important for API keys)
    )

    print(f"Starting server: python {SERVER_SCRIPT}...")

    # Connect to the server via stdio
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            # Initialize the connection
            await session.initialize()
            
            # List available tools
            result = await session.list_tools()
            tools = result.tools
            
            print("\n✅ Connected to MCP Server!")
            print(f"Available Tools ({len(tools)}):")
            for tool in tools:
                print(f"- {tool.name}: {tool.description}")

            print("\n---------------------------------------------------------")
            print("Interactive Client")
            print("Commands:")
            print("  list                              -> List tools")
            print("  call <tool> <json_args>           -> Call a tool")
            print("  Example: call analyze_vitals {\"heart_rate\": 100}")
            print("  quit                              -> Exit")
            print("---------------------------------------------------------")
            
            while True:
                try:
                    # Async input
                    user_input = await asyncio.get_event_loop().run_in_executor(None, input, "\n> ")
                    user_input = user_input.strip()
                    
                    if not user_input:
                        continue
                        
                    if user_input.lower() in ["quit", "exit"]:
                        break
                    
                    if user_input.startswith("call "):
                        # Parse command: call tool_name {"arg": "val"}
                        parts = user_input.split(" ", 2)
                        
                        if len(parts) < 3:
                            # Handle case where maybe args are empty or simple? 
                            # But our tools usually expect args.
                            # Just strictly enforce json for now.
                            print("Usage: call <tool_name> <json_arguments>")
                            continue
                        
                        tool_name = parts[1]
                        json_args_str = parts[2]
                        
                        try:
                            arguments = json.loads(json_args_str)
                        except json.JSONDecodeError:
                            print("❌ Error: Arguments must be valid JSON.")
                            continue
                            
                        print(f"⏳ Calling {tool_name}...")
                        try:
                            result = await session.call_tool(tool_name, arguments)
                            print("✅ Result:")
                            
                            # Content is a list of TextContent or ImageContent
                            if hasattr(result, 'content') and result.content:
                                for content in result.content:
                                    if hasattr(content, 'text'):
                                        print(content.text)
                                    else:
                                        print(content)
                            else:
                                print(result) # fallback
                                
                        except Exception as tool_err:
                            print(f"❌ Tool Execution Error: {tool_err}")
                                
                    elif user_input == "list":
                        result = await session.list_tools()
                        for tool in result.tools:
                            print(f"- {tool.name}")
                    else:
                        print("Unknown command. Try 'list', 'call', or 'quit'.")

                except KeyboardInterrupt:
                    break
                except Exception as e:
                    print(f"❌ Error: {e}")

if __name__ == "__main__":
    if not os.path.exists(SERVER_SCRIPT):
        print(f"Error: Server script not found at {SERVER_SCRIPT}")
        sys.exit(1)
        
    try:
        asyncio.run(run_client())
    except KeyboardInterrupt:
        print("\nGoodbye!")
