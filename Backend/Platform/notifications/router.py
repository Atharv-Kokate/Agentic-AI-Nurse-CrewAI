from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import uuid

# Replace these dependencies with actual ones in your project
from database.session import get_db
from notifications.service import NotificationService

router = APIRouter(prefix="/api/v1/notifications", tags=["Notifications"])

class RegisterTokenRequest(BaseModel):
    user_id: str
    fcm_token: str
    platform: str = "web"

@router.post("/register-token")
def register_device_token(request: RegisterTokenRequest, db: Session = Depends(get_db)):
    """Registers a new FCM token for a user."""
    try:
        user_uuid = uuid.UUID(request.user_id)
        # Verify user exists? Usually done via auth middleware, but we take user_id directly here.
        token_record = NotificationService.register_device_token(
            db=db,
            user_id=user_uuid,
            fcm_token=request.fcm_token,
            platform=request.platform
        )
        return {"status": "success", "message": "Token registered successfully"}
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id format. Must be a UUID.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to register token: {str(e)}")

# Test Endpoint to simulate sending a notification
class TestPushRequest(BaseModel):
    user_id: str
    title: str = "Test Notification"
    body: str = "This is a test notification"
    event_type: str = "TEST_EVENT"

@router.post("/test-push")
def test_push_notification(request: TestPushRequest, db: Session = Depends(get_db)):
    """Sends a test push notification to a user's registered devices."""
    try:
        user_uuid = uuid.UUID(request.user_id)
        success, msg = NotificationService.send_push_notification(
            db=db,
            user_id=user_uuid,
            title=request.title,
            body=request.body,
            event_type=request.event_type,
            data={"click_action": "/dashboard"}
        )
        
        if success:
            return {"status": "success", "message": msg}
        else:
            raise HTTPException(status_code=400, detail=msg)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user_id format. Must be a UUID.")
