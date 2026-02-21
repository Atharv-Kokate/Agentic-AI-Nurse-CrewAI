import json
import logging
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from datetime import datetime
import sys
import os

# Add Shared and AI_Agents to sys.path
from pathlib import Path
current_file = Path(__file__).resolve()
backend_dir = current_file.parent.parent
shared_dir = backend_dir / "Shared"
ai_agents_dir = shared_dir / "AI_Agents"

# Use insert(0) to prioritize our paths over potential system conflicts
sys.path.insert(0, str(shared_dir))
sys.path.insert(0, str(ai_agents_dir))
sys.path.insert(0, str(current_file.parent)) # Add Platform dir to allow 'from auth import ...'

# DEBUG: Print sys.path to logs to verify on deployment
print(f"DEBUG: Current File: {current_file}")
print(f"DEBUG: Backend Dir: {backend_dir}")
print(f"DEBUG: Shared Dir: {shared_dir} (Exists: {shared_dir.exists()})")
print(f"DEBUG: AI_Agents Dir: {ai_agents_dir} (Exists: {ai_agents_dir.exists()})")
print(f"DEBUG: sys.path[0]: {sys.path[0]}")
print(f"DEBUG: sys.path[1]: {sys.path[1]}")

# Database imports
from database.session import engine, Base, get_db, SessionLocal
from database.models import Patient, monitoring_logs, ai_assesments, alerts, AgentInteraction, User, UserRole
from medical_agents.crew import MedicalCrew

# Auth imports
from auth.dependencies import get_current_active_user, require_roles
from auth.security import decode_token

# Route imports
from routes.auth import router as auth_router
from routes.patients import router as patients_router 
from routes.dashboard import router as dashboard_router
from routes.reminders import router as reminders_router
from routes.callbacks import router as callbacks_router
from routes.caretaker import router as caretaker_router
from routes.medications import router as medications_router
from routes.tasks import router as tasks_router
from notifications.router import router as notifications_router
import requests

# Initialize DB tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Agentic AI Nurse API",
    version="1.0.0",
    description="AI-powered patient monitoring and risk assessment system",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Exception Handler for debugging
from fastapi import Request
from fastapi.responses import JSONResponse
import traceback

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_msg = str(exc)
    tb = traceback.format_exc()
    print(f"CRITICAL ERROR: {error_msg}\n{tb}") # Print to server logs
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "error": error_msg, "traceback": tb.splitlines()}
    )

# Include Routers
app.include_router(auth_router)
app.include_router(patients_router)
app.include_router(dashboard_router)
app.include_router(reminders_router)
app.include_router(callbacks_router)
app.include_router(caretaker_router)
app.include_router(medications_router)
app.include_router(tasks_router)
app.include_router(notifications_router)

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("backend_debug.log"),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# --- Pydantic Models ---

class PatientRequest(BaseModel):
    # Patient Demographics (DB: Patient)
    name: str
    age: int
    gender: str
    contact_number: str
    
    # Vitals & Monitoring (DB: monitoring_logs)
    blood_pressure: str
    heart_rate: str
    blood_sugar: str
    meds_taken: bool = Field(..., description="Has the patient taken their medications?")
    sleep_hours: Optional[int] = None
    
    # Clinical Info
    known_conditions: str
    initial_symptoms: str
    current_medications: Optional[str] = None # JSON string or comma separated

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "Async Test Patient",
                    "age": 55,
                    "gender": "Male",
                    "contact_number": "555-ASYNC-001",
                    "blood_pressure": "200/100",
                    "heart_rate": "95",
                    "blood_sugar": "100",
                    "meds_taken": False,
                    "known_conditions": "history of high BP, cardiac failure or heart attack",
                    "initial_symptoms": "difficulties in breathing",
                    "current_medications": "Metformin 500mg, Lisinopril 10mg",
                    "sleep_hours": 6
                }
            ]
        }
    }

class AnalysisInitResponse(BaseModel):
    message: str
    patient_id: str
    status_endpoint: str

class InteractionResponse(BaseModel):
    interaction_id: str
    question: str
    status: str
    created_at: datetime

