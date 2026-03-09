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
**Condition Tags**: HYPERTENSION, HIGH_BLOOD_PRESSURE, HTN
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
**Condition**: Diabetes Type 2 / DIABETES / Diabetes Mellitus
**Condition Tags**: DIABETES, DIABETES_TYPE_2, DIABETIC
**Patient Questions**:
- Did you check your fasting blood sugar this morning? (TYPE: YES_NO)
- Are you experiencing unusual thirst or dry mouth today? (TYPE: YES_NO)
- How are you feeling overall today? (TYPE: EMOJI_SCALE)
- Have you noticed any cuts, sores, or changes in your feet? (TYPE: YES_NO)
- Are you experiencing blurry vision or tingling in your hands/feet? (TYPE: YES_NO)
- Have you been able to eat your meals on a regular schedule today? (TYPE: YES_NO)
**Caretaker Questions**:
- Is the patient eating their prescribed meals on schedule? (TYPE: YES_NO)
- Does the patient seem unusually sluggish, irritable, or confused? (TYPE: YES_NO)
- Have you noticed the patient sweating excessively or looking pale? (TYPE: YES_NO)
**Escalation Rules**:
- IF patient.thirst == 'YES' AND caretaker.sluggish == 'YES' THEN status = ORANGE (Notify Nurse - possible Hyperglycemia)
- IF patient.feet_issues == 'YES' THEN status = YELLOW (Notify Nurse for wound care check)
- IF patient.feeling == 'Bad' THEN status = ORANGE (Notify Nurse)
- IF patient.blurry_vision == 'YES' THEN status = ORANGE (Notify Nurse - possible severe hypo/hyperglycemia)
- IF caretaker.sweating_pale == 'YES' THEN status = RED (Alert Nurse Immediately - possible hypoglycemia crisis)

## Post-Surgery Recovery Protocol
**Condition**: Post-Surgery / Post-Operative Recovery
**Condition Tags**: POST_SURGERY, POST_OPERATIVE, SURGERY_RECOVERY
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
**Condition**: Heart Failure / Congestive Heart Failure (CHF) / Cardiac Failure
**Condition Tags**: HEART_FAILURE, CARDIAC_FAILURE, CHF, CONGESTIVE_HEART_FAILURE
**Patient Questions**:
- Did you weigh yourself this morning, and is there a sudden increase? (TYPE: YES_NO)
- Are you experiencing any swelling in your ankles, legs, or abdomen? (TYPE: YES_NO)
- How is your breathing when you lie down flat? (TYPE: COMPARISON)
- Do you feel more tired than usual when doing light tasks like walking to the bathroom? (TYPE: YES_NO)
- Did you wake up during the night feeling short of breath? (TYPE: YES_NO)
- Have you been able to stay within your daily fluid and salt limits? (TYPE: YES_NO)
**Caretaker Questions**:
- Does the patient appear to be holding more fluid or look swollen today compared to yesterday? (TYPE: COMPARISON)
- Is the patient staying within their strict daily fluid limits? (TYPE: YES_NO)
- Has the patient been coughing, especially when lying down? (TYPE: YES_NO)
**Escalation Rules**:
- IF patient.weight_increase == 'YES' THEN status = ORANGE (Notify Nurse - fluid retention)
- IF patient.breathing == 'Worse' AND patient.swelling == 'YES' THEN status = RED (Alert Nurse Immediately)
- IF patient.night_breathlessness == 'YES' THEN status = RED (Alert Nurse - possible acute decompensation)
- IF caretaker.fluid_limits == 'NO' THEN status = YELLOW (Log & Remediation workflow)
- IF caretaker.coughing == 'YES' AND patient.breathing == 'Worse' THEN status = RED (Alert Nurse Immediately)

## COPD Monitoring Protocol
**Condition**: COPD (Chronic Obstructive Pulmonary Disease)
**Condition Tags**: COPD, CHRONIC_OBSTRUCTIVE_PULMONARY_DISEASE
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

