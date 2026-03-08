# Proactive Monitoring Knowledge Base
# Each section below represents a monitoring protocol for a specific medical condition.
# AI agents will use these rules to generate personalized, condition-specific questions.
#
# Available Response Types (for Frontend UI rendering):
# - TYPE: YES_NO (Simple toggle: Yes/No)
# - TYPE: EMOJI_SCALE (Sentiment scale: Good/Okay/Not Great/Bad)
# - TYPE: COMPARISON (Trend metric: Better/Same/Worse compared to last check)
# - TYPE: FREE_TEXT (Optional text input)

## Hypertension Monitoring Protocol
**Condition**: Hypertension (High Blood Pressure)
**Patient Questions**:
- Are you feeling dizzy, lightheaded, or having vision changes today? (TYPE: YES_NO)
- How is your energy level compared to yesterday? (TYPE: COMPARISON)
- Have you experienced any unusual heart palpitations or chest flutter? (TYPE: YES_NO)
- Have you taken your prescribed blood pressure medication today? (TYPE: YES_NO)
**Caretaker Questions**:
- Does the patient appear unusually fatigued or confused today? (TYPE: YES_NO)
- Has the patient complained of a severe headache? (TYPE: YES_NO)
**Escalation Rules**:
- IF patient.dizzy == 'YES' AND caretaker.fatigued == 'YES' THEN status = ORANGE (Notify Nurse)
- IF caretaker.headache == 'YES' THEN status = ORANGE (Notify Nurse)
- IF patient.medication == 'NO' THEN status = YELLOW (Log & Reminder)

## Diabetes Type 2 Monitoring Protocol
**Condition**: Diabetes Type 2
**Patient Questions**:
- Did you check your fasting blood sugar this morning? (TYPE: YES_NO)
- Are you experiencing unusual thirst or dry mouth today? (TYPE: YES_NO)
- How are you feeling overall today? (TYPE: EMOJI_SCALE)
- Have you noticed any cuts, sores, or changes in your feet? (TYPE: YES_NO)
**Caretaker Questions**:
- Is the patient eating their prescribed meals on schedule? (TYPE: YES_NO)
- Does the patient seem unusually sluggish or irritable? (TYPE: YES_NO)
**Escalation Rules**:
- IF patient.thirst == 'YES' AND caretaker.sluggish == 'YES' THEN status = ORANGE (Notify Nurse - possible Hyperglycemia)
- IF patient.feet_issues == 'YES' THEN status = YELLOW (Notify Nurse for wound care check)
- IF patient.feeling == 'Bad' THEN status = ORANGE (Notify Nurse)

## Post-Surgery Recovery Protocol
**Condition**: Post-Surgery / Post-Operative Recovery
**Patient Questions**:
- Is there any swelling near the surgery area? (TYPE: YES_NO)
- How is your pain at the incision site compared to yesterday? (TYPE: COMPARISON)
- Are you able to walk or move around as advised by the doctor? (TYPE: YES_NO)
- Would you like to add any notes about your recovery today? (TYPE: FREE_TEXT)
**Caretaker Questions**:
- Is the wound area visibly red, warm, or oozing? (TYPE: YES_NO)
- Is the patient taking their pain medication on the recommended schedule? (TYPE: YES_NO)
- From your observation, is the patient's mobility improving? (TYPE: COMPARISON)
**Escalation Rules**:
- IF caretaker.wound_red == 'YES' THEN status = RED (Alert Nurse Immediately - potential infection)
- IF patient.swelling == 'YES' AND patient.pain == 'Worse' THEN status = ORANGE (Notify Nurse)
- IF caretaker.mobility == 'Worse' THEN status = YELLOW (Log & Notify Physiotherapist/Nurse)

## Heart Failure Monitoring Protocol
**Condition**: Heart Failure / Congestive Heart Failure (CHF)
**Patient Questions**:
- Did you weigh yourself this morning, and is there a sudden increase? (TYPE: YES_NO)
- Are you experiencing any swelling in your ankles, legs, or abdomen? (TYPE: YES_NO)
- How is your breathing when you lie down flat? (TYPE: COMPARISON)
- Do you feel more tired than usual when doing light tasks? (TYPE: YES_NO)
**Caretaker Questions**:
- Does the patient appear to be holding more fluid/swollen today? (TYPE: YES_NO)
- Is the patient staying within their strict daily fluid limits? (TYPE: YES_NO)
**Escalation Rules**:
- IF patient.weight_increase == 'YES' THEN status = ORANGE (Notify Nurse - fluid retention)
- IF patient.breathing == 'Worse' AND patient.swelling == 'YES' THEN status = RED (Alert Nurse Immediately)
- IF caretaker.fluid_limits == 'NO' THEN status = YELLOW (Log & Remediation workflow)

## COPD Monitoring Protocol
**Condition**: COPD (Chronic Obstructive Pulmonary Disease)
**Patient Questions**:
- How is your breathing today compared to yesterday? (TYPE: COMPARISON)
- Are you coughing up more phlegm than usual? (TYPE: YES_NO)
- If coughing phlegm, has the color changed to yellow or green? (TYPE: YES_NO)
- How are you feeling overall today? (TYPE: EMOJI_SCALE)
**Caretaker Questions**:
- Is the patient using their inhalers as prescribed? (TYPE: YES_NO)
- Does the patient seem more breathless than usual when walking short distances? (TYPE: YES_NO)
**Escalation Rules**:
- IF patient.phlegm_color_changed == 'YES' THEN status = ORANGE (Notify Nurse - possible exacerbation)
- IF patient.breathing == 'Worse' AND caretaker.breathless == 'YES' THEN status = RED (Alert Nurse Immediately)
- IF patient.feeling == 'Bad' THEN status = ORANGE (Notify Nurse)
