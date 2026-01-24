import json
import re
import ast

def fix_and_parse_json(json_str):
    if hasattr(json_str, 'raw'):
        json_str = json_str.raw
    json_str = str(json_str)

    # 1. Strip code blocks
    if "```json" in json_str:
        json_str = json_str.split("```json")[1].split("```")[0]
    elif "```" in json_str:
        json_str = json_str.split("```")[1].split("```")[0]

    json_str = json_str.strip()

    # 2. Try direct parse
    try:
        return json.loads(json_str)
    except Exception:
        pass

    # 3. Handle multi-line strings using Regex
    # This regex matches double-quoted strings, accounting for escaped quotes
    # We use DOTALL so . matches newlines
    pattern = r'"((?:[^"\\]|\\.)*)"'
    
    def replace_newlines(match):
        # Allow real newlines in the string content to be escaped to \n
        content = match.group(1)
        if '\n' in content:
            # Replace literal newlines with escaped generic newline
            return '"' + content.replace('\n', '\\n').replace('\r', '') + '"'
        return match.group(0)

    fixed_str = re.sub(pattern, replace_newlines, json_str, flags=re.DOTALL)

    try:
        return json.loads(fixed_str)
    except Exception as e:
        print(f"Regex fix failed: {e}")

    # 4. Fallback to extracting just the curly braces (simple heuristic) and retrying
    # (Sometimes extra text is outside the JSON)
    start = fixed_str.find('{')
    end = fixed_str.rfind('}')
    if start != -1 and end != -1:
        try:
            return json.loads(fixed_str[start:end+1])
        except:
            pass
            
    return {}

# Test Case: The user's broken JSON with real newlines inside the string
broken_json = """{
  "risk_level": "CRITICAL",
  "justification": "Patient Context (Age/Gender): 69-year-old Male.
Known Medical History: Diabetes mellitus Type 2.
Rationale: CRITICAL Risk Level.",
  "requires_immediate_action": true
}"""

print("--- Original (Validating Failure) ---")
try:
    print(json.loads(broken_json))
except Exception as e:
    print(f"Failed as expected: {e}")

print("\n--- Fixed Parsing ---")
res = fix_and_parse_json(broken_json)
print(json.dumps(res, indent=2))
