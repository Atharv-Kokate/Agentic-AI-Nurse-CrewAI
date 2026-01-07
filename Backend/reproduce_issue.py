import sys
import os
import time
import requests
import json

BASE_URL = "http://localhost:8000/api/v1"

def test_async_flow():
    # 1. Start Analysis with 120/80 (Normal)
    payload = {
        "name": "Hallucination Test Patient",
        "age": 45,
        "gender": "Female",
        "contact_number": "555-HALLUC-002",
        "blood_pressure": "120/80", 
        "heart_rate": "72", 
        "blood_sugar": "80", 
        "meds_taken": True,
        "known_conditions": "None",
        "initial_symptoms": "None",
        "sleep_hours": 8
    }
    
    print(f"\n[INFO] Sending Payload:\n{json.dumps(payload, indent=2)}")
    
    print(f"[1] Starting Analysis for {payload['name']}...")
    try:
        resp = requests.post(f"{BASE_URL}/analyze", json=payload)
        if resp.status_code != 200:
            print(f"Error: {resp.text}")
            return
        data = resp.json()
        patient_id = data["patient_id"]
        print(f"✅ Analysis Started. Patient ID: {patient_id}")
    except Exception as e:
        print(f"❌ Failed to start analysis: {e}")
        return

    # 2. Polling Loop
    print(f"\n[2] Listening for Agent Questions ...")
    
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
                
                if interaction_id != last_interaction_id:
                    print(f"\n❓ [Agent Asks]: {interaction['question']}")
                    
                    user_answer = "No symptoms."
                    print(f"   Submitting answer: {user_answer}")
                    answer_payload = {"answer": user_answer}
                    requests.post(f"{BASE_URL}/interaction/{interaction_id}", json=answer_payload)
                    last_interaction_id = interaction_id
            
            elif status == "COMPLETED":
                result = status_data["result"]
                print(f"\n🎉 [Analysis Complete!]")
                print(f"   Risk Level: {result['risk_level']}")
                print(f"   Score: {result['risk_score']}")
                if "reasoning" in result:
                     print(f"   Reasoning: {result['reasoning']}")
                break
                
            elif status == "FAILED":
                print("Analysis FAILED.")
                break
                 
        except KeyboardInterrupt:
            print("\nTest stopped by user.")
            break
        except Exception as e:
            print(f"Error polling: {e}")
            break

if __name__ == "__main__":
    test_async_flow()
