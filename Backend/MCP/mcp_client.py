"""
Aviral — Agentic AI Nurse: MCP Client
======================================
Interactive CLI client for the MCP server.
Prompts for login on startup and displays tools grouped by category.

Run:   python -m MCP.mcp_client
"""

import asyncio
import sys
import json
import os
import getpass
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# Path to the server script
SERVER_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mcp_server.py")

# Tool categories for display grouping
TOOL_CATEGORIES = {
    "🔍 Patient Management": [
        "list_patients", "get_patient", "create_patient",
        "update_patient", "get_patient_vitals_history",
    ],
    "🧠 AI Analysis & Intelligence": [
        "run_full_analysis", "check_analysis_status",
        "analyze_vitals", "run_risk_assessment", "consult_knowledge_base",
    ],
    "📊 Health Monitoring & Dashboard": [
        "get_dashboard_stats", "get_health_summary",
        "get_assessment_history", "ingest_telemetry",
    ],
    "💊 Medication Management": [
        "schedule_medication_reminder", "get_medication_history",
        "update_medication_status", "get_patient_reminders",
    ],
    "✅ Daily Tasks & Health Plans": [
        "get_daily_tasks", "generate_daily_health_plan", "update_task_status",
    ],
    "🩺 Monitoring & Check-ins": [
        "generate_monitoring_checkin", "get_pending_checkin",
    ],
    "🚨 Alerts & Escalation": [
        "escalate_to_doctor", "get_doctor_recommendations",
    ],
}


def display_tools_grouped(tools):
    """Display tools organized by category."""
    tool_names = {t.name for t in tools}
    categorized = set()

    for category, tool_list in TOOL_CATEGORIES.items():
        matching = [t for t in tools if t.name in tool_list]
        if matching:
            print(f"\n  {category}")
            print(f"  {'─' * 40}")
            for tool in matching:
                # Truncate description to first sentence
                desc = tool.description or ""
                first_line = desc.split("\n")[0][:80]
                print(f"    • {tool.name:35s} {first_line}")
                categorized.add(tool.name)

    # Any uncategorized tools
    uncategorized = [t for t in tools if t.name not in categorized]
    if uncategorized:
        print(f"\n  📦 Other Tools")
        print(f"  {'─' * 40}")
        for tool in uncategorized:
            print(f"    • {tool.name}")


async def run_client():
    print("━" * 60)
    print("  🏥 Aviral — Agentic AI Nurse MCP Client")
    print("━" * 60)
    
    # Check for token in environment or prompt
    token = os.environ.get("MCP_AUTH_TOKEN")
    if not token:
        print("\n  🔐 Authentication Required")
        print("  You must provide a JWT Access Token to connect to the server.\n")
        token = input("  Enter MCP_AUTH_TOKEN: ").strip()
        if not token:
            print("  ❌ Token is required. Exiting.")
            return
        os.environ["MCP_AUTH_TOKEN"] = token

    server_params = StdioServerParameters(
        command="python",
        args=[SERVER_SCRIPT],
        env=os.environ.copy(),
    )

    print(f"\n  Starting server: python {SERVER_SCRIPT}...")

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # List tools
            result = await session.list_tools()
            tools = result.tools

            print(f"\n  ✅ Connected! Available Tools ({len(tools)}):")
            display_tools_grouped(tools)

            # ── Interactive CLI ──
            print("\n" + "━" * 60)
            print("  Interactive Commands")
            print("━" * 60)
            print("  list                              → List tools (grouped)")
            print("  call <tool> <json_args>           → Call a tool")
            print("  call <tool>                       → Call a tool (no args)")
            print("  help <tool>                       → Show tool description")
            print("  quit                              → Exit")
            print("━" * 60)

            while True:
                try:
                    user_input = await asyncio.get_event_loop().run_in_executor(
                        None, input, "\n  › "
                    )
                    user_input = user_input.strip()

                    if not user_input:
                        continue

                    if user_input.lower() in ["quit", "exit", "q"]:
                        break

                    if user_input.lower() == "list":
                        result = await session.list_tools()
                        display_tools_grouped(result.tools)
                        continue

                    if user_input.lower().startswith("help "):
                        tool_name = user_input.split(" ", 1)[1].strip()
                        result = await session.list_tools()
                        found = [t for t in result.tools if t.name == tool_name]
                        if found:
                            print(f"\n  📖 {found[0].name}")
                            print(f"  {'─' * 50}")
                            if found[0].description:
                                for line in found[0].description.split("\n"):
                                    print(f"  {line}")
                        else:
                            print(f"  ❌ Tool '{tool_name}' not found.")
                        continue

                    if user_input.startswith("call "):
                        parts = user_input.split(" ", 2)
                        tool_name = parts[1]

                        # Parse arguments (optional)
                        arguments = {}
                        if len(parts) >= 3:
                            json_args_str = parts[2]
                            try:
                                arguments = json.loads(json_args_str)
                            except json.JSONDecodeError:
                                print("  ❌ Arguments must be valid JSON.")
                                continue

                        print(f"  ⏳ Calling {tool_name}...")

                        try:
                            result = await session.call_tool(tool_name, arguments)

                            print(f"  ✅ Result:")
                            print(f"  {'─' * 50}")
                            if hasattr(result, "content") and result.content:
                                for content in result.content:
                                    if hasattr(content, "text"):
                                        # Pretty-print JSON if possible
                                        try:
                                            parsed = json.loads(content.text)
                                            formatted = json.dumps(parsed, indent=2)
                                            for line in formatted.split("\n"):
                                                print(f"  {line}")
                                        except (json.JSONDecodeError, TypeError):
                                            for line in content.text.split("\n"):
                                                print(f"  {line}")
                                    else:
                                        print(f"  {content}")
                            else:
                                print(f"  {result}")
                            print(f"  {'─' * 50}")

                        except Exception as tool_err:
                            print(f"  ❌ Tool Error: {tool_err}")
                    else:
                        print("  Unknown command. Try 'list', 'call', 'help', or 'quit'.")

                except KeyboardInterrupt:
                    break
                except Exception as e:
                    print(f"  ❌ Error: {e}")

    print("\n  👋 Goodbye!")


if __name__ == "__main__":
    if not os.path.exists(SERVER_SCRIPT):
        print(f"Error: Server script not found at {SERVER_SCRIPT}")
        sys.exit(1)

    try:
        asyncio.run(run_client())
    except KeyboardInterrupt:
        print("\n  👋 Goodbye!")
