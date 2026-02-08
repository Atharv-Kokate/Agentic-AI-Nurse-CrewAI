import os
import requests
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load env
current_dir = Path(__file__).resolve().parent
backend_dir = current_dir.parent.parent.parent
env_path = backend_dir / '.env'
load_dotenv(env_path)

api_key = os.getenv("GOOGLE_API_KEY")

def list_models():
    if not api_key:
        print("No API key found in .env")
        return

    print(f"Key present (end): ...{api_key[-5:] if len(api_key)>5 else 'short'}")
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
    print(f"Checking URL: {url.replace(api_key, 'API_KEY')}")
    
    try:
        response = requests.get(url)
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            models = data.get('models', [])
            print(f"Found {len(models)} models.")
            for m in models:
                if 'embed' in m['name'] or 'embedding' in m['name']:
                    print(f" - NAME: {m['name']}")
                    print(f"   Supported: {m.get('supportedGenerationMethods', [])}")
        else:
            print(f"Error Body: {response.text}")
    except Exception as e:
        print(f"Exception listing models: {e}")

if __name__ == "__main__":
    list_models()
