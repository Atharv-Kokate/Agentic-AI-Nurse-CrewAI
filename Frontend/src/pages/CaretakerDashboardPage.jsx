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

    const [medicationHistory, setMedicationHistory] = useState([]);
    const [showMedicationModal, setShowMedicationModal] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);

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
                                    <span className="text-blue-600 text-sm font-medium">Monitor Vitals →</span>
                                </div>
                            </Link>

                            {/* Actions Footer */}
                            <div className="border-t pt-4 mt-auto">
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        fetchMedicationHistory(patient.patient_id);
                                    }}
                                    className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-sm font-medium transition-colors border border-slate-200"
                                >
                                    💊 View Pill History
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
                    <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold">Medication History</h2>
                            <button onClick={() => setShowMedicationModal(false)} className="text-slate-400 hover:text-slate-600">
                                ✕
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 pr-2">
                            {loadingHistory ? (
                                <div className="text-center py-8">Loading...</div>
                            ) : medicationHistory.length === 0 ? (
                                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg">
                                    No records found.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {medicationHistory.map((log) => (
                                        <div key={log.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg hover:bg-slate-50">
                                            <div>
                                                <p className="font-semibold text-slate-900">{log.medicine_name}</p>
                                                <p className="text-xs text-slate-500">
                                                    Scheduled: {new Date(log.scheduled_time).toLocaleString()}
                                                </p>
                                            </div>
                                            <div className={`px-3 py-1 rounded-full text-xs font-bold ${log.status === 'TAKEN'
                                                    ? 'bg-green-100 text-green-700'
                                                    : 'bg-red-100 text-red-700'
                                                }`}>
                                                {log.status}
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
        </div>
    );
}

export default CaretakerDashboardPage;
