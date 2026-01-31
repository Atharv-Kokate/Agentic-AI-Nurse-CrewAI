from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
import uuid

from database.session import get_db
from database.models import MedicationLog, Patient

router = APIRouter(prefix="/api/v1/medication", tags=["Medication Tracking"])

class MedicationLogCreate(BaseModel):
    patient_phone: str # Use phone to identify, easier for N8N
    medicine_name: str
    scheduled_time: datetime = None # Defaults to now if missing

@router.post("/log", status_code=status.HTTP_201_CREATED)
def create_medication_log(log_data: MedicationLogCreate, db: Session = Depends(get_db)):
    """
    Create a PENDING medication log.
    Call this from N8N right before sending the WhatsApp reminder.
    """
    # 1. Find Patient
    clean_phone = log_data.patient_phone.replace("+", "").replace(" ", "").replace("-", "")
    patients = db.query(Patient).all()
    target_patient = None
    
    for p in patients:
        db_phone = p.contact_number.replace("+", "").replace(" ", "").replace("-", "")
        if db_phone in clean_phone or clean_phone in db_phone:
            target_patient = p
            break
            
    if not target_patient:
        raise HTTPException(status_code=404, detail="Patient not found with this phone number")

    # 2. Create Log
    new_log = MedicationLog(
        patient_id=target_patient.id,
        medicine_name=log_data.medicine_name,
        scheduled_time=log_data.scheduled_time or datetime.utcnow(),
        status="PENDING"
    )
    
    db.add(new_log)
    db.commit()
    return {"status": "success", "log_id": str(new_log.id)}

@router.get("/adherence/{patient_id}")
def get_adherence_records(patient_id: str, db: Session = Depends(get_db)):
    """
    Get medication logs for a patient (e.g. for Caretaker Dashboard).
    """
    logs = db.query(MedicationLog).filter(
        MedicationLog.patient_id == patient_id
    ).order_by(MedicationLog.created_at.desc()).limit(20).all()
    
    return logs
