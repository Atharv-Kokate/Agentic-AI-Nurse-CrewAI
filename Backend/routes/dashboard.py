from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date
from typing import List, Optional
from pydantic import BaseModel

from database.session import get_db
from database.models import User, Patient, ai_assesments, alerts, AgentInteraction, UserRole
from auth.dependencies import require_roles

router = APIRouter(prefix="/api/v1/dashboard", tags=["Dashboard"])

# --- Models ---
class ActivityItem(BaseModel):
    id: str
    patient_name: str
    description: str
    time: datetime

class DashboardStats(BaseModel):
    total_patients: int
    critical_alerts: int
    active_monitoring: int
    completed_today: int
    recent_activity: List[ActivityItem]

# --- Routes ---
@router.get("/stats", response_model=DashboardStats)
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.NURSE, UserRole.DOCTOR]))
):
    # 1. Total Patients
    total_patients = db.query(Patient).count()

    # 2. Critical Alerts (Total alerts in DB for now, or filter by urgency if column existed properly, but alerts table has alert_type)
    # Let's count alerts that are active or just total alerts as a proxy if 'active' status isn't clear. 
    # The 'alerts' model has 'call_received' which might act as 'resolved'. 
    # Let's count alerts where call_received is False.
    critical_alerts = db.query(alerts).filter(alerts.call_received == False).count()

    # 3. Active Monitoring 
    # Proxy: Count of AgentInteractions that are PENDING (HITL)
    # Plus maybe assessments started recently without results? Hard to track without a 'Job' table.
    # Let's stick to Pending Interactions.
    active_monitoring = db.query(AgentInteraction).filter(AgentInteraction.status == "PENDING").count()

    # 4. Completed Today
    today_start = datetime.combine(date.today(), datetime.min.time())
    completed_today = db.query(ai_assesments).filter(ai_assesments.created_at >= today_start).count()

    # 5. Recent Activity
    # Fetch last 5 assessments joined with Patient Name
    recent_assessments = db.query(ai_assesments, Patient.name).join(Patient, ai_assesments.patient_id == Patient.id)\
        .order_by(ai_assesments.created_at.desc()).limit(5).all()
    
    recent_activity = []
    for assessment, patient_name in recent_assessments:
        recent_activity.append(ActivityItem(
            id=str(assessment.id),
            patient_name=patient_name,
            description=f"Assessment completed: {assessment.risk_level} Risk",
            time=assessment.created_at
        ))

    return DashboardStats(
        total_patients=total_patients,
        critical_alerts=critical_alerts,
        active_monitoring=active_monitoring,
        completed_today=completed_today,
        recent_activity=recent_activity
    )
