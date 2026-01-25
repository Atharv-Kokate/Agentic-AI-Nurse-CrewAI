
import sys
import os

print(f"Current working directory: {os.getcwd()}")
print(f"File path: {__file__}")

platform_dir = os.path.dirname(__file__)
shared_dir = os.path.join(platform_dir, '..', 'Shared')
ai_agents_dir = os.path.join(platform_dir, '..', 'Shared', 'AI_Agents')

print(f"Adding to sys.path: {os.path.abspath(shared_dir)}")
print(f"Adding to sys.path: {os.path.abspath(ai_agents_dir)}")

sys.path.append(os.path.abspath(shared_dir))
sys.path.append(os.path.abspath(ai_agents_dir))

try:
    import src
    print(f"Successfully imported src from: {src.__file__}")
    from src.crew import MedicalCrew
    print("Successfully imported MedicalCrew")
except ImportError as e:
    print(f"ImportError: {e}")
except Exception as e:
    print(f"Error: {e}")

print("sys.path:")
for p in sys.path:
    print(p)
