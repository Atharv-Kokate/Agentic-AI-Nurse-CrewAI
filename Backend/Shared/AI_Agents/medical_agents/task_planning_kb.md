# Task Planning Knowledge Base
# Each section below is a SELF-CONTAINED protocol chunk.
# RAG retrieval must return the FULL section — do not split within a protocol.

## Hypertension Daily Protocol
**Condition**: Hypertension (High Blood Pressure)
**Diet (KB_BASELINE tasks)**:
- Follow DASH Diet (Dietary Approaches to Stop Hypertension)
- Keep sodium intake below 2300mg/day — avoid processed foods, canned soups, salty snacks
- Eat high-potassium foods: bananas, spinach, sweet potatoes, avocado
- Avoid sugary drinks and excess caffeine
- Drink 8 glasses of water throughout the day
**Exercise (KB_BASELINE tasks)**:
- 30 minutes of brisk walking, 5 days a week
- Light resistance training (avoid heavy lifting that spikes BP)
- Post-meal walk of 10-15 minutes to aid circulation
**Lifestyle (KB_BASELINE tasks)**:
- Practice stress management: meditation or deep breathing for 10 mins/day
- Limit alcohol consumption to 1 drink/day or less
- Quit smoking if applicable
- Monitor blood pressure at home: take reading in the morning before breakfast
**Sleep**: Aim for 7-8 hours of quality sleep per night
**If Patient Is Non-Compliant (SMART_REMEDIATION)**:
- Replace "30 min walk" with "10 min gentle walk around the house"
- Replace "full DASH diet" with "swap one snack for a banana or handful of nuts"
- Add "Set a phone alarm for medication time"

## Diabetes Type 2 Daily Protocol
**Condition**: Diabetes Type 2 / High Blood Sugar
**Diet (KB_BASELINE tasks)**:
- Follow Low Glycemic Index (GI) diet — whole grains, legumes, non-starchy vegetables
- Maintain consistent meal timing to regulate blood sugar (breakfast, lunch, dinner at fixed times)
- High fiber intake: vegetables, oats, beans, whole wheat bread
- Limit simple carbohydrates: white rice, white bread, sweets, fruit juice
- Stay hydrated: drink plenty of water, avoid sugary beverages
**Exercise (KB_BASELINE tasks)**:
- Post-meal walks of 15-20 minutes (highly effective for blood sugar control)
- Strength training 2-3 times per week (improves insulin sensitivity)
- Light stretching or yoga for flexibility and stress relief
**Lifestyle (KB_BASELINE tasks)**:
- Foot care: inspect feet daily for cuts, blisters, or sores
- Blood sugar monitoring: check fasting sugar in the morning
- Keep a food diary or log meals in the app
**Sleep**: 7-8 hours — lack of sleep increases insulin resistance
**If Patient Is Non-Compliant (SMART_REMEDIATION)**:
- Replace "post-meal walk 20 mins" with "stand and stretch for 5 mins after each meal"
- Replace "full GI diet" with "add one extra serving of vegetables to dinner"
- Add "Check blood sugar before bed tonight"

## Post-Surgery Recovery Protocol
**Condition**: Post-Surgery / Post-Operative Recovery (General)
**Diet (KB_BASELINE tasks)**:
- High protein intake for tissue repair: lean meats, eggs, dairy, beans, tofu
- Vitamin C rich foods for wound healing: oranges, strawberries, bell peppers
- Zinc rich foods: nuts, seeds, whole grains
- Stay hydrated — aim for 8+ glasses of water
**Exercise (KB_BASELINE tasks)**:
- Gentle stretching as prescribed by physiotherapist
- Short, frequent walks (5-10 mins every 2 hours) to prevent blood clots
- Avoid strenuous activity until cleared by doctor
**Lifestyle (KB_BASELINE tasks)**:
- Wound care: keep incision clean and dry, watch for signs of infection (redness, swelling, discharge)
- Pain management: take prescribed pain medication on schedule — do not "push through" pain
- Rest is critical — allow for naps during the day
**Sleep**: Prioritize rest. Use extra pillows for comfort if needed.
**If Patient Is Non-Compliant (SMART_REMEDIATION)**:
- Replace "walk every 2 hours" with "stand up and move to a different room once every 3 hours"
- Add "Take a photo of wound and note any changes"

## Heart Failure Daily Protocol
**Condition**: Heart Failure / Congestive Heart Failure
**Diet (KB_BASELINE tasks)**:
- Strict fluid restriction: limit to 1.5-2 liters/day (as per doctor's order)
- Very low salt: under 2000mg/day — no added salt, avoid canned/packaged food
- Eat small, frequent meals to reduce strain on the heart
**Exercise (KB_BASELINE tasks)**:
- Symptom-limited activity: walk at a comfortable pace, stop immediately if short of breath
- Daily weight monitoring: weigh yourself every morning after voiding — sudden weight gain (>1kg/day) may indicate fluid retention
- Gentle seated exercises if mobility is limited
**Lifestyle (KB_BASELINE tasks)**:
- Elevate legs when swollen
- Avoid temperature extremes (very hot or very cold environments)
- Track daily fluid intake in a log
**Sleep**: Use extra pillows or elevate head of bed if short of breath while lying flat
**If Patient Is Non-Compliant (SMART_REMEDIATION)**:
- Replace "walk at comfortable pace" with "practice deep breathing seated for 5 minutes"
- Add "Weigh yourself now and record the number"

## Adaptive Escalation Protocols
**When to use**: Apply these rules based on the patient context signals provided.
**Low Compliance Patient (overall completion < 50%)**:
- Reduce exercise task duration by 50% (e.g., 30 min → 15 min → 10 min)
- Use simpler, more specific language (not "maintain DASH diet" → "eat a banana as your morning snack")
- Add 1 motivational check-in task: "Rate your energy level today (1-10) and note one thing you're proud of"
- Limit total tasks to 8-10 to avoid overwhelm
- Mark simplified tasks as source='SMART_REMEDIATION', priority='NORMAL'
**Rising Risk Patient (risk.trend = 'deteriorating' or risk.level = 'HIGH'/'CRITICAL')**:
- Add daily vital monitoring tasks (BP, blood sugar if diabetic) — mark priority='HIGH' or 'CRITICAL'
- Add extra hydration reminders and rest periods
- Reduce physical activity intensity (light stretching only, no brisk exercise)
- Add "Contact caretaker/nurse if you feel unwell" as priority='CRITICAL' task
**Medication Non-Adherence (adherence rate < 80%)**:
- Add 1-2 explicit medication reminder tasks with the specific medication name and time
- Add "Check pill organizer in the morning" task
- If >2 missed doses in 3 days, mark medication tasks as priority='CRITICAL'
- Add "Set phone alarm for [medication name] at [time]"
**Improving Patient (health_score.trend = 'improving')**:
- Include 1-2 progressive/challenging tasks to build on the momentum
- Example: upgrade "10 min walk" to "15 min walk" or add "Try a new healthy recipe today"
- Maintain baseline tasks but can reduce monitoring frequency
**Active Alerts Present**:
- For each alert type, add a corresponding immediate task:
  - BP alert → "Take blood pressure reading now and record"
  - Blood sugar alert → "Check blood sugar level now"
  - Heart rate alert → "Rest for 10 minutes, then check pulse"
- Mark these as priority='CRITICAL', source='SMART_REMEDIATION'