class StatusResponse(BaseModel):
    status: str # RUNNING, WAITING_FOR_INPUT, COMPLETED, FAILED
    pending_interaction: Optional[InteractionResponse] = None
    result: Optional[Dict[str, Any]] = None
    patient_data: Optional[Dict[str, Any]] = None
    current_location: Optional[Dict[str, float]] = None

class AnswerRequest(BaseModel):
    answer: str

# --- Helper Functions ---

import re

import json_repair

def clean_json_string(json_str: Any) -> Dict[str, Any]:
    """
    Cleans markdown code blocks and handles mixed text/JSON content
    using the robust json_repair library.
    """
    # If already a dict, return it
    if isinstance(json_str, dict):
        return json_str

    if hasattr(json_str, 'raw'):
        json_str = json_str.raw
        
    # Ensure it's a string
    json_str = str(json_str)
    
    # Remove markdown code blocks if present
    # json_repair handles this well usually, but stripping explicitly is safer
    if "```json" in json_str:
        json_str = json_str.split("```json")[1].split("```")[0]
    elif "```" in json_str:
        json_str = json_str.split("```")[1].split("```")[0]
    
    json_str = json_str.strip()

    try:
        # json_repair.loads handles:
        # - Unescaped newlines in strings
        # - Missing closing braces/quotes
        # - Trailing commas
        # - Single quotes
        decoded = json_repair.loads(json_str)
        if isinstance(decoded, dict):
            return decoded
        # Sometimes it returns a string if it couldn't find an object
        logger.warning(f"json_repair returned type {type(decoded)} instead of dict: {decoded}")
        return {}
        
    except Exception as e:
        logger.error(f"json_repair failed: {e}. Input preview: {json_str[:100]}...")
        return {}

# --- WebSocket Manager ---
from websocket_manager import manager
import asyncio

