
import sys
import os
from pathlib import Path
from sqlalchemy import text
from uuid import UUID

# Add paths to sys.path to allow imports
current_file = Path(__file__).resolve()
backend_dir = current_file.parent
shared_dir = backend_dir / "Shared"
platform_dir = backend_dir / "Platform"

sys.path.insert(0, str(shared_dir))
sys.path.insert(0, str(platform_dir))

from database.session import SessionLocal, engine
from database.models import User, Patient

def check_user():
    print("Checking user data...", flush=True)
    db = SessionLocal()
    try:
        user_email = "test@email.com"
        user = db.query(User).filter(User.email == user_email).first()
        
        if not user:
            print(f"User {user_email} not found!")
            return

        print(f"User found: {user.full_name} (ID: {user.id})")
        print(f"Role: {user.role}")
        print(f"Patient ID: {user.patient_id}")
        
        if user.patient_id:
            patient = db.query(Patient).filter(Patient.id == user.patient_id).first()
            if patient:
                print("\n--- Patient Record ---")
                print(f"Name: {patient.name}")
                print(f"Age: {patient.age}")
                print(f"Contact: {patient.contact_number}")
                print(f"Known Conditions: {patient.known_conditions}")
                print(f"Reported Symptoms: {patient.reported_symptoms}")
                print(f"Current Medications: {patient.current_medications}")
            else:
                print(f"Patient record with ID {user.patient_id} NOT found!")
        else:
            print("User has no linked Patient ID.")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    check_user()
