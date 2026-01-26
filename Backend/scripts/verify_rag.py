import sys
import os
from pathlib import Path

# Setup paths
current_file = Path(__file__).resolve()
backend_dir = current_file.parent.parent
sys.path.append(str(backend_dir))
sys.path.append(str(backend_dir / "Shared"))

print("--- verify_rag.py started ---")
try:
    from dotenv import load_dotenv
    load_dotenv(backend_dir / ".env")
    
    from Shared.AI_Agents.medical_agents.rag_manager import RAGManager
except ImportError as e:
    print(f"Error importing modules: {e}")
    sys.exit(1)

def test_rag():
    print("--- Testing RAG System ---")
    
    # 1. Initialize
    print("Initializing RAGManager (this connects to Chroma & HF API)...")
    try:
        rag = RAGManager()
        print("✔ Initialization successful.")
    except Exception as e:
        print(f"❌ Initialization failed: {e}")
        return

    # 2. Check Embedding Function
    print("\n--- Testing Embedding Generation (Gemini API) ---")
    try:
        test_emb = rag.embedding_fn(["test query"])
        print(f"✔ Embedding generated. Type: {type(test_emb)}")
        if isinstance(test_emb, list) and len(test_emb) > 0:
             print(f"✔ Embedding vector size: {len(test_emb[0])} dimensions")
    except Exception as e:
        print(f"❌ Embedding generation failed. Check Google API Key. Error: {e}")
        return

    # 3. Perform Search
    print("\n--- Testing Search ---")
    query = "Chest pain and sweating"
    print(f"Query: '{query}'")
    try:
        results = rag.search(query, k=1)
        print("\n[Search Results]")
        print(results)
        
        if "No specific protocols found" in results and "Error" not in results:
             print("\nNote: No matches found, but search executed successfully.")
        
        print("\n✔ RAG Search Test Complete.")
    except Exception as e:
        print(f"❌ Search failed: {e}")

if __name__ == "__main__":
    test_rag()
