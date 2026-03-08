"""
Scheduler module — uses APScheduler to run periodic monitoring jobs.

Jobs:
  1. generate_all_check_ins: Every N hours, generate check-in questions for
     all patients who have condition_tags and no PENDING check-in.
  2. evaluate_unevaluated_responses: Safety net — evaluate any responses that
     were submitted but somehow missed severity evaluation.
"""

import os
import logging
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler

from database.session import SessionLocal
from database.models import (
    Patient, MonitoringCheckIn, MonitoringQuestion, MonitoringResponse
)

logger = logging.getLogger("scheduler")

# ---------------------------------------------------------------------------
# Configuration (via environment variables with sensible defaults)
# ---------------------------------------------------------------------------
CHECKIN_INTERVAL_HOURS = int(os.getenv("CHECKIN_INTERVAL_HOURS", "8"))
CHECKIN_EVALUATION_HOURS = int(os.getenv("CHECKIN_EVALUATION_HOURS", "2"))

_scheduler: BackgroundScheduler | None = None


# ---------------------------------------------------------------------------
# Job 1 — Generate check-ins for all eligible patients
# ---------------------------------------------------------------------------

def generate_all_check_ins():
    """
    Periodic job: for every patient with condition_tags, generate a new
    monitoring check-in unless they already have a PENDING one.
    """
    logger.info("⏰ [Scheduler] Running generate_all_check_ins ...")
    db = SessionLocal()

    try:
        # Patients who have at least one condition tag
        patients = db.query(Patient).filter(
            Patient.condition_tags.isnot(None),
            Patient.condition_tags != "{}",
        ).all()

        generated = 0
        skipped = 0

        for patient in patients:
            # Skip if any PENDING check-in exists (patient or caretaker side)
            pending = db.query(MonitoringCheckIn).filter(
                MonitoringCheckIn.patient_id == patient.id,
                (
                    (MonitoringCheckIn.status_patient == "PENDING")
                    | (MonitoringCheckIn.status_caretaker == "PENDING")
                ),
            ).first()

            if pending:
                skipped += 1
                continue

            try:
                from routes.monitoring import generate_check_in_for_patient

                result = generate_check_in_for_patient(patient, db)
                generated += 1
                logger.info(
                    f"  ✔ Generated {result['question_count']} questions for "
                    f"{patient.name} (id={patient.id})"
                )

                # Send push notification to patient
                _notify_patient_new_checkin(patient, db)

            except Exception as e:
                logger.error(f"  ✘ Failed for {patient.name}: {e}")
                db.rollback()

        logger.info(
            f"⏰ [Scheduler] generate_all_check_ins done: "
            f"generated={generated}, skipped={skipped}"
        )

    except Exception as e:
        logger.error(f"⏰ [Scheduler] generate_all_check_ins error: {e}")
    finally:
        db.close()


def _notify_patient_new_checkin(patient: Patient, db):
    """Send a push notification that a new check-in is ready."""
    try:
        from notifications.service import NotificationService

        notification_svc = NotificationService(db)
        notification_svc.send_push_notification(
            user_id=patient.user_id,
            title="📋 New Health Check-In",
            body="You have new monitoring questions to answer. Tap to respond.",
            data={"type": "NEW_CHECKIN", "patient_id": str(patient.id)},
        )
    except Exception as e:
        logger.warning(f"Push notify failed for patient {patient.id}: {e}")


# ---------------------------------------------------------------------------
# Job 2 — Safety net: evaluate any un-evaluated responses
# ---------------------------------------------------------------------------

def evaluate_unevaluated_responses():
    """
    Periodic safety net: find MonitoringResponses where evaluated_severity is
    NULL and run severity evaluation on their parent check-in.
    """
    logger.info("⏰ [Scheduler] Running evaluate_unevaluated_responses ...")
    db = SessionLocal()

    try:
        from severity_engine import evaluate_check_in, handle_severity_escalation

        # Responses missing severity that are older than 5 minutes
        # (give the normal submit flow time to evaluate first)
        cutoff = datetime.utcnow() - timedelta(minutes=5)

        unevaluated = (
            db.query(MonitoringResponse)
            .filter(
                MonitoringResponse.evaluated_severity.is_(None),
                MonitoringResponse.created_at <= cutoff,
            )
            .all()
        )

        if not unevaluated:
            logger.info("⏰ [Scheduler] No unevaluated responses found.")
            return

        # Collect unique check-in IDs
        check_in_ids = set()
        for resp in unevaluated:
            question = db.query(MonitoringQuestion).filter(
                MonitoringQuestion.id == resp.question_id
            ).first()
            if question:
                check_in_ids.add(question.check_in_id)

        logger.info(f"  Found {len(unevaluated)} unevaluated responses "
                     f"across {len(check_in_ids)} check-ins.")

        for ci_id in check_in_ids:
            try:
                eval_result = evaluate_check_in(ci_id, db)

                # Get patient_id for escalation
                ci = db.query(MonitoringCheckIn).filter(
                    MonitoringCheckIn.id == ci_id
                ).first()

                if ci and eval_result["overall_severity"] in ("ORANGE", "RED"):
                    handle_severity_escalation(
                        check_in_id=ci_id,
                        patient_id=ci.patient_id,
                        overall_severity=eval_result["overall_severity"],
                        db=db,
                    )

                logger.info(f"  ✔ Evaluated check-in {ci_id}: {eval_result['overall_severity']}")
            except Exception as e:
                logger.error(f"  ✘ Failed to evaluate check-in {ci_id}: {e}")
                db.rollback()

    except Exception as e:
        logger.error(f"⏰ [Scheduler] evaluate_unevaluated_responses error: {e}")
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

def start_scheduler():
    """Start the APScheduler with both periodic jobs."""
    global _scheduler

    if _scheduler is not None:
        logger.warning("Scheduler already running — skipping start.")
        return

    _scheduler = BackgroundScheduler()

    # Job 1: Generate check-ins every N hours
    _scheduler.add_job(
        generate_all_check_ins,
        "interval",
        hours=CHECKIN_INTERVAL_HOURS,
        id="generate_check_ins",
        next_run_time=None,  # Don't run immediately on startup
    )

    # Job 2: Evaluate unevaluated responses every N hours
    _scheduler.add_job(
        evaluate_unevaluated_responses,
        "interval",
        hours=CHECKIN_EVALUATION_HOURS,
        id="evaluate_responses",
        next_run_time=None,
    )

    _scheduler.start()
    logger.info(
        f"✅ Scheduler started — check-ins every {CHECKIN_INTERVAL_HOURS}h, "
        f"evaluation safety-net every {CHECKIN_EVALUATION_HOURS}h"
    )


def stop_scheduler():
    """Gracefully shut down the scheduler."""
    global _scheduler

    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("🛑 Scheduler stopped.")
