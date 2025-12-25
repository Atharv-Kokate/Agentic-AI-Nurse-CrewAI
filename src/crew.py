from crewai import Crew, Process
from src.agents import MedicalAgents
from src.tasks import MedicalTasks
import time
import sys

class MedicalCrew:
    def __init__(self):
        self.agents = MedicalAgents()
        self.tasks = MedicalTasks()

    def kickoff_with_retry(self, crew_instance, step_name):
        max_retries = 10
        wait_time = 45 # seconds
        for attempt in range(max_retries):
            try:
                return crew_instance.kickoff()
            except Exception as e:
                error_msg = str(e).lower()
                if "rate_limit" in error_msg or "429" in error_msg or "too many requests" in error_msg or "upstream" in error_msg:
                    # Use sys.__stdout__.write to avoid Rich FileProxy crash
                    sys.__stdout__.write(f"\n\n[WARNING] Rate limit hit ({step_name}). Waiting {wait_time}s before retry {attempt + 1}/{max_retries}...\n")
                    time.sleep(wait_time)
                    wait_time += 15 
                else:
                    raise e
        raise Exception(f"Max retries exceeded for {step_name}.")

    def run(self, patient_data):
        # Instantiate Agents
        detective_agent = self.agents.vital_analysis_agent()
        interviewer_agent = self.agents.symptom_inquiry_agent()
        aggregator_agent = self.agents.context_aggregation_agent()
        risk_agent = self.agents.risk_assessment_agent()
        decision_agent = self.agents.decision_action_agent()

        # Instantiate Tasks
        vital_analysis = self.tasks.analyze_vitals_task(detective_agent, patient_data)
        symptom_inquiry = self.tasks.symptom_inquiry_task(interviewer_agent, context=[vital_analysis])
        aggregation = self.tasks.aggregate_context_task(aggregator_agent, context=[vital_analysis, symptom_inquiry])
        risk_assessment = self.tasks.assess_risk_task(risk_agent, context=[aggregation])
        decision_making = self.tasks.decide_action_task(decision_agent, context=[risk_assessment])

        # Execution Chain with Retry Wrapper
        print("\n[1/5] Running Vital Analysis Agent...")
        c1 = Crew(agents=[detective_agent], tasks=[vital_analysis], verbose=True)
        self.kickoff_with_retry(c1, "Vital Analysis")
        print("Analysis Complete. Cooling down (10s)...")
        time.sleep(10)

        print("\n[2/5] Running Symptom Inquiry Agent...")
        c2 = Crew(agents=[interviewer_agent], tasks=[symptom_inquiry], verbose=True)
        self.kickoff_with_retry(c2, "Symptom Inquiry")
        print("Inquiry Complete. Cooling down (10s)...")
        time.sleep(10)

        print("\n[3/5] Running Context Aggregation Agent...")
        c3 = Crew(agents=[aggregator_agent], tasks=[aggregation], verbose=True)
        self.kickoff_with_retry(c3, "Context Aggregation")
        print("Aggregation Complete. Cooling down (10s)...")
        time.sleep(10)

        print("\n[4/5] Running Risk Assessment Agent...")
        c4 = Crew(agents=[risk_agent], tasks=[risk_assessment], verbose=True)
        self.kickoff_with_retry(c4, "Risk Assessment")
        print("Assessment Complete. Cooling down (10s)...")
        time.sleep(10)

        print("\n[5/5] Running Decision & Action Agent...")
        c5 = Crew(agents=[decision_agent], tasks=[decision_making], verbose=True)
        result = self.kickoff_with_retry(c5, "Decision Action")
        
        return result
