from crewai import Task
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

# --- Pydantic Output Models ---

class RiskAssessmentOutput(BaseModel):
    risk_level: str = Field(..., description="Overall risk level: LOW, MODERATE, HIGH, or CRITICAL")
    risk_score: int = Field(..., description="Risk score from 0-100")
    justification: Dict[str, Any] = Field(..., description="Detailed medical justification as a nested object (Patient Context, History, Symptoms, Vitals Evaluation, Potential Diagnosis)")
    requires_immediate_action: bool = Field(..., description="True if immediate medical intervention is needed")

class ActionDecisionOutput(BaseModel):
    action: str = Field(..., description="MONITOR | ALERT_DOCTOR | EMERGENCY")
    urgency: str = Field(..., description="Normal | High | Critical")
    doctor_note: str = Field(..., description="Concise briefing note for the doctor")

class MedicalTasks:
    def analyze_vitals_task(self, agent, patient_data):
        return Task(
            description=(
                f"Analyze the following patient vital signs: {patient_data}. "
                "Compare the [CURRENT VITALS] against standard medical thresholds (e.g., BP 120/80, HR 60-100). "
                "CRITICAL INSTRUCTIONS:\n"
                "1. USE ONLY THE NUMBERS PROVIDED IN [CURRENT VITALS]. DO NOT HALLUCINATE OR INVENT VALUES.\n"
                "2. IF A FIELD IS EMPTY, MISSING, OR 'None', STATE 'NOT PROVIDED'. DO NOT GUESS A NUMBER.\n"
                "3. If [RECENT VITALS HISTORY] is empty or [] or None, ASSUME NO HISTORY. Do NOT invent a history.\n"
                "4. Compare current vitals to history ONLY IF history exists.\n"
                "5. Determine severity (NORMAL, WARNING, CRITICAL) based strictly on the provided numbers.\n"
                "6. CHECK [CURRENT MEDICATIONS]. If provided, consider their effect on vitals (e.g., 'BP controlled by medication')."
            ),
            expected_output=(
                "A JSON object containing:\n"
                "{\n"
                "  \"status\": \"NORMAL | WARNING | CRITICAL\",\n"
                "  \"abnormal_findings\": [\"High BP\", \"Rising HR Trend\"],\n"
                "  \"trend_analysis\": \"Brief summary... OR 'No history available'\",\n"
                "  \"requires_symptom_check\": true\n"
                "}"
            ),
            agent=agent
        )