async def run_crew_background(crew_input: dict, patient_id_str: str):
    """
    Background task to run the crew and save results.
    """
    db = SessionLocal()
    try:
        logger.info(f"Starting background analysis for patient {patient_id_str}")
        await manager.broadcast({"status": "RUNNING", "message": "Starting analysis..."}, patient_id_str)
        
        # Instantiate Crew with patient_id for Tool usage
        medical_crew = MedicalCrew(patient_id=patient_id_str)
        
        # --- NEW: Fetch Medication History (Last 3 days) ---
        from database.models import MedicationLog, DailyTask, CaretakerPatientLink
        from notifications.service import NotificationService
        from datetime import timedelta
        
        # 1. Medication History
        current_time = datetime.utcnow()
        since = current_time - timedelta(days=3)
        med_logs = db.query(MedicationLog).filter(
            MedicationLog.patient_id == patient_id_str,
            MedicationLog.created_at >= since
        ).order_by(MedicationLog.created_at.desc()).all()
        
        med_history_str = "No recent medication logs."
        if med_logs:
            lines = []
            for log in med_logs:
                # Format: "2024-01-01 08:00: Metformin (500mg) - TAKEN"
                scheduled = log.scheduled_time.strftime("%Y-%m-%d %H:%M")
                status = log.status.upper()
                
                # Intelligent Overdue Check
                if status == "PENDING" and log.scheduled_time < current_time:
                    status = "MISSED (Overdue)"
                
                lines.append(f"- [{scheduled}] {log.medicine_name} - Status: {status}")
            med_history_str = "\n".join(lines)

        # 2. Daily Task Adherence (Today)
        today_start = current_time.replace(hour=0, minute=0, second=0, microsecond=0)
        daily_tasks = db.query(DailyTask).filter(
            DailyTask.patient_id == patient_id_str,
            DailyTask.scheduled_date >= today_start
        ).all()

        task_history_str = "No tasks assigned for today."
        if daily_tasks:
            lines = []
            for task in daily_tasks:
                status = task.status_patient.upper()
                
                # Check Caretaker Status First
                if task.status_caretaker == "REFUSED":
                    status = "REFUSED BY CARETAKER"
                elif status == "PENDING":
                     # If end of day is approaching (e.g. it's 8PM) and still pending? 
                     # Or just list as pending. Let's mark as INCOMPLETE if it's PENDING
                     # Actually, for tasks, PENDING is fine, but let's be explicit
                     status = "PENDING (Not Completed)"
                
                lines.append(f"- {task.category}: {task.task_description} (Status: {status})")
            task_history_str = "\n".join(lines)
            
        logger.info(f"Fetched Context: Meds={len(med_logs)}, Tasks={len(daily_tasks)}")
        # ----------------------------------------------------

        # Format input for LLM clarity to avoid hallucinations/history confusion
        # RE-ENABLE HISTORY: Format as TEXT logs, not JSON
        vitals_history_str = "No recent vitals history."
        if crew_input.get('recent_vitals_history'):
            lines = []
            for item in crew_input.get('recent_vitals_history'):
                lines.append(f"- [{item['date']}] BP: {item['bp']} | HR: {item['hr']} | Sugar: {item['sugar']}")
            vitals_history_str = "\n".join(lines)

        formatted_input = (
            f"Analyze this PATIENT DATA:\n\n"
            f"[CURRENT VITALS & CLINICAL STATUS]\n"
            f"Name: {crew_input.get('name')}\n"
            f"Age: {crew_input.get('age')}\n"
            f"Gender: {crew_input.get('gender')}\n"
            f"Blood Pressure: {crew_input.get('blood_pressure')}\n"
            f"Heart Rate: {crew_input.get('heart_rate')}\n"
            f"Blood Sugar: {crew_input.get('blood_sugar')}\n"
            f"Meds Taken (Self-Reported): {crew_input.get('meds_taken')}\n"
            f"Known Conditions: {crew_input.get('known_conditions')}\n"
            f"Current Medications List: {crew_input.get('current_medications')}\n"
            f"Reported Symptoms: {crew_input.get('reported_symptoms')}\n\n"
            f"========================================\n"
            f"[HISTORICAL VITALS LOG (Last 5 checks)]\n"
            f"(Use for trend analysis only. DO NOT confuse with current status)\n"
            f"{vitals_history_str}\n\n"
            f"[MEDICATION ADHERENCE LOG (Last 3 Days)]\n"
            f"{med_history_str}\n\n"
            f"[DAILY LIFESTYLE TASKS (Today)]\n"
            f"{task_history_str}\n"
            f"========================================"
        )
        
        logger.info(f"--- CREW INPUT START ---\n{formatted_input}\n--- CREW INPUT END ---")
        
        # NOTE: Run in separate thread to avoid blocking main event loop (WebSocket heartbeats)
        await manager.broadcast({"status": "RUNNING", "message": "AI Agents analyzing vitals..."}, patient_id_str)
        
        crew_result = await asyncio.to_thread(medical_crew.run, formatted_input)
        
        await manager.broadcast({"status": "RUNNING", "message": "Processing results..."}, patient_id_str)
        
        logger.info(f"raw crew_result type: {type(crew_result)}")
        logger.info(f"raw crew_result: {crew_result}")

        # Parse Results
        raw_risk = crew_result.get("risk_assessment", "{}")
        raw_decision = crew_result.get("decision_action", "{}")
        
        logger.info(f"Raw Risk Output: {raw_risk}")
        logger.info(f"Raw Decision Output: {raw_decision}")
        
        risk_output = clean_json_string(raw_risk)
        decision_output = clean_json_string(raw_decision)
        
        logger.info(f"Parsed Risk Output: {risk_output}")

        # Extract fields
        risk_level = risk_output.get("risk_level", "UNKNOWN")
        risk_score = risk_output.get("risk_score", 0) 
        if not isinstance(risk_score, int):
            try:
                risk_score = int(risk_score)
            except:
                risk_score = 0
                
        reasoning = risk_output
        
        # Store AI Assessment
        assessment = ai_assesments(
            patient_id=patient_id_str,
            risk_score=risk_score,
            risk_level=risk_level,
            reasoning=reasoning
        )
        db.add(assessment)

        # Create Alerts
        action = decision_output.get("action", "MONITOR")
        doctor_note = decision_output.get("doctor_note", "No specific note provided.")
        urgency = decision_output.get("urgency", "Normal")

        # Ensure doctor_note is a string for DB
        if isinstance(doctor_note, dict) or isinstance(doctor_note, list):
            doctor_note = json.dumps(doctor_note)

        
        is_critical = risk_level in ["HIGH", "CRITICAL"] or risk_score >= 80

        if action in ["ALERT_DOCTOR", "EMERGENCY"] or urgency in ["High", "Critical"] or is_critical:
            new_alert = alerts(
                patient_id=patient_id_str,
                alert_type=action,
                alert_message=doctor_note,
                call_received=False 
            )
            db.add(new_alert)

            # Send EMERGENCY Notification to Caretakers
            caretakers = db.query(CaretakerPatientLink).filter(CaretakerPatientLink.patient_id == patient_id_str).all()
            for ct in caretakers:
                NotificationService.send_push_notification(
                    db=db,
                    user_id=ct.caretaker_id,
                    title="🚨 EMERGENCY ALERT: Critical Risk Detected",
                    body=f"Patient risk level is {risk_level}. Action: {action}",
                    event_type="EMERGENCY_CRITICAL",
                    data={"click_action": f"/dashboard/patient/{patient_id_str}"}
                )
        else:
            # Send Normal Completion Notification to Caretakers
            caretakers = db.query(CaretakerPatientLink).filter(CaretakerPatientLink.patient_id == patient_id_str).all()
            for ct in caretakers:
                NotificationService.send_push_notification(
                    db=db,
                    user_id=ct.caretaker_id,
                    title="✅ Checkup Analysis Complete",
                    body=f"Patient is {risk_level}. Action: {action}",
                    event_type="HEALTH_CHECKUP_COMPLETED",
                    data={"click_action": f"/dashboard/patient/{patient_id_str}"}
                )
        
        db.commit()
        logger.info(f"Background analysis complete for {patient_id_str}")
        
        # Broadcast Final Success
        final_payload = {
            "status": "COMPLETED",
            "result": {
                "risk_level": risk_level,
                "risk_score": risk_score,
                "reasoning": reasoning
            }
        }
        await manager.broadcast(final_payload, patient_id_str)

    except Exception as e:
        logger.error(f"Background task failed for {patient_id_str}: {e}")
        await manager.broadcast({"status": "FAILED", "error": str(e)}, patient_id_str)
    finally:
        db.close()

