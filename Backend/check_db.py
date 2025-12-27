import sys
import os
import time

print("Starting DB check...")
sys.stdout.flush()

try:
    from database.session import engine
    print(f"Engine created: {engine}")
    sys.stdout.flush()
    
    with engine.connect() as conn:
        print("Successfully connected to DB!")
        sys.stdout.flush()
except Exception as e:
    print(f"DB Error: {e}")
    sys.stdout.flush()

print("Check complete.")
