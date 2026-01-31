
import sys
import os
from pathlib import Path
from sqlalchemy import text, create_engine, inspect

# Add paths to sys.path to allow imports
current_file = Path(__file__).resolve()
backend_dir = current_file.parent
shared_dir = backend_dir / "Shared"
platform_dir = backend_dir / "Platform"

sys.path.insert(0, str(shared_dir))
sys.path.insert(0, str(platform_dir))

from database.session import DATABASE_URL

def force_fix_schema():
    print(f"Connecting to database...", flush=True)
    # Print masked URL for verification
    if DATABASE_URL:
        masked_url = DATABASE_URL.split("@")[1] if "@" in DATABASE_URL else "LOCALLY_HOSTED_OR_INVALID"
        print(f"Target Host: {masked_url}")

    engine = create_engine(DATABASE_URL)
    
    with engine.connect() as connection:
        # Check 'patients' table
        print("\n--- Checking 'patients' table ---")
        inspector = inspect(engine)
        columns = [col['name'] for col in inspector.get_columns('patients')]
        print(f"Current columns: {columns}")
        
        missing_patients_cols = []
        if 'last_latitude' not in columns:
            missing_patients_cols.append("ADD COLUMN IF NOT EXISTS last_latitude VARCHAR")
        if 'last_longitude' not in columns:
            missing_patients_cols.append("ADD COLUMN IF NOT EXISTS last_longitude VARCHAR")
        if 'current_medications' not in columns:
            missing_patients_cols.append("ADD COLUMN IF NOT EXISTS current_medications JSONB")
            
        if missing_patients_cols:
            print(f"Adding missing columns to patients: {missing_patients_cols}")
            for cmd in missing_patients_cols:
                try:
                    connection.execute(text(f"ALTER TABLE patients {cmd}"))
                    print(f"Executed: ALTER TABLE patients {cmd}")
                except Exception as e:
                    print(f"Error executing {cmd}: {e}")
            connection.commit()
            print("Patients table updated.")
        else:
            print("Patients table already has all columns.")

        # Check 'monitoring_logs' table
        print("\n--- Checking 'monitoring_logs' table ---")
        columns_logs = [col['name'] for col in inspector.get_columns('monitoring_logs')]
        
        missing_logs_cols = []
        if 'latitude' not in columns_logs:
            missing_logs_cols.append("ADD COLUMN IF NOT EXISTS latitude VARCHAR")
        if 'longitude' not in columns_logs:
            missing_logs_cols.append("ADD COLUMN IF NOT EXISTS longitude VARCHAR")
            
        if missing_logs_cols:
            print(f"Adding missing columns to monitoring_logs: {missing_logs_cols}")
            for cmd in missing_logs_cols:
                try:
                    connection.execute(text(f"ALTER TABLE monitoring_logs {cmd}"))
                    print(f"Executed: ALTER TABLE monitoring_logs {cmd}")
                except Exception as e:
                    print(f"Error executing {cmd}: {e}")
            connection.commit()
            print("Monitoring Logs table updated.")
        else:
            print("Monitoring Logs table already has all columns.")

if __name__ == "__main__":
    force_fix_schema()
