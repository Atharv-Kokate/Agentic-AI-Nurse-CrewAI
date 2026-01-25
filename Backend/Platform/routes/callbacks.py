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
