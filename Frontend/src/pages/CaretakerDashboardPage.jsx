import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../contexts/AuthContext';

function CaretakerDashboardPage() {
    const { user } = useAuth();
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [linkForm, setLinkForm] = useState({ patient_id: '', relationship: '' });
    const [linkError, setLinkError] = useState('');

    // Medication State
    const [medicationHistory, setMedicationHistory] = useState([]);
    const [showMedicationModal, setShowMedicationModal] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [selectedPatientId, setSelectedPatientId] = useState(null);

    // Vitals State
    const [vitalsHistory, setVitalsHistory] = useState([]);
    const [showVitalsModal, setShowVitalsModal] = useState(false);
    const [loadingVitals, setLoadingVitals] = useState(false);

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

    const fetchMedicationHistory = async (patientId) => {
        setSelectedPatientId(patientId);
        setLoadingHistory(true);
        setMedicationHistory([]);
        setShowMedicationModal(true);
        try {
            const response = await client.get(`/medication/history/${patientId}`);
            setMedicationHistory(response.data);
        } catch (error) {
            console.error("Failed to fetch medication history", error);
        } finally {
            setLoadingHistory(false);
        }
    };

    const updateMedicationStatus = async (logId, newStatus) => {
        try {
            await client.put(`/medication/log/${logId}`, { status: newStatus });
            // Optimistic update
            setMedicationHistory(prev => prev.map(log =>
                log.id === logId ? { ...log, status: newStatus } : log
            ));
        } catch (error) {
            console.error("Failed to update status", error);
            alert("Failed to update status");
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


    // Tasks State
    const [tasks, setTasks] = useState([]);
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [loadingTasks, setLoadingTasks] = useState(false);

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
                <button
                    onClick={() => setShowLinkModal(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
                >
                    + Link New Patient
                </button>
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
                                        fetchMedicationHistory(patient.patient_id);
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
                            {loadingHistory ? (
                                <div className="text-center py-8">Loading...</div>
                            ) : medicationHistory.length === 0 ? (
                                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg">
                                    No records found. Reminders generated daily.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {medicationHistory.map((log) => (
                                        <div key={log.id} className="flex items-center justify-between p-4 border border-slate-100 rounded-lg hover:bg-slate-50 shadow-sm">
                                            <div className="flex-1">
                                                <p className="font-semibold text-slate-900 text-lg">{log.medicine_name}</p>
                                                <p className="text-sm text-slate-500">
                                                    Scheduled: {new Date(log.scheduled_time).toLocaleDateString()} at {new Date(log.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex items-center gap-2">
                                                {log.status === 'TAKEN' ? (
                                                    <span className="flex items-center gap-1 text-green-600 font-bold bg-green-50 px-3 py-1 rounded-full border border-green-100">
                                                        ✅ Taken
                                                    </span>
                                                ) : log.status === 'MISSED' ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-red-600 font-medium bg-red-50 px-3 py-1 rounded-full border border-red-100">
                                                            ❌ Missed
                                                        </span>
                                                        {/* Allow changing back if mistake? */}
                                                        <button
                                                            onClick={() => updateMedicationStatus(log.id, 'TAKEN')}
                                                            className="text-xs text-blue-600 underline"
                                                        >
                                                            Undo
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
                                                    ) : (
                                                        <span className="text-slate-400 italic">Unverified</span>
                                                    )}
                                                </div>

                                                <div className="flex gap-2">
                                                    {task.status_caretaker !== 'VALIDATED' && (
                                                        <button
                                                            onClick={() => validateTask(task.id, 'VALIDATED')}
                                                            disabled={task.status_patient !== 'COMPLETED'}
                                                            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${task.status_patient === 'COMPLETED'
                                                                    ? 'bg-green-600 text-white hover:bg-green-700'
                                                                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                                }`}
                                                            title={task.status_patient !== 'COMPLETED' ? "Patient must complete task first" : "Verify this task"}
                                                        >
                                                            Verify
                                                        </button>
                                                    )}

                                                    {task.status_caretaker === 'VALIDATED' && (
                                                        <button
                                                            onClick={() => validateTask(task.id, 'PENDING')}
                                                            className="text-xs text-red-500 hover:text-red-700 underline"
                                                        >
                                                            Revoke
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
        </div>
    );
}

export default CaretakerDashboardPage;
