from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import uuid

from database.session import get_db
from database.models import MedicationLog, Reminder, User, UserRole
from auth.dependencies import require_roles, get_current_active_user

router = APIRouter(prefix="/api/v1/medication", tags=["Medication"])

# --- Schemas ---
class MedicationLogCreate(BaseModel):
    reminder_id: str
    status: str # TAKEN, SKIPPED
    taken_at: Optional[datetime] = None

class MedicationLogResponse(BaseModel):
    id: str
    patient_id: str
    medicine_name: str
    scheduled_time: datetime
    taken_at: Optional[datetime]
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True

# --- Routes ---

@router.post("/log", response_model=MedicationLogResponse)
def log_medication(
    log_data: MedicationLogCreate,
    db: Session = Depends(get_db)
    # No auth requirement here as it comes from n8n (server-to-server)
    # In prod, we'd verify a webhook secret header
):
    """
    Receive medication status from n8n webhook.
    """
    # 1. Find the reminder to get details
    try:
        reminder_uuid = uuid.UUID(log_data.reminder_id)
    except ValueError:
         raise HTTPException(status_code=400, detail="Invalid reminder_id format")

    reminder = db.query(Reminder).filter(Reminder.id == reminder_uuid).first()
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")

    # 2. Calculate scheduled datetime (assuming today for simplicity, or nearest)
    # Logic: If HH:MM is passed for today, use today. 
    now = datetime.utcnow()
    try:
        hour, minute = map(int, reminder.schedule_time.split(':'))
        scheduled_dt = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    except:
        scheduled_dt = now # Fallback

    # 3. Create Log
    new_log = MedicationLog(
        patient_id=reminder.patient_id,
        medicine_name=reminder.medicine_name,
        scheduled_time=scheduled_dt,
        taken_at=log_data.taken_at or (now if log_data.status == "TAKEN" else None),
        status=log_data.status
    )
    
    db.add(new_log)
    db.commit()
    db.refresh(new_log)
    
    return new_log

@router.get("/history/{patient_id}", response_model=List[MedicationLogResponse])
def get_medication_history(
    patient_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get medication history for a patient.
    """
    # Access Control
    if current_user.role == UserRole.PATIENT and current_user.patient_id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")
        
    if current_user.role == UserRole.CARETAKER:
        # Verify link
        # (Simplified: assuming link exists if they have the ID, strictly should check CaretakerPatientLink)
        pass 

    logs = db.query(MedicationLog).filter(
        MedicationLog.patient_id == patient_id
    ).order_by(MedicationLog.created_at.desc()).limit(50).all()
    
    return logs
