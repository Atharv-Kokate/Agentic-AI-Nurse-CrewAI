import requests
import uuid
import sys
import os
from pathlib import Path

# Add paths to sys.path to allow imports
current_file = Path(__file__).resolve()
backend_dir = current_file.parent
shared_dir = backend_dir / "Shared"
platform_dir = backend_dir / "Platform"

sys.path.insert(0, str(shared_dir))
sys.path.insert(0, str(platform_dir))

from database.session import SessionLocal
from database.models import Reminder, User

def test_medication_log():
    db = SessionLocal()
    try:
        # 1. Find a valid reminder
        reminder = db.query(Reminder).first()
        if not reminder:
            print("No reminders found in DB. Please create a reminder first via the Frontend.")
            return

        print(f"Found Reminder: {reminder.id} - {reminder.medicine_name}")

        # 2. Mock n8n Payload
        payload = {
            "reminder_id": str(reminder.id),
            "status": "TAKEN"
        }

        # 3. Call API
        api_url = "http://localhost:8000/api/v1/medication/log"
        print(f"Sending POST to {api_url} with payload: {payload}")
        
        try:
            response = requests.post(api_url, json=payload)
            print(f"Status Code: {response.status_code}")
            print(f"Response: {response.text}")
            
            if response.status_code == 200:
                print("SUCCESS: Medication Logged!")
            else:
                print("FAILED: API Error")
                
        except Exception as e:
            print(f"Failed to connect to API: {e}")
            print("Make sure the backend server is running!")

    finally:
        db.close()

if __name__ == "__main__":
    test_medication_log()
