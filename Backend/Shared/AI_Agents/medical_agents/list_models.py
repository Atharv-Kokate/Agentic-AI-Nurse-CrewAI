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
if not api_key:
    print("No API key found")
    sys.exit(1)

url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"

try:
    response = requests.get(url)
    if response.status_code == 200:
        models = response.json().get('models', [])
        print("Available Models:")
        for m in models:
            if 'embed' in m['name'] or 'embedding' in m['name']:
                print(f" - {m['name']} (Supported methods: {m.get('supportedGenerationMethods', [])})")
    else:
        print(f"Error: {response.status_code} - {response.text}")
except Exception as e:
    print(f"Failed to list models: {e}")
