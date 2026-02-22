import os
from crewai import Agent, LLM
from medical_agents.tools import AskPatientTool

# ─── LLM Configuration ───────────────────────────────────────────────
# Strategy: Use 8B-instant for simple tasks (higher Groq TPM limits)
#           Use 70B-versatile only for reasoning-heavy tasks
#           Round-robin across 2 API keys to double effective rate limits
# ─────────────────────────────────────────────────────────────────────

_KEY_1 = os.getenv("GROQ_API_KEY")
_KEY_2 = os.getenv("GROQ_API_KEY_2") or _KEY_1  # Fallback to key1 if key2 missing

# 70B — Deep reasoning (symptom inquiry, risk assessment)
groq_70b_key1 = LLM(
    model="groq/llama-3.3-70b-versatile",
    api_key=_KEY_1,
    num_retries=3,
)
groq_70b_key2 = LLM(
    model="groq/llama-3.3-70b-versatile",
    api_key=_KEY_2,
    num_retries=3,
)

# 8B — Fast, high-throughput (vitals, aggregation, decision, planning)
groq_8b_key1 = LLM(
    model="groq/llama-3.1-8b-instant",
    api_key=_KEY_1,
    num_retries=3,
)
groq_8b_key2 = LLM(
    model="groq/llama-3.1-8b-instant",
    api_key=_KEY_2,
    num_retries=3,
)

class MedicalAgents:
    def __init__(self, patient_id=None):
        self.patient_id = patient_id

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
            max_rpm=6,
            llm=groq_8b_key1  # 8B fast model, Key 1 — classification task
        )

    def symptom_inquiry_agent(self):
        # Custom Knowledge Base Search Tool (Lightweight & Reliable)
        from medical_agents.tools import AskPatientTool, KnowledgeBaseSearchTool
        
        try:
            knowledge_tool = KnowledgeBaseSearchTool()
            tools_list = [AskPatientTool(patient_id=self.patient_id), knowledge_tool]
        except Exception as e:
            print(f"❌ CRITICAL ERROR: Failed to load Tools. Details: {e}")
            tools_list = [AskPatientTool(patient_id=self.patient_id)]

        return Agent(
            role='Symptom Inquiry Agent',
            goal='Intelligently ask follow-up questions to gather more context about the patient\'s condition.',
            backstory=(
                "You are an empathetic and thorough medical assistant. "
                "Your role is to interview the patient when their vitals are abnormal or when they report symptoms. "
                "You DO NOT memorize all medical protocols. Instead, you MUST use your 'Search a mdx' tool "
                "to look up specific protocols in the Knowledge Base.\n"
                "1. First, SEARCH the knowledge base.\n"
                "2. Then, based on what you find, use the 'Ask Patient' tool to ask the critical questions.\n"
                "3. Stop identifying if this is an emergency.\n"
                "IMPORTANT: When calling tools, ensure you use strictly JSON format. Do NOT use fake XML tags like <function>."
            ),
            verbose=True,
            allow_delegation=False,
            max_rpm=6,
            tools=tools_list,
            llm=groq_70b_key2  # 70B reasoning model, Key 2 (heavy tool usage)
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
            max_rpm=6,
            llm=groq_8b_key1  # 8B fast model, Key 1 — summarization task
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
            max_rpm=6,
            llm=groq_70b_key1  # 70B reasoning model, Key 1 — critical reasoning
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
            max_rpm=6,
            llm=groq_8b_key2  # 8B fast model, Key 2 — structured output task
        )

    def task_planner_agent(self):
        # Tools import
        from medical_agents.tools import SearchTaskKnowledgeBaseTool
        
        return Agent(
            role='Daily Health Task Planner',
            goal='Generate a structured daily plan (Diet, Exercise, Lifestyle) for a patient based on their specific medical conditions.',
            backstory="""You are an expert Lifestyle Medicine specialist. You create personalized, practical daily routines for patients. 
            You ALWAYS check the trusted knowledge base for condition-specific protocols (e.g., Diabetes Diet, Hypertension Exercise) before assigning tasks.
            Your plans are simple, actionable, and strictly based on medical guidelines.
            IMPORTANT: When calling tools, ensure you use strictly JSON format. Do NOT use fake XML tags like <function>.""",
            verbose=True,
            tools=[SearchTaskKnowledgeBaseTool()],
            llm=groq_8b_key2,  # 8B fast model, Key 2 — task generation
            max_rpm=6,
            max_iter=3
        )