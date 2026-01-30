import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, JSON, Boolean, Enum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship as sa_relationship
from database.session import Base
import enum


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    NURSE = "NURSE"
    DOCTOR = "DOCTOR"
    PATIENT = "PATIENT"
    CARETAKER = "CARETAKER"


class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.PATIENT)
    is_active = Column(Boolean, default=True)
    # Link to Patient record (only used when role=PATIENT)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationship to Patient
    patient = sa_relationship("Patient", back_populates="user_account")
    
    # Relationship for Caretakers
    linked_patients = sa_relationship("CaretakerPatientLink", back_populates="caretaker")


class Patient(Base):
    __tablename__ = "patients"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    age = Column(Integer, nullable=False)
    gender = Column(String, nullable=False)
    contact_number = Column(String, nullable=False)
    next_appointment_date = Column(DateTime, nullable=True)    
    known_conditions = Column(JSONB, nullable=False)
    reported_symptoms = Column(JSONB, nullable=False)
    assigned_doctor = Column(String, nullable=True)
    last_latitude = Column(String, nullable=True)
    last_longitude = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationship to User account (for patient login)
    user_account = sa_relationship("User", back_populates="patient", uselist=False)

    # Relationship to Caretakers
    linked_caretakers = sa_relationship("CaretakerPatientLink", back_populates="patient")
    
class monitoring_logs(Base):
    __tablename__ = "monitoring_logs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    blood_pressure = Column(String, nullable=False)
    heart_rate = Column(String, nullable=False)
    blood_sugar = Column(String, nullable=False)
    meds_taken = Column(Boolean, nullable=False)
    sleep_hours = Column(Integer, nullable=True)
    symptoms = Column(JSONB, nullable=True)
    latitude = Column(String, nullable=True)
    longitude = Column(String, nullable=True)
    log = Column(JSONB, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

class ai_assesments(Base):
    __tablename__ = "ai_assesments"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    risk_score = Column(Integer, nullable=False)
    risk_level = Column(String, nullable=False)
    reasoning = Column(JSONB, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

class alerts(Base):
    __tablename__ = "alerts"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    alert_type = Column(String, nullable=False)
    alert_message = Column(String, nullable=False)
    call_received = Column(Boolean, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

class AgentInteraction(Base):
    __tablename__ = "agent_interactions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    question = Column(String, nullable=False)
    answer = Column(String, nullable=True)
    status = Column(String, nullable=False, default="PENDING") # PENDING, ANSWERED
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

class Reminder(Base):
    __tablename__ = "reminders"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    medicine_name = Column(String, nullable=False)
    dosage = Column(String, nullable=False)
    schedule_time = Column(String, nullable=False) # Format: "HH:MM" (24h)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

class DoctorRecommendation(Base):
    __tablename__ = "doctor_recommendations"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    doctor_name = Column(String, nullable=True) # "Dr. AI" or real name if provided
    recommendation_summary = Column(String, nullable=False)
    medication_advice = Column(String, nullable=True) # JSON or String
    escalation_level = Column(String, default="Standard")
    is_reviewed = Column(Boolean, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

class CaretakerPatientLink(Base):
    __tablename__ = "caretaker_patient_links"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    caretaker_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False)
    relationship = Column(String, nullable=False) # e.g. "Son", "Mom"
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    caretaker = sa_relationship("User", back_populates="linked_patients")
    patient = sa_relationship("Patient", back_populates="linked_caretakers")
