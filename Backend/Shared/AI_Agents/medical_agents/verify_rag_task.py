import sys
import os
from pathlib import Path
import logging

# Configure logging to stdout
logging.basicConfig(level=logging.INFO)

# Add Backend to sys.path to allow imports if needed, though RAGManager is self-contained mostly
current_dir = Path(__file__).resolve().parent
# specific path to backend: .../Backend
backend_dir = current_dir.parent.parent.parent
sys.path.append(str(backend_dir))

from dotenv import load_dotenv

# Load env from Backend/.env
env_path = backend_dir / '.env'
print(f"Loading .env from: {env_path}")
load_dotenv(env_path)

try:
    from rag_manager import RAGManager
except ImportError:
    # Try absolute import if running from root
    try:
        from Shared.AI_Agents.medical_agents.rag_manager import RAGManager
    except ImportError:
         print("Could not import RAGManager. Check python path.")
         sys.exit(1)

def test_rag():
    print("Initializing RAG Manager...")
    try:
        rag = RAGManager()
    except Exception as e:
        print(f"Failed to initialize RAG: {e}")
        import traceback
        traceback.print_exc()
        return

    queries = ["Hypertension", "Diabetes", "Heart Failure"]
    
    print("\n--- Testing Task Knowledge Base Retrieval ---")
    for query in queries:
        print(f"\nQuerying: '{query}'")
        result = rag.search(query, k=1, collection_type="task")
        print(f"Result:\n{result}")
        print("-" * 30)

if __name__ == "__main__":
    test_rag()