##"6. EVEN IF VITALS ARE CRITICAL: You may ask up to 2 high-priority questions to confirm the severity or nature of the symptoms. Do not incorrectly assume you have 'enough info' just because vitals are high."


    def symptom_inquiry_task(self, agent, context):
        return Task(
            description=(
                "Based on the vital analysis and any initial symptoms reported, determine if further questions are needed. "
                "CRITICAL INSTRUCTIONS:\n"
                "1. CHECK [CONTEXT - VITAL ANALYSIS]. If status is 'NORMAL' AND input reported_symptoms is 'None' or empty, DO NOT ASK QUESTIONS.\n"
                "2. If no questions needed, return \"symptom_summary\": \"No symptoms reported, patient healthy\".\n"
                "3. SEARCH KNOWLEDGE BASE: You MUST use the 'Search Knowledge Base' tool to find the specific protocol for the patient's symptoms (e.g., 'Chest Pain', 'Hypertension').\n"
                "4. CHECK CONTEXT FIRST (CRITICAL): Before asking a question from the protocol, CHECK [ORIGINAL PATIENT DATA].\n"
                "   - If the patient has already provided the answer (e.g., 'known_conditions' answers 'history'), DO NOT ASK IT AGAIN.\n"
                "   - If the patient's 'reported_symptoms' already covers the question (e.g., they said 'chest pain', don't ask 'do you have chest pain'), DO NOT ASK IT AGAIN.\n"
                "5. ASK ONLY NEW QUESTIONS: Formulate your questions based ONLY on missing information from the protocol.\n"
                "6. You MUST ask at least 1-2 clarifying questions using the 'ask_patient' tool if there is ANY ambiguity or risk. Do not assume you know enough.\n"
                "7. MANDATORY TOOL USAGE: If the patient has ANY reported symptoms or ABNORMAL vitals, you MUST use the 'ask_patient' tool to verify the severity. Do NOT just summarize. Ask a question.\n"
                "8. ONLY stop asking questions if:\n"
                "   a) The patient is completely healthy (Normal Vitals + No Symptoms).\n"
                "   b) You have already asked 3 questions and have a clear picture.\n"
                "   c) It is a clear medical emergency requiring immediate escalation (skip to risk assessment).\n"
                "9. DO NOT return the final JSON until you have either asked the necessary questions or confirmed the patient is healthy."
                
            ),
            expected_output=(
                "A JSON object containing:\n"
                "{\n"
                "  \"symptom_summary\": \"Patient reports...\",\n"
                "  \"follow_up_questions_asked\": [\"Question 1\", \"Question 2\"],\n"
                "  \"patient_responses\": [\"Answer 1\", \"Answer 2\"]\n"
                "}"
            ),
            agent=agent,
            context=context # Explicitly pass context from vital analysis
        )

    def aggregate_context_task(self, agent, context):
        return Task(
            description=(
                "Combine the vital analysis and the symptom inquiry results into a cohesive clinical summary. "
                "Highlight correlations between vitals and symptoms. "
                "Identify key risk factors present in the data.\n"
                "CRITICAL: \n"
                "1. If Symptom Inquiry says 'No symptoms' and Vitals are 'NORMAL', the aggregate summary MUST reflect a healthy patient.\n"
                "2. If Vital Analysis says 'NOT PROVIDED' or 'MISSING', DO NOT INVENT VITALS in the summary.\n"
                "3. REVIEW [CURRENT MEDICATIONS]. explicitly mention them in the clinical summary if relevant (e.g. 'Patient on Metformin')."
            ),
            expected_output=(
                "A JSON object containing:\n"
                "{\n"
                "  \"clinical_summary\": \"Evaluated BP with...\",\n"
                "  \"key_risk_factors\": [\"Hypertension\", \"Angina risk\"],\n"
                "  \"trend\": \"Stable | Worsening | Improving\"\n"
                "}"
            ),
            agent=agent,
            context=context
        )

    def assess_risk_task(self, agent, context):
        return Task(
            description=(
                "Evaluate the aggregated clinical context and determine the overall health risk. "
                "Assign a risk level (LOW, MODERATE, HIGH, CRITICAL) and provide a medical justification.\n"
                "CRITICAL INSTRUCTIONS:\n"
                "1. IF [CONTEXT - CLINICAL AGGREGATION] says 'No symptoms' AND vitals are 'NORMAL', Risk Level MUST be 'LOW'.\n"
                "2. DO NOT HALLUCINATE RISKS. If vitals are benign, do not claim 'hypertensive crisis'.\n"
                "3. Consistency Check: If BP is < 130/85, Risk CANNOT be HIGH unless severe symptoms exist.\n"
                "5. CHECK [MEDICATION ADHERENCE LOG] & [DAILY LIFESTYLE TASKS]:\n"
                "   - If 'Status: MISSED', 'SKIPPED' or 'OVERDUE' appears for critical meds, Risk Level MUST INCREASE.\n"
                "   - If 'REFUSED BY CARETAKER' appears, flag this as a compliance issue.\n"
                "6. Your 'justification' MUST be a COMPREHENSIVE MEDICAL REPORT. It must explicitly include:\n"
                "   - Patient Context (Age/Gender)\n"
                "   - Known Medical History (from input)\n"
                "   - Current Medications (from input)\n"
                "   - Adherence Check (Missed Meds/Tasks?)\n"
                "   - Reported Symptoms (detailed)\n"
                "   - Vital Signs Evaluation (cite specific numbers e.g., 'BP: 160/100')\n"
                "   - Potential Conditions/Diagnosis (e.g., 'Suspected Hypertensive Urgency')\n"
                "   - Rationale for Risk Level.\n"
                "7. OUTPUT FORMAT RULE: You MUST return ONLY the raw JSON object. Do NOT wrap it in markdown codes (like ```json). Ensure all strings use \\n for newlines. Valid JSON only."
            ),
            expected_output=(
                "A JSON object containing:\n"
                "{\n"
                "  \"risk_level\": \"HIGH\",\n"
                "  \"risk_score\": 85,\n"
                "  \"justification\": \"Patient has critical BP and specific symptoms... Missed Metformin dose...\",\n"
                "  \"requires_immediate_action\": true\n"
                "}"
            ),
            agent=agent,
            context=context,
            # output_pydantic=RiskAssessmentOutput # DISABLED: Processed by robust clean_json_string in main.py
        )

    def decide_action_task(self, agent, context):
        return Task(
            description=(
                "Based on the risk assessment, decide the next operational step. "
                "Draft a detailed note for the doctor if the action is to alert or escalate. "
                "CRITICAL: The 'doctor_note' must be a standalone Briefing. It must include:\n"
                "1. Patient Identity & Demographics\n"
                "2. Chief Complaint & Symptoms\n"
                "3. Medical History & Adherence: YOU MUST EXPLICITLY LIST any medications marked as 'MISSED', 'SKIPPED', or 'OVERDUE' from the logs. Do not just say 'inconsistent adherence'. Also list REFUSED tasks.\n"
                "4. EXACT VITALS (BP, HR, SpO2, etc.)\n"
                "5. Suspected Condition & Recommended Action.\n"
                "6. OUTPUT FORMAT RULE: You MUST return ONLY the raw JSON object. Do NOT wrap it in markdown codes (like ```json). Ensure all strings use \\n for newlines. Valid JSON only."
            ),
            expected_output=(
                "A JSON object containing:\n"
                "{\n"
                "  \"action\": \"MONITOR | ALERT_DOCTOR | EMERGENCY\",\n"
                "  \"urgency\": \"Normal | High | Critical\",\n"
                "  \"doctor_note\": \"Patient presenting with... Recommended action...\"\n"
                "}"
            ),
            agent=agent,
            context=context,
            # output_pydantic=ActionDecisionOutput # DISABLED: Processed by robust clean_json_string in main.py
        )

    def create_daily_plan_task(self, agent, patient_data):
        return Task(
            description=(
                f"Create a daily health plan for the following patient: {patient_data}. "
                "1. SEARCH the Task Knowledge Base for protocols relevant to the patient's known conditions (e.g., 'Hypertension', 'Diabetes'). "
                "2. Generate 10 to 12 specific, actionable tasks for TODAY. "
                "3. Tasks must span categories: Diet, Exercise, Lifestyle, Medication (if applicable). "
                "4. OUTPUT FORMAT RULE: Return ONLY a JSON list of objects. "
                "Example: [{\"category\": \"Diet\", \"task_description\": \"Eat a low-sodium lunch...\"}, ...]"
            ),
            expected_output=(
                "A JSON array containing:\n"
                "[\n"
                "  {\n"
                "    \"category\": \"Diet | Exercise | Lifestyle | Medication\",\n"
                "    \"task_description\": \"Specific action item\"\n"
                "  }\n"
                "]"
            ),
            agent=agent
        )
