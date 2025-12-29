from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta

from database.session import get_db
from database.models import User, Patient, UserRole
from auth.schemas import UserCreate, UserLogin, Token, UserResponse, UserWithToken
from auth.security import hash_password, verify_password, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES
from auth.dependencies import get_current_active_user, require_roles

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.NURSE]))
):
    """
    Register a new user. Only ADMIN and NURSE can create new users.
    
    - NURSE can create PATIENT and other NURSE accounts
    - ADMIN can create any account type
    """
    # Check if email already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Validate role permissions
    if current_user.role == UserRole.NURSE:
        if user_data.role not in [UserRole.PATIENT, UserRole.NURSE]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Nurses can only create PATIENT or NURSE accounts"
            )
    
    # If role is PATIENT, validate patient_id exists
    if user_data.role == UserRole.PATIENT:
        if not user_data.patient_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="patient_id is required when creating a PATIENT user"
            )
        patient = db.query(Patient).filter(Patient.id == user_data.patient_id).first()
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient record not found"
            )
        # Check if patient already has a user account
        existing_patient_user = db.query(User).filter(User.patient_id == user_data.patient_id).first()
        if existing_patient_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This patient already has a user account"
            )
    
    # Create new user
    new_user = User(
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        full_name=user_data.full_name,
        role=user_data.role,
        patient_id=user_data.patient_id if user_data.role == UserRole.PATIENT else None,
        is_active=True
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return new_user


@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Login with email and password to get JWT access token.
    
    Use this endpoint in Swagger UI's Authorize button.
    """
    # Find user by email
    user = db.query(User).filter(User.email == form_data.username).first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    # Create access token
    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "email": user.email,
            "role": user.role.value
        },
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    return Token(access_token=access_token, token_type="bearer")


@router.post("/login/json", response_model=Token)
def login_json(
    credentials: UserLogin,
    db: Session = Depends(get_db)
):
    """
    Login with JSON body (alternative to form-based login).
    """
    user = db.query(User).filter(User.email == credentials.email).first()
    
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "email": user.email,
            "role": user.role.value
        },
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    return Token(access_token=access_token, token_type="bearer")


@router.get("/me", response_model=UserResponse)
def get_current_user_profile(
    current_user: User = Depends(get_current_active_user)
):
    """
    Get the current authenticated user's profile.
    """
    return current_user


@router.post("/setup-admin", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def setup_first_admin(
    user_data: UserCreate,
    db: Session = Depends(get_db)
):
    """
    One-time setup endpoint to create the first ADMIN user.
    This only works if no users exist in the database.
    """
    # Check if any users exist
    existing_users = db.query(User).first()
    if existing_users:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin setup already completed. Use /register to create new users."
        )
    
    # Create admin user
    admin_user = User(
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        full_name=user_data.full_name,
        role=UserRole.ADMIN,
        is_active=True
    )
    
    db.add(admin_user)
    db.commit()
    db.refresh(admin_user)
    
    return admin_user
