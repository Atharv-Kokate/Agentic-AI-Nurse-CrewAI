from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from uuid import UUID
from enum import Enum


class UserRole(str, Enum):
    ADMIN = "ADMIN"
    NURSE = "NURSE"
    DOCTOR = "DOCTOR"
    PATIENT = "PATIENT"
    CARETAKER = "CARETAKER"


# --- Request Schemas ---

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters")
    full_name: str
    role: UserRole = UserRole.PATIENT
    patient_id: Optional[UUID] = Field(None, description="Required when role is PATIENT")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "email": "nurse@hospital.com",
                    "password": "securepass123",
                    "full_name": "Jane Nurse",
                    "role": "NURSE",
                    "patient_id": None
                }
            ]
        }
    }


class UserLogin(BaseModel):
    email: EmailStr
    password: str

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "email": "nurse@hospital.com",
                    "password": "securepass123"
                }
            ]
        }
    }

# --- Response Schemas ---

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None


class UserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    patient_id: Optional[UUID] = None
    created_at: datetime

    model_config = {
        "from_attributes": True
    }


class UserWithToken(BaseModel):
    user: UserResponse
    access_token: str
    token_type: str = "bearer"
