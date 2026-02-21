import sqlite3
import os
import sys

# Ensure we're running from the root or Backend directory
db_path = os.path.join(os.path.dirname(__file__), "..", "Backend", "agentic_nurse.db")
if not os.path.exists(db_path):
    print(f"Error: Database not found at {db_path}")
    sys.exit(1)

print(f"Connecting to database: {db_path}")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check if the table exists first
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='reminders';")
table_exists = cursor.fetchone()

if table_exists:
    print("Dropping 'reminders' table...")
    cursor.execute("DROP TABLE reminders;")
    conn.commit()
    print("Table reminders dropped successfully.")
else:
    print("Table 'reminders' does not exist. Nothing to drop.")

# Run SQLAlchemy create_all to recreate it with the new column
from database.session import engine, Base
from database.models import Reminder

print("Recreating table via SQLAlchemy...")
Base.metadata.create_all(bind=engine)
print("Table reminders recreated with remaining_count column.")

conn.close()