class EscalateRequest(BaseModel):
    patient_id: str

@app.post("/api/v1/escalate")
def escalate_to_doctor(
    request: EscalateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.NURSE, UserRole.DOCTOR, UserRole.PATIENT, UserRole.CARETAKER]))
):
    """
    Manually trigger n8n escalation for a patient.
    """
    # Fetch latest assessment
    assessment = db.query(ai_assesments).filter(
        ai_assesments.patient_id == request.patient_id
    ).order_by(ai_assesments.created_at.desc()).first()

    if not assessment:
        raise HTTPException(status_code=404, detail="No assessment found for this patient")

    patient = db.query(Patient).filter(Patient.id == request.patient_id).first()
    if not patient:
         raise HTTPException(status_code=404, detail="Patient not found")

    try:
        # Load Webhook from env, fallback to old test url if missing (or raise error)
        N8N_WEBHOOK = os.getenv("N8N_ESCALATE_WEBHOOK", "https://modijiop.app.n8n.cloud/webhook-test/escalate-risk") 
        
        # Prepare payload from stored assessment
        # Note: We rely on the stored reasoning/risk level. 
        # Ideally we'd store the 'doctor_note' specifically, but for now we use reasoning.
        
        risk_level = assessment.risk_level
        risk_score = assessment.risk_score
        reasoning = assessment.reasoning # DB stores JSON
        
        # safely get doctor note if it was stored contextually, or construct generic
        summary_text = "Manual Escalation Requested"
        
        logger.info(f"Escalation Reasoning Type: {type(reasoning)}")
        logger.info(f"Escalation Reasoning Content: {reasoning}")

        if isinstance(reasoning, dict):
             summary_text = reasoning.get("justification", "Manual Escalation")
        elif isinstance(reasoning, str):
            try:
                # Attempt to parse if it's a string
                parsed = json.loads(reasoning)
                if isinstance(parsed, dict):
                    summary_text = parsed.get("justification", "Manual Escalation (Parsed)")
            except:
                summary_text = f"Manual Escalation (Raw): {reasoning}"
        
        logger.info(f"Final Escalation Summary: {summary_text}")

        # Fetch latest vitals from monitoring_logs
        latest_log = db.query(monitoring_logs).filter(
            monitoring_logs.patient_id == request.patient_id
        ).order_by(monitoring_logs.created_at.desc()).first()

        vitals_data = {}
        if latest_log:
            vitals_data = {
                "blood_pressure": latest_log.blood_pressure,
                "heart_rate": latest_log.heart_rate,
                "blood_sugar": latest_log.blood_sugar,
                "meds_taken": latest_log.meds_taken
            }

        # --- HARD FETCH: Missed Meds & Failed Tasks (Context Guarantee) ---
        from database.models import MedicationLog, DailyTask
        from datetime import timedelta
        
        # 1. Missed Meds (Last 48 hours)
        since_48h = datetime.utcnow() - timedelta(hours=48)
        missed_logs = db.query(MedicationLog).filter(
            MedicationLog.patient_id == request.patient_id,
            MedicationLog.created_at >= since_48h,
            MedicationLog.status.in_(["MISSED", "SKIPPED"])
        ).all()
        
        missed_meds_list = []
        for log in missed_logs:
            missed_meds_list.append({
                "medicine": log.medicine_name,
                "scheduled": log.scheduled_time.strftime("%Y-%m-%d %H:%M"),
                "status": log.status
            })

        # 2. Failed/Pending Tasks (Today)
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        failed_tasks = db.query(DailyTask).filter(
            DailyTask.patient_id == request.patient_id,
            DailyTask.scheduled_date >= today_start,
            DailyTask.status_patient != "COMPLETED" 
        ).all()

        failed_tasks_list = []
        for task in failed_tasks:
             status = task.status_patient
             if task.status_caretaker == "REFUSED":
                 status = "REFUSED_BY_CARETAKER"
             
             failed_tasks_list.append({
                 "task": task.task_description,
                 "category": task.category,
                 "status": status
             })
        # ------------------------------------------------------------------

        payload = {
            "patient_id": str(patient.id),
            "patient_name": patient.name,
            "patient_phone": patient.contact_number,
            "age": patient.age,
            "risk_level": risk_level,
            "risk_score": risk_score,
            "summary": summary_text, 
            "doctor_name": "Dr kokate",
            "callback_url": f"{os.getenv('API_BASE_URL', 'https://agentic-nurse.onrender.com')}/api/v1/callbacks/doctor-advice",
            "vitals": vitals_data,
            "missed_medications": missed_meds_list,
            "incomplete_tasks": failed_tasks_list
        }
        
        logger.info(f"Triggering N8N Escalation (Manual): {N8N_WEBHOOK}")
        response = requests.post(N8N_WEBHOOK, json=payload, timeout=10) # Increased timeout
        return {"status": "success", "n8n_response": response.status_code}

    except Exception as e:
        logger.error(f"Failed to manually trigger n8n webhook: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- Routes ---

@app.post("/api/v1/analyze", response_model=AnalysisInitResponse)
def analyze_patient(
    request: PatientRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.NURSE, UserRole.DOCTOR, UserRole.PATIENT]))
):
    """
    Ingest patient data and start AI analysis in background.
    Requires authentication: ADMIN, NURSE, or DOCTOR role.
    """
    try:
        logger.info(f"Received analysis request for patient: {request.name}")

        # 1. Create or Update Patient
        patient = db.query(Patient).filter(Patient.contact_number == request.contact_number).first()
        
        symptoms_json = {"initial_symptoms": request.initial_symptoms}
        conditions_json = {"known_conditions": request.known_conditions}
        medications_json = {"medications": request.current_medications} if request.current_medications else {}

        if not patient:
            patient = Patient(
                name=request.name,
                age=request.age,
                gender=request.gender,
                contact_number=request.contact_number,
                known_conditions=conditions_json,
                reported_symptoms=symptoms_json,
                current_medications=medications_json
            )
            db.add(patient)
            db.commit()
            db.refresh(patient)
        else:
            patient.name = request.name
            patient.age = request.age
            patient.gender = request.gender
            
            # Only update known_conditions if provided
            if request.known_conditions and request.known_conditions.strip():
                patient.known_conditions = conditions_json
            
            # Always update reported_symptoms as these are current
            patient.reported_symptoms = symptoms_json
            
            if request.current_medications:
                 patient.current_medications = medications_json
            
            patient.updated_at = datetime.utcnow()
            db.commit()

        # 1.5. CLEANUP: Invalidate any stuck/pending interactions from previous runs
        stuck_interactions = db.query(AgentInteraction).filter(
            AgentInteraction.patient_id == patient.id,
            AgentInteraction.status == "PENDING"
        ).all()
        
        if stuck_interactions:
            logger.warning(f"Found {len(stuck_interactions)} stuck interactions for {patient.name}. Cancelling them.")
            for interaction in stuck_interactions:
                interaction.status = "CANCELLED"
                interaction.answer = "Analysis Restarted"
            db.commit()

        # 2. Create Monitoring Log
        log_entry = {
            "source": "api_request",
            "vitals": {
                "bp": request.blood_pressure,
                "hr": request.heart_rate,
                "sugar": request.blood_sugar
            }
        }
        
        monitor_log = monitoring_logs(
            patient_id=patient.id,
            blood_pressure=request.blood_pressure,
            heart_rate=request.heart_rate,
            blood_sugar=request.blood_sugar,
            meds_taken=request.meds_taken,
            sleep_hours=request.sleep_hours,
            symptoms=symptoms_json,
            log=log_entry
        )
        db.add(monitor_log)
        db.commit()

        # --- Trigger Checkup Completed Notification to Caretakers ---
        from database.models import CaretakerPatientLink
        from notifications.service import NotificationService
        
        caretakers = db.query(CaretakerPatientLink).filter(CaretakerPatientLink.patient_id == patient.id).all()
        for ct in caretakers:
            NotificationService.send_push_notification(
                db=db,
                user_id=ct.caretaker_id,
                title="Health Checkup Completed",
                body=f"{patient.name} has submitted their vitals for analysis.",
                event_type="HEALTH_CHECKUP_COMPLETED",
                data={"click_action": f"/dashboard/patient/{patient.id}"}
            )
        # ------------------------------------------------------------

        # 3. Prepare Data for Crew
        # Fetch last 5 logs for trend analysis
        recent_logs = db.query(monitoring_logs).filter(
            monitoring_logs.patient_id == patient.id
        ).order_by(monitoring_logs.created_at.desc()).limit(5).all()

        history_list = []
        # DISABLE HISTORY FOR DEBUGGING - IT IS CAUSING HALLUCINATIONS
        # for log in recent_logs:
        #     history_list.append({
        #         "date": log.created_at.strftime("%Y-%m-%d %H:%M"),
        #         "bp": log.blood_pressure,
        #         "hr": log.heart_rate,
        #         "sugar": log.blood_sugar
        #     })

        crew_input = {
            "name": request.name,
            "age": request.age,
            "gender": request.gender,
            "blood_pressure": request.blood_pressure,
            "heart_rate": request.heart_rate,
            "blood_sugar": request.blood_sugar,
            "known_conditions": request.known_conditions,
            "current_medications": request.current_medications,
            "reported_symptoms": request.initial_symptoms,
            "meds_taken": request.meds_taken,
            "recent_vitals_history": history_list
        }

        # 4. Start Background Task
        background_tasks.add_task(run_crew_background, crew_input, str(patient.id))

        return AnalysisInitResponse(
            message="Analysis started in background.",
            patient_id=str(patient.id),
            status_endpoint=f"/api/v1/status/{patient.id}"
        )

    except Exception as e:
        logger.error(f"Error starting analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/status/{patient_id}", response_model=StatusResponse)
