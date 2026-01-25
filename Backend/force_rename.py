
import os
import shutil

src_path = r"c:\Users\athar\OneDrive\Desktop\Agentic AI Nurse\Backend\Shared\AI_Agents\src"
dst_path = r"c:\Users\athar\OneDrive\Desktop\Agentic AI Nurse\Backend\Shared\AI_Agents\medical_agents"

print(f"Attempting to rename '{src_path}' to '{dst_path}'...")

if not os.path.exists(src_path):
    print("Error: Source path does not exist!")
    exit(1)

if os.path.exists(dst_path):
    print("Error: Destination path already exists!")
    # exit(1) # We might want to overwrite or merge? No, let's fail for now.

try:
    os.rename(src_path, dst_path)
    print("Success: Renamed via os.rename")
except OSError as e:
    print(f"os.rename failed: {e}")
    print("Attempting copytree + rmtree fallback...")
    try:
        shutil.copytree(src_path, dst_path)
        print("Success: Copied to new location.")
        shutil.rmtree(src_path)
        print("Success: Removed old location.")
    except Exception as e2:
        print(f"Fallback failed: {e2}")
