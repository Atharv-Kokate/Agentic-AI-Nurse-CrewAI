
import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if not DATABASE_URL:
    print("DATABASE_URL not found!")
    exit(1)


# Redirect stdout/stderr to a log file
import sys
log_file = open("backend_fix.log", "w")
sys.stdout = log_file
sys.stderr = log_file

print(f"Connecting to DB...", flush=True)
engine = create_engine(DATABASE_URL)

try:
    with engine.connect() as conn:
        print("Connected.", flush=True)
        # Check columns
        try:
            conn.execute(text("SELECT last_latitude FROM patients LIMIT 1"))
            print("Column 'last_latitude' already exists.", flush=True)
        except Exception as e:
            print("Column missing or error. Attempting fix...", flush=True)
            conn.rollback()
            try:
                conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS last_latitude VARCHAR"))
                conn.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS last_longitude VARCHAR"))
                conn.commit()
                print("Successfully added columns.", flush=True)
            except Exception as fix_e:
                print(f"Fix failed: {fix_e}", flush=True)
except Exception as e:
    print(f"Connection failed: {e}", flush=True)
finally:
    log_file.close()
