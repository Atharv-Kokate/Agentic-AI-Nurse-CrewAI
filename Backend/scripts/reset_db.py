import sys
import os
from pathlib import Path

# Add parent directories to sys.path to allow imports
current_file = Path(__file__).resolve()
backend_dir = current_file.parent.parent
shared_dir = backend_dir / "Shared"

sys.path.append(str(backend_dir))
sys.path.append(str(shared_dir))

from database.session import engine, Base
from database.models import *  # Import all models to ensure they are registered
from sqlalchemy import text

def kill_connections(engine):
    """Kills all other connections to the database to release locks."""
    print("Attempting to kill active connections...")
    try:
        # PostgreSQL specific command to kill connections
        # We use a separate connection with autocommit enabled
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            connection.execute(text("""
                SELECT pg_terminate_backend(pg_stat_activity.pid)
                FROM pg_stat_activity
                WHERE pg_stat_activity.datname = current_database()
                  AND pid <> pg_backend_pid();
            """))
            print("✅ Active connections terminated.")
    except Exception as e:
        print(f"⚠ Warning: Could not kill connections (this is expected on SQLite or restricted DBs): {e}")

def reset_database():
    print("⚠ WARNING: This will DELETE ALL DATA in the database.")
    confirm = input("Are you sure you want to proceed? (yes/no): ")
    
    if confirm.lower() != "yes":
        print("Operation cancelled.")
        return

    # Kill connections first
    kill_connections(engine)

    print("Dropping all tables...")
    Base.metadata.drop_all(bind=engine)
    
    print("Creating all tables...")
    Base.metadata.create_all(bind=engine)
    
    print("✅ Database reset successfully!")

if __name__ == "__main__":
    reset_database()
