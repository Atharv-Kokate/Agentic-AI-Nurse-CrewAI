from crewai import Task

class MedicalTasks:
    def analyze_vitals_task(self, agent, patient_data):
        return Task(
            description=(
                f"Analyze the following patient vital signs: {patient_data}. "
                "Compare them against standard medical thresholds (e.g., BP 120/80, HR 60-100). "
                "CRITICAL: Check the 'recent_vitals_history' provided in the input. Compare the CURRENT vitals to these previous 5 readings. "
                "Identify if thresholds are MET, but also if values are TRENDING negatively (e.g., BP steadily rising over last 5 logs). "
                "Determine the severity (NORMAL, WARNING, CRITICAL) based on both absolute values AND trends."
            ),
            expected_output=(
                "A JSON object containing:\n"
                "{\n"
                "  \"status\": \"NORMAL | WARNING | CRITICAL\",\n"
                "  \"abnormal_findings\": [\"High BP\", \"Rising HR Trend\"],\n"
                "  \"trend_analysis\": \"Brief summary of how vitals have changed over the last 5 readings (e.g. 'BP has increased by 10 points since last check')\",\n"
                "  \"requires_symptom_check\": true\n"
                "}"
            ),
            agent=agent
        )

    def symptom_inquiry_task(self, agent, context):
        return Task(
            description=(
                "Based on the vital analysis and any initial symptoms reported, determine if further questions are needed. "
                "If 'requires_symptom_check' is true or if there are abnormal findings, use the 'Ask Patient' tool "
                "to interview the patient. Limit yourself to 3 questions max. "
                "Prioritize identifying red flags (severe pain, difficulty breathing, altered mental state). "
                "Stop immediately if you identify a medical emergency or have enough info."
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
                "Identify key risk factors present in the data."
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
                "Assign a risk level (LOW, MODERATE, HIGH, CRITICAL) and provide a medical justification."
            ),
            expected_output=(
                "A JSON object containing:\n"
                "{\n"
                "  \"risk_level\": \"HIGH\",\n"
                "  \"risk_score\": 85,\n"
                "  \"justification\": \"Patient has critical BP and specific symptoms...\",\n"
                "  \"requires_immediate_action\": true\n"
                "}"
            ),
            agent=agent,
            context=context
        )

    def decide_action_task(self, agent, context):
        return Task(
            description=(
                "Based on the risk assessment, decide the next operational step. "
                "Draft a concise summary note for the doctor if the action is to alert or escalate. "
                "The note should be professional and highlight the most critical information first."
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
            context=context
        )
