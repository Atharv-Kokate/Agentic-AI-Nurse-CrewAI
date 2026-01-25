from crewai import Crew, Process
from medical_agents.agents import MedicalAgents
from medical_agents.tasks import MedicalTasks
import time
import sys
import datetime

def log_debug(msg):
    with open("crew_debug.log", "a") as f:
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        f.write(f"[{timestamp}] {msg}\n")


class MedicalCrew:
    def __init__(self, patient_id=None):
        self.agents = MedicalAgents(patient_id=patient_id)
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
        print(f"DEBUG: MedicalCrew.run called with: {patient_data}")
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
        res1 = self.kickoff_with_retry(c1, "Vital Analysis")
        print(f"DEBUG: Vitals Output: {res1}")
        print("Analysis Complete.")

        # Helper to safely get string content
        def get_output_str(res):
            if hasattr(res, 'raw'):
                return res.raw
            return str(res)

        out1 = get_output_str(res1)
        
        print("\n[2/5] Running Symptom Inquiry Agent...")
        # Manually inject context since separate Crews might break Task.context sharing
        # CRITICAL FIX: Inject ORIGINAL PATIENT DATA so this agent doesn't rely solely on the previous agent's summary
        symptom_inquiry.description += f"\n\n[ORIGINAL PATIENT DATA]:\n{patient_data}\n\n[CONTEXT - VITAL ANALYSIS]:\n{out1}"
        
        c2 = Crew(agents=[interviewer_agent], tasks=[symptom_inquiry], verbose=True)
        res2 = self.kickoff_with_retry(c2, "Symptom Inquiry")
        print(f"DEBUG: Symptom Output: {res2}")
        print("Inquiry Complete.")
        
        out2 = get_output_str(res2)

        print("\n[3/5] Running Context Aggregation Agent...")
        # Inject previous contexts AND original data
        aggregation.description += f"\n\n[ORIGINAL PATIENT DATA]:\n{patient_data}\n\n[CONTEXT - VITAL ANALYSIS]:\n{out1}\n\n[CONTEXT - SYMPTOM INQUIRY]:\n{out2}"
        
        c3 = Crew(agents=[aggregator_agent], tasks=[aggregation], verbose=True)
        res3 = self.kickoff_with_retry(c3, "Context Aggregation")
        print(f"DEBUG: Aggregation Output: {res3}")
        print("Aggregation Complete.")

        out3 = get_output_str(res3)

        print("\n[4/5] Running Risk Assessment Agent...")
        # Inject Ground Truth again
        risk_assessment.description += f"\n\n[ORIGINAL PATIENT DATA]:\n{patient_data}\n\n[CONTEXT - CLINICAL AGGREGATION]:\n{out3}"
        
        c4 = Crew(agents=[risk_agent], tasks=[risk_assessment], verbose=True)
        risk_result = self.kickoff_with_retry(c4, "Risk Assessment")
        print(f"DEBUG: Risk Result: {risk_result}")
        print("Assessment Complete.")

        out4 = get_output_str(risk_result)

        print("\n[5/5] Running Decision & Action Agent...")
        decision_making.description += f"\n\n[CONTEXT - RISK ASSESSMENT]:\n{out4}"
        
        c5 = Crew(agents=[decision_agent], tasks=[decision_making], verbose=True)
        decision_result = self.kickoff_with_retry(c5, "Decision Action")
        print(f"DEBUG: Decision Result: {decision_result}")

        
        return {
            "risk_assessment": risk_result,
            "decision_action": decision_result
        }
