from crewai import Task

class MedicalTasks:
    def analyze_vitals_task(self, agent, patient_data):
        return Task(
            description=(
                f"Analyze the following patient vital signs: {patient_data}. "
                "Compare the [CURRENT VITALS] against standard medical thresholds (e.g., BP 120/80, HR 60-100). "
                "CRITICAL INSTRUCTIONS:\n"
                "1. USE ONLY THE NUMBERS PROVIDED IN [CURRENT VITALS]. DO NOT HALLUCINATE OR INVENT VALUES.\n"
                "2. If [RECENT VITALS HISTORY] is empty or [] or None, ASSUME NO HISTORY. Do NOT invent a history.\n"
                "3. Compare current vitals to history ONLY IF history exists.\n"
                "4. Determine severity (NORMAL, WARNING, CRITICAL) based strictly on the provided numbers."
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

    def symptom_inquiry_task(self, agent, context):
        return Task(
            description=(
                "Based on the vital analysis and any initial symptoms reported, determine if further questions are needed. "
                "CRITICAL INSTRUCTIONS:\n"
                "1. CHECK [CONTEXT - VITAL ANALYSIS]. If status is 'NORMAL' AND input reported_symptoms is 'None' or empty, DO NOT ASK QUESTIONS.\n"
                "2. If no questions needed, return \"symptom_summary\": \"No symptoms reported, patient healthy\".\n"
                "3. DO NOT INVENT SYMPTOMS like 'chest pain' if the user did not report them. STRICTLY USE REPORTED SYMPTOMS ONLY.\n"
                "4. Only ask questions if 'requires_symptom_check' is true or explicit symptoms were provided.\n"
                "5. Stop immediately if you identify a medical emergency or have enough info."
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
                "CRITICAL: If Symptom Inquiry says 'No symptoms' and Vitals are 'NORMAL', the aggregate summary MUST reflect a healthy patient."
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
                "3. Consistency Check: If BP is < 130/85, Risk CANNOT be HIGH unless severe symptoms exist."
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
