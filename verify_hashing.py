
import sys
import os
from pathlib import Path

# Add the backend to sys.path so we can import the module
current_dir = Path(__file__).parent.absolute()
backend_dir = current_dir / "Backend" / "Platform"
sys.path.insert(0, str(backend_dir))

try:
    print("Testing Auth Security Configuration...")
    from auth.security import hash_password, verify_password, pwd_context
    
    # Check what scheme is being used
    print(f"Hashing Scheme in use: {pwd_context.schemes}")
    
    # Test 1: Hash a normal password
    password = "securepassword123"
    print(f"\n1. Hashing password: '{password}'")
    hashed = hash_password(password)
    print(f"   Result: {hashed[:20]}...")
    
    # Test 2: Verify the password
    print(f"\n2. Verifying password...")
    is_valid = verify_password(password, hashed)
    print(f"   Verification result: {is_valid}")
    
    if is_valid:
        print("\n[SUCCESS] Argon2 hashing is working correctly!")
    else:
        print("\n[FAILURE] Verification failed.")
        
except ImportError as e:
    print(f"\n[ERROR] Import failed. Is argon2-cffi installed? {e}")
except Exception as e:
    print(f"\n[ERROR] An unexpected error occurred: {e}")
