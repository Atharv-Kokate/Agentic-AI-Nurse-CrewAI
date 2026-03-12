"""
Severity Evaluation Engine for Monitoring Check-In Responses.

Hybrid approach:
  1. Rule-based evaluation for YES_NO, EMOJI_SCALE, COMPARISON responses
  2. AI fallback (Gemini) for FREE_TEXT responses

Severity levels: GREEN, YELLOW, ORANGE, RED
"""

import logging
from typing import Optional, List
from sqlalchemy.orm import Session
from uuid import UUID

from database.models import (
    MonitoringCheckIn, MonitoringQuestion, MonitoringResponse,
    Patient, alerts, CaretakerPatientLink
)

logger = logging.getLogger("severity_engine")

# ---------------------------------------------------------------------------
# Keyword-based severity rules for YES_NO questions
# When patient answers YES to these keywords in the question → escalate
# ---------------------------------------------------------------------------

# YES → RED (immediate concern)
RED_YES_KEYWORDS = [
    "wound red", "oozing", "bleeding", "breathing worse",
    "chest pain", "sudden increase", "fever",
]

# YES → ORANGE (needs attention)
ORANGE_YES_KEYWORDS = [
    "swelling", "dizzy", "lightheaded", "palpitation",
    "vision changes", "phlegm color", "yellow or green",
    "thirst", "dry mouth", "cuts", "sores",
]

# NO answer to these positive-action keywords → YELLOW (non-adherence)
YELLOW_NO_KEYWORDS = [
    "medication", "prescribed", "meals on schedule",
    "fluid limits", "inhaler", "blood sugar", "weigh yourself",
    "walk", "move around",
]


def _keyword_match(text: str, keywords: List[str]) -> bool:
    """Check if any keyword appears in the text (case-insensitive)."""
    text_lower = text.lower()
    return any(kw in text_lower for kw in keywords)


def evaluate_yes_no(question_text: str, answer: str) -> str:
    """Evaluate a YES_NO response based on question keywords."""
    answer_upper = answer.strip().upper()

    if answer_upper == "YES":
        if _keyword_match(question_text, RED_YES_KEYWORDS):
            return "RED"
        if _keyword_match(question_text, ORANGE_YES_KEYWORDS):
            return "ORANGE"
        # Generic YES to unknown question — neutral
        return "YELLOW"

    if answer_upper == "NO":
        if _keyword_match(question_text, YELLOW_NO_KEYWORDS):
            return "YELLOW"
        # NO to a symptom question is good
        return "GREEN"

    return "YELLOW"  # Ambiguous


def evaluate_emoji_scale(answer: str) -> str:
    """Evaluate EMOJI_SCALE: GOOD / OKAY / NOT_GREAT / BAD."""
    mapping = {
        "GOOD": "GREEN",
        "OKAY": "YELLOW",
        "NOT_GREAT": "ORANGE",
        "NOT GREAT": "ORANGE",
        "BAD": "RED",
    }
    return mapping.get(answer.strip().upper(), "YELLOW")


def evaluate_comparison(answer: str) -> str:
    """Evaluate COMPARISON: BETTER / SAME / WORSE."""
    mapping = {
        "BETTER": "GREEN",
        "SAME": "YELLOW",
        "WORSE": "ORANGE",
    }
    return mapping.get(answer.strip().upper(), "YELLOW")


# Severity ordering for computing max
SEVERITY_ORDER = {"GREEN": 0, "YELLOW": 1, "ORANGE": 2, "RED": 3}


def max_severity(severities: List[str]) -> str:
    """Return the highest severity from a list."""
    if not severities:
        return "GREEN"
    return max(severities, key=lambda s: SEVERITY_ORDER.get(s, 0))


