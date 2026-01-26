import sys
import os
from pathlib import Path

# Setup paths
current_file = Path(__file__).resolve()
backend_dir = current_file.parent.parent # Backend folder
if str(backend_dir) not in sys.path:
    sys.path.append(str(backend_dir))
if str(backend_dir / "Shared") not in sys.path:
    sys.path.append(str(backend_dir / "Shared"))
if str(backend_dir / "Platform") not in sys.path:
    sys.path.append(str(backend_dir / "Platform"))

try:
    from Shared.database.session import engine, Base, SessionLocal
    from Shared.database.models import User, UserRole, Patient, monitoring_logs
    # Avoid importing from Platform.auth.security to prevent circular/double imports of models
    from passlib.context import CryptContext
except ImportError as e:
    print(f"Error importing modules: {e}")
    sys.exit(1)

# Local hash function to avoid import loops
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def full_reset():
    print("WARNING: This will DELETE ALL DATA in the database.")
    
    # 1. Force Drop All Tables using Raw SQL (More reliable)
    print("Dropping all tables...")
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("DROP TABLE IF EXISTS doctor_recommendations CASCADE;"))
            conn.execute(text("DROP TABLE IF EXISTS reminders CASCADE;"))
            conn.execute(text("DROP TABLE IF EXISTS agent_interactions CASCADE;"))
            conn.execute(text("DROP TABLE IF EXISTS alerts CASCADE;"))
            conn.execute(text("DROP TABLE IF EXISTS ai_assesments CASCADE;"))
            conn.execute(text("DROP TABLE IF EXISTS monitoring_logs CASCADE;"))
            conn.execute(text("DROP TABLE IF EXISTS patients CASCADE;"))
            conn.execute(text("DROP TABLE IF EXISTS users CASCADE;"))
            # Also drop enums if necessary, though usually not needed for a quick reset unless changed
            conn.commit()
        print("Tables dropped successfully.")
    except Exception as e:
        print(f"Error dropping tables: {e}")
        return

    # 2. Recreate Tables
    print("Creating tables...")
    try:
        Base.metadata.create_all(bind=engine)
        print("Tables created.")
    except Exception as e:
        print(f"Error creating tables: {e}")
        return

    # 3. Create Admin User
    print("Creating Admin User...")
    db = SessionLocal()
    try:
        admin_email = "admin@hospital.com"
        admin_pass = "admin"
        hashed = hash_password(admin_pass)
        
        admin_user = User(
            email=admin_email,
            hashed_password=hashed,
            full_name="System Admin",
            role=UserRole.ADMIN,
            is_active=True
        )
        db.add(admin_user)
        db.commit()
        print(f"Admin created successfully!")
        print(f"Login: {admin_email}")
        print(f"Pass : {admin_pass}")
        
    except Exception as e:
        print(f"Error creating admin: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    full_reset()
