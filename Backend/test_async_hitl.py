import sys
import os
import time
import requests

# Assuming running locall on default port
BASE_URL = "http://localhost:8000/api/v1"

def test_async_flow():
    # 1. Start Analysis
    payload = {
        "name": "Async Test Patient",
        "age": 55,
        "gender": "Male",
        "contact_number": "555-ASYNC-001",
        "blood_pressure": "200/100", # High BP to trigger Agent
        "heart_rate": "95",
        "blood_sugar": "100",
        "meds_taken": False,
        "known_conditions": "history of high BP , cardiac failure or heart attack",
        "initial_symptoms": "difficulties in breathing",
        "sleep_hours": 6
    }
    
    print(f"[1] Starting Analysis for {payload['name']}...")
    try:
        resp = requests.post(f"{BASE_URL}/analyze", json=payload)
        resp.raise_for_status()
        data = resp.json()
        patient_id = data["patient_id"]
        print(f"✅ Analysis Started. Patient ID: {patient_id}")
    except Exception as e:
        print(f"❌ Failed to start analysis: {e}")
        return

    # 2. Polling Loop
    print(f"\n[2] Listening for Agent Questions (Ctrl+C to quit)...")
    
    last_interaction_id = None
    
    while True:
        try:
            time.sleep(2)
            status_resp = requests.get(f"{BASE_URL}/status/{patient_id}")
            status_data = status_resp.json()
            status = status_data["status"]
            
            if status == "WAITING_FOR_INPUT":
                interaction = status_data["pending_interaction"]
                interaction_id = interaction["interaction_id"]
                
                # Only prompt if it's a NEW question we haven't answered yet
                if interaction_id != last_interaction_id:
                    print(f"\n❓ [Agent Asks]: {interaction['question']}")
                    
                    # Interactive Input
                    user_answer = input("👉 [Your Answer]: ")
                    
                    # Submit Answer
                    print(f"   Submitting answer...")
                    answer_payload = {"answer": user_answer}
                    requests.post(f"{BASE_URL}/interaction/{interaction_id}", json=answer_payload)
                    last_interaction_id = interaction_id
                    print("   ✅ Sent. Waiting for agent...")
            
            elif status == "COMPLETED":
                result = status_data["result"]
                print(f"\n🎉 [Analysis Complete!]")
                print(f"   Risk Level: {result['risk_level']}")
                print(f"   Score: {result['risk_score']}")
                if "reasoning" in result:
                     print(f"   Reasoning: {result['reasoning']}")
                break
                
            elif status == "RUNNING":
                 # Just waiting
                 pass
                 
        except KeyboardInterrupt:
            print("\nTest stopped by user.")
            break
        except Exception as e:
            print(f"Error polling: {e}")
            break

if __name__ == "__main__":
    test_async_flow()
