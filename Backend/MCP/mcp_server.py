"""
Aviral — Agentic AI Nurse: MCP Server
======================================
Model Context Protocol server exposing 26 tools across 7 categories
with full RBAC (Role-Based Access Control) authentication.

Run:   python -m MCP.mcp_server
Test:  python -m MCP.mcp_client

Architecture:
  - Agents connect via stdio transport
  - Authentication is handled automatically via the MCP_AUTH_TOKEN environment variable
  - Each tool call is checked against the user's role encoded in the token
  - Permissions mirror the FastAPI route guards exactly
"""

from mcp.server.fastmcp import FastMCP, Context
import sys
import os
import json
import logging
import io
import contextlib
import asyncio
import uuid as uuid_mod
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime, date, timedelta
from contextlib import contextmanager

# ──────────────────────────────────────────────────────────────────────
# Path Setup (using pathlib, matching Platform/main.py pattern)
# ──────────────────────────────────────────────────────────────────────
current_file = Path(__file__).resolve()
mcp_dir = current_file.parent            # Backend/MCP
backend_dir = mcp_dir.parent             # Backend
shared_dir = backend_dir / "Shared"
ai_agents_dir = shared_dir / "AI_Agents"
platform_dir = backend_dir / "Platform"

sys.path.insert(0, str(shared_dir))
sys.path.insert(0, str(ai_agents_dir))
sys.path.insert(0, str(platform_dir))

# Load .env from Backend directory
from dotenv import load_dotenv
load_dotenv(dotenv_path=backend_dir / ".env")

# ──────────────────────────────────────────────────────────────────────
# Project Imports
# ──────────────────────────────────────────────────────────────────────
from database.session import SessionLocal
from database.models import (
    User, UserRole, Patient, monitoring_logs, ai_assesments, alerts,
    AgentInteraction, Reminder, MedicationLog, DailyTask,
    DoctorRecommendation, CaretakerPatientLink,
    MonitoringCheckIn, MonitoringQuestion, MonitoringResponse,
    TelemetryLog, DeviceToken, NotificationLog,
)
# Medical agent imports are deferred inside specific tools to prevent CrewAI startup crashes

# Auth utilities (reuse the exact same password verification)
from auth.security import verify_password

# ──────────────────────────────────────────────────────────────────────
# Logging
# ──────────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mcp_server")

# ──────────────────────────────────────────────────────────────────────
# Initialize FastMCP Server
# ──────────────────────────────────────────────────────────────────────
mcp = FastMCP(
    "Aviral — Agentic AI Nurse",
    instructions=(
        "You are connected to the Aviral AI Nurse platform. "
        "Your access is restricted based on the token provided in MCP_AUTH_TOKEN. "
        "Attempting to use tools outside your role will be denied."
    ),
)

