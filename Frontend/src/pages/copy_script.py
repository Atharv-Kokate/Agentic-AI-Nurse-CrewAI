import shutil
import os

src = r"c:\Users\athar\OneDrive\Desktop\Agentic AI Nurse\Frontend\src\pages\AssessmentMonitorPage.jsx"
patient_dst = r"c:\Users\athar\OneDrive\Desktop\Agentic AI Nurse\Frontend\src\pages\PatientAssessmentMonitor.jsx"
caretaker_dst = r"c:\Users\athar\OneDrive\Desktop\Agentic AI Nurse\Frontend\src\pages\CaretakerAssessmentMonitor.jsx"

with open(src, 'r', encoding='utf-8') as f:
    content = f.read()

with open(patient_dst, 'w', encoding='utf-8') as f:
    f.write(content.replace("AssessmentMonitorPage", "PatientAssessmentMonitor"))

with open(caretaker_dst, 'w', encoding='utf-8') as f:
    f.write(content.replace("AssessmentMonitorPage", "CaretakerAssessmentMonitor"))
    
print("Copied successfully.")
