"""
Database Initialization Script
Run this script to create all database tables
"""
import sys
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Check if DATABASE_URL is set
if not os.getenv("DATABASE_URL"):
    print("❌ Error: DATABASE_URL not found in environment variables!")
    print("Please create a .env file with your PostgreSQL connection string.")
    print("\nExample format:")
    print("DATABASE_URL=postgresql://username:password@localhost:5432/database_name")
    sys.exit(1)

print(f"📊 Connecting to database...")
print(f"DATABASE_URL: {os.getenv('DATABASE_URL').replace(os.getenv('DATABASE_URL').split('@')[0].split('//')[1], '***')}")

from database.session import init_db

if __name__ == "__main__":
    try:
        print("\n🔄 Initializing database and creating tables...\n")
        init_db()
        print("\n✅ Database initialization complete!")
        print("You should now be able to see the 'patients' and 'monitoring_logs' tables in pgAdmin.")
    except Exception as e:
        print(f"\n❌ Database initialization failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
