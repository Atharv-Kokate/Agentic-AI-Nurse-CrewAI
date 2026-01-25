from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
import uuid

from database.session import get_db
from database.models import Reminder, User, UserRole, Patient
from auth.dependencies import require_roles, get_current_active_user

router = APIRouter(prefix="/api/v1/reminders", tags=["Reminders"])

# --- Schemas ---
class ReminderCreate(BaseModel):
    medicine_name: str
    dosage: str
    schedule_time: str # HH:MM

class ReminderResponse(BaseModel):
    id: str
    medicine_name: str
    dosage: str
    schedule_time: str
    is_active: bool

# --- Routes ---

@router.get("/", response_model=List[ReminderResponse])
def get_my_reminders(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.PATIENT]))
):
    """
    Get all active reminders for the logged-in patient.
    """
    if not current_user.patient_id:
        raise HTTPException(status_code=400, detail="User is not linked to a patient record.")

    reminders = db.query(Reminder).filter(
        Reminder.patient_id == current_user.patient_id,
        Reminder.is_active == True
    ).all()

    return [
        ReminderResponse(
            id=str(r.id),
            medicine_name=r.medicine_name,
            dosage=r.dosage,
            schedule_time=r.schedule_time,
            is_active=r.is_active
        ) for r in reminders
    ]

import httpx
import os
import logging

# ... imports ...

# Change to async
@router.post("/", response_model=ReminderResponse)
async def create_reminder(
    reminder: ReminderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.PATIENT]))
):
    """
    Create a new medicine reminder and trigger n8n Webhook.
    """
    if not current_user.patient_id:
        raise HTTPException(status_code=400, detail="User is not linked to a patient record.")

    # 1. Save to Local DB (for UI)
    new_reminder = Reminder(
        patient_id=current_user.patient_id,
        medicine_name=reminder.medicine_name,
        dosage=reminder.dosage,
        schedule_time=reminder.schedule_time,
        is_active=True
    )
    
    db.add(new_reminder)
    db.commit()
    db.refresh(new_reminder)

    # 2. Trigger n8n Webhook
    # Configurable via env, default to modijiop test url
    webhook_url = os.getenv("N8N_REMINDER_WEBHOOK", "https://modijiop.app.n8n.cloud/webhook-test/nurse-reminder")
    if webhook_url:
        try:
            # Helper to get patient info. 
            # current_user.patient is lazy loaded, might need explicit join if session closed, 
            # but usually fine in same request. 
            # Safe way:
            patient = db.query(Patient).filter(Patient.id == current_user.patient_id).first()
            
            payload = {
                "action": "create",
                "reminder_id": str(new_reminder.id),
                "patient_name": patient.name,
                "phone_number": patient.contact_number,
                "medicine_name": new_reminder.medicine_name,
                "dosage": new_reminder.dosage,
                "schedule_time": new_reminder.schedule_time,
                "is_active": True
            }
            
            # Fire and forget (or await)
            async with httpx.AsyncClient() as client:
                await client.post(webhook_url, json=payload)
                
        except Exception as e:
            logging.error(f"Failed to trigger n8n webhook: {e}")
            # Don't fail the request just because webhook failed, but log it.

    return ReminderResponse(
        id=str(new_reminder.id),
        medicine_name=new_reminder.medicine_name,
        dosage=new_reminder.dosage,
        schedule_time=new_reminder.schedule_time,
        is_active=new_reminder.is_active
    )

@router.delete("/{reminder_id}")
def delete_reminder(
    reminder_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.PATIENT]))
):
    """
    Deactivate (soft delete) a reminder.
    """
    reminder = db.query(Reminder).filter(
        Reminder.id == reminder_id,
        Reminder.patient_id == current_user.patient_id
    ).first()

    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")

    reminder.is_active = False # Soft delete
    db.commit()

    return {"message": "Reminder deleted successfully"}
