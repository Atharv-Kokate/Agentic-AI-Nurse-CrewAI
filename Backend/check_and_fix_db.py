
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
        result = db.execute(text("SELECT count(*) FROM doctor_recommendations"))
        count = result.scalar()
        print(f"Count: {count}")
        
        if count > 0:
            recs = db.execute(text("SELECT * FROM doctor_recommendations LIMIT 5"))
            for row in recs:
                print(row)
        else:
            print("No recommendations found.")

        # 2. Check Patients Schema
        print("\n--- Checking Patients Schema ---")
        try:
            # Try to select the missing columns
            db.execute(text("SELECT last_latitude, last_longitude FROM patients LIMIT 1"))
            print("Columns last_latitude and last_longitude exist.")
        except Exception as e:
            print(f"Columns missing or query failed: {e}")
            print("Attempting to fix schema...")
            db.rollback() # Rollback the failed transaction
            
            # Add columns
            try:
                db.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS last_latitude VARCHAR"))
                db.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS last_longitude VARCHAR"))
                db.commit()
                print("Successfully added last_latitude and last_longitude columns.")
            except Exception as fix_e:
                print(f"Failed to fix schema: {fix_e}")
                db.rollback()

    except Exception as e:
        print(f"General Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    check_and_fix()
