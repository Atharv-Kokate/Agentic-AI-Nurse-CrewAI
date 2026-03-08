"""
Patient Context Builder for Adaptive Task Planning.

Aggregates historical signals (compliance, vitals, medication adherence, risk,
alerts) into a compact, structured context dict that the AI planner uses to
generate personalized daily tasks.

Design goals:
  - Token-efficient: only the signals that matter, not raw data dumps.
  - Actionable: every field directly maps to an AI planning rule.
"""

from datetime import datetime, date, timedelta
from collections import defaultdict
from sqlalchemy.orm import Session
from uuid import UUID

from database.models import (
    Patient, DailyTask, MedicationLog, monitoring_logs,
    ai_assesments, alerts, DoctorRecommendation
)


# ---------------------------------------------------------------------------
# Helpers (shared logic with health_summary.py, kept lightweight)
# ---------------------------------------------------------------------------

def _parse_bp(bp_str):
    try:
        parts = bp_str.strip().split("/")
        return int(parts[0]), int(parts[1])
    except Exception:
        return None, None


def _safe_int(val):
    try:
        return int(val)
    except Exception:
        return None


def _compute_trend(scores: list) -> str:
    """Compare recent vs older half of scores."""
    if len(scores) < 2:
        return "stable"
    mid = len(scores) // 2
    older_avg = sum(scores[:mid]) / len(scores[:mid])
    newer_avg = sum(scores[mid:]) / len(scores[mid:])
    diff = newer_avg - older_avg
    if diff < -5:
        return "improving"
    elif diff > 5:
        return "deteriorating"
    return "stable"


# ---------------------------------------------------------------------------
# Core builder
# ---------------------------------------------------------------------------

