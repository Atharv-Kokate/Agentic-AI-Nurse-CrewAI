from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database.session import get_db
from database.models import DoctorRecommendation, Patient
from typing import Optional
import logging

router = APIRouter(prefix="/api/v1/callbacks", tags=["Callbacks"])
logger = logging.getLogger(__name__)

class DoctorAdviceRequest(BaseModel):
    patient_id: str
    doctor_name: Optional[str] = "Medical Officer"
    recommendation_summary: str
    medication_advice: Optional[str] = None
    escalation_level: Optional[str] = "Standard"

@router.post("/doctor-advice")
async def receive_doctor_advice(data: DoctorAdviceRequest, db: Session = Depends(get_db)):
    """
    Webhook receiver for n8n to push doctor's advice back to the system.
    """
    logger.info(f"Received doctor advice for patient {data.patient_id}")
    
    # Validate patient exists
    patient = db.query(Patient).filter(Patient.id == data.patient_id).first()
    if not patient:
        logger.warning(f"Patient {data.patient_id} not found for advice callback")
        raise HTTPException(status_code=404, detail="Patient not found")

    try:
        recommendation = DoctorRecommendation(
            patient_id=data.patient_id,
            doctor_name=data.doctor_name,
            recommendation_summary=data.recommendation_summary,
            medication_advice=data.medication_advice,
            escalation_level=data.escalation_level
        )
        db.add(recommendation)
        db.commit()
        db.refresh(recommendation)
        logger.info(f"Saved recommendation {recommendation.id}")
        return {"status": "success", "recommendation_id": str(recommendation.id)}
    except Exception as e:
        logger.error(f"Failed to save recommendation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/recommendations")
async def get_doctor_recommendations(db: Session = Depends(get_db)):
    """
    Fetch all doctor recommendations.
    """
    recs = db.query(DoctorRecommendation).order_by(DoctorRecommendation.created_at.desc()).all()
    # Join with Patient to get names if needed, but for now just return raw recs
    # Ideally should use a Pydantic response model
    return recs

class MedicationReply(BaseModel):
    phone: str
    response: str
    raw_payload: Optional[dict] = None

@router.post("/medication-reply")
async def handle_medication_reply(data: MedicationReply, db: Session = Depends(get_db)):
    """
    Handle response from WhatsApp (via N8N).
    Updates the latest PENDING medication log for the patient.
    """
    logger.info(f"Received Med Reply from {data.phone}: {data.response}")
    
    # Clean phone number (remove +, spaces, etc if needed)
    # Ideally, match loosely or allow exact match
    # For now, we assume Format matches DB
    
    # Find Patient by contact number
    # Note: Contact number in DB might be "555-1234" while WhatsApp sends "+15551234"
    # Logic: Try to find suffix match or logic. For prototype, exact or 'contains'
    
    # We will search for a patient where contact_number is in the phone or vice versa
    # This is simplified phone matching
    patients = db.query(Patient).all()
    target_patient = None
    
    # Normalize input
    clean_input_phone = data.phone.replace("+", "").replace(" ", "").replace("-", "")
    
    for p in patients:
        db_phone = p.contact_number.replace("+", "").replace(" ", "").replace("-", "")
        if db_phone in clean_input_phone or clean_input_phone in db_phone:
            target_patient = p
            break
            
    if not target_patient:
        logger.warning(f"No patient found for phone {data.phone}")
        raise HTTPException(status_code=404, detail="Patient not found")

    # Find Latest PENDING Log
    # We look for a log created today or recently that is PENDING
    from database.models import MedicationLog
    from datetime import datetime, timedelta
    
    # Look for logs in the last 24 hours
    since = datetime.utcnow() - timedelta(hours=24)
    
    pending_log = db.query(MedicationLog).filter(
        MedicationLog.patient_id == target_patient.id,
        MedicationLog.status == "PENDING",
        MedicationLog.created_at >= since
    ).order_by(MedicationLog.created_at.desc()).first()
    
    if not pending_log:
        logger.info(f"No pending medication logs found for {target_patient.name}")
        return {"status": "ignored", "message": "No pending logs"}
        
    # Update Status based on response
    response_lower = data.response.lower()
    
    if "taken" in response_lower or "yes" in response_lower or "✅" in response_lower:
        pending_log.status = "TAKEN"
        pending_log.taken_at = datetime.utcnow()
        db.commit()
        logger.info(f"Updated Log {pending_log.id} to TAKEN")
        return {"status": "success", "updated": "TAKEN"}
        
    elif "skip" in response_lower or "no" in response_lower or "❌" in response_lower:
        pending_log.status = "MISSED" # Or SKIPPED
        db.commit()
        logger.info(f"Updated Log {pending_log.id} to MISSED")
        return {"status": "success", "updated": "MISSED"}
        
    return {"status": "ignored", "message": "Response not understood"}
