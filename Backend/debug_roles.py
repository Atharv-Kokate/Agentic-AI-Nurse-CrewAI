from database.session import SessionLocal
from database.models import User

def list_users():
    db = SessionLocal()
    try:
        users = db.query(User).all()
        print(f"Found {len(users)} users:")
        for user in users:
            print(f"- Email: {user.email}, Role: {user.role}, Name: {user.full_name}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    list_users()
