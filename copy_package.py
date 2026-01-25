
import shutil
import os

src = r"Backend\Shared\AI_Agents\src"
dst = r"Backend\Shared\AI_Agents\medical_agents"

print(f"Copying {src} to {dst}...")

if os.path.exists(dst):
    print("Destination already exists. Removing it first...")
    shutil.rmtree(dst)

shutil.copytree(src, dst)
print("Copy complete.")
