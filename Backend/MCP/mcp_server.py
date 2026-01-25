from fastmcp import FastMCP, Context
import sys
import os
import json
import logging
from typing import Dict, Any
from datetime import datetime
import asyncio
import httpx

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mcp_server")

# --- Path Setup ---
# Ensure Backend root is in sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
shared_dir = os.path.join(current_dir, '..', 'Shared')
ai_agents_dir = os.path.join(shared_dir, 'AI_Agents')

if current_dir not in sys.path:
    sys.path.append(current_dir)
if shared_dir not in sys.path:
    sys.path.append(shared_dir)
if ai_agents_dir not in sys.path:
    sys.path.append(ai_agents_dir)

# --- Import Project Modules ---
try:
    from src.agents import MedicalAgents
    from src.tools import AskPatientTool
    from database.session import SessionLocal
    from database.models import Reminder, Patient, AgentInteraction
    from crewai import Agent, Task, Crew
except ImportError as e:
    logger.error(f"Failed to import project modules: {e}")
    # Print sys.path to help debug if it fails again
    logger.error(f"Current sys.path: {sys.path}")
    sys.exit(1)

# --- Initialize MCP Server ---
mcp = FastMCP("Agentic AI Nurse")

# --- Helper Functions ---
def get_medical_agents(patient_id: str = None) -> MedicalAgents:
    return MedicalAgents(patient_id=patient_id)

# --- MCP Tools ---

@mcp.tool()
async def analyze_vitals(vitals_json: Any) -> str:
    """
    Analyzes patient vital signs to identify abnormalities.
    
    Args:
        vitals_json: A JSON string or dictionary containing vital signs (e.g., '{"heart_rate": 100, "bp": "120/80"}').
    """
    import io
    import contextlib
    
    try:
        # Validate JSON
        if isinstance(vitals_json, str):
            vitals_data = json.loads(vitals_json)
        else:
            vitals_data = vitals_json # Handle if passed as dict
            
        agents = get_medical_agents()
        analyzer_agent = agents.vital_analysis_agent()
        
        task = Task(
            description=f"Analyze the following vital signs: {vitals_data}.\nProvide a detailed analysis report immediately. Do NOT use 'Thought:' or 'Observation:'. Just the report.",
            expected_output="A detailed analysis report including status (NORMAL, WARNING, CRITICAL) and observations.",
            agent=analyzer_agent
        )
        
        # Override agent verbosity if possible, otherwise we rely on redirection
        analyzer_agent.verbose = False 
        
        crew = Crew(
            agents=[analyzer_agent],
            tasks=[task],
            verbose=False # Must be False
        )
        
        # Capture stdout/stderr to prevent leaking into MCP transport
        f_out = io.StringIO()
        f_err = io.StringIO()
        
        with contextlib.redirect_stdout(f_out), contextlib.redirect_stderr(f_err):
            result = crew.kickoff()
            
        if hasattr(result, 'raw'):
            return result.raw
        return str(result)
    except Exception as e:
        return f"Error analyzing vitals: {str(e)}"

@mcp.tool()
async def consult_knowledge_base(query: str) -> str:
    """
    Searches the internal medical knowledge base for protocols and guidelines.
    
    Args:
        query: The medical topic or symptom to look up.
    """
    try:
        # Updated to point to Shared/AI_Agents
        kb_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'Shared', 'AI_Agents', 'src', 'knowledge_base.md')
        
        if not os.path.exists(kb_path):
            return "Error: Knowledge base file not found."
            
        with open(kb_path, "r", encoding="utf-8") as f:
            content = f.read()
            
        # Simple Keyword Search since file is small (2KB)
        # This avoids needing an embedding model or OpenAI key
        query_lower = query.lower()
        
        # Split into sections by "## "
        sections = content.split("## ")
        matching_sections = []
        
        for sec in sections:
            if not sec.strip():
                continue
            # Restore the header tag for readability
            full_sec = "## " + sec
            # Check if any part of the query matches content (simple heuristic)
            if any(word in full_sec.lower() for word in query_lower.split() if len(word) > 3):
                matching_sections.append(full_sec)
        
        if matching_sections:
            return "\n\n".join(matching_sections)
            
        # If no specific match, return the whole thing if it's small enough
        if len(content) < 3000:
            return f"No exact match found. Here is the full protocol list:\n\n{content}"
            
        return "No specific protocols found matching your query."

    except Exception as e:
        return f"Error consulting knowledge base: {str(e)}"

