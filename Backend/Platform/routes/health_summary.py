"""
Patient Health Summary Aggregation Endpoint
Provides a single comprehensive endpoint that aggregates all patient health data
for the Patient Health Dashboard.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_
from datetime import datetime, date, timedelta
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from uuid import UUID

from database.session import get_db
from database.models import (
    User, Patient, ai_assesments, alerts, monitoring_logs,
    MedicationLog, DailyTask, DoctorRecommendation, AgentInteraction,
    Reminder, UserRole, CaretakerPatientLink
)
from auth.dependencies import get_current_active_user

router = APIRouter(prefix="/api/v1/patients", tags=["Health Summary"])

# --- Pydantic Response Models ---

class VitalReading(BaseModel):
    date: str
    blood_pressure: Optional[str] = None
    systolic: Optional[int] = None
    diastolic: Optional[int] = None
    heart_rate: Optional[int] = None
    blood_sugar: Optional[int] = None
    sleep_hours: Optional[int] = None

class RiskEntry(BaseModel):
    date: str
    score: int
    level: str

class MedLogEntry(BaseModel):
    id: str
    medicine_name: str
    scheduled_time: str
    status: str
    status_patient: Optional[str] = "PENDING"
    status_caretaker: Optional[str] = "PENDING"

class TaskEntry(BaseModel):
    id: str
    task_description: str
    category: str
    status_patient: Optional[str] = "PENDING"
    status_caretaker: Optional[str] = "PENDING"

class AlertEntry(BaseModel):
    id: str
    alert_type: str
    alert_message: str
    call_received: bool
    created_at: str

class RecommendationEntry(BaseModel):
    id: str
    doctor_name: Optional[str] = None
    recommendation_summary: str
    medication_advice: Optional[str] = None
    escalation_level: str
    created_at: str

class PatientProfile(BaseModel):
    id: str
    name: str
    age: int
    gender: str
    contact_number: str
    known_conditions: Any
    reported_symptoms: Any
    current_medications: Any
    assigned_doctor: Optional[str] = None
    next_appointment_date: Optional[str] = None

class HealthSummaryResponse(BaseModel):
    patient: PatientProfile
    health_score: float
    health_score_trend: str  # "improving", "stable", "deteriorating"
    risk: Dict[str, Any]
    vitals: Dict[str, Any]
    medications: Dict[str, Any]
    tasks: Dict[str, Any]
    alerts: Dict[str, Any]
    recommendations: List[RecommendationEntry]
    pending_interactions: int


# --- Helper Functions ---

def parse_bp(bp_str: str):
    """Parse blood pressure string like '120/80' into systolic and diastolic."""
    try:
        parts = bp_str.strip().split("/")
        return int(parts[0]), int(parts[1])
    except:
        return None, None

def safe_int(val):
    """Safely convert a value to int."""
    try:
        return int(val)
    except:
        return None

def compute_vitals_normal_pct(vitals_list):
    """
    Compute the percentage of vitals readings that are within normal range.
    Normal ranges:
      - Systolic BP: 90-140
      - Diastolic BP: 60-90
      - Heart Rate: 60-100
      - Blood Sugar: 70-140
    """
    if not vitals_list:
        return 100  # No data = assume normal
    
    total_checks = 0
    normal_checks = 0
    
    for v in vitals_list:
        # Blood pressure
        if v.blood_pressure:
            sys, dia = parse_bp(v.blood_pressure)
            if sys is not None:
                total_checks += 1
                if 90 <= sys <= 140:
                    normal_checks += 1
            if dia is not None:
                total_checks += 1
                if 60 <= dia <= 90:
                    normal_checks += 1
        
        # Heart rate
        hr = safe_int(v.heart_rate)
        if hr is not None:
            total_checks += 1
            if 60 <= hr <= 100:
                normal_checks += 1
        
        # Blood sugar
        bs = safe_int(v.blood_sugar)
        if bs is not None:
            total_checks += 1
            if 70 <= bs <= 140:
                normal_checks += 1
    
    if total_checks == 0:
        return 100
    return round((normal_checks / total_checks) * 100, 1)


def compute_trend(scores: List[int]) -> str:
    """
    Compare average of recent half vs older half of scores.
    Returns: 'improving', 'stable', or 'deteriorating'
    """
    if len(scores) < 2:
        return "stable"
    
    mid = len(scores) // 2
    older = scores[:mid]  # Earlier scores
    newer = scores[mid:]  # More recent scores
    
    older_avg = sum(older) / len(older)
    newer_avg = sum(newer) / len(newer)
    
    diff = newer_avg - older_avg
    if diff < -5:
        return "improving"  # Risk score going down = improving
    elif diff > 5:
        return "deteriorating"  # Risk score going up = deteriorating
    return "stable"


# --- Main Endpoint ---

@router.get("/{patient_id}/health-summary")
def get_health_summary(
    patient_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Aggregated health summary for the Patient Health Dashboard.
    Accessible by: the patient themselves, their linked caretakers, and medical staff.
    """
    # --- Authorization ---
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Check access permissions
    if current_user.role == UserRole.PATIENT:
        if current_user.patient_id != patient_id:
            raise HTTPException(status_code=403, detail="Access denied")
    elif current_user.role == UserRole.CARETAKER:
        link = db.query(CaretakerPatientLink).filter(
            CaretakerPatientLink.caretaker_id == current_user.id,
            CaretakerPatientLink.patient_id == patient_id
        ).first()
        if not link:
            raise HTTPException(status_code=403, detail="Access denied")
    elif current_user.role not in [UserRole.ADMIN, UserRole.NURSE, UserRole.DOCTOR]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # --- Time Ranges ---
    now = datetime.utcnow()
    today_start = datetime.combine(date.today(), datetime.min.time())
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)
    
    # ===========================
    # 1. PATIENT PROFILE
    # ===========================
    patient_profile = PatientProfile(
        id=str(patient.id),
        name=patient.name,
        age=patient.age,
        gender=patient.gender,
        contact_number=patient.contact_number,
        known_conditions=patient.known_conditions,
        reported_symptoms=patient.reported_symptoms,
        current_medications=patient.current_medications,
        assigned_doctor=patient.assigned_doctor,
        next_appointment_date=str(patient.next_appointment_date) if patient.next_appointment_date else None
    )
    
    # ===========================
    # 2. AI RISK ASSESSMENTS
    # ===========================
    risk_assessments = db.query(ai_assesments).filter(
        ai_assesments.patient_id == patient_id
    ).order_by(ai_assesments.created_at.asc()).all()
    
    risk_history = []
    risk_scores = []
    for a in risk_assessments:
        risk_history.append(RiskEntry(
            date=a.created_at.strftime("%Y-%m-%d %H:%M"),
            score=a.risk_score,
            level=a.risk_level
        ))
        risk_scores.append(a.risk_score)
    
    current_risk_score = risk_scores[-1] if risk_scores else 0
    current_risk_level = risk_assessments[-1].risk_level if risk_assessments else "UNKNOWN"
    latest_reasoning = risk_assessments[-1].reasoning if risk_assessments else {}
    risk_trend = compute_trend(risk_scores)
    
    risk_data = {
        "current_score": current_risk_score,
        "current_level": current_risk_level,
        "trend_direction": risk_trend,
        "history": [r.dict() for r in risk_history[-30:]],  # Last 30 entries
        "latest_reasoning": latest_reasoning
    }
    
    # ===========================
    # 3. VITALS HISTORY
    # ===========================
    vitals_records = db.query(monitoring_logs).filter(
        monitoring_logs.patient_id == patient_id,
        monitoring_logs.created_at >= thirty_days_ago
    ).order_by(monitoring_logs.created_at.asc()).all()
    
    vitals_history = []
    for v in vitals_records:
        sys_val, dia_val = parse_bp(v.blood_pressure) if v.blood_pressure else (None, None)
        vitals_history.append(VitalReading(
            date=v.created_at.strftime("%Y-%m-%d %H:%M"),
            blood_pressure=v.blood_pressure,
            systolic=sys_val,
            diastolic=dia_val,
            heart_rate=safe_int(v.heart_rate),
            blood_sugar=safe_int(v.blood_sugar),
            sleep_hours=v.sleep_hours
        ))
    
    # Latest vitals
    latest_vitals = vitals_history[-1] if vitals_history else None
    
    # Anomalies detection
    anomalies = []
    for v in vitals_history[-7:]:  # Check last 7 readings
        if v.systolic and (v.systolic > 140 or v.systolic < 90):
            anomalies.append(f"Blood pressure abnormal ({v.blood_pressure}) on {v.date}")
        if v.heart_rate and (v.heart_rate > 100 or v.heart_rate < 60):
            anomalies.append(f"Heart rate abnormal ({v.heart_rate} bpm) on {v.date}")
        if v.blood_sugar and (v.blood_sugar > 140 or v.blood_sugar < 70):
            anomalies.append(f"Blood sugar abnormal ({v.blood_sugar} mg/dL) on {v.date}")
    
    # Vitals normal percentage for health score
    recent_vitals = db.query(monitoring_logs).filter(
        monitoring_logs.patient_id == patient_id,
        monitoring_logs.created_at >= seven_days_ago
    ).all()
    vitals_normal_pct = compute_vitals_normal_pct(recent_vitals)
    
    vitals_data = {
        "latest": latest_vitals.dict() if latest_vitals else None,
        "history": [v.dict() for v in vitals_history],
        "anomalies": anomalies[:10],  # Cap at 10
        "vitals_normal_pct": vitals_normal_pct
    }
    
    # ===========================
    # 4. MEDICATION ADHERENCE
    # ===========================
    # Today's medications
    today_meds = db.query(MedicationLog).filter(
        MedicationLog.patient_id == patient_id,
        MedicationLog.scheduled_time >= today_start
    ).order_by(MedicationLog.scheduled_time.asc()).all()
    
    today_med_entries = [MedLogEntry(
        id=str(m.id),
        medicine_name=m.medicine_name,
        scheduled_time=m.scheduled_time.strftime("%H:%M"),
        status=m.status,
        status_patient=m.status_patient,
        status_caretaker=m.status_caretaker
    ) for m in today_meds]
    
    # 7-day adherence
    week_meds = db.query(MedicationLog).filter(
        MedicationLog.patient_id == patient_id,
        MedicationLog.scheduled_time >= seven_days_ago
    ).all()
    
    total_week = len(week_meds) if week_meds else 0
    taken_week = sum(1 for m in week_meds if m.status in ("TAKEN",) or m.status_patient == "TAKEN")
    adherence_7d = round((taken_week / total_week) * 100, 1) if total_week > 0 else 100
    
    # 30-day adherence
    month_meds = db.query(MedicationLog).filter(
        MedicationLog.patient_id == patient_id,
        MedicationLog.scheduled_time >= thirty_days_ago
    ).all()
    
    total_month = len(month_meds) if month_meds else 0
    taken_month = sum(1 for m in month_meds if m.status in ("TAKEN",) or m.status_patient == "TAKEN")
    adherence_30d = round((taken_month / total_month) * 100, 1) if total_month > 0 else 100
    
    # Daily adherence for heatmap (last 30 days)
    daily_adherence = {}
    for m in month_meds:
        day_key = m.scheduled_time.strftime("%Y-%m-%d")
        if day_key not in daily_adherence:
            daily_adherence[day_key] = {"total": 0, "taken": 0}
        daily_adherence[day_key]["total"] += 1
        if m.status in ("TAKEN",) or m.status_patient == "TAKEN":
            daily_adherence[day_key]["taken"] += 1
    
    adherence_heatmap = []
    for day_key, counts in sorted(daily_adherence.items()):
        pct = round((counts["taken"] / counts["total"]) * 100) if counts["total"] > 0 else 0
        adherence_heatmap.append({"date": day_key, "adherence": pct})
    
    medications_data = {
        "today": [m.dict() for m in today_med_entries],
        "adherence_7d": adherence_7d,
        "adherence_30d": adherence_30d,
        "adherence_heatmap": adherence_heatmap,
        "total_today": len(today_meds),
        "taken_today": sum(1 for m in today_meds if m.status in ("TAKEN",) or m.status_patient == "TAKEN"),
        "pending_today": sum(1 for m in today_meds if m.status_patient == "PENDING")
    }
    
    # ===========================
    # 5. DAILY TASKS
    # ===========================
    today_tasks = db.query(DailyTask).filter(
        DailyTask.patient_id == patient_id,
        DailyTask.scheduled_date >= today_start
    ).all()
    
    today_task_entries = [TaskEntry(
        id=str(t.id),
        task_description=t.task_description,
        category=t.category,
        status_patient=t.status_patient,
        status_caretaker=t.status_caretaker
    ) for t in today_tasks]
    
    # Weekly compliance
    week_tasks = db.query(DailyTask).filter(
        DailyTask.patient_id == patient_id,
        DailyTask.scheduled_date >= seven_days_ago
    ).all()
    
    total_week_tasks = len(week_tasks) if week_tasks else 0
    completed_week_tasks = sum(1 for t in week_tasks if t.status_patient == "COMPLETED")
    compliance_7d = round((completed_week_tasks / total_week_tasks) * 100, 1) if total_week_tasks > 0 else 100
    
    tasks_data = {
        "today": [t.dict() for t in today_task_entries],
        "total_today": len(today_tasks),
        "completed_today": sum(1 for t in today_tasks if t.status_patient == "COMPLETED"),
        "compliance_7d": compliance_7d
    }
    
    # ===========================
    # 6. ALERTS
    # ===========================
    active_alerts = db.query(alerts).filter(
        alerts.patient_id == patient_id,
        alerts.call_received == False
    ).order_by(alerts.created_at.desc()).all()
    
    all_recent_alerts = db.query(alerts).filter(
        alerts.patient_id == patient_id,
        alerts.created_at >= seven_days_ago
    ).order_by(alerts.created_at.desc()).all()
    
    alert_entries = [AlertEntry(
        id=str(a.id),
        alert_type=a.alert_type,
        alert_message=a.alert_message,
        call_received=a.call_received,
        created_at=a.created_at.strftime("%Y-%m-%d %H:%M")
    ) for a in all_recent_alerts]
    
    alerts_data = {
        "active": [a.dict() for a in alert_entries if not a.call_received],
        "recent": [a.dict() for a in alert_entries],
        "active_count": len(active_alerts)
    }
    
    # ===========================
    # 7. DOCTOR RECOMMENDATIONS
    # ===========================
    recent_recs = db.query(DoctorRecommendation).filter(
        DoctorRecommendation.patient_id == patient_id
    ).order_by(DoctorRecommendation.created_at.desc()).limit(5).all()
    
    recommendations = [RecommendationEntry(
        id=str(r.id),
        doctor_name=r.doctor_name,
        recommendation_summary=r.recommendation_summary,
        medication_advice=r.medication_advice,
        escalation_level=r.escalation_level,
        created_at=r.created_at.strftime("%Y-%m-%d %H:%M")
    ) for r in recent_recs]
    
    # ===========================
    # 8. PENDING INTERACTIONS (HITL)
    # ===========================
    pending_count = db.query(AgentInteraction).filter(
        AgentInteraction.patient_id == patient_id,
        AgentInteraction.status == "PENDING"
    ).count()
    
    # ===========================
    # 9. COMPOSITE HEALTH SCORE
    # ===========================
    # Formula: (100 - risk_score) * 0.4 + med_adherence * 0.25 + task_compliance * 0.15 + vitals_normal * 0.20
    inverted_risk = 100 - current_risk_score
    health_score = round(
        inverted_risk * 0.4 +
        adherence_7d * 0.25 +
        compliance_7d * 0.15 +
        vitals_normal_pct * 0.20,
        1
    )
    
    # Clamp to 0-100
    health_score = max(0, min(100, health_score))
    
    # Health score trend (based on risk trend since it's the primary driver)
    health_score_trend = risk_trend
    if risk_trend == "improving":
        health_score_trend = "improving"
    elif risk_trend == "deteriorating":
        health_score_trend = "deteriorating"
    else:
        health_score_trend = "stable"
    
    # ===========================
    # BUILD RESPONSE
    # ===========================
    return {
        "patient": patient_profile.dict(),
        "health_score": health_score,
        "health_score_trend": health_score_trend,
        "risk": risk_data,
        "vitals": vitals_data,
        "medications": medications_data,
        "tasks": tasks_data,
        "alerts": alerts_data,
        "recommendations": [r.dict() for r in recommendations],
        "pending_interactions": pending_count
    }