def build_patient_context(patient_id: UUID, db: Session) -> dict:
    """
    Build a compact patient context dict for the AI task planner.

    Returns a dict with sections:
      profile, compliance, skipped_tasks, medication_adherence,
      vitals_summary, risk, active_alerts, health_score,
      recent_recommendations
    """
    now = datetime.utcnow()
    today_start = datetime.combine(date.today(), datetime.min.time())
    three_days_ago = now - timedelta(days=3)
    seven_days_ago = now - timedelta(days=7)

    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        return {"error": "Patient not found"}

    # -----------------------------------------------------------------------
    # 1. PROFILE (compact — only what the AI needs for task planning)
    # -----------------------------------------------------------------------
    profile = {
        "age": patient.age,
        "gender": patient.gender,
        "known_conditions": patient.known_conditions or [],
        "condition_tags": patient.condition_tags or [],
        "current_medications": patient.current_medications or [],
        "reported_symptoms": patient.reported_symptoms or [],
    }

    # -----------------------------------------------------------------------
    # 2. TASK COMPLIANCE (last 7 days, broken down by category)
    # -----------------------------------------------------------------------
    week_tasks = db.query(DailyTask).filter(
        DailyTask.patient_id == patient_id,
        DailyTask.scheduled_date >= seven_days_ago,
    ).all()

    category_stats = defaultdict(lambda: {"total": 0, "completed": 0, "skipped": 0})
    for t in week_tasks:
        cat = t.category or "General"
        category_stats[cat]["total"] += 1
        if t.status_patient == "COMPLETED":
            category_stats[cat]["completed"] += 1
        elif t.status_patient == "SKIPPED":
            category_stats[cat]["skipped"] += 1

    compliance_by_category = {}
    for cat, s in category_stats.items():
        rate = round((s["completed"] / s["total"]) * 100, 1) if s["total"] > 0 else None
        compliance_by_category[cat] = {
            "completion_rate": rate,
            "total": s["total"],
            "completed": s["completed"],
            "skipped": s["skipped"],
        }

    overall_total = sum(s["total"] for s in category_stats.values())
    overall_completed = sum(s["completed"] for s in category_stats.values())
    overall_rate = round((overall_completed / overall_total) * 100, 1) if overall_total > 0 else None

    # -----------------------------------------------------------------------
    # 3. RECENTLY SKIPPED / REFUSED TASKS (last 3 days — for remediation)
    # -----------------------------------------------------------------------
    recent_tasks = db.query(DailyTask).filter(
        DailyTask.patient_id == patient_id,
        DailyTask.scheduled_date >= three_days_ago,
    ).all()

    skipped_descriptions = []
    for t in recent_tasks:
        if t.status_patient == "SKIPPED" or t.status_caretaker == "REFUSED":
            skipped_descriptions.append({
                "task": t.task_description,
                "category": t.category,
                "date": t.scheduled_date.strftime("%Y-%m-%d") if t.scheduled_date else "unknown",
            })

    # Deduplicate by task description and count repeats
    skip_counts = defaultdict(lambda: {"count": 0, "category": "", "dates": []})
    for s in skipped_descriptions:
        key = s["task"]
        skip_counts[key]["count"] += 1
        skip_counts[key]["category"] = s["category"]
        skip_counts[key]["dates"].append(s["date"])

    repeated_skips = [
        {"task": k, "category": v["category"], "skipped_days": v["count"]}
        for k, v in skip_counts.items()
        if v["count"] >= 2  # only surface tasks skipped 2+ times
    ]

    # -----------------------------------------------------------------------
    # 4. MEDICATION ADHERENCE (last 7 days)
    # -----------------------------------------------------------------------
    week_meds = db.query(MedicationLog).filter(
        MedicationLog.patient_id == patient_id,
        MedicationLog.scheduled_time >= seven_days_ago,
    ).all()

    total_meds = len(week_meds)
    taken_meds = sum(
        1 for m in week_meds
        if m.status == "TAKEN" or m.status_patient == "TAKEN"
    )
    adherence_rate = round((taken_meds / total_meds) * 100, 1) if total_meds > 0 else None

    # Find specific missed medications (names)
    missed_med_names = list({
        m.medicine_name
        for m in week_meds
        if m.status in ("MISSED", "SKIPPED") or m.status_patient in ("SKIPPED",)
    })

    # -----------------------------------------------------------------------
    # 5. VITALS SUMMARY (latest + anomalies from last 7 days)
    # -----------------------------------------------------------------------
    recent_vitals = db.query(monitoring_logs).filter(
        monitoring_logs.patient_id == patient_id,
        monitoring_logs.created_at >= seven_days_ago,
    ).order_by(monitoring_logs.created_at.desc()).all()

    latest_vitals = None
    anomalies = []

    if recent_vitals:
        v = recent_vitals[0]
        sys_val, dia_val = _parse_bp(v.blood_pressure) if v.blood_pressure else (None, None)
        latest_vitals = {
            "blood_pressure": v.blood_pressure,
            "heart_rate": _safe_int(v.heart_rate),
            "blood_sugar": _safe_int(v.blood_sugar),
            "sleep_hours": v.sleep_hours,
            "date": v.created_at.strftime("%Y-%m-%d"),
        }

        # Detect anomalies across last 7 readings
        for vr in recent_vitals[:7]:
            s, d = _parse_bp(vr.blood_pressure) if vr.blood_pressure else (None, None)
            if s and (s > 140 or s < 90):
                anomalies.append(f"BP {vr.blood_pressure} on {vr.created_at.strftime('%m/%d')}")
            hr = _safe_int(vr.heart_rate)
            if hr and (hr > 100 or hr < 60):
                anomalies.append(f"HR {hr}bpm on {vr.created_at.strftime('%m/%d')}")
            bs = _safe_int(vr.blood_sugar)
            if bs and (bs > 140 or bs < 70):
                anomalies.append(f"Sugar {bs}mg/dL on {vr.created_at.strftime('%m/%d')}")

    # Deduplicate and cap anomalies
    anomalies = list(dict.fromkeys(anomalies))[:5]

    # -----------------------------------------------------------------------
    # 6. RISK ASSESSMENT (current + trend)
    # -----------------------------------------------------------------------
    risk_records = db.query(ai_assesments).filter(
        ai_assesments.patient_id == patient_id,
    ).order_by(ai_assesments.created_at.asc()).all()

    risk_scores = [r.risk_score for r in risk_records]
    current_risk = {
        "score": risk_scores[-1] if risk_scores else 0,
        "level": risk_records[-1].risk_level if risk_records else "UNKNOWN",
        "trend": _compute_trend(risk_scores),
    }

    # -----------------------------------------------------------------------
    # 7. ACTIVE ALERTS (unresolved)
    # -----------------------------------------------------------------------
    active_alerts = db.query(alerts).filter(
        alerts.patient_id == patient_id,
        alerts.call_received == False,
    ).order_by(alerts.created_at.desc()).limit(3).all()

    alert_summaries = [
        {"type": a.alert_type, "message": a.alert_message[:100]}
        for a in active_alerts
    ]

    # -----------------------------------------------------------------------
    # 8. COMPOSITE HEALTH SCORE
    # -----------------------------------------------------------------------
    # Recompute a lightweight health score (same formula as health_summary.py)
    vitals_normal_pct = 100
    if recent_vitals:
        total_checks = 0
        normal_checks = 0
        for vr in recent_vitals[:7]:
            s, d = _parse_bp(vr.blood_pressure) if vr.blood_pressure else (None, None)
            if s is not None:
                total_checks += 1
                normal_checks += 1 if 90 <= s <= 140 else 0
            if d is not None:
                total_checks += 1
                normal_checks += 1 if 60 <= d <= 90 else 0
            hr = _safe_int(vr.heart_rate)
            if hr is not None:
                total_checks += 1
                normal_checks += 1 if 60 <= hr <= 100 else 0
            bs = _safe_int(vr.blood_sugar)
            if bs is not None:
                total_checks += 1
                normal_checks += 1 if 70 <= bs <= 140 else 0
        vitals_normal_pct = round((normal_checks / total_checks) * 100, 1) if total_checks > 0 else 100

    inverted_risk = 100 - current_risk["score"]
    med_adh = adherence_rate if adherence_rate is not None else 100
    task_comp = overall_rate if overall_rate is not None else 100
    health_score = round(
        inverted_risk * 0.4 + med_adh * 0.25 + task_comp * 0.15 + vitals_normal_pct * 0.20,
        1,
    )
    health_score = max(0, min(100, health_score))

    # -----------------------------------------------------------------------
    # 9. RECENT DOCTOR RECOMMENDATIONS (unreviewed)
    # -----------------------------------------------------------------------
    recent_recs = db.query(DoctorRecommendation).filter(
        DoctorRecommendation.patient_id == patient_id,
        DoctorRecommendation.is_reviewed == False,
    ).order_by(DoctorRecommendation.created_at.desc()).limit(2).all()

    rec_summaries = [r.recommendation_summary[:120] for r in recent_recs]

    # -----------------------------------------------------------------------
    # ASSEMBLE CONTEXT (compact, token-efficient)
    # -----------------------------------------------------------------------
    return {
        "profile": profile,
        "compliance": {
            "overall_7d_rate": overall_rate,
            "by_category": compliance_by_category,
        },
        "repeatedly_skipped_tasks": repeated_skips,
        "medication_adherence": {
            "rate_7d": adherence_rate,
            "missed_medications": missed_med_names[:5],
        },
        "vitals_summary": {
            "latest": latest_vitals,
            "anomalies": anomalies,
        },
        "risk": current_risk,
        "active_alerts": alert_summaries,
        "health_score": {
            "score": health_score,
            "trend": current_risk["trend"],
        },
        "recent_recommendations": rec_summaries,
    }
