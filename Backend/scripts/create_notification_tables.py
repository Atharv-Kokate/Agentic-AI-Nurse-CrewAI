import sys
import os

# Ensure backend directory is in path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
sys.path.insert(0, backend_dir)

from Shared.database.session import engine, Base
from Shared.database.models import DeviceToken, NotificationLog

def main():
    print("Creating new tables...")
    # This will create tables that don't exist yet
    Base.metadata.create_all(bind=engine)
    print("Done!")

if __name__ == "__main__":
    main()
