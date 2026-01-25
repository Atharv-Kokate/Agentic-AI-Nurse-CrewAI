from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID

from database.session import get_db
from database.models import User, Patient, UserRole
from auth.dependencies import get_current_active_user, require_roles

router = APIRouter(prefix="/api/v1/patients", tags=["Patients"])


# --- Pydantic Schemas ---

class PatientCreate(BaseModel):
    name: str
    age: int
    gender: str
    contact_number: str
    known_conditions: dict = Field(default_factory=dict)
    reported_symptoms: dict = Field(default_factory=dict)
    assigned_doctor: Optional[str] = None
    next_appointment_date: Optional[datetime] = None

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "John Doe",
                    "age": 55,
                    "gender": "Male",
                    "contact_number": "555-1234",
                    "known_conditions": {"conditions": ["hypertension", "diabetes"]},
                    "reported_symptoms": {"symptoms": ["headache", "fatigue"]},
                    "assigned_doctor": "Dr. Smith",
                    "next_appointment_date": None
                }
            ]
        }
    }


class PatientUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    contact_number: Optional[str] = None
    known_conditions: Optional[dict] = None
    reported_symptoms: Optional[dict] = None
    assigned_doctor: Optional[str] = None
    next_appointment_date: Optional[datetime] = None


class PatientResponse(BaseModel):
    id: UUID
    name: str
    age: int
    gender: str
    contact_number: str
    known_conditions: dict
    reported_symptoms: dict
    assigned_doctor: Optional[str] = None
    next_appointment_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True
    }


# --- Routes ---

@router.post("/", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
def create_patient(
    patient_data: PatientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.NURSE]))
):
    """
    Create a new patient record. Only ADMIN and NURSE can create patients.
    """
    # Check if contact number already exists
    existing_patient = db.query(Patient).filter(
        Patient.contact_number == patient_data.contact_number
    ).first()
    
    if existing_patient:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Patient with this contact number already exists"
        )
    
    new_patient = Patient(
        name=patient_data.name,
        age=patient_data.age,
        gender=patient_data.gender,
        contact_number=patient_data.contact_number,
        known_conditions=patient_data.known_conditions,
        reported_symptoms=patient_data.reported_symptoms,
        assigned_doctor=patient_data.assigned_doctor,
        next_appointment_date=patient_data.next_appointment_date
    )
    
    db.add(new_patient)
    db.commit()
    db.refresh(new_patient)
    
    return new_patient


@router.get("/", response_model=List[PatientResponse])
def list_patients(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.NURSE, UserRole.DOCTOR]))
):
    """
    List all patients. Only medical staff (ADMIN, NURSE, DOCTOR) can view all patients.
    """
    patients = db.query(Patient).offset(skip).limit(limit).all()
    return patients


@router.get("/me", response_model=PatientResponse)
def get_my_patient_record(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get the current user's own patient record (for PATIENT role users).
    """
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This endpoint is only for patient users. Use /patients/{id} instead."
        )
    
    if not current_user.patient_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No patient record linked to this user"
        )
    
    patient = db.query(Patient).filter(Patient.id == current_user.patient_id).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient record not found"
        )
    
    return patient


@router.get("/{patient_id}", response_model=PatientResponse)
def get_patient(
    patient_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get a specific patient by ID.
    - Medical staff can view any patient
    - Patients can only view their own record
    """
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found"
        )
    
    # Check access permissions
    if current_user.role == UserRole.PATIENT:
        if current_user.patient_id != patient_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view your own patient record"
            )
    
    return patient


@router.put("/{patient_id}", response_model=PatientResponse)
def update_patient(
    patient_id: UUID,
    patient_data: PatientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.NURSE]))
):
    """
    Update a patient record. Only ADMIN and NURSE can update patients.
    """
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found"
        )
    
    # Update only provided fields
    update_data = patient_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(patient, field, value)
    
    patient.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(patient)
    
    return patient


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_patient(
    patient_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN]))
):
    """
    Delete a patient record. Only ADMIN can delete patients.
    """
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient not found"
        )
    
    # Check if patient has linked user account
    linked_user = db.query(User).filter(User.patient_id == patient_id).first()
    if linked_user:
        # Unlink the user from patient before deleting
        linked_user.patient_id = None
        db.commit()
    
    db.delete(patient)
    db.commit()
    
    db.delete(patient)
    db.commit()
    
    return None

from database.models import ai_assesments

@router.get("/{patient_id}/history")
def get_patient_history(
    patient_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get assessment history for a specific patient.
    """
    # Authorization check
    if current_user.role == UserRole.PATIENT:
        if current_user.patient_id != patient_id:
             raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view your own history"
            )

    history = db.query(ai_assesments).filter(
        ai_assesments.patient_id == patient_id
    ).order_by(ai_assesments.created_at.desc()).all()
    
    return history
