import requests
import sys

# Replace this with the actual Caretaker's User UUID from your database
# You can find this in your Supabase/PostgreSQL database under the 'users' table
# where role = 'CARETAKER'
CARETAKER_UUID = "YOUR_CARETAKER_UUID_HERE" 

RENDER_URL = "https://agentic-ai-nurse-backend.onrender.com"

def test_push():
    if CARETAKER_UUID == "YOUR_CARETAKER_UUID_HERE":
        print("❌ Error: You must open test_render_push.py and paste your Caretaker's User UUID first!")
        sys.exit(1)
        
    url = f"{RENDER_URL}/api/v1/notifications/test-push"
    
    payload = {
        "user_id": CARETAKER_UUID,
        "title": "Render Test Alert",
        "body": "If you see this, Firebase and Render are working perfectly!",
        "event_type": "TEST_EVENT"
    }

    print(f"Sending test push to {RENDER_URL} for User ID: {CARETAKER_UUID}...")
    
    try:
        response = requests.post(url, json=payload)
        
        if response.status_code == 200:
            print("✅ Success! Response from Render:")
            print(response.json())
        else:
            print(f"❌ Failed with status code: {response.status_code}")
            print(response.text)
            
    except Exception as e:
        print(f"❌ Request failed: {e}")

if __name__ == "__main__":
    test_push()
