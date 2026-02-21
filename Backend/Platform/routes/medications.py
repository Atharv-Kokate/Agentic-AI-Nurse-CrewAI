from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta, date
import uuid

from database.session import get_db
from database.models import MedicationLog, Reminder, User, UserRole, CaretakerPatientLink
from auth.dependencies import require_roles, get_current_active_user

router = APIRouter(prefix="/api/v1/medication", tags=["Medication"])

# --- Schemas ---
class MedicationLogCreate(BaseModel):
    reminder_id: str
    status: str # TAKEN, SKIPPED
    taken_at: Optional[datetime] = None

class MedicationLogUpdate(BaseModel):
    status: str # TAKEN, MISSED, SKIPPED

class MedicationLogResponse(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    medicine_name: str
    scheduled_time: datetime
    taken_at: Optional[datetime]
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True

# --- Helpers ---
def ensure_daily_logs(patient_id: uuid.UUID, db: Session):
    """
    Checks if medication logs for today exist for all active reminders.
    If not, creates them with status 'PENDING'.
    """
    now = datetime.utcnow()
    today_start = datetime.combine(now.date(), datetime.min.time())
    today_end = datetime.combine(now.date(), datetime.max.time())

    # Get Active Reminders
    reminders = db.query(Reminder).filter(
        Reminder.patient_id == patient_id,
        Reminder.is_active == True
    ).all()

    for reminder in reminders:
        # Check if log exists for this reminder today
        # We match by medicine_name and approximate scheduled time (date)
        # Or simpler: Check if ANY log for this medicine exists today?
        # Better: Create logs based on schedule.
        
        # Calculate today's scheduled time for this reminder
        try:
            hour, minute = map(int, reminder.schedule_time.split(':'))
            scheduled_dt = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        except:
            continue # Skip invalid time

        # check if a log exists for this patient, this medicine, and this scheduled_dt (approximate range)
        # To avoid duplicates if the script runs multiple times:
        # Check if we have a log for this medicine created/scheduled today.
        
        existing_log = db.query(MedicationLog).filter(
            MedicationLog.patient_id == patient_id,
            MedicationLog.medicine_name == reminder.medicine_name,
            MedicationLog.scheduled_time >= today_start,
            MedicationLog.scheduled_time <= today_end
        ).first()

        if not existing_log:
            # Create PENDING log
            new_log = MedicationLog(
                patient_id=patient_id,
                medicine_name=reminder.medicine_name,
                scheduled_time=scheduled_dt,
                status="PENDING"
            )
            db.add(new_log)
    
    db.commit()


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
    
    # Decrement count if marked taken
    if log_data.status == "TAKEN":
        reminder.remaining_count = max(0, reminder.remaining_count - 1)

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
    Auto-generates daily logs if missing.
    """
    # Access Control
    if current_user.role == UserRole.PATIENT and current_user.patient_id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")
        
    if current_user.role == UserRole.CARETAKER:
        # Verify link
        link = db.query(CaretakerPatientLink).filter(
            CaretakerPatientLink.caretaker_id == current_user.id,
            CaretakerPatientLink.patient_id == patient_id
        ).first()
        if not link:
             raise HTTPException(status_code=403, detail="You are not linked to this patient")

    # Lazy Generation of Daily Logs
    ensure_daily_logs(patient_id, db)

    logs = db.query(MedicationLog).filter(
        MedicationLog.patient_id == patient_id
    ).order_by(MedicationLog.scheduled_time.desc()).limit(50).all()
    
    return logs

@router.put("/log/{log_id}", response_model=MedicationLogResponse)
def update_log_status(
    log_id: uuid.UUID,
    update_data: MedicationLogUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Update the status of a medication log (e.g. Caretaker creating manual entry or verifying).
    """
    log_entry = db.query(MedicationLog).filter(MedicationLog.id == log_id).first()
    if not log_entry:
        raise HTTPException(status_code=404, detail="Log entry not found")
        
    # Access Control
    if current_user.role == UserRole.PATIENT:
        if current_user.patient_id != log_entry.patient_id:
             raise HTTPException(status_code=403, detail="Access denied")
             
    elif current_user.role == UserRole.CARETAKER:
         link = db.query(CaretakerPatientLink).filter(
            CaretakerPatientLink.caretaker_id == current_user.id,
            CaretakerPatientLink.patient_id == log_entry.patient_id
        ).first()
         if not link:
             raise HTTPException(status_code=403, detail="Access denied")
    else:
        # Admin/Nurse/Doctor allow?
        pass # For now assume okay if they have the ID, or restrict. strict is better.
        if current_user.role not in [UserRole.ADMIN, UserRole.NURSE, UserRole.DOCTOR]:
             raise HTTPException(status_code=403, detail="Access denied")

    old_status = log_entry.status
    log_entry.status = update_data.status
    
    if update_data.status == "TAKEN" and not log_entry.taken_at:
        log_entry.taken_at = datetime.utcnow()
    elif update_data.status != "TAKEN":
        log_entry.taken_at = None # Reset if changed to missed/skipped? Or keep it? keeping it simple.

    # Find the reminder to adjust count
    reminder = db.query(Reminder).filter(
        Reminder.patient_id == log_entry.patient_id,
        Reminder.medicine_name == log_entry.medicine_name,
        Reminder.is_active == True
    ).first()

    if reminder:
        if old_status != "TAKEN" and update_data.status == "TAKEN":
            reminder.remaining_count = max(0, reminder.remaining_count - 1)
        elif old_status == "TAKEN" and update_data.status != "TAKEN":
            reminder.remaining_count += 1
            
    db.commit()
    db.refresh(log_entry)
    return log_entry