def check_status(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.NURSE, UserRole.DOCTOR, UserRole.PATIENT, UserRole.CARETAKER]))
):
    """
    Check the status of the analysis.
    Requires authentication: ADMIN, NURSE, or DOCTOR role.
    """
    # 0. Fetch patient data for UI context
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    patient_info = {}
    current_location = None

    if patient:
        patient_info = {
            "name": patient.name,
            "age": patient.age,
            "gender": patient.gender,
            "conditions": patient.known_conditions if patient.known_conditions else ""
        }
        # Location
        if patient.last_latitude and patient.last_longitude:
            try:
                current_location = {
                    "lat": float(patient.last_latitude),
                    "lng": float(patient.last_longitude)
                }
            except:
                pass

    # 1. Check for Pending Interactions (HITL)
    pending_interaction = db.query(AgentInteraction).filter(
        AgentInteraction.patient_id == patient_id,
        AgentInteraction.status == "PENDING"
    ).order_by(AgentInteraction.created_at.desc()).first()

    if pending_interaction:
        return StatusResponse(
            status="WAITING_FOR_INPUT",
            pending_interaction=InteractionResponse(
                interaction_id=str(pending_interaction.id),
                question=pending_interaction.question,
                status=pending_interaction.status,
                created_at=pending_interaction.created_at
            ),
            patient_data=patient_info,
            current_location=current_location
        )

    # 2. Check for Completion (Assessment Exists)
    # Ensure we get the Result corresponding to the LATEST analysis request.
    # We use the latest monitoring_log as a proxy for the start of the analysis.
    latest_log = db.query(monitoring_logs).filter(
        monitoring_logs.patient_id == patient_id
    ).order_by(monitoring_logs.created_at.desc()).first()

    assessment = None
    if latest_log:
        # Check for assessment created AFTER the log
        assessment = db.query(ai_assesments).filter(
            ai_assesments.patient_id == patient_id,
            ai_assesments.created_at >= latest_log.created_at
        ).first()
    
    # Fallback/Safety: Get latest assessment generally
    if not assessment:
        assessment = db.query(ai_assesments).filter(
            ai_assesments.patient_id == patient_id
        ).order_by(ai_assesments.created_at.desc()).first()

    if assessment:
        return StatusResponse(
            status="COMPLETED",
            result={
                "risk_level": assessment.risk_level,
                "risk_score": assessment.risk_score,
                "reasoning": assessment.reasoning
            },
            patient_data=patient_info,
            current_location=current_location
        )

    # 3. Default: Completed (Stable/Idle)
    return StatusResponse(
        status="COMPLETED", 
        result={
            "risk_level": "STABLE",
            "risk_score": 0,
            "reasoning": "Patient is being monitored. No active analysis detected."
        },
        patient_data=patient_info,
        current_location=current_location
    )

