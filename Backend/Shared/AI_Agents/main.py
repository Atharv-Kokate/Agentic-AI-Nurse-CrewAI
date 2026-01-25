import os
import sys
from dotenv import load_dotenv

# Load environment variables
# Load environment variables
load_dotenv()

# Add current directory to sys.path to allow src import
from pathlib import Path
current_file = Path(__file__).resolve()
current_dir = current_file.parent
sys.path.append(str(current_dir))

# Check for API Key
if not os.getenv("GROQ_API_KEY"):
    print("Error: GROQ_API_KEY not found. Please set it in a .env file or environment variables.")
    sys.exit(1)

from medical_agents.crew import MedicalCrew

def get_patient_input():
    print("\n--- AI Agent Nurse: Patient Intake ---")
    print("Please enter the patient's vital signs and basic info.\n")
    
    name = input("Patient Name: ")
    age = input("Age: ")
    gender = input("Gender: ")
    bp = input("Blood Pressure (e.g., 120/80): ")
    hr = input("Heart Rate (bpm): ")
    sugar = input("Blood Sugar (mg/dL): ")
    known_conditions = input("Known Medical Conditions (comma separated, or 'None'): ")
    initial_symptoms = input("Any initial symptoms? (or 'None'): ")

    patient_data = {
        "name": name,
        "age": age,
        "gender": gender,
        "blood_pressure": bp,
        "heart_rate": hr,
        "blood_sugar": sugar,
        "known_conditions": known_conditions,
        "reported_symptoms": initial_symptoms
    }
    return str(patient_data)

def main():
    try:
        patient_data = get_patient_input()
        
        print("\n\nAnalying patient data... invoking AI Agents...\n")
        
        crew = MedicalCrew()
        result = crew.run(patient_data)
        
        print("\n\n################################################")
        print("## MEDICAL DECISION & REPORT")
        print("################################################\n")
        print(result)

    except Exception:
        import traceback
        import sys
        # Bypass rich's stdout proxy which causes the AttributeError
        try:
            sys.__stdout__.write("\n\n[Detailed Error Report]:\n")
            traceback.print_exc(file=sys.__stdout__)
            sys.__stdout__.write("\nAn error occurred during execution (see details above).\n")
        except Exception:
            # If even that fails, purely silent fail or try stderr
            pass

if __name__ == "__main__":
    main()
