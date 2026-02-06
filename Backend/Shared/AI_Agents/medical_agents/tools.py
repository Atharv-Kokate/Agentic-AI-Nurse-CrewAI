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

from pydantic import BaseModel, Field

class AskPatientInput(BaseModel):
    question: str = Field(..., description="The specific question to ask the patient to clarify symptoms or condition.")

class AskPatientTool(BaseTool):
    name: str = "ask_patient"
    description: str = (
        "Useful for asking the patient follow-up questions to clarify their symptoms. "
        "Use this tool when you need more information to assess the risk."
    )
    args_schema: type[BaseModel] = AskPatientInput
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
            
            # 2. Notify Frontend via WebSocket
            try:
                import requests
                # Construct payload for broadcast
                payload = {
                    "patient_id": self.patient_id,
                    "status": "WAITING_FOR_INPUT",
                    "pending_interaction": {
                        "interaction_id": str(interaction_id),
                        "question": question
                    }
                }
                # Use default port 8000 if not set, typical for local dev
                port = os.getenv("PORT", "8000")
                requests.post(f"http://localhost:{port}/api/v1/internal/broadcast", json=payload, timeout=2)
            except Exception as wse:
                print(f"[AskPatientTool] Failed to trigger broadcast: {wse}")

        except Exception as e:
            db.close()
            return f"Error logging question: {e}"
        finally:
            db.close()

        # 3. Poll for Answer
        max_retries = 150 # 5 minutes
        
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

class SearchKnowledgeBaseInput(BaseModel):
    query: str = Field(..., description="The medical condition, symptom, or protocol to search for (e.g., 'Chest Pain protocols').")

class KnowledgeBaseSearchTool(BaseTool):
    name: str = "search_knowledge_base"
    description: str = (
        "Useful for searching medical protocols and guidelines for specific symptoms or conditions. "
        "Returns the relevant protocol sections from the trusted knowledge base."
    )
    args_schema: type[BaseModel] = SearchKnowledgeBaseInput
    
    def _run(self, query: str) -> str:
        try:
            rag = RAGManager()
            return rag.search(query, collection_type="clinical")
        except Exception as e:
            return f"Error searching knowledge base: {str(e)}"

class SearchTaskKnowledgeBaseInput(BaseModel):
    query: str = Field(..., description="The condition or topic to find daily routines for (e.g., 'Diabetes Diet', 'Post-Surgery Exercises').")

class SearchTaskKnowledgeBaseTool(BaseTool):
    name: str = "search_task_knowledge_base"
    description: str = (
        "Useful for finding specific daily routine protocols (Diet, Exercise, Sleep, Lifestyle) "
        "based on medical conditions."
    )
    args_schema: type[BaseModel] = SearchTaskKnowledgeBaseInput
    
    def _run(self, query: str) -> str:
        try:
            rag = RAGManager()
            return rag.search(query, collection_type="task")
        except Exception as e:
            return f"Error searching task knowledge base: {str(e)}"