## Heart Attack Recovery Monitoring Protocol
**Condition**: Heart Attack Recovery / Post-Myocardial Infarction / MI Recovery
**Condition Tags**: HEART_ATTACK, MYOCARDIAL_INFARCTION, MI_RECOVERY, POST_HEART_ATTACK
**Patient Questions**:
- Are you experiencing any chest pain, tightness, or pressure today? (TYPE: YES_NO)
- How is your chest pain compared to yesterday? (TYPE: COMPARISON)
- Are you experiencing shortness of breath during rest or light activity? (TYPE: YES_NO)
- Have you felt any sudden dizziness, nausea, or cold sweats today? (TYPE: YES_NO)
- Have you taken all your prescribed heart medications today (aspirin, beta-blocker, statin)? (TYPE: YES_NO)
- How is your overall energy level today? (TYPE: EMOJI_SCALE)
**Caretaker Questions**:
- Does the patient appear pale, clammy, or in visible distress? (TYPE: YES_NO)
- Is the patient resting as recommended and avoiding heavy exertion? (TYPE: YES_NO)
- Has the patient complained of pain radiating to the jaw, arm, or back? (TYPE: YES_NO)
**Escalation Rules**:
- IF patient.chest_pain == 'YES' AND patient.chest_comparison == 'Worse' THEN status = RED (EMERGENCY - possible recurrent MI)
- IF patient.chest_pain == 'YES' AND caretaker.radiating_pain == 'YES' THEN status = RED (EMERGENCY - call 911 immediately)
- IF caretaker.pale_clammy == 'YES' THEN status = RED (Alert Nurse Immediately - autonomic distress signs)
- IF patient.dizziness_nausea == 'YES' THEN status = ORANGE (Notify Nurse - cardiac symptom follow-up)
- IF patient.medications == 'NO' THEN status = ORANGE (Notify Nurse - critical post-MI medication non-adherence)
- IF patient.breathlessness == 'YES' AND patient.energy == 'Bad' THEN status = ORANGE (Notify Nurse - possible heart failure onset)

## Cardiac Arrhythmia Monitoring Protocol
**Condition**: Cardiac Arrhythmia / Atrial Fibrillation / Irregular Heartbeat
**Condition Tags**: ARRHYTHMIA, ATRIAL_FIBRILLATION, AFIB, CARDIAC_ARRHYTHMIA, IRREGULAR_HEARTBEAT
**Patient Questions**:
- Have you felt your heart racing, fluttering, or skipping beats today? (TYPE: YES_NO)
- How would you rate your heart rhythm symptoms compared to yesterday? (TYPE: COMPARISON)
- Are you experiencing dizziness or feeling faint? (TYPE: YES_NO)
- Have you had any episodes of sudden fatigue or weakness? (TYPE: YES_NO)
- Have you taken your heart rhythm medication (e.g., blood thinner) on time today? (TYPE: YES_NO)
**Caretaker Questions**:
- Does the patient seem confused, disoriented, or unusually breathless? (TYPE: YES_NO)
- Has the patient mentioned any episodes of chest discomfort or palpitations? (TYPE: YES_NO)
**Escalation Rules**:
- IF patient.heart_racing == 'YES' AND patient.dizziness == 'YES' THEN status = RED (Alert Nurse Immediately - syncope risk)
- IF caretaker.confused == 'YES' THEN status = RED (Alert Nurse - possible stroke or TIA with AFib)
- IF patient.heart_rhythm == 'Worse' THEN status = ORANGE (Notify Nurse)
- IF patient.medication == 'NO' THEN status = ORANGE (Notify Nurse - blood thinner non-adherence increases stroke risk)

## General Cardiac Monitoring Protocol
**Condition**: General Cardiac / Heart Disease / Cardiovascular Disease
**Condition Tags**: CARDIAC, HEART_DISEASE, CARDIOVASCULAR, CVD
**Patient Questions**:
- Are you experiencing any chest pain or discomfort today? (TYPE: YES_NO)
- How are you feeling overall compared to yesterday? (TYPE: COMPARISON)
- Have you been able to do your prescribed physical activity (walking, light exercise)? (TYPE: YES_NO)
- Are you experiencing any swelling in your legs or feet? (TYPE: YES_NO)
- How would you rate your overall well-being today? (TYPE: EMOJI_SCALE)
**Caretaker Questions**:
- Does the patient appear short of breath during normal daily activities? (TYPE: YES_NO)
- Is the patient following their prescribed low-sodium/heart-healthy diet? (TYPE: YES_NO)
**Escalation Rules**:
- IF patient.chest_pain == 'YES' THEN status = RED (Alert Nurse Immediately)
- IF patient.swelling == 'YES' AND patient.comparison == 'Worse' THEN status = ORANGE (Notify Nurse - possible fluid retention)
- IF caretaker.breathless == 'YES' THEN status = ORANGE (Notify Nurse)
- IF patient.feeling == 'Bad' THEN status = YELLOW (Log & Monitor)
