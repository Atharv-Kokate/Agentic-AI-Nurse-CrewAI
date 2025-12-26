from crewai.tools import BaseTool

class AskPatientTool(BaseTool):
    name: str = "Ask Patient"
    description: str = (
        "Useful for asking the patient follow-up questions to clarify their symptoms. "
        "Input should be the question you want to ask."
    )

    def _run(self, question: str) -> str:
        """Run the tool to ask the patient a question."""
        print(f"\n\n[Doctor/Agent]: {question}")
        answer = input("[Patient]: ")
        return answer