def evaluate_single_response(
    question_text: str,
    response_type: str,
    answer_value: str,
) -> str:
    """
    Evaluate severity for a single response.
    Returns GREEN / YELLOW / ORANGE / RED.
    """
    if response_type == "YES_NO":
        return evaluate_yes_no(question_text, answer_value)
    elif response_type == "EMOJI_SCALE":
        return evaluate_emoji_scale(answer_value)
    elif response_type == "COMPARISON":
        return evaluate_comparison(answer_value)
    elif response_type == "FREE_TEXT":
        # For free text, do a simple keyword scan
        text_lower = answer_value.lower()
        red_words = ["emergency", "severe", "unbearable", "can't breathe", "bleeding", "fainted"]
        orange_words = ["worse", "painful", "swollen", "dizzy", "nauseous", "weak"]
        if any(w in text_lower for w in red_words):
            return "RED"
        if any(w in text_lower for w in orange_words):
            return "ORANGE"
        if len(answer_value.strip()) > 0:
            return "YELLOW"  # Free text provided = worth noting
        return "GREEN"

    return "YELLOW"


def evaluate_check_in(check_in_id: UUID, db: Session) -> dict:
    """
    Evaluate all responses for a check-in and populate evaluated_severity.

    Returns:
        {
            "overall_severity": "RED",
            "per_response": [
                {"question_id": ..., "severity": "RED", "question_text": ..., "answer": ...},
                ...
            ],
            "red_count": 1,
            "orange_count": 0,
        }
    """
    check_in = db.query(MonitoringCheckIn).filter(
        MonitoringCheckIn.id == check_in_id
    ).first()

    if not check_in:
        return {"overall_severity": "GREEN", "per_response": [], "red_count": 0, "orange_count": 0}

    # Load all responses with their parent questions
    responses = (
        db.query(MonitoringResponse, MonitoringQuestion)
        .join(MonitoringQuestion, MonitoringResponse.question_id == MonitoringQuestion.id)
        .filter(MonitoringQuestion.check_in_id == check_in_id)
        .all()
    )

    per_response = []
    severities = []

    for resp, question in responses:
        severity = evaluate_single_response(
            question_text=question.question_text,
            response_type=question.response_type,
            answer_value=resp.answer_value,
        )

        # Write severity to DB
        resp.evaluated_severity = severity
        severities.append(severity)

        per_response.append({
            "question_id": str(question.id),
            "question_text": question.question_text,
            "answer": resp.answer_value,
            "severity": severity,
        })

    db.commit()

    overall = max_severity(severities)
    red_count = severities.count("RED")
    orange_count = severities.count("ORANGE")

    logger.info(
        f"Check-in {check_in_id} evaluated: overall={overall}, "
        f"red={red_count}, orange={orange_count}, total={len(severities)}"
    )

    return {
        "overall_severity": overall,
        "per_response": per_response,
        "red_count": red_count,
        "orange_count": orange_count,
    }


def handle_severity_escalation(
    check_in_id: UUID,
    patient_id: UUID,
    overall_severity: str,
    db: Session,
):
    """
    If severity is ORANGE or RED, create an alert and notify caretakers.
    """
    if overall_severity not in ("ORANGE", "RED"):
        return

    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    patient_name = patient.name if patient else "Unknown"

    severity_label = "CRITICAL" if overall_severity == "RED" else "WARNING"
    alert_msg = (
        f"Monitoring check-in flagged {overall_severity} severity for {patient_name}. "
        f"Review patient responses immediately."
    )

    # Create alert record
    new_alert = alerts(
        patient_id=patient_id,
        alert_type=f"MONITORING_{severity_label}",
        alert_message=alert_msg,
        call_received=False,
    )
    db.add(new_alert)
    db.commit()

    # Send push notification to linked caretakers
    try:
        from notifications.service import NotificationService

        caretakers = db.query(CaretakerPatientLink).filter(
            CaretakerPatientLink.patient_id == patient_id
        ).all()

        title = (
            f"🚨 URGENT: {patient_name} check-in flagged {overall_severity}"
            if overall_severity == "RED"
            else f"⚠️ {patient_name} check-in needs attention"
        )

        for ct in caretakers:
            NotificationService.send_push_notification(
                db=db,
                user_id=ct.caretaker_id,
                title=title,
                body=alert_msg,
                event_type=f"MONITORING_{severity_label}",
                data={"click_action": f"/dashboard/patient/{patient_id}"},
            )
    except Exception as e:
        logger.error(f"Failed to send monitoring escalation notification: {e}")
