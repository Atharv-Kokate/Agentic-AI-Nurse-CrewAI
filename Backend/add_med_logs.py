
import sys
import os
from pathlib import Path
from sqlalchemy import text, create_engine

# Add paths to sys.path
current_file = Path(__file__).resolve()
backend_dir = current_file.parent
shared_dir = backend_dir / "Shared"
platform_dir = backend_dir / "Platform"

sys.path.insert(0, str(shared_dir))
sys.path.insert(0, str(platform_dir))

from database.session import DATABASE_URL, Base
from database.models import MedicationLog

def create_med_logs_table():
    print(f"Connecting to database...", flush=True)
    engine = create_engine(DATABASE_URL)
    
    print("Creating 'medication_logs' table...")
    # This uses SQLAlchemy's create_all which checks for existence first
    # But specifically for this table just to be safe/clear
    Base.metadata.create_all(bind=engine)
    print("Database schema updated successfully.")

if __name__ == "__main__":
    create_med_logs_table()
