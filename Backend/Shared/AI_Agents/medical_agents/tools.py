import sys
import os

# Ensure backend root is in path to import database modules
current_dir = os.path.dirname(os.path.abspath(__file__)) # .../Backend/Shared/AI_Agents/medical_agents
# .../Backend/Shared/AI_Agents -> .../Backend/Shared
backend_path = os.path.abspath(os.path.join(current_dir, '..', '..'))
if backend_path not in sys.path:
    sys.path.append(backend_path)

from crewai.tools import BaseTool
import time
import uuid

# Import DB session and model
from database.session import SessionLocal
from database.models import AgentInteraction

class AskPatientTool(BaseTool):
    name: str = "Ask Patient"
    description: str = (
        "Useful for asking the patient follow-up questions to clarify their symptoms. "
        "Input should be the question you want to ask."
    )
    patient_id: str = None
    
    def __init__(self, patient_id: str = None):
        super().__init__()
        self.patient_id = patient_id

    def _run(self, question: str) -> str:
        """Run the tool to ask the patient a question via DB polling."""
        if not self.patient_id:
             return "Error: Patient ID not provided to tool. Cannot ask question."
             
        # 1. Create Question Record
        db = SessionLocal()
        interaction_id = uuid.uuid4()
        try:
            interaction = AgentInteraction(
                id=interaction_id,
                patient_id=self.patient_id,
                question=question,
                status="PENDING"
            )
            db.add(interaction)
            db.commit()
            print(f"[AskPatientTool] Question logged: {question} (ID: {interaction_id})")
            
            # 2. Notify Frontend via WebSocket (Thread-Safe via requests)
            try:
                # We use a direct HTTP call to our own server to trigger the broadcast
                # This avoids messing with asyncio loops from a thread
                import requests
                payload = {
                    "patient_id": self.patient_id,
                    "status": "WAITING_FOR_INPUT",
                    "pending_interaction": {
                        "interaction_id": str(interaction_id),
                        "question": question
                    }
                }
                # Assuming localhost running on 8000. 
                # Ideally config url, but hardcoding for this fix.
                requests.post("http://localhost:8000/api/v1/internal/broadcast", json=payload, timeout=2)
            except Exception as wse:
                print(f"[AskPatientTool] Failed to trigger broadcast: {wse}")

        except Exception as e:
            db.close()
            return f"Error logging question: {e}"
        finally:
            db.close()

        # 3. Poll for Answer
        # Wait for up to 5 minutes (150 * 2s)
        max_retries = 150 
        
        print(f"[AskPatientTool] Waiting for answer for Interaction {interaction_id}...")
        for _ in range(max_retries):
            time.sleep(2)
            db = SessionLocal()
            try:
                record = db.query(AgentInteraction).filter(AgentInteraction.id == interaction_id).first()
                if record and record.status == "ANSWERED" and record.answer:
                    print(f"[AskPatientTool] Answer received: {record.answer}")
                    return record.answer
            finally:
                db.close()
        
        return "Timeout: Patient did not provide an answer in time. Proceed with available information."

from medical_agents.rag_manager import RAGManager

class KnowledgeBaseSearchTool(BaseTool):
    name: str = "Search Knowledge Base"
    description: str = (
        "Useful for searching medical protocols and guidelines for specific symptoms or conditions. "
        "Input should be a specific symptom or condition (e.g., 'Chest Pain', 'Hypertension'). "
        "Returns the relevant protocol sections."
    )
    
    def _run(self, query: str) -> str:
        try:
            rag = RAGManager()
            return rag.search(query)
        except Exception as e:
            return f"Error searching knowledge base: {str(e)}"
