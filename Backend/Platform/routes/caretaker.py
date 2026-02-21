from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from uuid import UUID

from database.session import get_db
from database.models import User, Patient, CaretakerPatientLink, UserRole
from auth.dependencies import get_current_active_user, require_roles

router = APIRouter(prefix="/api/v1/caretaker", tags=["Caretaker"])

class LinkPatientRequest(BaseModel):
    patient_id: UUID
    relationship: str

class PatientSummary(BaseModel):
    patient_id: UUID
    name: str
    relationship: str
    contact_number: str

@router.get("/my-patients", response_model=List[PatientSummary])
def get_my_patients(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.CARETAKER]))
):
    links = db.query(CaretakerPatientLink).filter(
        CaretakerPatientLink.caretaker_id == current_user.id
    ).all()
    
    results = []
    for link in links:
        patient = db.query(Patient).filter(Patient.id == link.patient_id).first()
        if patient:
            results.append(PatientSummary(
                patient_id=patient.id,
                name=patient.name,
                relationship=link.relationship,
                contact_number=patient.contact_number
            ))
    return results

@router.post("/link", status_code=status.HTTP_201_CREATED)
def link_patient(
    request: LinkPatientRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.CARETAKER]))
):
    # Verify patient exists
    patient = db.query(Patient).filter(Patient.id == request.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Check if already linked
    existing = db.query(CaretakerPatientLink).filter(
        CaretakerPatientLink.caretaker_id == current_user.id,
        CaretakerPatientLink.patient_id == request.patient_id
    ).first()
    
    if existing:
        return {"message": "Already linked"}

    new_link = CaretakerPatientLink(
        caretaker_id=current_user.id,
        patient_id=request.patient_id,
        relationship=request.relationship
    )
    db.add(new_link)
    db.commit()
    return {"message": "Linked successfully"}

@router.get("/test-push")
def test_caretaker_push(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.CARETAKER]))
):
    """Temporary endpoint to allow Caretakers to test Push Notifications to themselves."""
    from notifications.service import NotificationService
    
    success, msg = NotificationService.send_push_notification(
        db=db,
        user_id=current_user.id,
        title="Render Test Alert",
        body="If you see this, Firebase and Render are working perfectly!",
        event_type="TEST_EVENT",
        data={"click_action": "/dashboard"}
    )
    
    if success:
        return {"status": "success", "message": msg, "caretaker_id": str(current_user.id)}
    else:
        raise HTTPException(status_code=400, detail=f"Push failed: {msg}. Caretaker ID: {str(current_user.id)}")
