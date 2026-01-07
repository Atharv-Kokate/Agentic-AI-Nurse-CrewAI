from database.session import SessionLocal
from database.models import monitoring_logs, Patient
import json

db = SessionLocal()

try:
    with open("db_history_dump.txt", "w") as f:
        # Get patient
        patient = db.query(Patient).filter(Patient.contact_number == "555-NORMAL-001").first() # From reproduce_issue.py
        
        if patient:
            f.write(f"Patient ID: {patient.id}\n")
            f.write(f"Name: {patient.name}\n")
            
            # Get logs
            logs = db.query(monitoring_logs).filter(
                monitoring_logs.patient_id == patient.id
            ).order_by(monitoring_logs.created_at.desc()).limit(10).all()
            
            f.write("--- Recent Logs ---\n")
            for log in logs:
                f.write(f"Time: {log.created_at}, BP: {log.blood_pressure}, HR: {log.heart_rate}\n")
        else:
            # Fallback to check async test patient if normal one doesn't exist
             f.write("Normal Test Patient not found. Checking Async Test Patient...\n")
             patient = db.query(Patient).filter(Patient.contact_number == "555-ASYNC-001").first()
             if patient:
                logs = db.query(monitoring_logs).filter(
                monitoring_logs.patient_id == patient.id
                ).order_by(monitoring_logs.created_at.desc()).limit(10).all()
                for log in logs:
                    f.write(f"Time: {log.created_at}, BP: {log.blood_pressure}, HR: {log.heart_rate}\n")
             else:
                f.write("No patients found.\n")

except Exception as e:
    with open("db_history_dump_error.txt", "w") as err:
        err.write(str(e))
finally:
    db.close()
