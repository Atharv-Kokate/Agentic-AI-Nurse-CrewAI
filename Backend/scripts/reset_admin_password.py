import sys
import os
from pathlib import Path

# Setup paths - Handle being run from Backend/ or Backend/scripts/
current_file = Path(__file__).resolve()
backend_dir = current_file.parent.parent
if str(backend_dir) not in sys.path:
    sys.path.append(str(backend_dir))
if str(backend_dir / "Shared") not in sys.path:
    sys.path.append(str(backend_dir / "Shared"))
if str(backend_dir / "Platform") not in sys.path:
    sys.path.append(str(backend_dir / "Platform"))

try:
    from Platform.auth.security import hash_password
    from Shared.database.session import SessionLocal
    from Shared.database.models import User, UserRole
except ImportError as e:
    print(f"Error importing modules: {e}")
    # Fallback for path debugging
    print(f"sys.path: {sys.path}")
    sys.exit(1)

def reset_admin_password():
    db = SessionLocal()
    try:
        email = "admin@hospital.com"
        password = "admin"
        
        print(f"Resetting password for {email}...")
        
        user = db.query(User).filter(User.email == email).first()
        
        # This will generate an ARGON2 hash, which is what the new system expects
        hashed = hash_password(password)
        
        if not user:
            print("User not found. Creating new ADMIN user.")
            user = User(
                email=email,
                hashed_password=hashed,
                full_name="System Admin",
                role=UserRole.ADMIN,
                is_active=True
            )
            db.add(user)
        else:
            print(f"User found (ID: {user.id}). Updating password hash to Argon2.")
            user.hashed_password = hashed
            
        db.commit()
        print(f"Success! Login with: {email} / {password}")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    reset_admin_password()
