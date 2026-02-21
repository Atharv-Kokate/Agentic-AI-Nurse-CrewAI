import firebase_admin
from firebase_admin import credentials, messaging
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from database.models import DeviceToken, NotificationLog
import ast

# We will initialize this gracefully so the app won't crash if credentials are not present yet.
try:
    # Use a service account
    # In production, this path should be loaded from env vars
    cred = credentials.Certificate("firebase-credentials.json")
    firebase_admin.initialize_app(cred)
    FIREBASE_INITIALIZED = True
except Exception as e:
    print(f"Warning: Firebase Admin SDK not initialized. Push notifications will be mocked. Error: {e}")
    FIREBASE_INITIALIZED = False

class NotificationService:
    @staticmethod
    def register_device_token(db: Session, user_id: str, fcm_token: str, platform: str = "web"):
        """Register or update a user's FCM token."""
        # Check if token exists
        existing_token = db.query(DeviceToken).filter(DeviceToken.user_id == user_id, DeviceToken.fcm_token == fcm_token).first()
        
        if existing_token:
            existing_token.platform = platform
            db.commit()
            return existing_token
            
        new_token = DeviceToken(
            user_id=user_id,
            fcm_token=fcm_token,
            platform=platform
        )
        db.add(new_token)
        db.commit()
        db.refresh(new_token)
        return new_token
        
    @staticmethod
    def _save_log(db: Session, user_id: str, event_type: str, payload: dict, status: str):
        log = NotificationLog(
            user_id=user_id,
            event_type=event_type,
            payload=payload,
            delivery_status=status
        )
        db.add(log)
        db.commit()
        return log

    @staticmethod
    def send_push_notification(db: Session, user_id: str, title: str, body: str, event_type: str, data: Dict[str, str] = None):
        """Send a push notification to all devices registered to a user."""
        if data is None:
            data = {}
            
        # Get user's device tokens
        tokens = db.query(DeviceToken).filter(DeviceToken.user_id == user_id).all()
        
        if not tokens:
            # Save log as failed due to no tokens
            NotificationService._save_log(db, user_id, event_type, {"title": title, "body": body, "data": data}, "FAILED_NO_TOKEN")
            return False, "No device tokens found for user"

        fcm_tokens = [t.fcm_token for t in tokens]
        
        # Payload format for FCM
        message = messaging.MulticastMessage(
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            data=data,
            tokens=fcm_tokens,
        )

        try:
            if FIREBASE_INITIALIZED:
                response = messaging.send_each_for_multicast(message)
                status = "SENT" if response.success_count > 0 else "FAILED_FCM_ERROR"
            else:
                print(f"[MOCK PUSH] To: {fcm_tokens} | {title} - {body} | Data: {data}")
                status = "MOCKED"
                
            NotificationService._save_log(db, user_id, event_type, {"title": title, "body": body, "data": data}, status)
            
            return True, "Notification sent"
        except Exception as e:
            NotificationService._save_log(db, user_id, event_type, {"title": title, "body": body, "data": data}, f"FAILED_EXCEPTION: {str(e)}")
            return False, f"Failed to send push: {str(e)}"
