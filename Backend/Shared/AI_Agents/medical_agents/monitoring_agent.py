import os
import logging
import json
from datetime import datetime
from pydantic import BaseModel, Field
from typing import List, Optional
from google import genai
from google.genai import types
from Shared.AI_Agents.medical_agents.rag_manager import RAGManager

logger = logging.getLogger("monitoring_agent")

class TargetedQuestion(BaseModel):
    target_role: str = Field(..., description="Must be exactly 'PATIENT' or 'CARETAKER'.")
    question_text: str = Field(..., description="The user-friendly question to display in the app.")
    response_type: str = Field(..., description="Must be exactly one of: 'YES_NO', 'EMOJI_SCALE', 'COMPARISON', 'FREE_TEXT'.")
    condition_tag: str = Field(..., description="The condition this question is related to, e.g. 'POST_SURGERY' or 'GENERAL'.")

class MonitoringCheckInPlan(BaseModel):
    questions: list[TargetedQuestion] = Field(..., description="List of generated questions for this check-in session.")

class MonitoringAgent:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("GOOGLE_API_KEY")
        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY is required for MonitoringAgent.")
        
        # Initialize GenAI Client
        self.client = genai.Client(api_key=self.api_key)
        self.model_name = "gemini-2.5-flash"  # Fast, cheap, and supports structured output natively
        
        # Initialize RAG
        self.rag_manager = RAGManager()

    def generate_check_in_questions(
        self, 
        patient_name: str,
        condition_tags: list[str],
        recent_history: str = "No recent history available."
    ) -> MonitoringCheckInPlan:
        """
        Uses RAG to fetch condition protocols and generates personalized questions.
        Outputs a strictly structured Pydantic object `MonitoringCheckInPlan`.
        """
        protocols_context = ""
        
        if condition_tags:
            logger.info(f"Fetching monitoring protocols for tags: {condition_tags}")
            for tag in condition_tags:
                protocol = self.rag_manager.search(
                    query=tag,
                    k=1,
                    collection_type="monitoring"
                )
                protocols_context += f"--- Tag: {tag} ---\n{protocol}\n\n"
        else:
            protocols_context = "No specific condition tags provided. Use generic daily check-in protocols."
            
        system_instruction = (
            "You are a Clinical Monitoring AI. Your task is to generate a proactive monitoring check-in consisting of precise, targeted questions.\n"
            "You MUST create questions for the PATIENT (subjective feelings/symptoms) AND the CARETAKER (objective observations).\n"
            "You MUST strictly adhere to the provided monitoring protocols and use ONLY the predefined response types.\n\n"
            "CRITICAL RULES:\n"
            "1. Generate exactly 2-3 questions for the PATIENT.\n"
            "2. Generate exactly 1-2 questions for the CARETAKER.\n"
            "3. The `target_role` MUST be exactly 'PATIENT' or 'CARETAKER'.\n"
            "4. The `response_type` MUST be exactly one of: 'YES_NO', 'EMOJI_SCALE', 'COMPARISON', 'FREE_TEXT'.\n"
            "5. Keep `question_text` extremely simple and colloquial. (e.g., 'Are your ankles swelling today?' not 'Are you experiencing peripheral edema?')."
        )
        
        prompt = (
            f"Patient Context:\n"
            f"Name: {patient_name}\n"
            f"Condition Tags: {condition_tags}\n\n"
            f"Recent History & Notes: {recent_history}\n\n"
            f"=== MONITORING PROTOCOLS (From RAG Knowledge Base) ===\n"
            f"{protocols_context}\n"
            f"====================================================\n\n"
            f"Task: Generate the precise list of questions to float to the patient and caretaker right now based on the protocols."
        )

        logger.info(f"Calling Gemini ({self.model_name}) for monitoring question generation...")
        
        try:
            # We strictly enforce the Pydantic schema Response Structure via the Gemini SDK
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    response_schema=MonitoringCheckInPlan,
                    temperature=0.2 # Low temperature for strict adherence to protocols
                ),
            )
            
            # The structured JSON output string from Gemini
            json_output = response.text
            
            # Parse the strict JSON back into the Pydantic model
            plan = MonitoringCheckInPlan.model_validate_json(json_output)
            logger.info(f"Successfully generated {len(plan.questions)} monitoring questions.")
            return plan
            
        except Exception as e:
            logger.error(f"Failed to generate monitoring questions: {e}")
            raise e
