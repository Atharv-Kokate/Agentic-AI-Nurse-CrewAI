
import sys
import os
from pathlib import Path

print(f"Current working directory: {os.getcwd()}")
print(f"File path: {__file__}")

current_file = Path(__file__).resolve()
backend_dir = current_file.parent
shared_dir = backend_dir / "Shared"
ai_agents_dir = shared_dir / "AI_Agents"

print(f"Backend Dir: {backend_dir}")
print(f"Shared Dir: {shared_dir}")
print(f"AI Agents Dir: {ai_agents_dir}")

print(f"Exists(Shared): {shared_dir.exists()}")
print(f"Exists(AI_Agents): {ai_agents_dir.exists()}")
print(f"Exists(src inside AI_Agents): {(ai_agents_dir / 'src').exists()}")

sys.path.append(str(shared_dir))
sys.path.append(str(ai_agents_dir))

print("\nsys.path:")
for p in sys.path:
    print(p)

print("\nAttempting import...")
try:
    import src
    print(f"Imported src from: {src.__file__}")
    from src.crew import MedicalCrew
    print("Successfully imported MedicalCrew")
except ImportError as e:
    print(f"ImportError: {e}")
except Exception as e:
    print(f"Error: {e}")
