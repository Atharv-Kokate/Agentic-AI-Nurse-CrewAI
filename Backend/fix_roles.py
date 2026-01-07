from database.session import SessionLocal
from database.models import User, UserRole

def promote_users():
    db = SessionLocal()
    try:
        users = db.query(User).all()
        print(f"Found {len(users)} users. Promoting all to NURSE...")
        for user in users:
            print(f"Updating {user.email} from {user.role} to NURSE")
            user.role = UserRole.NURSE
        db.commit()
        print("Done.")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    promote_users()