# ──────────────────────────────────────────────────────────────────────
# Database Session Helper
# ──────────────────────────────────────────────────────────────────────
@contextmanager
def get_db():
    """Context manager for database sessions with guaranteed cleanup."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ══════════════════════════════════════════════════════════════════════
#  RBAC AUTHENTICATION LAYER
# ══════════════════════════════════════════════════════════════════════

# In-memory session state (Lazy-loaded from MCP_AUTH_TOKEN)
_auth_state: Dict[str, Any] = {
    "initialized": False,
    "is_authenticated": False,
    "user_id": None,
    "email": None,
    "role": None,
    "patient_id": None,
    "full_name": None,
}


def _init_auth_state():
    """Reads the JWT token from environment and initializes auth state."""
    global _auth_state
    if _auth_state.get("initialized"):
        return

    _auth_state["initialized"] = True
    token = os.getenv("MCP_AUTH_TOKEN")
    
    if not token:
        logger.error("MCP_AUTH_TOKEN environment variable not set. All tool calls will be denied.")
        return

    from auth.security import decode_token
    payload = decode_token(token)
    
    if not payload:
        logger.error("Invalid or expired MCP_AUTH_TOKEN.")
        return

    user_id = payload.get("sub")
    if not user_id:
        return

    # Look up user to get patient_id and full_name
    with get_db() as db:
        user = db.query(User).filter(User.id == user_id).first()
        if not user or not user.is_active:
            logger.error("User not found or inactive.")
            return

        _auth_state.update({
            "is_authenticated": True,
            "user_id": str(user.id),
            "email": user.email,
            "role": user.role.value,
            "patient_id": str(user.patient_id) if user.patient_id else None,
            "full_name": user.full_name,
        })
        logger.info(f"MCP Auth: {user.email} ({user.role.value}) authenticated automatically via Token.")


def _require_auth(allowed_roles: List[str] = None) -> Optional[str]:
    """
    Check if the current session is authenticated and authorized.
    Returns None if OK, or an error message string if denied.
    """
    _init_auth_state()

    if not _auth_state["is_authenticated"]:
        return "❌ Authentication required. Please provide a valid JWT token in the MCP_AUTH_TOKEN environment variable."

    if allowed_roles and _auth_state["role"] not in allowed_roles:
        return (
            f"❌ Access denied. Your role ({_auth_state['role']}) is not permitted for this tool. "
            f"Required: {', '.join(allowed_roles)}"
        )

    return None  # All good


def _check_patient_access(patient_id: str) -> Optional[str]:
    """
    For PATIENT and CARETAKER roles, verify they can access the given patient_id.
    Returns None if OK, or an error message if denied.
    Staff roles (ADMIN, NURSE, DOCTOR) always pass.
    """
    role = _auth_state["role"]

    if role in ["ADMIN", "NURSE", "DOCTOR"]:
        return None  # Staff have unrestricted patient access

    if role == "PATIENT":
        if str(_auth_state["patient_id"]) != str(patient_id):
            return "❌ Access denied. You can only access your own patient data."
        return None

    if role == "CARETAKER":
        with get_db() as db:
            link = db.query(CaretakerPatientLink).filter(
                CaretakerPatientLink.caretaker_id == _auth_state["user_id"],
                CaretakerPatientLink.patient_id == patient_id,
            ).first()
            if not link:
                return "❌ Access denied. You are not linked to this patient."
        return None

    return "❌ Access denied. Unknown role."


# ══════════════════════════════════════════════════════════════════════
#  CATEGORY 1: PATIENT MANAGEMENT (5 tools)
# ══════════════════════════════════════════════════════════════════════

@mcp.tool()
async def list_patients(limit: int = 50) -> str:
    """
    List all patients in the system.
    Requires: ADMIN, NURSE, or DOCTOR role.

    Args:
        limit: Maximum number of patients to return (default 50).
    """
    auth_err = _require_auth(["ADMIN", "NURSE", "DOCTOR"])
    if auth_err:
        return auth_err

    with get_db() as db:
        patients = db.query(Patient).limit(limit).all()
        result = []
        for p in patients:
            result.append({
                "id": str(p.id),
                "name": p.name,
                "age": p.age,
                "gender": p.gender,
                "contact_number": p.contact_number,
                "known_conditions": p.known_conditions,
                "condition_tags": p.condition_tags or [],
                "assigned_doctor": p.assigned_doctor,
            })
        return json.dumps(result, indent=2, default=str)


@mcp.tool()
async def get_patient(patient_id: str) -> str:
    """
    Get a specific patient's full profile.
    Requires authentication. PATIENT can only view own record, CARETAKER only linked patients.

    Args:
        patient_id: UUID of the patient.
    """
    auth_err = _require_auth(["ADMIN", "NURSE", "DOCTOR", "PATIENT", "CARETAKER"])
    if auth_err:
        return auth_err

    access_err = _check_patient_access(patient_id)
    if access_err:
        return access_err

    with get_db() as db:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return "❌ Patient not found."

        return json.dumps({
            "id": str(patient.id),
            "name": patient.name,
            "age": patient.age,
            "gender": patient.gender,
            "contact_number": patient.contact_number,
            "known_conditions": patient.known_conditions,
            "reported_symptoms": patient.reported_symptoms,
            "current_medications": patient.current_medications,
            "condition_tags": patient.condition_tags or [],
            "assigned_doctor": patient.assigned_doctor,
            "next_appointment_date": str(patient.next_appointment_date) if patient.next_appointment_date else None,
            "last_latitude": patient.last_latitude,
            "last_longitude": patient.last_longitude,
            "created_at": str(patient.created_at),
            "updated_at": str(patient.updated_at),
        }, indent=2, default=str)


@mcp.tool()
async def create_patient(
    name: str,
    age: int,
    gender: str,
    contact_number: str,
    known_conditions: str = "{}",
    reported_symptoms: str = "{}",
    assigned_doctor: str = None,
    current_medications: str = None,
) -> str:
    """
    Register a new patient in the system.
    Requires: ADMIN or NURSE role.

    Args:
        name: Patient's full name.
        age: Patient's age.
        gender: Gender (Male/Female/Other).
        contact_number: Phone number.
        known_conditions: JSON string of known conditions (e.g. '{"conditions": ["hypertension"]}').
        reported_symptoms: JSON string of reported symptoms.
        assigned_doctor: Name of the assigned doctor (optional).
        current_medications: JSON string of current medications (optional).
    """
    auth_err = _require_auth(["ADMIN", "NURSE"])
    if auth_err:
        return auth_err

    with get_db() as db:
        # Check duplicate
        existing = db.query(Patient).filter(Patient.contact_number == contact_number).first()
        if existing:
            return f"❌ Patient with contact number {contact_number} already exists (ID: {existing.id})."

        try:
            conditions_json = json.loads(known_conditions) if isinstance(known_conditions, str) else known_conditions
        except json.JSONDecodeError:
            conditions_json = {"conditions": known_conditions}

        try:
            symptoms_json = json.loads(reported_symptoms) if isinstance(reported_symptoms, str) else reported_symptoms
        except json.JSONDecodeError:
            symptoms_json = {"symptoms": reported_symptoms}

        meds_json = None
        if current_medications:
            try:
                meds_json = json.loads(current_medications)
            except json.JSONDecodeError:
                meds_json = {"medications": current_medications}

        new_patient = Patient(
            name=name,
            age=age,
            gender=gender,
            contact_number=contact_number,
            known_conditions=conditions_json,
            reported_symptoms=symptoms_json,
            assigned_doctor=assigned_doctor,
            current_medications=meds_json,
        )
        db.add(new_patient)
        db.commit()
        db.refresh(new_patient)

        return f"✅ Patient created successfully.\n  ID: {new_patient.id}\n  Name: {name}"


@mcp.tool()
async def update_patient(
    patient_id: str,
    name: str = None,
    age: int = None,
    gender: str = None,
    contact_number: str = None,
    known_conditions: str = None,
    assigned_doctor: str = None,
    current_medications: str = None,
) -> str:
    """
    Update a patient's information.
    Requires: ADMIN or NURSE role.

    Args:
        patient_id: UUID of the patient to update.
        name: New name (optional).
        age: New age (optional).
        gender: New gender (optional).
        contact_number: New contact number (optional).
        known_conditions: New conditions as JSON string (optional).
        assigned_doctor: New assigned doctor (optional).
        current_medications: New medications as JSON string (optional).
    """
    auth_err = _require_auth(["ADMIN", "NURSE"])
    if auth_err:
        return auth_err

    with get_db() as db:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return "❌ Patient not found."

        if name:
            patient.name = name
        if age:
            patient.age = age
        if gender:
            patient.gender = gender
        if contact_number:
            patient.contact_number = contact_number
        if known_conditions:
            try:
                patient.known_conditions = json.loads(known_conditions)
            except json.JSONDecodeError:
                patient.known_conditions = {"conditions": known_conditions}
        if assigned_doctor:
            patient.assigned_doctor = assigned_doctor
        if current_medications:
            try:
                patient.current_medications = json.loads(current_medications)
            except json.JSONDecodeError:
                patient.current_medications = {"medications": current_medications}

        patient.updated_at = datetime.utcnow()
        db.commit()

        return f"✅ Patient {patient.name} (ID: {patient_id}) updated successfully."


@mcp.tool()
async def get_patient_vitals_history(patient_id: str, limit: int = 20) -> str:
    """
    Fetch vitals monitoring history for a patient.
    Requires authentication. Scoped access for PATIENT/CARETAKER.

    Args:
        patient_id: UUID of the patient.
        limit: Max number of records to return (default 20).
    """
    auth_err = _require_auth(["ADMIN", "NURSE", "DOCTOR", "PATIENT", "CARETAKER"])
    if auth_err:
        return auth_err

    access_err = _check_patient_access(patient_id)
    if access_err:
        return access_err

    with get_db() as db:
        logs = db.query(monitoring_logs).filter(
            monitoring_logs.patient_id == patient_id
        ).order_by(monitoring_logs.created_at.desc()).limit(limit).all()

        result = []
        for log in logs:
            result.append({
                "id": str(log.id),
                "blood_pressure": log.blood_pressure,
                "heart_rate": log.heart_rate,
                "blood_sugar": log.blood_sugar,
                "meds_taken": log.meds_taken,
                "sleep_hours": log.sleep_hours,
                "symptoms": log.symptoms,
                "created_at": str(log.created_at),
            })
        return json.dumps(result, indent=2, default=str)


# ══════════════════════════════════════════════════════════════════════
#  CATEGORY 2: AI ANALYSIS & INTELLIGENCE (5 tools)
# ══════════════════════════════════════════════════════════════════════

def _run_crew_agent_safely(crew_fn):
    """Helper to run CrewAI operations with stdout/stderr capture."""
    f_out = io.StringIO()
    f_err = io.StringIO()
    with contextlib.redirect_stdout(f_out), contextlib.redirect_stderr(f_err):
        result = crew_fn()
    return result


@mcp.tool()
async def run_full_analysis(
    patient_id: str,
    blood_pressure: str,
    heart_rate: str,
    blood_sugar: str,
    meds_taken: bool,
    known_conditions: str,
    initial_symptoms: str,
    current_medications: str = None,
    sleep_hours: int = None,
) -> str:
    """
    Trigger the complete 5-agent AI analysis pipeline for a patient.
    WARNING: This takes 2-5 minutes due to multi-agent processing and Groq rate limits.
    Requires: ADMIN, NURSE, DOCTOR, or PATIENT role.

    Args:
        patient_id: UUID of the patient.
        blood_pressure: e.g. "120/80".
        heart_rate: e.g. "75".
        blood_sugar: e.g. "110".
        meds_taken: Whether patient took medications.
        known_conditions: Known medical conditions.
        initial_symptoms: Current symptoms being reported.
        current_medications: List of current medications (optional).
        sleep_hours: Hours of sleep (optional).
    """
    auth_err = _require_auth(["ADMIN", "NURSE", "DOCTOR", "PATIENT"])
    if auth_err:
        return auth_err

    with get_db() as db:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return "❌ Patient not found."

        # Build crew input
        formatted_input = (
            f"Analyze this PATIENT DATA:\n\n"
            f"[CURRENT VITALS & CLINICAL STATUS]\n"
            f"Name: {patient.name}\n"
            f"Age: {patient.age}\n"
            f"Gender: {patient.gender}\n"
            f"Blood Pressure: {blood_pressure}\n"
            f"Heart Rate: {heart_rate}\n"
            f"Blood Sugar: {blood_sugar}\n"
            f"Meds Taken (Self-Reported): {meds_taken}\n"
            f"Known Conditions: {known_conditions}\n"
            f"Current Medications List: {current_medications}\n"
            f"Reported Symptoms: {initial_symptoms}\n"
        )

        try:
            from medical_agents.crew import MedicalCrew
            medical_crew = MedicalCrew(patient_id=str(patient_id))
            crew_result = await asyncio.to_thread(
                lambda: _run_crew_agent_safely(lambda: medical_crew.run(formatted_input))
            )
            return json.dumps(crew_result, indent=2, default=str)
        except Exception as e:
            return f"❌ Analysis failed: {str(e)}"


@mcp.tool()
async def check_analysis_status(patient_id: str) -> str:
    """
    Check the status of an AI analysis (RUNNING, WAITING_FOR_INPUT, COMPLETED, FAILED).
    Requires authentication.

    Args:
        patient_id: UUID of the patient.
    """
    auth_err = _require_auth(["ADMIN", "NURSE", "DOCTOR", "PATIENT", "CARETAKER"])
    if auth_err:
        return auth_err

    with get_db() as db:
        # Check for pending HITL interactions
        pending = db.query(AgentInteraction).filter(
            AgentInteraction.patient_id == patient_id,
            AgentInteraction.status == "PENDING"
        ).order_by(AgentInteraction.created_at.desc()).first()

        if pending:
            return json.dumps({
                "status": "WAITING_FOR_INPUT",
                "interaction_id": str(pending.id),
                "question": pending.question,
                "created_at": str(pending.created_at),
            }, indent=2)

        # Check for completed assessment
        latest_log = db.query(monitoring_logs).filter(
            monitoring_logs.patient_id == patient_id
        ).order_by(monitoring_logs.created_at.desc()).first()

        if latest_log:
            assessment = db.query(ai_assesments).filter(
                ai_assesments.patient_id == patient_id,
                ai_assesments.created_at >= latest_log.created_at
            ).first()

            if assessment:
                return json.dumps({
                    "status": "COMPLETED",
                    "risk_level": assessment.risk_level,
                    "risk_score": assessment.risk_score,
                    "reasoning": assessment.reasoning,
                }, indent=2, default=str)

            return json.dumps({"status": "RUNNING"})

        return json.dumps({
            "status": "COMPLETED",
            "risk_level": "STABLE",
            "risk_score": 0,
            "reasoning": "No active analysis. Patient has never had a checkup.",
        })


@mcp.tool()
async def analyze_vitals(vitals_json: str) -> str:
    """
    Run the Vital Analysis Agent on a vitals payload.
    This is a standalone agent — does NOT require a patient_id.
    Requires authentication.

    Args:
        vitals_json: JSON string of vital signs (e.g. '{"heart_rate": 100, "bp": "120/80", "blood_sugar": "110"}').
    """
    auth_err = _require_auth(["ADMIN", "NURSE", "DOCTOR", "PATIENT", "CARETAKER"])
    if auth_err:
        return auth_err

    try:
        from crewai import Agent, Task, Crew
        from medical_agents.agents import MedicalAgents

        vitals_data = json.loads(vitals_json) if isinstance(vitals_json, str) else vitals_json
        agents = MedicalAgents()
        analyzer_agent = agents.vital_analysis_agent()
        analyzer_agent.verbose = False

        task = Task(
            description=f"Analyze the following vital signs: {vitals_data}.\nProvide a detailed analysis report immediately.",
            expected_output="A detailed analysis report including status (NORMAL, WARNING, CRITICAL) and observations.",
            agent=analyzer_agent,
        )

        crew = Crew(agents=[analyzer_agent], tasks=[task], verbose=False)

        result = await asyncio.to_thread(
            lambda: _run_crew_agent_safely(lambda: crew.kickoff())
        )

        return result.raw if hasattr(result, "raw") else str(result)
    except Exception as e:
        return f"❌ Error analyzing vitals: {str(e)}"


@mcp.tool()
async def run_risk_assessment(case_context: str) -> str:
    """
    Run the Risk Assessment Agent on aggregated case context.
    Requires authentication.

    Args:
        case_context: Summary of vitals, patient answers, and any other relevant info.
    """
    auth_err = _require_auth(["ADMIN", "NURSE", "DOCTOR", "PATIENT", "CARETAKER"])
    if auth_err:
        return auth_err

    try:
        from crewai import Agent, Task, Crew
        from medical_agents.agents import MedicalAgents

        agents = MedicalAgents()
        risk_agent = agents.risk_assessment_agent()
        risk_agent.verbose = False

        task = Task(
            description=f"Assess the health risk level based on this context: {case_context}.\nProvide your assessment immediately.",
            expected_output="Risk level (LOW/MODERATE/HIGH/CRITICAL) with detailed justification.",
            agent=risk_agent,
        )

        crew = Crew(agents=[risk_agent], tasks=[task], verbose=False)

        result = await asyncio.to_thread(
            lambda: _run_crew_agent_safely(lambda: crew.kickoff())
        )

        return result.raw if hasattr(result, "raw") else str(result)
    except Exception as e:
        return f"❌ Error running risk assessment: {str(e)}"


@mcp.tool()
async def consult_knowledge_base(query: str, collection_type: str = "clinical") -> str:
    """
    Semantic search across the medical knowledge bases using RAG (ChromaDB).
    Requires authentication.

    Args:
        query: The medical topic, symptom, or condition to search for.
        collection_type: Which knowledge base to search — "clinical" (protocols), "task" (daily routines), or "monitoring" (check-in protocols).
    """
    auth_err = _require_auth(["ADMIN", "NURSE", "DOCTOR", "PATIENT", "CARETAKER"])
    if auth_err:
        return auth_err

    try:
        from medical_agents.rag_manager import RAGManager
        rag = RAGManager()
        result = rag.search(query, collection_type=collection_type)
        return result
    except Exception as e:
        return f"❌ Error searching knowledge base: {str(e)}"


# ══════════════════════════════════════════════════════════════════════
#  CATEGORY 3: HEALTH MONITORING & DASHBOARD (4 tools)
# ══════════════════════════════════════════════════════════════════════

@mcp.tool()
async def get_dashboard_stats() -> str:
    """
    Get overview dashboard statistics: total patients, critical alerts, active monitoring, completed today.
    Requires: ADMIN, NURSE, or DOCTOR role.
    """
    auth_err = _require_auth(["ADMIN", "NURSE", "DOCTOR"])
    if auth_err:
        return auth_err

    with get_db() as db:
        total_patients = db.query(Patient).count()
        critical_alerts = db.query(alerts).filter(alerts.call_received == False).count()
        active_monitoring = db.query(AgentInteraction).filter(AgentInteraction.status == "PENDING").count()

        today_start = datetime.combine(date.today(), datetime.min.time())
        completed_today = db.query(ai_assesments).filter(ai_assesments.created_at >= today_start).count()

        # Recent activity
        recent = db.query(ai_assesments, Patient.name).join(
            Patient, ai_assesments.patient_id == Patient.id
        ).order_by(ai_assesments.created_at.desc()).limit(5).all()

        activity = []
        for assessment, patient_name in recent:
            activity.append({
                "patient_name": patient_name,
                "risk_level": assessment.risk_level,
                "risk_score": assessment.risk_score,
                "time": str(assessment.created_at),
            })

        return json.dumps({
            "total_patients": total_patients,
            "critical_alerts": critical_alerts,
            "active_monitoring": active_monitoring,
            "completed_today": completed_today,
            "recent_activity": activity,
        }, indent=2, default=str)


@mcp.tool()
async def get_health_summary(patient_id: str) -> str:
    """
    Get a comprehensive aggregated health summary for a patient.
    Includes: health score, risk data, vitals, medication adherence, tasks, alerts, and recommendations.
    Requires authentication. Scoped access for PATIENT/CARETAKER.

    Args:
        patient_id: UUID of the patient.
    """
    auth_err = _require_auth(["ADMIN", "NURSE", "DOCTOR", "PATIENT", "CARETAKER"])
    if auth_err:
        return auth_err

    access_err = _check_patient_access(patient_id)
    if access_err:
        return access_err

    # Reuse the patient_context builder for a compact summary
    try:
        from routes.patient_context import build_patient_context
        with get_db() as db:
            context = build_patient_context(patient_id, db)
            if "error" in context:
                return f"❌ {context['error']}"
            return json.dumps(context, indent=2, default=str)
    except Exception as e:
        return f"❌ Error building health summary: {str(e)}"


@mcp.tool()
async def get_assessment_history(patient_id: str, limit: int = 10) -> str:
    """
    Get AI risk assessment history for a patient.
    Requires authentication. Scoped access for PATIENT/CARETAKER.

    Args:
        patient_id: UUID of the patient.
        limit: Max number of assessments to return (default 10).
    """
    auth_err = _require_auth(["ADMIN", "NURSE", "DOCTOR", "PATIENT", "CARETAKER"])
    if auth_err:
        return auth_err

    access_err = _check_patient_access(patient_id)
    if access_err:
        return access_err

    with get_db() as db:
        history = db.query(ai_assesments).filter(
            ai_assesments.patient_id == patient_id
        ).order_by(ai_assesments.created_at.desc()).limit(limit).all()

        result = []
        for a in history:
            result.append({
                "id": str(a.id),
                "risk_score": a.risk_score,
                "risk_level": a.risk_level,
                "reasoning": a.reasoning,
                "created_at": str(a.created_at),
            })
        return json.dumps(result, indent=2, default=str)


@mcp.tool()
async def ingest_telemetry(
    patient_id: str,
    heart_rate: int = None,
    blood_pressure: str = None,
    spo2: int = None,
) -> str:
    """
    Push continuous vitals data with automatic anomaly detection.
    Used for real-time monitoring from wearable devices or n8n webhooks.
    Requires authentication.

    Args:
        patient_id: UUID of the patient.
        heart_rate: Heart rate in BPM (optional).
        blood_pressure: BP as "systolic/diastolic" (optional).
        spo2: Blood oxygen saturation percentage (optional).
    """
    auth_err = _require_auth(["ADMIN", "NURSE", "DOCTOR", "PATIENT", "CARETAKER"])
    if auth_err:
        return auth_err

    with get_db() as db:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return "❌ Patient not found."

        log = TelemetryLog(
            patient_id=patient_id,
            heart_rate=heart_rate,
            blood_pressure=blood_pressure,
            spo2=spo2,
        )
        db.add(log)
        db.commit()

        # Check anomalies
        try:
            from severity_engine import check_telemetry_anomalies, evaluate_vitals_severity
            is_anomaly = check_telemetry_anomalies(patient_id, db)

            if is_anomaly:
                severity = evaluate_vitals_severity(heart_rate, blood_pressure, spo2)
                return json.dumps({
                    "status": "alert_triggered",
                    "severity": severity,
                    "message": f"⚠️ Sustained anomaly detected for {patient.name}!",
                })
        except Exception as e:
            logger.warning(f"Anomaly check failed: {e}")

        return json.dumps({"status": "ok", "alert_triggered": False})


# ══════════════════════════════════════════════════════════════════════
#  CATEGORY 4: MEDICATION MANAGEMENT (4 tools)
# ══════════════════════════════════════════════════════════════════════

@mcp.tool()
async def schedule_medication_reminder(
    medicine_name: str,
    dosage: str,
    schedule_time: str,
    patient_id: str = None,
    remaining_count: int = 0,
) -> str:
    """
    Create a medication reminder and optionally trigger WhatsApp notification via n8n.
    Requires: ADMIN, NURSE, or PATIENT (own only).

    Args:
        medicine_name: Name of the medication.
        dosage: Dosage instruction (e.g. "500mg").
        schedule_time: Time in HH:MM format (24h).
        patient_id: UUID of the patient (optional for PATIENT role).
        remaining_count: Initial stock count (default 0).
    """
    auth_err = _require_auth(["ADMIN", "NURSE", "PATIENT"])
    if auth_err:
        return auth_err

    # Auto-fill patient_id for PATIENT role
    if not patient_id:
        if _auth_state["role"] == "PATIENT":
            patient_id = _auth_state["patient_id"]
        else:
            return "❌ patient_id is required for your role."

    if _auth_state["role"] == "PATIENT":
        access_err = _check_patient_access(patient_id)
        if access_err:
            return access_err

    with get_db() as db:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return "❌ Patient not found."

        new_reminder = Reminder(
            patient_id=patient_id,
            medicine_name=medicine_name,
            dosage=dosage,
            schedule_time=schedule_time,
            remaining_count=remaining_count,
            is_active=True,
        )
        db.add(new_reminder)
        db.commit()
        db.refresh(new_reminder)

        reminder_id = str(new_reminder.id)

        # Trigger n8n webhook (fire and forget)
        webhook_url = os.getenv("N8N_REMINDER_WEBHOOK")
        webhook_status = "No webhook configured"

        if webhook_url:
            try:
                import httpx
                payload = {
                    "action": "create",
                    "reminder_id": reminder_id,
                    "patient_name": patient.name,
                    "phone_number": patient.contact_number,
                    "medicine_name": medicine_name,
                    "dosage": dosage,
                    "schedule_time": schedule_time,
                    "is_active": True,
                }
                async with httpx.AsyncClient() as client:
                    await client.post(webhook_url, json=payload, timeout=5.0)
                    webhook_status = "Webhook triggered successfully"
            except Exception as we:
                webhook_status = f"Webhook failed: {we}"

        return f"✅ Reminder scheduled (ID: {reminder_id}). {webhook_status}"


@mcp.tool()
async def get_medication_history(patient_id: str, today_only: bool = False, limit: int = 30) -> str:
    """
    Get medication adherence logs for a patient.
    Requires authentication. Scoped access for PATIENT/CARETAKER.

    Args:
        patient_id: UUID of the patient.
        today_only: If True, only return today's medications.
        limit: Max records to return (default 30).
    """
    auth_err = _require_auth(["ADMIN", "NURSE", "DOCTOR", "PATIENT", "CARETAKER"])
    if auth_err:
        return auth_err

    access_err = _check_patient_access(patient_id)
    if access_err:
        return access_err

    with get_db() as db:
        query = db.query(MedicationLog).filter(MedicationLog.patient_id == patient_id)

        if today_only:
            now = datetime.utcnow()
            today_start = datetime.combine(now.date(), datetime.min.time())
            today_end = datetime.combine(now.date(), datetime.max.time())
            query = query.filter(
                MedicationLog.scheduled_time >= today_start,
                MedicationLog.scheduled_time <= today_end,
            )

        logs = query.order_by(MedicationLog.scheduled_time.desc()).limit(limit).all()

        result = []
        for log in logs:
            result.append({
                "id": str(log.id),
                "medicine_name": log.medicine_name,
                "scheduled_time": str(log.scheduled_time),
                "taken_at": str(log.taken_at) if log.taken_at else None,
                "status": log.status,
                "status_patient": log.status_patient,
                "status_caretaker": log.status_caretaker,
            })
        return json.dumps(result, indent=2, default=str)


@mcp.tool()
async def update_medication_status(
    log_id: str,
    status_patient: str = None,
    status_caretaker: str = None,
) -> str:
    """
    Update a medication log's status.
    PATIENT can set status_patient (TAKEN/SKIPPED). CARETAKER/staff set status_caretaker (CONFIRMED_TAKEN/CONFIRMED_SKIPPED).
    Requires authentication. Scoped access.

    Args:
        log_id: UUID of the medication log entry.
        status_patient: Patient's self-report (TAKEN, SKIPPED). Only for PATIENT role.
        status_caretaker: Caretaker/staff validation (CONFIRMED_TAKEN, CONFIRMED_SKIPPED).
    """
    auth_err = _require_auth(["ADMIN", "NURSE", "DOCTOR", "PATIENT", "CARETAKER"])
    if auth_err:
        return auth_err

    with get_db() as db:
        log_entry = db.query(MedicationLog).filter(MedicationLog.id == log_id).first()
        if not log_entry:
            return "❌ Medication log entry not found."

        # Scoped access check
        access_err = _check_patient_access(str(log_entry.patient_id))
        if access_err:
            return access_err

        role = _auth_state["role"]
        old_status = log_entry.status

        if role == "PATIENT":
            if status_patient:
                log_entry.status_patient = status_patient
        else:
            if status_caretaker:
                log_entry.status_caretaker = status_caretaker

        # Auto-resolve the main status field
        if log_entry.status_caretaker == "CONFIRMED_TAKEN":
            resolved = "TAKEN"
        elif log_entry.status_caretaker == "CONFIRMED_SKIPPED":
            resolved = "SKIPPED"
        elif log_entry.status_patient == "TAKEN":
            resolved = "TAKEN"
        elif log_entry.status_patient == "SKIPPED":
            resolved = "SKIPPED"
        else:
            resolved = "PENDING"

        log_entry.status = resolved

        if resolved == "TAKEN" and not log_entry.taken_at:
            log_entry.taken_at = datetime.utcnow()
        elif resolved != "TAKEN":
            log_entry.taken_at = None

        # Adjust reminder stock count
        reminder = db.query(Reminder).filter(
            Reminder.patient_id == log_entry.patient_id,
            Reminder.medicine_name == log_entry.medicine_name,
            Reminder.is_active == True,
        ).first()

        if reminder:
            if old_status != "TAKEN" and resolved == "TAKEN":
                reminder.remaining_count = max(0, reminder.remaining_count - 1)
            elif old_status == "TAKEN" and resolved != "TAKEN":
                reminder.remaining_count += 1

        db.commit()
        return f"✅ Medication log updated. Status: {resolved}"


@mcp.tool()
async def get_patient_reminders(patient_id: str) -> str:
    """
    Get all active medication reminders for a patient.
    Requires authentication. Scoped access for PATIENT/CARETAKER.

    Args:
        patient_id: UUID of the patient.
    """
    auth_err = _require_auth(["ADMIN", "NURSE", "DOCTOR", "PATIENT", "CARETAKER"])
    if auth_err:
        return auth_err

    access_err = _check_patient_access(patient_id)
    if access_err:
        return access_err

    with get_db() as db:
        reminders = db.query(Reminder).filter(
            Reminder.patient_id == patient_id,
            Reminder.is_active == True,
        ).all()

        result = []
        for r in reminders:
            result.append({
                "id": str(r.id),
                "medicine_name": r.medicine_name,
                "dosage": r.dosage,
                "schedule_time": r.schedule_time,
                "remaining_count": r.remaining_count,
                "is_active": r.is_active,
            })
        return json.dumps(result, indent=2, default=str)


# ══════════════════════════════════════════════════════════════════════
#  CATEGORY 5: DAILY TASKS & HEALTH PLANS (3 tools)
# ══════════════════════════════════════════════════════════════════════

@mcp.tool()
async def get_daily_tasks(patient_id: str, target_date: str = None) -> str:
    """
    Get a patient's daily tasks for today or a specific date.
    Requires authentication.

    Args:
        patient_id: UUID of the patient.
        target_date: Date in YYYY-MM-DD format (optional, defaults to today).
    """
    auth_err = _require_auth(["ADMIN", "NURSE", "DOCTOR", "PATIENT", "CARETAKER"])
    if auth_err:
        return auth_err

    if target_date:
        try:
            td = datetime.strptime(target_date, "%Y-%m-%d").date()
        except ValueError:
            return "❌ Invalid date format. Use YYYY-MM-DD."
    else:
        td = date.today()

    start_of_day = datetime.combine(td, datetime.min.time())
    end_of_day = datetime.combine(td, datetime.max.time())

    with get_db() as db:
        tasks = db.query(DailyTask).filter(
            DailyTask.patient_id == patient_id,
            DailyTask.scheduled_date >= start_of_day,
            DailyTask.scheduled_date <= end_of_day,
        ).all()

        result = []
        for t in tasks:
            result.append({
                "id": str(t.id),
                "task_description": t.task_description,
                "category": t.category,
                "status_patient": t.status_patient,
                "status_caretaker": t.status_caretaker,
                "source": t.source,
                "priority": t.priority,
                "scheduled_date": str(t.scheduled_date),
            })
        return json.dumps(result, indent=2, default=str)


@mcp.tool()
async def generate_daily_health_plan(patient_id: str) -> str:
    """
    AI-generate a personalized daily health plan for a patient using the Task Planner Agent.
    WARNING: This takes 1-3 minutes. Generates tasks for Diet, Exercise, Lifestyle, and Medication.
    Requires authentication.

    Args:
        patient_id: UUID of the patient.
    """
    auth_err = _require_auth(["ADMIN", "NURSE", "DOCTOR", "PATIENT", "CARETAKER"])
    if auth_err:
        return auth_err

    with get_db() as db:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return "❌ Patient not found."

        # Check if tasks already exist today
        today_start = datetime.combine(date.today(), datetime.min.time())
        today_end = datetime.combine(date.today(), datetime.max.time())
        existing = db.query(DailyTask).filter(
            DailyTask.patient_id == patient_id,
            DailyTask.scheduled_date >= today_start,
            DailyTask.scheduled_date <= today_end,
            DailyTask.source.in_(["AI_GENERATED", "KB_BASELINE", "SMART_REMEDIATION"]),
        ).count()

        if existing > 0:
            return "❌ Tasks already generated for today. Use a different date or regenerate via the web UI."

    try:
        from routes.patient_context import build_patient_context

        with get_db() as db:
            context = build_patient_context(patient_id, db)
            if "error" in context:
                return f"❌ {context['error']}"

            patient_data_str = json.dumps(context, default=str)

        from medical_agents.crew import MedicalCrew
        crew = MedicalCrew(patient_id=str(patient_id))
        result = await asyncio.to_thread(
            lambda: _run_crew_agent_safely(lambda: crew.run_planning_crew(patient_data_str))
        )

        output_str = str(result)
        try:
            start = output_str.find("[")
            end = output_str.rfind("]") + 1
            if start != -1 and end > 0:
                json_content = json.loads(output_str[start:end])
            else:
                json_content = json.loads(output_str)
        except Exception as e:
            return f"❌ AI output parse error: {e}. Raw: {output_str[:200]}..."

        # Save tasks to DB
        with get_db() as db:
            generated_tasks = []
            today = date.today()

            for item in json_content:
                valid_sources = {"AI_GENERATED", "KB_BASELINE", "SMART_REMEDIATION"}
                source = item.get("source", "AI_GENERATED")
                source = source if source in valid_sources else "AI_GENERATED"

                valid_priorities = {"LOW", "NORMAL", "HIGH", "CRITICAL"}
                priority = item.get("priority", "NORMAL")
                priority = priority if priority in valid_priorities else "NORMAL"

                new_task = DailyTask(
                    id=uuid_mod.uuid4(),
                    patient_id=patient_id,
                    task_description=item.get("task_description", "Unnamed Task"),
                    category=item.get("category", "General"),
                    scheduled_date=datetime.combine(today, datetime.min.time()),
                    status_patient="PENDING",
                    status_caretaker="PENDING",
                    source=source,
                    priority=priority,
                )
                db.add(new_task)
                generated_tasks.append({
                    "task": item.get("task_description"),
                    "category": item.get("category"),
                    "source": source,
                    "priority": priority,
                })

            db.commit()

        return json.dumps({
            "message": f"✅ Generated {len(generated_tasks)} tasks for today.",
            "tasks": generated_tasks,
        }, indent=2)

    except Exception as e:
        return f"❌ Error generating health plan: {str(e)}"


@mcp.tool()
async def update_task_status(
    task_id: str,
    status_patient: str = None,
    status_caretaker: str = None,
) -> str:
    """
    Update a daily task's completion status.
    PATIENT sets status_patient (COMPLETED/SKIPPED). CARETAKER/staff sets status_caretaker (VALIDATED/REFUSED).
    Requires authentication.

    Args:
        task_id: UUID of the task.
        status_patient: Patient's self-report (PENDING, COMPLETED, SKIPPED).
        status_caretaker: Caretaker validation (PENDING, VALIDATED, REFUSED).
    """
    auth_err = _require_auth(["ADMIN", "NURSE", "DOCTOR", "PATIENT", "CARETAKER"])
    if auth_err:
        return auth_err

    with get_db() as db:
        task = db.query(DailyTask).filter(DailyTask.id == task_id).first()
        if not task:
            return "❌ Task not found."

        role = _auth_state["role"]

        if role == "PATIENT":
            # Patient can only update their own task status
            access_err = _check_patient_access(str(task.patient_id))
            if access_err:
                return access_err
            if status_patient:
                task.status_patient = status_patient
        else:
            if status_caretaker:
                task.status_caretaker = status_caretaker

        db.commit()
        return f"✅ Task updated. Patient: {task.status_patient}, Caretaker: {task.status_caretaker}"


# ══════════════════════════════════════════════════════════════════════
#  CATEGORY 6: MONITORING & CHECK-INS (2 tools)
# ══════════════════════════════════════════════════════════════════════

@mcp.tool()
async def generate_monitoring_checkin(patient_id: str) -> str:
    """
    AI-generate monitoring check-in questions for a patient based on their condition tags.
    Requires: ADMIN, NURSE, DOCTOR, or CARETAKER role.

    Args:
        patient_id: UUID of the patient.
    """
    auth_err = _require_auth(["ADMIN", "NURSE", "DOCTOR", "CARETAKER"])
    if auth_err:
        return auth_err

    with get_db() as db:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return "❌ Patient not found."

        try:
            from routes.monitoring import generate_check_in_for_patient
            result = generate_check_in_for_patient(patient, db)
            return json.dumps({
                "message": f"✅ Generated {result['question_count']} monitoring questions.",
                "check_in_id": str(result["check_in_id"]),
                "question_count": result["question_count"],
            }, indent=2, default=str)
        except Exception as e:
            db.rollback()
            return f"❌ Error generating check-in: {str(e)}"


@mcp.tool()
async def get_pending_checkin(patient_id: str, target_role: str = "PATIENT") -> str:
    """
    Get pending check-in questions for a patient.
    Requires authentication.

    Args:
        patient_id: UUID of the patient.
        target_role: Which role's questions to fetch — "PATIENT" or "CARETAKER".
    """
    auth_err = _require_auth(["ADMIN", "NURSE", "DOCTOR", "PATIENT", "CARETAKER"])
    if auth_err:
        return auth_err

    target_role = target_role.upper()

    with get_db() as db:
        check_in = db.query(MonitoringCheckIn).filter(
            MonitoringCheckIn.patient_id == patient_id
        ).order_by(MonitoringCheckIn.created_at.desc()).first()

        if not check_in:
            return json.dumps({"check_in_id": None, "questions": []})

        if target_role == "PATIENT" and check_in.status_patient != "PENDING":
            return json.dumps({"check_in_id": None, "questions": [], "note": "Already completed by patient."})
        if target_role == "CARETAKER" and check_in.status_caretaker != "PENDING":
            return json.dumps({"check_in_id": None, "questions": [], "note": "Already completed by caretaker."})

        from sqlalchemy import func
        questions = db.query(MonitoringQuestion).filter(
            MonitoringQuestion.check_in_id == check_in.id,
            func.upper(MonitoringQuestion.target_role) == target_role,
        ).all()

        result = []
        for q in questions:
            result.append({
                "id": str(q.id),
                "text": q.question_text,
                "type": q.response_type,
                "condition_tag": q.condition_tag,
            })

        return json.dumps({
            "check_in_id": str(check_in.id),
            "questions": result,
        }, indent=2, default=str)


# ══════════════════════════════════════════════════════════════════════
#  CATEGORY 7: ALERTS & ESCALATION (2 tools)
# ══════════════════════════════════════════════════════════════════════

@mcp.tool()
async def escalate_to_doctor(patient_id: str) -> str:
    """
    Trigger emergency escalation to a doctor via n8n/WhatsApp webhook.
    Sends the patient's latest assessment, vitals, missed medications, and incomplete tasks.
    Requires authentication.

    Args:
        patient_id: UUID of the patient.
    """
    auth_err = _require_auth(["ADMIN", "NURSE", "DOCTOR", "PATIENT", "CARETAKER"])
    if auth_err:
        return auth_err

    with get_db() as db:
        assessment = db.query(ai_assesments).filter(
            ai_assesments.patient_id == patient_id
        ).order_by(ai_assesments.created_at.desc()).first()

        if not assessment:
            return "❌ No assessment found for this patient. Run an analysis first."

        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            return "❌ Patient not found."

        risk_level = assessment.risk_level
        risk_score = assessment.risk_score
        reasoning = assessment.reasoning

        summary_text = "MCP Escalation Requested"
        if isinstance(reasoning, dict):
            summary_text = reasoning.get("justification", summary_text)

        # Latest vitals
        latest_log = db.query(monitoring_logs).filter(
            monitoring_logs.patient_id == patient_id
        ).order_by(monitoring_logs.created_at.desc()).first()

        vitals_data = {}
        if latest_log:
            vitals_data = {
                "blood_pressure": latest_log.blood_pressure,
                "heart_rate": latest_log.heart_rate,
                "blood_sugar": latest_log.blood_sugar,
                "meds_taken": latest_log.meds_taken,
            }

        # Missed medications (last 48h)
        since_48h = datetime.utcnow() - timedelta(hours=48)
        missed_logs = db.query(MedicationLog).filter(
            MedicationLog.patient_id == patient_id,
            MedicationLog.created_at >= since_48h,
            MedicationLog.status.in_(["MISSED", "SKIPPED"]),
        ).all()

        missed_meds = [
            {"medicine": log.medicine_name, "scheduled": str(log.scheduled_time), "status": log.status}
            for log in missed_logs
        ]

        # Incomplete tasks (today)
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        incomplete_tasks = db.query(DailyTask).filter(
            DailyTask.patient_id == patient_id,
            DailyTask.scheduled_date >= today_start,
            DailyTask.status_patient != "COMPLETED",
        ).all()

        task_list = [
            {"task": t.task_description, "category": t.category, "status": t.status_patient}
            for t in incomplete_tasks
        ]

        # Trigger n8n webhook
        webhook_url = os.getenv("N8N_ESCALATE_WEBHOOK")
        if not webhook_url:
            return (
                f"⚠️ N8N_ESCALATE_WEBHOOK not configured. Escalation data prepared:\n"
                f"  Risk: {risk_level} ({risk_score})\n"
                f"  Missed meds: {len(missed_meds)}\n"
                f"  Incomplete tasks: {len(task_list)}"
            )

        import requests
        payload = {
            "patient_id": str(patient.id),
            "patient_name": patient.name,
            "patient_phone": patient.contact_number,
            "age": patient.age,
            "risk_level": risk_level,
            "risk_score": risk_score,
            "summary": summary_text,
            "vitals": vitals_data,
            "missed_medications": missed_meds,
            "incomplete_tasks": task_list,
            "triggered_by": _auth_state["full_name"],
            "triggered_via": "MCP Server",
        }

        try:
            response = requests.post(webhook_url, json=payload, timeout=240)
            return f"✅ Escalation triggered. n8n response: {response.status_code}"
        except Exception as e:
            return f"❌ Escalation webhook failed: {str(e)}"


@mcp.tool()
async def get_doctor_recommendations(patient_id: str = None, limit: int = 10) -> str:
    """
    Fetch doctor recommendations/advice. Optionally filter by patient.
    Requires authentication.

    Args:
        patient_id: UUID of a specific patient (optional, returns all if not provided).
        limit: Max number of recommendations to return (default 10).
    """
    auth_err = _require_auth(["ADMIN", "NURSE", "DOCTOR", "PATIENT", "CARETAKER"])
    if auth_err:
        return auth_err

    # If patient-scoped role, enforce access
    if patient_id and _auth_state["role"] in ["PATIENT", "CARETAKER"]:
        access_err = _check_patient_access(patient_id)
        if access_err:
            return access_err

    with get_db() as db:
        query = db.query(DoctorRecommendation)
        if patient_id:
            query = query.filter(DoctorRecommendation.patient_id == patient_id)

        recs = query.order_by(DoctorRecommendation.created_at.desc()).limit(limit).all()

        result = []
        for r in recs:
            result.append({
                "id": str(r.id),
                "patient_id": str(r.patient_id),
                "doctor_name": r.doctor_name,
                "recommendation_summary": r.recommendation_summary,
                "medication_advice": r.medication_advice,
                "escalation_level": r.escalation_level,
                "is_reviewed": r.is_reviewed,
                "created_at": str(r.created_at),
            })
        return json.dumps(result, indent=2, default=str)


# ══════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ══════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    mcp.run()
