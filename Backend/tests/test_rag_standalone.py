import os
import sys

# Mocking DB dependencies to avoid connection errors during simple import test
from unittest.mock import MagicMock
sys.modules['database.session'] = MagicMock()
sys.modules['database.models'] = MagicMock()

# Now import the code
from AI_Agents.src.agents import MedicalAgents
from crewai import Task, Crew

def test_rag_initialization():
    print("1. Initializing MedicalAgents...")
    try:
        agents = MedicalAgents(patient_id="test_patient")
        print("✅ MedicalAgents initialized.")
    except Exception as e:
        print(f"❌ Failed to init MedicalAgents: {e}")
        return

    print("2. Creating Symptom Inquiry Agent (with RAG)...")
    try:
        agent = agents.symptom_inquiry_agent()
        print("✅ Agent created.")
        print(f"   Tools: {[t.name for t in agent.tools]}")
    except Exception as e:
        print(f"❌ Failed to create agent: {e}")
        import traceback
        traceback.print_exc()
        return

    print("\n✅ RAG Implementation verified successfully (Static Check).")
    print("To test fully, run the backend and perform a request.")

if __name__ == "__main__":
    test_rag_initialization()
