import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, ChevronLeft, Activity, Heart, Stethoscope, Loader2 } from 'lucide-react';
import client from '../api/client';
import { cn } from '../utils/cn';
import { useAuth } from '../contexts/AuthContext';
import useNetworkStatus from '../hooks/useNetworkStatus';
import { Send, WifiOff, Phone } from 'lucide-react';
import VoiceInput from '../components/ui/VoiceInput';

const steps = [
    { id: 'patient', title: 'Patient Info', icon: Activity },
    { id: 'vitals', title: 'Vitals', icon: Heart },
    { id: 'symptoms', title: 'Symptoms', icon: Stethoscope },
];

const NewAssessmentPage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [currentStep, setCurrentStep] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    const isOnline = useNetworkStatus();
    const [savedLocally, setSavedLocally] = useState(false);

    const { register, handleSubmit, formState: { errors }, trigger, reset, watch, setValue } = useForm({
        defaultValues: {
            name: '', age: '', gender: 'Male', contact_number: '',
            blood_pressure: '', heart_rate: '', blood_sugar: '',
            meds_taken: false, sleep_hours: '',
            known_conditions: '', initial_symptoms: '',
            current_medications: ''
        }
    });

    const formValues = watch();

    // 1. Local Persistence (Resilience)
    useEffect(() => {
        const saved = localStorage.getItem('assessment_draft');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Only load if form is empty (don't overwrite user input if they navigated back)
                // actually better to just reset if empty.
                // For simplicity, we just save here. Loading is tricky if mixing with API data.
                // We'll trust the user or API first.
            } catch (e) { }
        }

        // Auto-save on change
        const timeout = setTimeout(() => {
            localStorage.setItem('assessment_draft', JSON.stringify(formValues));
            setSavedLocally(true);
            setTimeout(() => setSavedLocally(false), 1000);
        }, 1000);
        return () => clearTimeout(timeout);
    }, [JSON.stringify(formValues)]);

    useEffect(() => {
        const loadPatientData = async () => {
            // Case-insensitive role check
            if (user?.role?.toUpperCase() === 'PATIENT') {
                try {
                    // Try to fetch from API first (if online)
                    if (isOnline) {
                        console.log("Fetching patient data...");
                        const response = await client.get('/patients/me');
                        const patient = response.data;
                        console.log("Patient data received:", patient);

                        // Try fetching latest telemetry for pre-filling vitals
                        let presetVitals = { blood_pressure: '', heart_rate: '', blood_sugar: '', sleep_hours: '' };
                        try {
                             if(patient.id) {
                                  const telResponse = await client.get(`/monitoring/telemetry/latest/${patient.id}`);
                                  if(telResponse.data) {
                                       presetVitals.heart_rate = telResponse.data.heart_rate || '';
                                       presetVitals.blood_pressure = telResponse.data.blood_pressure || '';
                                       // Assuming SpO2 is supported on backend but not in form yet, we just fill what we have
                                  }
                             }
                        } catch(telErr) {
                             console.log("No recent telemetry or failed to fetch:", telErr);
                        }

                        // Helper to safely extract list from potentially nested objects
                        const extractList = (obj, keys) => {
                            if (!obj) return '';
                            if (Array.isArray(obj)) return obj.join(', ');
                            if (typeof obj === 'string') return obj;
                            for (const key of keys) {
                                if (obj[key] && Array.isArray(obj[key])) return obj[key].join(', ');
                                if (obj[key] && typeof obj[key] === 'string') return obj[key];
                            }
                            return '';
                        };

                        reset({
                            name: patient.name || '',
                            age: patient.age || '',
                            gender: patient.gender || 'Male',
                            contact_number: patient.contact_number || '',
                            known_conditions: extractList(patient.known_conditions, ['known_conditions', 'conditions']),
                            current_medications: extractList(patient.current_medications, ['medications', 'current_medications']),
                            initial_symptoms: '', // Always start blank?
                            meds_taken: false,
                            blood_pressure: presetVitals.blood_pressure,
                            heart_rate: presetVitals.heart_rate,
                            blood_sugar: presetVitals.blood_sugar,
                            sleep_hours: presetVitals.sleep_hours
                        });
                    } else {
                        // Offline: Load from local storage if available
                        const saved = localStorage.getItem('assessment_draft');
                        if (saved) {
                            reset(JSON.parse(saved));
                        }
                    }
                } catch (error) {
                    console.error("Failed to load patient data", error);
                    // Optional: Notify user if data loading fails but they are online
                    if (isOnline) {
                        // We don't want to alert blocking if it's just a minor fetch issue, 
                        // but for debugging this uses console. 
                        // Check if it was 404 (Patient not found) or 403 (Unauthorized)
                    }
                }
            }
        };
        loadPatientData();
    }, [user, reset, isOnline]);

    const nextStep = async () => {
        const fields = currentStep === 0
            ? ['name', 'age', 'gender', 'contact_number']
            : currentStep === 1
                ? ['blood_pressure', 'heart_rate', 'blood_sugar', 'meds_taken', 'sleep_hours']
                : ['known_conditions', 'current_medications', 'initial_symptoms'];

        const isValid = await trigger(fields);
        if (isValid) setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
    };

    const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 0));

    const onSubmit = async (data) => {
        setIsLoading(true);

        // --- OFFLINE FALLBACK: SMS ---
        if (!isOnline) {
            try {
                // Construct SMS Body with History as requested
                const smsBody =
                    `URGENT PATIENT ASSESSMENT
Name: ${data.name}
Age: ${data.age}, Gender: ${data.gender}
History: ${data.known_conditions}
Symptoms: ${data.initial_symptoms}
Vitals: BP ${data.blood_pressure}, HR ${data.heart_rate}, Sugar ${data.blood_sugar}
Meds Taken: ${data.meds_taken ? 'Yes' : 'No'}
Current Meds: ${data.current_medications}
Sent via offline-mode`;

                const encodedBody = encodeURIComponent(smsBody);
                // Prompt user for doctor number or use default/config
                // ideally this comes from settings, but for now we open generic
                const doctorNumber = ""; // User picks contact

                window.location.href = `sms:${doctorNumber}?body=${encodedBody}`;

                alert("Opening SMS app... Please send this message to your doctor.");
                setIsLoading(false);
                return;
            } catch (err) {
                alert("Failed to open SMS app.");
                setIsLoading(false);
                return;
            }
        }

        // --- ONLINE: API ---
        try {
            const payload = {
                name: data.name,
                age: parseInt(data.age),
                gender: data.gender,
                contact_number: data.contact_number,
                blood_pressure: data.blood_pressure,
                heart_rate: data.heart_rate,
                blood_sugar: data.blood_sugar,
                meds_taken: data.meds_taken,
                sleep_hours: data.sleep_hours ? parseInt(data.sleep_hours) : null,
                known_conditions: data.known_conditions,
                current_medications: data.current_medications,
                initial_symptoms: data.initial_symptoms
            };

            const response = await client.post('/analyze', payload);
            // Backend returns { message, patient_id, status_endpoint }
            const { patient_id } = response.data;

            // Clear draft after successful submission
            localStorage.removeItem('assessment_draft');

            // Redirect to monitor page
            navigate(`/assessments/monitor/${patient_id}`);
        } catch (error) {
            console.error("Submission failed", error);
            alert("Failed to start assessment. Please check the backend connection.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="mx-auto max-w-3xl">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900">New Health Assessment</h1>
                <p className="mt-1 text-slate-500">Enter patient details to initiate AI analysis.</p>
            </div>

            {/* Progress Steps */}
            <div className="mb-8 flex items-center justify-between px-10">
                {steps.map((step, index) => (
                    <div key={step.id} className="flex flex-col items-center relative z-10">
                        <div className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300",
                            index <= currentStep ? "bg-sky-500 text-white shadow-lg shadow-sky-200" : "bg-slate-200 text-slate-500"
                        )}>
                            <step.icon className="h-5 w-5" />
                        </div>
                        <span className={cn(
                            "mt-2 text-xs font-medium transition-colors duration-300",
                            index <= currentStep ? "text-sky-600" : "text-slate-500"
                        )}>{step.title}</span>
                    </div>
                ))}
                {/* Connecting Line */}
                <div className="absolute left-0 right-0 top-[110px] mx-auto h-[2px] w-[50%] bg-slate-200 -z-0">
                    <div
                        className="h-full bg-sky-500 transition-all duration-300"
                        style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
                    />
                </div>
            </div>

            <motion.div
                layout
                className="glass-panel overflow-hidden rounded-xl p-8 shadow-sm"
            >
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

                    {/* Step 1: Patient Info */}
                    {currentStep === 0 && (
                        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">
                                        Patient Name
                                    </label>
                                    <input
                                        {...register('name')}
                                        disabled
                                        className="mt-1 w-full rounded-md border border-slate-200 bg-slate-800 text-white p-2.5 disabled:opacity-70 disabled:cursor-not-allowed focus:outline-none"
                                        placeholder="John Doe"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700">
                                        Age
                                    </label>
                                    <input
                                        type="number"
                                        {...register('age')}
                                        disabled
                                        className="mt-1 w-full rounded-md border border-slate-200 bg-slate-800 text-white p-2.5 disabled:opacity-70 disabled:cursor-not-allowed focus:outline-none"
                                        placeholder="55"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">Gender</label>
                                    <select {...register('gender')} disabled className="mt-1 w-full rounded-md border border-slate-200 bg-slate-800 text-white p-2.5 focus:border-sky-500 focus:outline-none placeholder:text-slate-400">
                                        <option>Male</option>
                                        <option>Female</option>
                                        <option>Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700">Contact Number</label>
                                    <input {...register('contact_number', { required: 'Contact is required' })} className="mt-1 w-full rounded-md border border-slate-200 bg-slate-800 text-white p-2.5 focus:border-sky-500 focus:outline-none placeholder:text-slate-400" placeholder="555-0123" />
                                    {errors.contact_number && <p className="text-xs text-red-500">{errors.contact_number.message}</p>}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Step 2: Vitals */}
                    {currentStep === 1 && (
                        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">

                            {/* Blood Pressure Sliders */}
                            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                                <label className="flex items-center justify-between text-sm font-medium text-slate-700 mb-4">
                                    <span>Blood Pressure (mmHg)</span>
                                    <span className="text-xl font-bold text-slate-800 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
                                        {formValues.blood_pressure || '120/80'}
                                    </span>
                                </label>

                                <div className="space-y-6">
                                    {/* Systolic */}
                                    <div>
                                        <div className="flex justify-between text-xs text-slate-500 mb-2">
                                            <span>Systolic (Top)</span>
                                            <span className={cn(
                                                "font-medium",
                                                (parseInt((formValues.blood_pressure || '120/80').split('/')[0]) < 90 || parseInt((formValues.blood_pressure || '120/80').split('/')[0]) > 140) ? "text-red-500" :
                                                    (parseInt((formValues.blood_pressure || '120/80').split('/')[0]) > 120) ? "text-yellow-500" : "text-emerald-500"
                                            )}>
                                                {parseInt((formValues.blood_pressure || '120/80').split('/')[0])}
                                            </span>
                                        </div>
                                        <input
                                            type="range" min="80" max="200"
                                            value={parseInt((formValues.blood_pressure || '120/80').split('/')[0])}
                                            onChange={(e) => {
                                                const dia = (formValues.blood_pressure || '120/80').split('/')[1];
                                                setValue('blood_pressure', `${e.target.value}/${dia}`, { shouldValidate: true });
                                            }}
                                            className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-slate-200 accent-sky-500"
                                        />
                                    </div>

                                    {/* Diastolic */}
                                    <div>
                                        <div className="flex justify-between text-xs text-slate-500 mb-2">
                                            <span>Diastolic (Bottom)</span>
                                            <span className={cn(
                                                "font-medium",
                                                (parseInt((formValues.blood_pressure || '120/80').split('/')[1]) < 60 || parseInt((formValues.blood_pressure || '120/80').split('/')[1]) > 90) ? "text-red-500" :
                                                    (parseInt((formValues.blood_pressure || '120/80').split('/')[1]) > 80) ? "text-yellow-500" : "text-emerald-500"
                                            )}>
                                                {parseInt((formValues.blood_pressure || '120/80').split('/')[1])}
                                            </span>
                                        </div>
                                        <input
                                            type="range" min="50" max="130"
                                            value={parseInt((formValues.blood_pressure || '120/80').split('/')[1])}
                                            onChange={(e) => {
                                                const sys = (formValues.blood_pressure || '120/80').split('/')[0];
                                                setValue('blood_pressure', `${sys}/${e.target.value}`, { shouldValidate: true });
                                            }}
                                            className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-slate-200 accent-teal-500"
                                        />
                                    </div>
                                </div>
                                <input type="hidden" {...register('blood_pressure')} />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Heart Rate Slider */}
                                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                                    <label className="flex items-center justify-between text-sm font-medium text-slate-700 mb-4">
                                        <span>Heart Rate (BPM)</span>
                                        <span className={cn(
                                            "text-xl font-bold px-3 py-1 rounded-lg border border-slate-200 bg-slate-100",
                                            (formValues.heart_rate < 60 || formValues.heart_rate > 100) && formValues.heart_rate !== '' ? "text-red-500" :
                                                formValues.heart_rate === '' ? "text-slate-800" : "text-emerald-500"
                                        )}>
                                            {formValues.heart_rate || '--'}
                                        </span>
                                    </label>
                                    <input
                                        type="range" min="40" max="180"
                                        value={formValues.heart_rate || 75}
                                        onChange={(e) => setValue('heart_rate', e.target.value, { shouldValidate: true })}
                                        className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-slate-200 accent-rose-500"
                                    />
                                    <div className="flex justify-between text-[10px] text-slate-400 mt-2 font-medium">
                                        <span>40</span><span>180</span>
                                    </div>
                                    <input type="hidden" {...register('heart_rate')} />
                                </div>

                                {/* Blood Sugar Slider */}
                                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                                    <label className="flex items-center justify-between text-sm font-medium text-slate-700 mb-4">
                                        <span>Blood Sugar (mg/dL)</span>
                                        <span className={cn(
                                            "text-xl font-bold px-3 py-1 rounded-lg border border-slate-200 bg-slate-100",
                                            (formValues.blood_sugar < 70 || formValues.blood_sugar > 140) && formValues.blood_sugar !== '' ? "text-red-500" :
                                                formValues.blood_sugar === '' ? "text-slate-800" : "text-emerald-500"
                                        )}>
                                            {formValues.blood_sugar || '--'}
                                        </span>
                                    </label>
                                    <input
                                        type="range" min="50" max="300"
                                        value={formValues.blood_sugar || 100}
                                        onChange={(e) => setValue('blood_sugar', e.target.value, { shouldValidate: true })}
                                        className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-slate-200 accent-amber-500"
                                    />
                                    <div className="flex justify-between text-[10px] text-slate-400 mt-2 font-medium">
                                        <span>50</span><span>300</span>
                                    </div>
                                    <input type="hidden" {...register('blood_sugar')} />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Sleep Hours Buttons */}
                                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                                    <label className="block text-sm font-medium text-slate-700 mb-3">Hours Slept</label>
                                    <div className="flex flex-wrap gap-2">
                                        {[4, 5, 6, 7, 8, 9, 10].map(h => (
                                            <button
                                                key={h}
                                                type="button"
                                                onClick={() => setValue('sleep_hours', h, { shouldValidate: true })}
                                                className={cn(
                                                    "w-10 h-10 rounded-full font-bold text-sm transition-all",
                                                    formValues.sleep_hours == h
                                                        ? "bg-sky-500 text-white shadow-md shadow-sky-500/30 scale-110"
                                                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                                )}
                                            >
                                                {h}{h === 10 ? '+' : ''}
                                            </button>
                                        ))}
                                    </div>
                                    <input type="hidden" {...register('sleep_hours')} />
                                </div>

                                {/* Meds Taken Toggle */}
                                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex items-center justify-between">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Medications Taken?</label>
                                        <p className="text-xs text-slate-500 mt-1">Have you taken today's prescribed meds?</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setValue('meds_taken', !formValues.meds_taken)}
                                        className={cn(
                                            "relative inline-flex h-8 w-14 items-center rounded-full transition-colors",
                                            formValues.meds_taken ? "bg-emerald-500" : "bg-slate-300"
                                        )}
                                    >
                                        <span className={cn(
                                            "inline-block h-6 w-6 transform rounded-full bg-white transition-transform shadow",
                                            formValues.meds_taken ? "translate-x-7" : "translate-x-1"
                                        )} />
                                    </button>
                                    <input type="hidden" {...register('meds_taken')} />
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Step 3: Symptoms */}
                    {currentStep === 2 && (
                        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Known Conditions</label>
                                <textarea {...register('known_conditions', { required: 'Required' })} rows={3} className="mt-1 w-full rounded-md border border-slate-200 text-white bg-slate-800 p-2.5 focus:border-sky-500 focus:outline-none" placeholder="e.g. Hypertension, Diabetes Type 2..." />
                                {errors.known_conditions && <p className="text-xs text-red-500">{errors.known_conditions.message}</p>}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Current Medications</label>
                                <textarea {...register('current_medications')} rows={2} className="mt-1 w-full rounded-md border border-slate-200 text-white bg-slate-800 p-2.5 focus:border-sky-500 focus:outline-none" placeholder="e.g. Metformin 500mg, Lisinopril..." />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Current Symptoms</label>
                                <p className="text-xs text-slate-500 mb-2">Tap the mic to describe how you're feeling, or type it</p>
                                <VoiceInput
                                    value={formValues.initial_symptoms}
                                    onChange={(val) => setValue('initial_symptoms', val, { shouldValidate: true })}
                                    placeholder="e.g., I'm feeling dizzy and have a headache..."
                                />
                                <input type="hidden" {...register('initial_symptoms', { required: 'Symptoms are required' })} />
                                {errors.initial_symptoms && <p className="text-xs text-red-500 mt-1">{errors.initial_symptoms.message}</p>}
                            </div>
                        </motion.div>
                    )}

                    {/* Navigation Controls */}
                    <div className="mt-8 flex justify-between border-t border-slate-100 pt-6">
                        <button
                            type="button"
                            onClick={prevStep}
                            disabled={currentStep === 0 || isLoading}
                            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
                        >
                            <ChevronLeft className="h-4 w-4" /> Back
                        </button>

                        {currentStep < steps.length - 1 ? (
                            <button
                                type="button"
                                onClick={nextStep}
                                className="flex items-center gap-2 rounded-lg bg-sky-500 px-6 py-2 text-sm font-medium text-white shadow-md transition-all hover:bg-sky-600"
                            >
                                Next <ChevronRight className="h-4 w-4" />
                            </button>
                        ) : (
                            <div className="flex gap-2">
                                {!isOnline && (
                                    <button
                                        type="button"
                                        onClick={() => window.location.href = 'tel:'} // Opens dialer
                                        className="flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white shadow-md transition-all hover:bg-green-600"
                                    >
                                        <Phone className="h-4 w-4" />
                                        <span>Call Doctor</span>
                                    </button>
                                )}
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className={cn(
                                        "flex items-center gap-2 rounded-lg px-8 py-2 text-sm font-medium text-white shadow-md transition-all hover:scale-105 disabled:opacity-70 disabled:cursor-not-allowed",
                                        !isOnline ? "bg-gradient-to-r from-amber-500 to-orange-500" : "bg-gradient-to-r from-sky-500 to-teal-500"
                                    )}
                                >
                                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> :
                                        !isOnline ? (
                                            <>
                                                <WifiOff className="h-4 w-4 mr-2" />
                                                Send via SMS (Offline)
                                            </>
                                        ) : 'Start AI Analysis'
                                    }
                                </button>
                            </div>
                        )}
                    </div>
                </form>
            </motion.div>
        </div>
    );
};

export default NewAssessmentPage;
