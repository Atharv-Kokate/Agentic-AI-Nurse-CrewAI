import os
from crewai import Agent, LLM
from src.tools import AskPatientTool
# Initialize Native CrewAI LLMs
# 1. Ollama (Llama 3 8B) - Running Locally
ollama_llama3 = LLM(
    model="ollama/llama3:8b",
    base_url="http://localhost:11434"
)

# 2. Ollama (Phi 3) - Running Locally
ollama_phi = LLM(
    model="ollama/phi3",
    base_url="http://localhost:11434"
)

# 3. Groq (Llama 3.1 8B Instant) - Cloud
# Ensure GROQ_API_KEY is in .env
groq_llama70 = LLM(
    model="groq/llama-3.1-8b-instant",
    api_key=os.getenv("GROQ_API_KEY")
)

# 4. Groq (Gemma 9B) - Cloud
groq_gemma = LLM(
    model="groq/gemma2-9b-it",
    api_key=os.getenv("GROQ_API_KEY")
)

class MedicalAgents:
    def vital_analysis_agent(self):
        return Agent(
            role='Vital Analysis Agent',
            goal='Evaluate patient vital signs and identify abnormalities.',
            backstory=(
                "You are a medical diagnostician specializing in vital sign analysis. "
                "Your job is to strictly analyze the provided vital signs (Blood Pressure, Heart Rate, Blood Sugar, etc.) "
                "against standard medical thresholds. You classify the status as NORMAL, WARNING, or CRITICAL "
                "and identify specific abnormal findings. You are the first line of defense."
            ),
            verbose=True,
            allow_delegation=False,
            max_rpm=10,
            llm=ollama_llama3
        )

    def symptom_inquiry_agent(self):
        # Load Knowledge Base
        try:
            kb_path = os.path.join(os.path.dirname(__file__), 'knowledge_base.md')
            with open(kb_path, 'r', encoding='utf-8') as f:
                knowledge_base = f.read()
        except Exception:
            knowledge_base = "Error loading knowledge base. relied on general medical knowledge."

        return Agent(
            role='Symptom Inquiry Agent',
            goal='Intelligently ask follow-up questions to gather more context about the patient\'s condition.',
            backstory=(
                "You are an empathetic and thorough medical assistant. "
                "Your role is to interview the patient when their vitals are abnormal or when they report symptoms. "
                "You have access to a Medical Knowledge Base which you must strictly follow:\n\n"
                f"{knowledge_base}\n\n"
                "Use the 'Ask Patient' tool to ask these questions one by one until you have a clear picture. "
                "Do not ask too many open-ended questions at once. Be concise and professional."
            ),
            verbose=True,
            allow_delegation=False,
            max_rpm=10,
            tools=[AskPatientTool()],
            llm=ollama_llama3
        )

    def context_aggregation_agent(self):
        return Agent(
            role='Context Aggregation Agent',
            goal='Synthesize vital signs and symptom reports into a unified clinical context.',
            backstory=(
                "You are a clinical data specialist. You take the raw vital analysis and the detailed "
                "symptom report from the patient interview and combine them. "
                "You look for patterns (e.g., High BP + Chest Pain = potential cardiac event). "
                "You do not diagnose, but you summarize the clinical picture clearly for the risk assessor."
            ),
            verbose=True,
            allow_delegation=False,
            max_rpm=10,
            llm=groq_llama70
        )

    def risk_assessment_agent(self):
        return Agent(
            role='Risk Assessment Agent',
            goal='Quantify the health risk level and provide justification.',
            backstory=(
                "You are a senior risk managment officer in a hospital. "
                "Based on the clinical summary, you determine the risk level: LOW, MODERATE, HIGH, or CRITICAL. "
                "You must justify your assessment with specific data points (e.g., 'Risk is HIGH due to hypertensive crisis symptoms')."
            ),
            verbose=True,
            allow_delegation=False,
            max_rpm=10,
            llm=groq_llama70
        )

    def decision_action_agent(self):
        return Agent(
            role='Decision & Action Agent',
            goal='Determine the operational next step and summarize for the doctor.',
            backstory=(
                "You are the operational lead. Your job is to decide the final action: "
                "MONITOR_HOME, SCHEDULE_APPOINTMENT, ALERT_CAREGIVER, or EMERGENCY_ESCALATION. "
                "You also draft a concise, high-priority note for the doctor if escalation is needed, "
                "summarizing the key critical findings."
            ),
            verbose=True,
            allow_delegation=False,
            max_rpm=10,
            llm=ollama_phi
        )