@mcp.tool()
async def ask_patient_question(question: str, patient_id: str, ctx: Context = None) -> str:
    """
    Sends a follow-up question to the patient's interface and waits for their response.
    This is a Human-in-the-Loop tool.
    
    Args:
        question: The text to display to the patient.
        patient_id: The ID of the patient to address.
    """
    if ctx:
        ctx.info(f"Asking patient {patient_id}: {question}")
    
    try:
        tool = AskPatientTool(patient_id=patient_id)
        # _run is synchronous in the original tool but contains a polling loop with sleep.
        # Running it directly here might block the async event loop if not careful.
        # For FastMCP, we can define the tool as async, but the underlying _run is sync.
        # We should run it in a threadpool to be safe.
        
        loop = asyncio.get_event_loop()
        answer = await loop.run_in_executor(None, tool._run, question)
        return answer
    except Exception as e:
        return f"Error asking patient: {str(e)}"

@mcp.tool()
async def run_risk_assessment(case_context: str) -> str:
    """
    Performs a comprehensive risk assessment based on gathered data.
    
    Args:
        case_context: Summary of vitals, patient answers, and any other relevant info.
    """
    try:
        agents = get_medical_agents()
        risk_agent = agents.risk_assessment_agent()
        
        task = Task(
            description=f"Assess the health risk level based on this context: {case_context}.\nProvide your assessment immediately. Do NOT use 'Thought:'.",
            expected_output="Risk level (LOW/MODERATE/HIGH/CRITICAL) with detailed justification.",
            agent=risk_agent
        )
        
        crew = Crew(
            agents=[risk_agent],
            tasks=[task],
            verbose=False # Must be False to avoid polluting stdout and breaking MCP
        )
        
        with contextlib.redirect_stdout(f_out), contextlib.redirect_stderr(f_err):
            result = crew.kickoff()
            
        if hasattr(result, 'raw'):
            return result.raw
        return str(result)
    except Exception as e:
        return f"Error running risk assessment: {str(e)}"

@mcp.tool()
async def schedule_medication_reminder(
    patient_id: str,
    medicine_name: str,
    dosage: str,
    schedule_time: str
) -> str:
    """
    Schedules a new medication reminder and triggers the notification system.
    
    Args:
        patient_id: The ID of the patient.
        medicine_name: Name of the medication.
        dosage: Dosage instruction (e.g., "500mg").
        schedule_time: Time in HH:MM format.
    """
    db = SessionLocal()
    try:
        # 1. Save to DB
        new_reminder = Reminder(
            patient_id=patient_id,
            medicine_name=medicine_name,
            dosage=dosage,
            schedule_time=schedule_time,
            is_active=True
        )
        db.add(new_reminder)
        db.commit()
        db.refresh(new_reminder)
        
        reminder_id = str(new_reminder.id)
        
        # 2. Trigger n8n Webhook
        webhook_url = "https://hackerr.app.n8n.cloud/webhook-test/nurse-reminder"
        
        # Fetch patient details for the payload
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        patient_name = patient.name if patient else "Unknown"
        contact_number = patient.contact_number if patient else ""
            
        payload = {
            "action": "create",
            "reminder_id": reminder_id,
            "patient_name": patient_name,
            "phone_number": contact_number,
            "medicine_name": medicine_name,
            "dosage": dosage,
            "schedule_time": schedule_time,
            "is_active": True
        }
            
        async with httpx.AsyncClient() as client:
            try:
                await client.post(webhook_url, json=payload, timeout=5.0)
                webhook_status = "Webhook triggered successfully"
            except Exception as we:
                webhook_status = f"Webhook failed: {we}"
        
        return f"Reminder scheduled (ID: {reminder_id}). {webhook_status}"

    except Exception as e:
        return f"Error scheduling reminder: {str(e)}"
    finally:
        db.close()

if __name__ == "__main__":
    # Run the server
    mcp.run()
