import sys
import os

# Add Shared directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "Shared"))

from database.session import engine
from database.models import Base

print("Creating tables...")
Base.metadata.create_all(engine)
print("Tables created successfully.")
