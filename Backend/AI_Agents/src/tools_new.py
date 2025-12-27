from crewai.tools import BaseTool
import time
import uuid

# Import DB session and model
# Note: We assume this runs in a context where 'Backend' is in path or installed
from database.session import SessionLocal
from database.models import AgentInteraction

class AskPatientTool(BaseTool):
    name: str = "Ask Patient"
    description: str = (
        "Useful for asking the patient follow-up questions to clarify their symptoms. "
        "Input should be the question you want to ask."
    )
    patient_id: str = None
    
    def __init__(self, patient_id: str):
        super().__init__()
        self.patient_id = patient_id

    def _run(self, question: str) -> str:
        """Run the tool to ask the patient a question via DB polling."""
        if not self.patient_id:
             return "Error: Patient ID not provided to tool. Cannot ask question."
             
        # 1. Create Question Record
        db = SessionLocal()
        try:
            interaction_id = uuid.uuid4()
            interaction = AgentInteraction(
                id=interaction_id,
                patient_id=self.patient_id,
                question=question,
                status="PENDING"
            )
            db.add(interaction)
            db.commit()
            print(f"[AskPatientTool] Question logged: {question} (ID: {interaction_id})")
        except Exception as e:
            db.close()
            return f"Error logging question: {e}"
        finally:
            db.close()

        # 2. Poll for Answer
        max_retries = 30 # 30 * 2s = 60 seconds timeout (Adjust as needed)
        # Ideally, this should be much longer or configurable for real usage
        
        print("[AskPatientTool] Waiting for answer...")
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
