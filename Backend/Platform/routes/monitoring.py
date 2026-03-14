from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
from uuid import UUID

from database.session import get_db
from database.models import User, Patient, UserRole, MonitoringCheckIn, MonitoringQuestion, MonitoringResponse
from auth.dependencies import get_current_active_user, require_roles
from medical_agents.monitoring_agent import MonitoringAgent
from severity_engine import evaluate_check_in, handle_severity_escalation

router = APIRouter(prefix="/api/v1/monitoring", tags=["Monitoring"])

# --- Schemas ---
class SubmitResponseItem(BaseModel):
    question_id: UUID
    answer_value: str
    notes: Optional[str] = None

class SubmitResponseRequest(BaseModel):
    responses: List[SubmitResponseItem]


# --- Helpers ---

def build_recent_history(patient_id: UUID, db: Session, days: int = 3) -> str:
    """
    Build a formatted string of recent monitoring responses for history-aware
    question generation. Returns the last N days of check-in Q&A pairs with severity.
    """
    since = datetime.utcnow() - timedelta(days=days)

    recent_check_ins = db.query(MonitoringCheckIn).filter(
        MonitoringCheckIn.patient_id == patient_id,
        MonitoringCheckIn.created_at >= since,
    ).order_by(MonitoringCheckIn.created_at.desc()).limit(3).all()

    if not recent_check_ins:
        return "No recent check-in history available."

    lines = []
    for ci in recent_check_ins:
        ci_date = ci.created_at.strftime("%Y-%m-%d %H:%M")
        questions = db.query(MonitoringQuestion).filter(
            MonitoringQuestion.check_in_id == ci.id
        ).all()

        for q in questions:
            resp = db.query(MonitoringResponse).filter(
                MonitoringResponse.question_id == q.id
            ).first()

            if resp:
                severity_tag = f" ({resp.evaluated_severity})" if resp.evaluated_severity else ""
                lines.append(
                    f"- [{ci_date}] Q: \"{q.question_text}\" → A: \"{resp.answer_value}\"{severity_tag}"
                )

    if not lines:
        return "No recent check-in history available."

    return "\n".join(lines)


def generate_check_in_for_patient(patient: Patient, db: Session) -> dict:
    """
    Core generation logic — used by both the API endpoint and the scheduler.
    Returns {"check_in_id": UUID, "question_count": int} or raises.
    """
    recent_history = build_recent_history(patient.id, db)

    agent = MonitoringAgent()
    plan = agent.generate_check_in_questions(
        patient_name=patient.name,
        condition_tags=patient.condition_tags or [],
        recent_history=recent_history,
    )

    # Create Check-in Record
    check_in = MonitoringCheckIn(
        patient_id=patient.id,
        scheduled_for=datetime.utcnow(),
    )
    db.add(check_in)
    db.flush()

    # Add Questions
    for q in plan.questions:
        db_q = MonitoringQuestion(
            check_in_id=check_in.id,
            target_role=q.target_role,
            question_text=q.question_text,
            response_type=q.response_type,
            condition_tag=q.condition_tag,
        )
        db.add(db_q)

    db.commit()
    return {"check_in_id": check_in.id, "question_count": len(plan.questions)}

# --- Routes ---

@router.post("/generate/{patient_id}")
def generate_check_in(
    patient_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.NURSE, UserRole.DOCTOR, UserRole.CARETAKER]))
):
    """
    Manually trigger the AI to generate a set of monitoring questions for a patient
    based on their condition tags. Also called automatically by the scheduler.
    """
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    try:
        result = generate_check_in_for_patient(patient, db)
        return {
            "message": f"Generated {result['question_count']} questions successfully.",
            "check_in_id": result["check_in_id"],
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pending/{patient_id}")
def get_pending_check_in(
    patient_id: UUID,
    target_role: str, # 'PATIENT' or 'CARETAKER'
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Fetch the latest pending check-in questions for a specific role (PATIENT or CARETAKER).
    """
    # Find the most recent incomplete check-in for this patient
    check_in = db.query(MonitoringCheckIn).filter(
        MonitoringCheckIn.patient_id == patient_id
    ).order_by(MonitoringCheckIn.created_at.desc()).first()
    
    if not check_in:
        return {"check_in_id": None, "questions": []}
        
    # Check if this role already completed it
    target_role = target_role.upper()
    if target_role == "PATIENT" and check_in.status_patient != "PENDING":
        return {"check_in_id": None, "questions": []}
    if target_role == "CARETAKER" and check_in.status_caretaker != "PENDING":
        return {"check_in_id": None, "questions": []}

    # Get questions for this role (Case Insensitive!)
    from sqlalchemy import func
    questions = db.query(MonitoringQuestion).filter(
        MonitoringQuestion.check_in_id == check_in.id,
        func.upper(MonitoringQuestion.target_role) == target_role
    ).all()
    
    # If there are no questions for this role, mark their status as NOT_REQUIRED
    if not questions:
        if target_role == "PATIENT":
            check_in.status_patient = "NOT_REQUIRED"
        elif target_role == "CARETAKER":
            check_in.status_caretaker = "NOT_REQUIRED"
        db.commit()
        return {"check_in_id": None, "questions": []}
    
    return {
        "check_in_id": check_in.id,
        "questions": [
            {
                "id": q.id,
                "text": q.question_text,
                "type": q.response_type
            } for q in questions
        ]
    }


@router.post("/submit/{check_in_id}")
def submit_check_in_responses(
    check_in_id: UUID,
    request: SubmitResponseRequest,
    target_role: str, # 'PATIENT' or 'CARETAKER'
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Submit answers to a pending check-in.
    After saving, automatically evaluates severity and escalates if needed.
    """
    check_in = db.query(MonitoringCheckIn).filter(MonitoringCheckIn.id == check_in_id).first()
    if not check_in:
        raise HTTPException(status_code=404, detail="Check-in not found")

    # Save Responses
    for item in request.responses:
        response = MonitoringResponse(
            question_id=item.question_id,
            responder_id=current_user.id,
            answer_value=item.answer_value,
            notes=item.notes
        )
        db.add(response)
        
    # Mark status as completed
    if target_role == "PATIENT":
        check_in.status_patient = "COMPLETED"
    elif target_role == "CARETAKER":
        check_in.status_caretaker = "COMPLETED"
        
    db.commit()

    # --- Severity Evaluation ---
    eval_result = evaluate_check_in(check_in_id, db)

    # Auto-escalate if ORANGE or RED
    handle_severity_escalation(
        check_in_id=check_in_id,
        patient_id=check_in.patient_id,
        overall_severity=eval_result["overall_severity"],
        db=db,
    )

    return {
        "message": "Responses submitted successfully.",
        "severity": eval_result["overall_severity"],
        "red_flags": eval_result["red_count"],
        "orange_flags": eval_result["orange_count"],
    }