@app.post("/api/v1/interaction/{interaction_id}")
def provide_answer(
    interaction_id: str,
    request: AnswerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.NURSE, UserRole.DOCTOR, UserRole.PATIENT, UserRole.CARETAKER]))
):
    """
    Provide an answer to a pending question.
    Requires authentication: ADMIN, NURSE, or DOCTOR role.
    """
    interaction = db.query(AgentInteraction).filter(AgentInteraction.id == interaction_id).first()
    if not interaction:
        raise HTTPException(status_code=404, detail="Interaction not found")
    
    if interaction.status != "PENDING":
        raise HTTPException(status_code=400, detail="Interaction is not pending")

    interaction.answer = request.answer
    interaction.status = "ANSWERED"
    db.commit()

    return {"message": "Answer recorded. Agent will resume shortly."}

@app.websocket("/ws/{patient_id}")
async def websocket_endpoint(websocket: WebSocket, patient_id: str, db: Session = Depends(get_db)):
    # 1. Auth via Token (Query Param)
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        payload = decode_token(token)
        if not payload:
             logger.warning(f"WS Token Invalid: {token[:10]}...")
             await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
             return
        user_id = payload.get("sub")
        role = payload.get("role")
        
        # Verify Access
        # We define the check_permission function and run it. 
        # The previous 'if role == ...' block was incomplete and is now removed.

        
        # Let's do a robust check
        # We need to be careful with blocking DB calls in async. 
        # Using run_in_executor or just assuming quick query.
        
        from database.models import User, CaretakerPatientLink
        
        # Helper to run sync query
        def check_permission():
            user = db.query(User).filter(User.id == user_id).first()
            if not user: return False
            
            if user.role in [UserRole.ADMIN, UserRole.NURSE, UserRole.DOCTOR]:
                return True
            
            if user.role == UserRole.PATIENT:
                return str(user.patient_id) == str(patient_id)
            
            if user.role == UserRole.CARETAKER:
                link = db.query(CaretakerPatientLink).filter(
                    CaretakerPatientLink.caretaker_id == user.id,
                    CaretakerPatientLink.patient_id == patient_id
                ).first()
                return link is not None
                
            return False

        has_access = await asyncio.to_thread(check_permission)

        if not has_access:
            logger.warning(f"WS Auth Failed for user {user_id} on patient {patient_id}")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        # 2. Accept
        await manager.connect(websocket, patient_id)
        
        try:
            while True:
                # Receive Message
                data = await websocket.receive_json()
                
                # Handle Message Types
                if data.get("type") == "LOCATION_UPDATE":
                    lat = data.get("latitude")
                    lng = data.get("longitude")
                    logger.info(f"Received LOCATION_UPDATE for {patient_id}: {lat}, {lng}")
                    
                    if lat and lng:
                        # Update DB (Last Known Location)
                        def update_location():
                            patient = db.query(Patient).filter(Patient.id == patient_id).first()
                            if patient:
                                patient.last_latitude = str(lat)
                                patient.last_longitude = str(lng)
                                db.commit() # Important: Save changes!
                        
                        await asyncio.to_thread(update_location)
                        
                        # Broadcast to all listeners (Caretakers)
                        await manager.broadcast({
                            "type": "LOCATION_UPDATE",
                            "latitude": lat,
                            "longitude": lng,
                            "timestamp": datetime.utcnow().isoformat()
                        }, patient_id)
                        logger.info(f"Broadcasted LOCATION_UPDATE for {patient_id}")
                        
                        
                elif data.get("type") == "PING":
                    await websocket.send_json({"type": "PONG"})

                elif data.get("type") == "WEBRTC_SIGNAL":
                    # Relay the signal to other peers in the room (patient_id)
                    # We assume 1-on-1 or small group, so broadcast to all others is fine.
                    # The payload should contain: { type: "WEBRTC_SIGNAL", payload: { ... }, target: ... }
                    # Ideally we just relay the whole data object.
                    logger.info(f"Relaying WEBRTC_SIGNAL for {patient_id}")
                    await manager.broadcast(data, patient_id, exclude=websocket)
                    
        except WebSocketDisconnect:
            manager.disconnect(websocket, patient_id)
            
    except Exception as e:
        logger.error(f"WebSocket error for {patient_id}: {e}")
        try:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        except:
            pass

class BroadcastRequest(BaseModel):
    patient_id: str
    status: str
    message: Optional[str] = None
    pending_interaction: Optional[Dict] = None
    result: Optional[Dict] = None

@app.post("/api/v1/internal/broadcast")
async def internal_broadcast(req: BroadcastRequest):
    """
    Internal endpoint to allow background threads (like Tools) to trigger WS broadcasts.
    """
    payload = {
        "status": req.status,
    }
    if req.message:
        payload["message"] = req.message
    if req.pending_interaction:
        payload["pending_interaction"] = req.pending_interaction
    if req.result:
        payload["result"] = req.result
        
    logger.info(f"Internal broadcast request for {req.patient_id}: {req.status}")
    await manager.broadcast(payload, req.patient_id)
    return {"status": "broadcasted"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
