import sys
import os

with open("import_result.txt", "w") as f:
    try:
        sys.path.append(os.path.join(os.path.dirname(__file__), 'AI_Agents'))
        from src.crew import MedicalCrew
        f.write("Import Successful\n")
    except Exception as e:
        f.write(f"Import Failed: {e}\n")
