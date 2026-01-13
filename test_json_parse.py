
import json
import logging

# Mock logger
logging.basicConfig(level=logging.ERROR)
logger = logging.getLogger(__name__)

def clean_json_string(json_str: str):
    """
    Current implementation from Backend/main.py
    """
    if hasattr(json_str, 'raw'):
        json_str = json_str.raw
    
    # Remove markdown code blocks if present
    if "```json" in json_str:
        json_str = json_str.split("```json")[1].split("```")[0]
    elif "```" in json_str:
        json_str = json_str.split("```")[1].split("```")[0]
    
    try:
        return json.loads(json_str.strip())
    except json.JSONDecodeError as e:
        print(f"Failed to parse JSON: {json_str[:50]}...")
        return {}

def robust_clean_json_string(json_str: str):
    """
    Proposed robust implementation
    """
    if hasattr(json_str, 'raw'):
        json_str = json_str.raw
    
    # 1. Try extracting from code blocks first
    if "```json" in json_str:
        try:
            block = json_str.split("```json")[1].split("```")[0]
            return json.loads(block.strip())
        except:
            pass
    elif "```" in json_str:
        try:
            block = json_str.split("```")[1].split("```")[0]
            return json.loads(block.strip())
        except:
            pass

    # 2. Try finding the first '{' and last '}'
    try:
        start_idx = json_str.find('{')
        end_idx = json_str.rfind('}')
        
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            potential_json = json_str[start_idx : end_idx + 1]
            return json.loads(potential_json)
    except json.JSONDecodeError:
        pass
        
    # 3. Fallback to original attempt (rarely works if above failed, but strictly adhering)
    try:
        return json.loads(json_str.strip())
    except json.JSONDecodeError:
        print(f"Robust parse failed for: {json_str[:50]}...")
        return {}

# Test Case from User
bad_output = """
{
  "action": "EMERGENCY",
  "urgency": "Critical",
  "doctor_note": "Patient Atharv..."
}
- Heart Rate: 90 (diagnosis: Tachycardia)
- Blood Sugar: 120 (diagnosis: Hyperglycemia in the context of known diabetes)
Potential Conditions/Diagnosis:
...
requires_immediate_action": true
}
"""

print("--- Testing Original ---")
res = clean_json_string(bad_output)
print(f"Result: {res}")

print("\n--- Testing Robust ---")
res_robust = robust_clean_json_string(bad_output)
print(f"Result: {res_robust}")
