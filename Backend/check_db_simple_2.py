
import os
from sqlalchemy import create_engine, text

# Hardcoded for test - matching .env
DATABASE_URL = "postgresql://postgres:atharvsk03@localhost:5432/agentic_nurse_db"

def check():
    print(f"Connecting to {DATABASE_URL}")
    engine = create_engine(DATABASE_URL)
    
    with engine.connect() as conn:
        print("Connected.")
        
        # Check User
        result = conn.execute(text("SELECT id, email, patient_id, role FROM users WHERE email = 'test@email.com'"))
        user = result.fetchone()
        
        if not user:
            print("User test@email.com NOT found.")
            return
            
        print(f"User: {user.email}, Role: {user.role}, PatientID: {user.patient_id}")
        
        if user.patient_id:
            # Check Patient
            p_result = conn.execute(text(f"SELECT name, age, known_conditions, current_medications FROM patients WHERE id = '{user.patient_id}'"))
            patient = p_result.fetchone()
            if patient:
                print(f"Patient Name: {patient.name}")
                print(f"Patient Age: {patient.age}")
                print(f"Conditions: {patient.known_conditions}")
                print(f"Meds: {patient.current_medications}")
            else:
                print("Patient record not found.")
        else:
            print("No linked patient record.")

if __name__ == "__main__":
    check()
