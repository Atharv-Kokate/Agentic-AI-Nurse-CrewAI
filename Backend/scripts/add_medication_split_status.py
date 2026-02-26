"""
Migration script: Add status_patient and status_caretaker columns to medication_logs table.
Copies existing status values into status_patient for backward compatibility.

Run: python scripts/add_medication_split_status.py
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'Shared'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'Platform'))

from database.session import engine
from sqlalchemy import text

def migrate():
    with engine.connect() as conn:
        # Check if columns already exist
        result = conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'medication_logs' AND column_name = 'status_patient'
        """))
        
        if result.fetchone():
            print("✅ Columns already exist. Skipping migration.")
            return

        print("🔧 Adding status_patient and status_caretaker columns...")
        
        # Add new columns
        conn.execute(text("""
            ALTER TABLE medication_logs
            ADD COLUMN status_patient VARCHAR DEFAULT 'PENDING',
            ADD COLUMN status_caretaker VARCHAR DEFAULT 'PENDING'
        """))
        
        # Copy existing status into status_patient for backward compat
        conn.execute(text("""
            UPDATE medication_logs
            SET status_patient = CASE
                WHEN status = 'TAKEN' THEN 'TAKEN'
                WHEN status = 'SKIPPED' THEN 'SKIPPED'
                WHEN status = 'MISSED' THEN 'SKIPPED'
                ELSE 'PENDING'
            END,
            status_caretaker = 'PENDING'
        """))
        
        conn.commit()
        print("✅ Migration complete! Added status_patient and status_caretaker to medication_logs.")

if __name__ == "__main__":
    migrate()
