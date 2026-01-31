
import sys
import os
from pathlib import Path
from sqlalchemy import text

# Add paths to sys.path to allow imports
current_file = Path(__file__).resolve()
backend_dir = current_file.parent
shared_dir = backend_dir / "Shared"
platform_dir = backend_dir / "Platform"

sys.path.insert(0, str(shared_dir))
sys.path.insert(0, str(platform_dir))

from database.session import SessionLocal, engine

def check_and_fix():
    print("Starting database check...", flush=True)
    db = SessionLocal()
    try:
        # 1. Check Doctor Recommendations
        print("--- Checking Doctor Recommendations ---", flush=True)
        try:
            result = db.execute(text("SELECT count(*) FROM doctor_recommendations"))
            count = result.scalar()
            print(f"Count: {count}")
        except Exception as e:
            print(f"Error checking recommendations: {e}")

        # 2. Check Patients Schema
        print("\n--- Checking Patients Schema ---")
        try:
            # Try to select the missing columns
            db.execute(text("SELECT last_latitude, last_longitude, current_medications FROM patients LIMIT 1"))
            print("Columns last_latitude, last_longitude, and current_medications exist in patients.")
        except Exception as e:
            print(f"Columns missing or query failed in patients: {e}")
            print("Attempting to fix patients schema...")
            db.rollback() 
            
            # Add columns
            try:
                db.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS last_latitude VARCHAR"))
                db.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS last_longitude VARCHAR"))
                db.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS current_medications JSONB"))
                db.commit()
                print("Successfully added columns to patients.")
            except Exception as fix_e:
                print(f"Failed to fix patients schema: {fix_e}")
                db.rollback()

        # 3. Check Monitoring Logs Schema
        print("\n--- Checking Monitoring Logs Schema ---")
        try:
            # Try to select the missing columns
            db.execute(text("SELECT latitude, longitude FROM monitoring_logs LIMIT 1"))
            print("Columns latitude and longitude exist in monitoring_logs.")
        except Exception as e:
            print(f"Columns missing or query failed in monitoring_logs: {e}")
            print("Attempting to fix monitoring_logs schema...")
            db.rollback() 
            
            # Add columns
            try:
                db.execute(text("ALTER TABLE monitoring_logs ADD COLUMN IF NOT EXISTS latitude VARCHAR"))
                db.execute(text("ALTER TABLE monitoring_logs ADD COLUMN IF NOT EXISTS longitude VARCHAR"))
                db.commit()
                print("Successfully added columns to monitoring_logs.")
            except Exception as fix_e:
                print(f"Failed to fix monitoring_logs schema: {fix_e}")
                db.rollback()

    except Exception as e:
        print(f"General Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    check_and_fix()
