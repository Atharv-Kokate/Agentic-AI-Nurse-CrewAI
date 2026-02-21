import sys
import os

current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
sys.path.insert(0, backend_dir)

from Shared.database.session import SessionLocal
from Platform.notifications.service import NotificationService
import uuid

def main():
    print("Testing Notification Service (Mock Mode Expected without Credentials)")
    db = SessionLocal()
    try:
        # Create a dummy user ID for testing
        test_user_id = uuid.uuid4()
        
        # 1. Register Token
        print("\n--- Registering Device Token ---")
        token_record = NotificationService.register_device_token(
            db=db,
            user_id=test_user_id,
            fcm_token="dummy_token_123",
            platform="web"
        )
        print(f"Registered Token: {token_record.fcm_token} for Platform: {token_record.platform}")
        
        # 2. Send Push
        print("\n--- Sending Push Notification ---")
        success, msg = NotificationService.send_push_notification(
            db=db,
            user_id=test_user_id,
            title="Emergency Alert!",
            body="This is a critical risk test.",
            event_type="TEST",
            data={"click_action": "/test"}
        )
        print(f"Status: {success}, Message: {msg}")
        
    finally:
        db.close()

if __name__ == "__main__":
    main()
