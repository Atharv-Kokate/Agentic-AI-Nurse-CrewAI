from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from typing import List, Optional
from functools import wraps

from database.session import get_db
from database.models import User, UserRole
from auth.security import decode_token
from auth.schemas import TokenData

# OAuth2 scheme - expects token in Authorization header as "Bearer <token>"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """
    Dependency to get the current authenticated user from JWT token.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Decode token
    payload = decode_token(token)
    if payload is None:
        raise credentials_exception
    
    user_id: str = payload.get("sub")
    if user_id is None:
        raise credentials_exception
    
    # Get user from database
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Dependency to ensure the current user is active.
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    return current_user


def require_roles(allowed_roles: List[UserRole]):
    """
    Dependency factory to require specific roles.
    
    Usage:
        @app.get("/admin-only")
        def admin_endpoint(user: User = Depends(require_roles([UserRole.ADMIN]))):
            ...
    """
    async def role_checker(
        current_user: User = Depends(get_current_active_user)
    ) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {[r.value for r in allowed_roles]}"
            )
        return current_user
    
    return role_checker


# Pre-defined role dependencies for convenience
require_admin = require_roles([UserRole.ADMIN])
require_nurse_or_admin = require_roles([UserRole.ADMIN, UserRole.NURSE])
require_medical_staff = require_roles([UserRole.ADMIN, UserRole.NURSE, UserRole.DOCTOR])
require_any_authenticated = require_roles([UserRole.ADMIN, UserRole.NURSE, UserRole.DOCTOR, UserRole.PATIENT])
