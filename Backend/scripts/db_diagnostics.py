import sys
import os
from pprint import pprint

# Add necessary paths
sys.path.append(os.path.join(os.path.dirname(__file__), 'Shared'))
sys.path.append(os.path.dirname(__file__))

from database.session import SessionLocal
from database.models import DeviceToken, NotificationLog, CaretakerPatientLink, Patient, User

def run_diagnostics():
    print("=== RUNNING NOTIFICATION DIAGNOSTICS ===")
    db = SessionLocal()
    try:
        print("\n--- 1. Users ---")
        users = db.query(User).all()
        for u in users:
            print(f"User ID: {u.id} | Email: {u.email} | Role: {u.role}")

        print("\n--- 2. Device Tokens ---")
        tokens = db.query(DeviceToken).all()
        if not tokens:
            print("❌ No Device Tokens found in the database. The frontend hasn't successfully sent the token yet.")
        else:
            for t in tokens:
                print(f"Token ID: {t.id} | User ID: {t.user_id} | Platform: {t.platform}\nFCM Token: {t.fcm_token[:20]}...")

        print("\n--- 3. Caretaker-Patient Links ---")
        links = db.query(CaretakerPatientLink).all()
        if not links:
            print("❌ No Caretakers are linked to any Patients.")
        else:
            for l in links:
                print(f"Caretaker UI: {l.caretaker_id} | Patient ID: {l.patient_id} | Relationship: {l.relationship}")

        print("\n--- 4. Recent Notification Logs ---")
        logs = db.query(NotificationLog).order_by(NotificationLog.created_at.desc()).limit(10).all()
        if not logs:
            print("❌ No notifications have been attempted by the system.")
        else:
            for log in logs:
                print(f"[{log.created_at}] Event: {log.event_type} | User: {log.user_id} | Status: {log.delivery_status}")

    except Exception as e:
        print(f"Error reading DB: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    run_diagnostics()
