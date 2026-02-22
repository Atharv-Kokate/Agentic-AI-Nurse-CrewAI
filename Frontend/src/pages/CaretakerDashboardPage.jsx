import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity, Thermometer, Droplet, Clock, ChevronRight, ActivitySquare, Brain, Phone, MapPin, Pill, CheckCircle2, AlertTriangle, PhoneCall } from 'lucide-react';
import client from '../api/client';
import { useAuth } from '../contexts/AuthContext';

function CaretakerDashboardPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [linkForm, setLinkForm] = useState({ patient_id: '', relationship: '' });
    const [linkError, setLinkError] = useState('');

    // Medications
    const [showMedicationModal, setShowMedicationModal] = useState(false);
    const [patientIdForMedication, setPatientIdForMedication] = useState(null);
    const [medicationLogs, setMedicationLogs] = useState([]);
    const [patientReminders, setPatientReminders] = useState([]);
    const [loadingMedications, setLoadingMedications] = useState(false);

    // Vitals State
    const [vitalsHistory, setVitalsHistory] = useState([]);
    const [showVitalsModal, setShowVitalsModal] = useState(false);
    const [loadingVitals, setLoadingVitals] = useState(false);

    // Tasks State
    const [tasks, setTasks] = useState([]);
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [loadingTasks, setLoadingTasks] = useState(false);

    // Emergency Call State
    const [showSOSModal, setShowSOSModal] = useState(false);
    const emergencyNumber = import.meta.env.VITE_EMERGENCY_NUMBER || '+91108';

    useEffect(() => {
        fetchPatients();
    }, []);

    const fetchPatients = async () => {
        try {
            const response = await client.get('/caretaker/my-patients');
            setPatients(response.data);
        } catch (error) {
            console.error("Failed to fetch patients", error);
        } finally {
            setLoading(false);
        }
    };

    const handleMedicationTracking = async (patientId) => {
        setPatientIdForMedication(patientId);
        setShowMedicationModal(true);
        setLoadingMedications(true);
        try {
            const [logsRes, remindersRes] = await Promise.all([
                client.get(`/medication/history/${patientId}`),
                client.get(`/reminders/patient/${patientId}`)
            ]);
            setMedicationLogs(logsRes.data);
            setPatientReminders(remindersRes.data);
        } catch (error) {
            console.error("Failed to fetch medications", error);
        } finally {
            setLoadingMedications(false);
        }
    };

    const updateMedicationStatus = async (logId, status) => {
        try {
            await client.put(`/medication/log/${logId}`, { status });
            // Refresh
            handleMedicationTracking(patientIdForMedication);
        } catch (error) {
            alert("Failed to update status");
        }
    };

    const handleRefill = async (reminderId) => {
        const amountStr = window.prompt("Enter the number of pills to add (e.g., 30):");
        if (amountStr) {
            const amount = parseInt(amountStr, 10);
            if (!isNaN(amount) && amount > 0) {
                try {
                    await client.put(`/reminders/${reminderId}/refill`, { amount });
                    // Refresh
                    handleMedicationTracking(patientIdForMedication);
                } catch (error) {
                    alert("Failed to refill medicine");
                }
            } else {
                alert("Please enter a valid number");
            }
        }
    };

    const fetchVitalsHistory = async (patientId) => {
        setLoadingVitals(true);
        setVitalsHistory([]);
        setShowVitalsModal(true);
        try {
            const response = await client.get(`/patients/${patientId}/vitals`);
            setVitalsHistory(response.data);
        } catch (error) {
            console.error("Failed to fetch vitals", error);
        } finally {
            setLoadingVitals(false);
        }
    };

    const fetchTasks = async (patientId) => {
        setLoadingTasks(true);
        setTasks([]);
        setShowTaskModal(true);
        try {
            const response = await client.get(`/tasks/${patientId}`);
            setTasks(response.data);
        } catch (error) {
            console.error("Failed to fetch tasks", error);
        } finally {
            setLoadingTasks(false);
        }
    };

    const validateTask = async (taskId, validationStatus) => {
        try {
            await client.put(`/tasks/${taskId}/status`, { status_caretaker: validationStatus });
            // Optimistic update
            setTasks(prev => prev.map(t =>
                t.id === taskId ? { ...t, status_caretaker: validationStatus } : t
            ));
        } catch (error) {
            console.error("Failed to validate task", error);
            alert("Failed to update status");
        }
    };

    const handleLinkPatient = async (e) => {
        e.preventDefault();
        setLinkError('');
        try {
            await client.post('/caretaker/link', linkForm);
            setShowLinkModal(false);
            setLinkForm({ patient_id: '', relationship: '' });
            fetchPatients();
        } catch (error) {
            setLinkError(error.response?.data?.detail || "Failed to link patient");
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Caretaker Dashboard</h1>
                    <p className="text-slate-600">Monitor your family members and patients</p>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={async () => {
                            try {
                                const res = await client.get('/caretaker/test-push');
                                alert(res.data.message + "\nYour ID: " + res.data.caretaker_id);
                            } catch (err) {
                                alert(err.response?.data?.detail || "Failed to trigger test push");
                            }
                        }}
                        className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition flex items-center gap-2"
                    >
                        Test Push Notification
                    </button>
                    <button
                        onClick={() => setShowLinkModal(true)}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
                    >
                        + Link New Patient
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-12">Loading...</div>
            ) : patients.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl shadow-sm">
                    <p className="text-slate-500 mb-4">You haven't linked any patients yet.</p>
                    <button
                        onClick={() => setShowLinkModal(true)}
                        className="text-blue-600 hover:underline"
                    >
                        Link your first patient
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {patients.map((patient) => (
                        <div key={patient.patient_id} className="bg-white rounded-xl shadow-sm hover:shadow-md transition p-6 border border-slate-100 flex flex-col">
                            <Link
                                to={`/assessments/monitor/${patient.patient_id}`}
                                className="block flex-1"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold">
                                        {patient.relationship}
                                    </div>
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 mb-1">{patient.name}</h3>
                                <p className="text-slate-500 text-sm mb-4">Phone: {patient.contact_number}</p>

                                <div className="mb-4">
                                    <span className="text-blue-600 text-sm font-medium">Monitor Live Vitals →</span>
                                </div>
                            </Link>

                            {/* Actions Footer */}
                            <div className="border-t pt-4 mt-auto flex gap-2">
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleMedicationTracking(patient.patient_id);
                                    }}
                                    className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-sm font-medium transition-colors border border-slate-200"
                                >
                                    💊 Pills
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        fetchVitalsHistory(patient.patient_id);
                                    }}
                                    className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-sm font-medium transition-colors border border-slate-200"
                                >
                                    ❤️ Vitals
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        fetchTasks(patient.patient_id);
                                    }}
                                    className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-sm font-medium transition-colors border border-slate-200"
                                >
                                    📋 Tasks
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Link Modal */}
            {showLinkModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">Link to Patient</h2>
                        {linkError && (
                            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">
                                {linkError}
                            </div>
                        )}
                        <form onSubmit={handleLinkPatient}>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Patient ID (UUID)
                                </label>
                                <input
                                    type="text"
                                    required
                                    className="w-full border rounded-lg p-2"
                                    placeholder="e.g. 550e8400-e29b..."
                                    value={linkForm.patient_id}
                                    onChange={(e) => setLinkForm({ ...linkForm, patient_id: e.target.value })}
                                />
                                <p className="text-xs text-slate-500 mt-1">
                                    Ask the patient for their ID from their profile.
                                </p>
                            </div>
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Relationship
                                </label>
                                <input
                                    type="text"
                                    required
                                    className="w-full border rounded-lg p-2"
                                    placeholder="e.g. Son, Nurse, Daughter"
                                    value={linkForm.relationship}
                                    onChange={(e) => setLinkForm({ ...linkForm, relationship: e.target.value })}
                                />
                            </div>
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowLinkModal(false)}
                                    className="text-slate-600 hover:text-slate-800"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                                >
                                    Link Patient
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Medication History Modal */}
            {showMedicationModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold">Medication Tracker</h2>
                            <button onClick={() => setShowMedicationModal(false)} className="text-slate-400 hover:text-slate-600">
                                ✕
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 pr-2">
                            {loadingMedications ? (
                                <div className="text-center py-8">Loading...</div>
                            ) : medicationLogs.length === 0 && patientReminders.length === 0 ? (
                                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg">
                                    No medication logs or reminders found.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Low Stock Alerts */}
                                    {patientReminders.some(r => r.remaining_count < 5) && (
                                        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                                            <h4 className="font-semibold text-red-800 flex items-center gap-2 mb-2">
                                                <AlertTriangle className="w-5 h-5" /> Low Medication Stock Alert
                                            </h4>
                                            <div className="space-y-2">
                                                {patientReminders.filter(r => r.remaining_count < 5).map(r => (
                                                    <div key={r.id} className="flex justify-between items-center text-sm text-red-700 bg-white/50 p-2 rounded">
                                                        <span>{r.medicine_name} - {r.remaining_count} left</span>
                                                        <button onClick={() => handleRefill(r.id)} className="bg-red-600 text-white px-3 py-1 rounded shadow-sm hover:bg-red-700">Refill</button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {medicationLogs.map((log) => (
                                        <div key={log.id} className={`p-4 rounded-xl border ${log.status === 'TAKEN' ? 'border-green-200 bg-green-50' : log.status === 'MISSED' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                <div className="flex items-start gap-4">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${log.status === 'TAKEN' ? 'bg-green-100 text-green-600' : 'bg-slate-200 text-slate-500'}`}>
                                                        {log.status === 'TAKEN' ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <h4 className="font-semibold text-slate-900">{log.medicine_name}</h4>
                                                                <p className="text-sm text-slate-500">
                                                                    {new Date(log.scheduled_time).toLocaleDateString()} at {new Date(log.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </p>
                                                                {(() => {
                                                                    const reminder = patientReminders.find(r => r.medicine_name === log.medicine_name);
                                                                    return reminder ? (
                                                                        <span className={`text-xs mt-1 inline-block px-2 py-0.5 rounded-full ${reminder.remaining_count < 5 ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-600'}`}>
                                                                            Stock: {reminder.remaining_count} left
                                                                        </span>
                                                                    ) : null;
                                                                })()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Action Buttons */}
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {log.status === 'TAKEN' ? (
                                                        <div className="flex items-center gap-2">
                                                            <span className="flex items-center gap-1 text-green-600 font-bold bg-green-50 px-3 py-1 rounded-full border border-green-100">
                                                                ✅ Taken
                                                            </span>
                                                            <button
                                                                onClick={() => updateMedicationStatus(log.id, 'MISSED')}
                                                                className="text-xs text-red-500 hover:text-red-700 underline"
                                                                title="Correct to Missed"
                                                            >
                                                                Mark Missed
                                                            </button>
                                                        </div>
                                                    ) : log.status === 'MISSED' || log.status === 'SKIPPED' ? (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-red-600 font-medium bg-red-50 px-3 py-1 rounded-full border border-red-100">
                                                                ❌ {log.status === 'SKIPPED' ? 'Skipped' : 'Missed'}
                                                            </span>
                                                            <button
                                                                onClick={() => updateMedicationStatus(log.id, 'TAKEN')}
                                                                className="text-xs text-blue-600 underline"
                                                                title="Correct to Taken"
                                                            >
                                                                Mark Taken
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => updateMedicationStatus(log.id, 'TAKEN')}
                                                                className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-green-700 transition"
                                                            >
                                                                Mark Taken
                                                            </button>
                                                            <button
                                                                onClick={() => updateMedicationStatus(log.id, 'MISSED')}
                                                                className="bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-slate-300 transition"
                                                            >
                                                                Missed
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="mt-6 pt-4 border-t flex justify-end">
                            <button
                                onClick={() => setShowMedicationModal(false)}
                                className="text-slate-600 hover:bg-slate-100 px-4 py-2 rounded-lg"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Vitals History Modal */}
            {showVitalsModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold">Vitals History</h2>
                            <button onClick={() => setShowVitalsModal(false)} className="text-slate-400 hover:text-slate-600">
                                ✕
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 pr-2">
                            {loadingVitals ? (
                                <div className="text-center py-8">Loading...</div>
                            ) : vitalsHistory.length === 0 ? (
                                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg">
                                    No vitals recorded yet.
                                </div>
                            ) : (
                                <div className="space-y-0 divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                                    <div className="bg-slate-50 p-3 grid grid-cols-4 font-semibold text-slate-700 text-sm">
                                        <div>Date</div>
                                        <div>BP</div>
                                        <div>HR</div>
                                        <div>Sugar</div>
                                    </div>
                                    {vitalsHistory.map((log) => (
                                        <div key={log.id} className="p-3 grid grid-cols-4 text-sm hover:bg-slate-50">
                                            <div className="text-slate-900">{new Date(log.created_at).toLocaleDateString()}</div>
                                            <div className="text-slate-600">{log.blood_pressure}</div>
                                            <div className="text-slate-600">{log.heart_rate} bpm</div>
                                            <div className="text-slate-600">{log.blood_sugar} mg/dL</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="mt-6 pt-4 border-t flex justify-end">
                            <button
                                onClick={() => setShowVitalsModal(false)}
                                className="text-slate-600 hover:bg-slate-100 px-4 py-2 rounded-lg"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Task Verification Modal */}
            {showTaskModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold">Daily Tasks Verification</h2>
                            <button onClick={() => setShowTaskModal(false)} className="text-slate-400 hover:text-slate-600">
                                ✕
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 pr-2">
                            {loadingTasks ? (
                                <div className="text-center py-8">Loading tasks...</div>
                            ) : tasks.length === 0 ? (
                                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg">
                                    No tasks assigned for today.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {tasks.map((task) => (
                                        <div key={task.id} className="p-4 border border-slate-100 rounded-lg hover:bg-slate-50 shadow-sm">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-600 mb-1">
                                                        {task.category}
                                                    </span>
                                                    <p className="font-semibold text-slate-900">{task.task_description}</p>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-xs text-slate-500 mb-1">Patient Status</div>
                                                    {task.status_patient === 'COMPLETED' ? (
                                                        <span className="text-green-600 font-medium text-sm flex items-center gap-1 justify-end">
                                                            ✓ Done
                                                        </span>
                                                    ) : (
                                                        <span className="text-amber-600 font-medium text-sm flex items-center gap-1 justify-end">
                                                            ○ Pending
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="border-t pt-3 flex items-center justify-between">
                                                <div className="text-sm">
                                                    <span className="text-slate-500 mr-2">Verification:</span>
                                                    {task.status_caretaker === 'VALIDATED' ? (
                                                        <span className="text-green-700 font-semibold">Verified ✅</span>
                                                    ) : task.status_caretaker === 'REFUSED' ? (
                                                        <span className="text-red-600 font-semibold">Refused ❌</span>
                                                    ) : (
                                                        <span className="text-slate-400 italic">Unverified</span>
                                                    )}
                                                </div>

                                                <div className="flex gap-2">
                                                    {task.status_caretaker === 'PENDING' && (
                                                        <>
                                                            <button
                                                                onClick={() => validateTask(task.id, 'VALIDATED')}
                                                                className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition"
                                                                title="Verify this task"
                                                            >
                                                                Verify
                                                            </button>
                                                            <button
                                                                onClick={() => validateTask(task.id, 'REFUSED')}
                                                                className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition"
                                                                title="Refuse/Reject this task"
                                                            >
                                                                Refuse
                                                            </button>
                                                        </>
                                                    )}

                                                    {(task.status_caretaker === 'VALIDATED' || task.status_caretaker === 'REFUSED') && (
                                                        <button
                                                            onClick={() => validateTask(task.id, 'PENDING')}
                                                            className="text-xs text-slate-500 hover:text-slate-700 underline"
                                                        >
                                                            Revoke ({task.status_caretaker})
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="mt-6 pt-4 border-t flex justify-end">
                            <button
                                onClick={() => setShowTaskModal(false)}
                                className="text-slate-600 hover:bg-slate-100 px-4 py-2 rounded-lg"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Contextual SOS Button */}
            {patients.length > 0 && (
                <button
                    onClick={() => setShowSOSModal(true)}
                    className="fixed bottom-6 right-6 md:bottom-8 md:right-8 bg-red-600 hover:bg-red-700 text-white p-4 rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 z-40 group"
                    aria-label="Emergency Call"
                >
                    <PhoneCall className="h-6 w-6 sm:h-8 sm:w-8 animate-pulse" />
                    <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs transition-all duration-300 ease-in-out font-bold text-sm ml-0 group-hover:ml-3">
                        Call Ambulance
                    </span>
                </button>
            )}

            {/* SOS Confirmation Modal */}
            {showSOSModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-xl animate-in zoom-in-95">
                        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                            <AlertTriangle className="h-8 w-8 text-red-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-2">Emergency Call</h2>
                        <p className="text-slate-500 text-sm mb-6">
                            Are you sure you want to dial emergency services ({emergencyNumber})?
                        </p>

                        <div className="flex flex-col gap-3">
                            <a
                                href={`tel:${emergencyNumber}`}
                                onClick={() => setShowSOSModal(false)}
                                className="w-full flex items-center justify-center gap-2 bg-red-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-red-700 active:bg-red-800 transition-colors shadow-lg shadow-red-600/20"
                            >
                                <PhoneCall className="h-5 w-5" />
                                Yes, Call Now
                            </a>
                            <button
                                onClick={() => setShowSOSModal(false)}
                                className="w-full font-semibold text-slate-600 py-3 px-4 rounded-xl hover:bg-slate-100 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default CaretakerDashboardPage;
