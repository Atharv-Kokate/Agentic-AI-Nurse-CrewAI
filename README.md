# AI-Driven Patient Health Monitoring System

This system uses a multi-agent architecture (CrewAI) to evaluate patient health.

## Setup

1.  **Install Dependencies**:
    ```bash
    pip install .
    # OR
    pip install crewai crewai-tools langchain-groq python-dotenv
    ```

2.  **Environment Variables**:
    Create a `.env` file in the root directory and add your Groq API Key:
    ```
    GROQ_API_KEY=your_groq_api_key_here
    ```

## Usage

Run the main script:
```bash
python main.py
```

Follow the prompts to enter patient vital signs.
- If vitals are abnormal, the **Symptom Inquiry Agent** will ask you follow-up questions.
- Answer them in the terminal.

## Agents

1.  **Vital Analysis**: Checks for deviations from normal ranges.
2.  **Symptom Inquiry**: Asks follow-up questions if needed (Human-in-the-Loop).
3.  **Context Aggregation**: Combines data.
4.  **Risk Assessment**: Determines risk level.
5.  **Decision & Action**: Decides next steps (e.g., ALERT_DOCTOR).
