import firebase_admin
from firebase_admin import credentials, messaging
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from database.models import DeviceToken, NotificationLog
import ast
import os
import json
import base64

# We will initialize this gracefully so the app won't crash if credentials are not present yet.
FIREBASE_INITIALIZED = False
try:
    if not firebase_admin._apps:
        # Priority 1: FIREBASE_CREDENTIALS_JSON env var (base64-encoded JSON for deployments like Render)
        cred_b64 = os.environ.get("FIREBASE_CREDENTIALS_JSON")
        if cred_b64:
            cred_dict = json.loads(base64.b64decode(cred_b64))
            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred)
            FIREBASE_INITIALIZED = True
            print("Firebase Admin SDK initialized from FIREBASE_CREDENTIALS_JSON env var.")
        # Priority 2: firebase-credentials.json file in the Platform directory
        elif os.path.exists("firebase-credentials.json"):
            cred = credentials.Certificate("firebase-credentials.json")
            firebase_admin.initialize_app(cred)
            FIREBASE_INITIALIZED = True
            print("Firebase Admin SDK initialized from firebase-credentials.json file.")
        else:
            print("Warning: No Firebase credentials found. Push notifications will be mocked.")
            print("  → Place firebase-credentials.json in Backend/Platform/")
            print("  → Or set FIREBASE_CREDENTIALS_JSON env var (base64-encoded JSON)")
    else:
        FIREBASE_INITIALIZED = True
        print("Firebase Admin SDK was already initialized.")
except Exception as e:
    print(f"Warning: Firebase Admin SDK not initialized. Push notifications will be mocked. Error: {e}")

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
        
        # Build data dict — FCM data values must be strings
        str_data = {k: str(v) for k, v in data.items()} if data else {}
        # Also put title/body in data so the service worker can access them
        str_data["title"] = title
        str_data["body"] = body
        
        # Ensure click_action is a full HTTPS URL (FCM requirement)
        frontend_url = os.getenv("FRONTEND_URL", "https://vital-iq.onrender.com")
        click_action = str_data.get("click_action", "/dashboard")
        if not click_action.startswith("http"):
            click_action = f"{frontend_url.rstrip('/')}{click_action}"
        
        # Payload format for FCM — includes webpush config for proper OS notification on browsers
        message = messaging.MulticastMessage(
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            webpush=messaging.WebpushConfig(
                notification=messaging.WebpushNotification(
                    title=title,
                    body=body,
                    icon="/pwa-192x192.png",
                ),
                fcm_options=messaging.WebpushFCMOptions(
                    link=click_action
                ),
            ),
            data=str_data,
            tokens=fcm_tokens,
        )

        try:
            if FIREBASE_INITIALIZED:
                response = messaging.send_each_for_multicast(message)
                if response.success_count > 0:
                    status = "SENT"
                    result_msg = f"Notification sent to {response.success_count}/{len(fcm_tokens)} devices"
                else:
                    status = "FAILED_FCM_ERROR"
                    # Log individual errors for debugging
                    errors = [str(r.exception) for r in response.responses if r.exception]
                    result_msg = f"FCM delivery failed for all {len(fcm_tokens)} devices. Errors: {errors[:3]}"
                    
                # Clean up invalid tokens
                for i, resp in enumerate(response.responses):
                    if resp.exception and ('UNREGISTERED' in str(resp.exception) or 'INVALID_ARGUMENT' in str(resp.exception)):
                        stale_token = fcm_tokens[i]
                        db.query(DeviceToken).filter(DeviceToken.fcm_token == stale_token).delete()
                        db.commit()
                        print(f"Removed stale FCM token: {stale_token[:20]}...")
            else:
                print(f"[MOCK PUSH] To: {fcm_tokens} | {title} - {body} | Data: {data}")
                status = "MOCKED"
                result_msg = "Notification MOCKED (Firebase not initialized — add firebase-credentials.json)"
                
            NotificationService._save_log(db, user_id, event_type, {"title": title, "body": body, "data": data}, status)
            
            return status != "FAILED_FCM_ERROR", result_msg
        except Exception as e:
            NotificationService._save_log(db, user_id, event_type, {"title": title, "body": body, "data": data}, f"FAILED_EXCEPTION: {str(e)}")
            return False, f"Failed to send push: {str(e)}"
