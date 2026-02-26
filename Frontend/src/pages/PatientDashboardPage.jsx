import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Calendar, Clock, AlertTriangle, CheckCircle, Plus, Copy, Sparkles, Utensils, Loader2, Pill, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import client from '../api/client';
import { cn } from '../utils/cn';
import { useAuth } from '../contexts/AuthContext';
import { getWsUrl } from '../utils/websocket';
import VideoCallModal from '../components/VideoCallModal';
import TaskGrid from '../components/TaskGrid';

const PatientDashboardPage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [patient, setPatient] = useState(null);
    const [history, setHistory] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [medications, setMedications] = useState([]);
    const [loadingMeds, setLoadingMeds] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // 1. Get My Patient Record
                const meRes = await client.get('/patients/me');
                setPatient(meRes.data);

                // 2. Get Assessment History
                if (meRes.data.id) {
                    const historyRes = await client.get(`/patients/${meRes.data.id}/history`);
                    setHistory(historyRes.data);

                    // 3. Get Today's Tasks
                    const tasksRes = await client.get(`/tasks/${meRes.data.id}`);
                    setTasks(tasksRes.data);

                    // 4. Get Today's Medications
                    setLoadingMeds(true);
                    try {
                        const medsRes = await client.get(`/medication/history/${meRes.data.id}?today_only=true`);
                        setMedications(medsRes.data);
                    } catch (medErr) {
                        console.error("Failed to fetch medications", medErr);
                    } finally {
                        setLoadingMeds(false);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch dashboard data", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const [generatingPlan, setGeneratingPlan] = useState(false);

    const generateAiPlan = async () => {
        setGeneratingPlan(true);
        try {
            const response = await client.post(`/tasks/generate/${patient.id}`);
            setTasks(response.data); // Update with new tasks
        } catch (error) {
            console.error("Failed to generate plan", error);
            const msg = error.response?.data?.detail || "Failed to generate plan. Please try again.";
            alert(msg);
        } finally {
            setGeneratingPlan(false);
        }
    };

    const updateMedicationPatientStatus = async (logId, newStatus) => {
        // Optimistic update
        setMedications(prev => prev.map(log =>
            log.id === logId ? { ...log, status_patient: newStatus } : log
        ));
        try {
            await client.put(`/medication/log/${logId}`, { status_patient: newStatus });
        } catch (error) {
            console.error("Failed to update medication status", error);
            // Revert on failure
            setMedications(prev => prev.map(log =>
                log.id === logId ? { ...log, status_patient: log.status_patient === newStatus ? 'PENDING' : log.status_patient } : log
            ));
            alert("Failed to update. Please try again.");
        }
    };

    const toggleTaskStatus = async (taskId, currentStatus) => {
        const newStatus = currentStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED';

        // Optimistic Update
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status_patient: newStatus } : t));

        try {
            await client.put(`/tasks/${taskId}/status`, { status_patient: newStatus });
        } catch (error) {
            console.error("Failed to update task", error);
            // Revert on failure
            setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status_patient: currentStatus } : t));
        }
    };

    // WebRTC State for Patient
    const [isVideoCallOpen, setIsVideoCallOpen] = useState(false);
    const [signalQueue, setSignalQueue] = useState([]);
    const [isInitiator, setIsInitiator] = useState(false);
    const wsRef = useRef(null);
    const isVideoCallOpenRef = useRef(false);

    // Keep ref in sync so the WS closure always sees current value
    useEffect(() => {
        isVideoCallOpenRef.current = isVideoCallOpen;
    }, [isVideoCallOpen]);

    useEffect(() => {
        if (!user || !user.patient_id) return;

        const wsUrl = getWsUrl(user.patient_id);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("Connected to Stream (Location & WebRTC)");
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(pos => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: "LOCATION_UPDATE",
                            latitude: pos.coords.latitude,
                            longitude: pos.coords.longitude
                        }));
                    }
                });

                // Watch Position
                navigator.geolocation.watchPosition(
                    (position) => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                type: "LOCATION_UPDATE",
                                latitude: position.coords.latitude,
                                longitude: position.coords.longitude
                            }));
                        }
                    },
                    (err) => console.error("Geo Error", err),
                    { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
                );
            }
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'WEBRTC_SIGNAL' && data.payload) {
                    setSignalQueue(prev => [...prev, data.payload]);
                    // Only treat as new incoming call if modal isn't already open
                    if (!isVideoCallOpenRef.current) {
                        setIsInitiator(false);
                        setIsVideoCallOpen(true);
                    }
                }
            } catch (e) {
                console.error("WS Parse Error", e);
            }
        };

        return () => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        };
    }, [user]);

    const handleWebRTCSignal = (signal) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'WEBRTC_SIGNAL',
                payload: signal
            }));
        }
    };

    if (loading) return <div className="p-10 text-center">Loading dashboard...</div>;
    if (!patient) return <div className="p-10 text-center">No patient record found. Please contact your nurse.</div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Welcome, {patient.name}</h1>
                    <p className="text-slate-500">Track your health status and run new check-ups.</p>
                    <div className="mt-2 flex items-center gap-2 text-sm text-slate-500 bg-slate-100 px-3 py-1 rounded-lg w-fit">
                        <span className="font-semibold">Patient ID:</span>
                        <span className="font-mono text-slate-700 select-all">{patient.id}</span>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(patient.id);
                                // Optional: You could add a toast here, but for now simple is fine or just relying on UI feedback
                            }}
                            className="hover:text-sky-600 transition-colors p-1"
                            title="Copy ID"
                        >
                            <Copy className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                <button
                    onClick={() => navigate('/assessments/new')}
                    className="flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-600 transition-all"
                >
                    <Plus className="w-4 h-4" /> Start New Check-up
                </button>
            </div>

            {/* Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-panel p-5 rounded-xl border-l-4 border-l-sky-500">
                    <div className="flex items-center gap-3 mb-2">
                        <Activity className="w-5 h-5 text-sky-500" />
                        <h3 className="font-semibold text-slate-700">Latest Status</h3>
                    </div>
                    {history.length > 0 ? (
                        <>
                            <p className="text-2xl font-bold text-slate-900">{history[0].risk_level}</p>
                            <p className="text-xs text-slate-500">Score: {history[0].risk_score}/100</p>
                        </>
                    ) : (
                        <p className="text-slate-500">No assessments yet</p>
                    )}
                </div>

                <div className="glass-panel p-5 rounded-xl border-l-4 border-l-emerald-500">
                    <div className="flex items-center gap-3 mb-2">
                        <Calendar className="w-5 h-5 text-emerald-500" />
                        <h3 className="font-semibold text-slate-700">Next Appointment</h3>
                    </div>
                    <p className="text-lg font-medium text-slate-900">
                        {patient.next_appointment_date ? format(new Date(patient.next_appointment_date), 'PPP') : 'Not Scheduled'}
                    </p>
                </div>

                <div className="glass-panel p-5 rounded-xl border-l-4 border-l-purple-500">
                    <div className="flex items-center gap-3 mb-2">
                        <Clock className="w-5 h-5 text-purple-500" />
                        <h3 className="font-semibold text-slate-700">Total Check-ups</h3>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{history.length}</p>
                </div>
            </div>

            {/* My Medications Section */}
            <div className="glass-panel rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Pill className="w-5 h-5 text-rose-500" />
                        <h3 className="font-semibold text-slate-800">My Medications</h3>
                    </div>
                    <span className="text-xs text-slate-400">Mark your pills for today</span>
                </div>
                <div className="p-4">
                    {loadingMeds ? (
                        <div className="text-center py-6 text-slate-500"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
                    ) : medications.length === 0 ? (
                        <div className="text-center py-6 text-slate-500">
                            <Pill className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                            <p className="text-sm">No medications scheduled for today.</p>
                            <p className="text-xs text-slate-400 mt-1">Set up reminders from the Reminders page.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {medications.map((log) => (
                                <div key={log.id} className={cn(
                                    "flex items-center justify-between p-4 rounded-xl border transition-all",
                                    log.status_patient === 'TAKEN' ? "border-emerald-200 bg-emerald-50/50" :
                                        log.status_patient === 'SKIPPED' ? "border-red-200 bg-red-50/50" :
                                            "border-slate-200 bg-white hover:bg-slate-50"
                                )}>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-slate-900">{log.medicine_name}</p>
                                        <p className="text-xs text-slate-500">
                                            {new Date(log.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                        {/* Caretaker validation badge */}
                                        {log.status_caretaker && log.status_caretaker !== 'PENDING' ? (
                                            <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                                                <ShieldCheck className="w-3 h-3" />
                                                {log.status_caretaker === 'CONFIRMED_TAKEN' ? 'Verified Taken' : 'Verified Skipped'}
                                            </span>
                                        ) : log.status_patient !== 'PENDING' ? (
                                            <span className="mt-1 inline-flex items-center gap-1 text-xs text-slate-400">
                                                <Clock className="w-3 h-3" /> Awaiting caretaker verification
                                            </span>
                                        ) : null}
                                    </div>

                                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                                        {log.status_patient === 'TAKEN' ? (
                                            <div className="flex items-center gap-2">
                                                <span className="flex items-center gap-1 text-emerald-600 font-bold bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200 text-sm">
                                                    <CheckCircle className="w-4 h-4" /> Taken
                                                </span>
                                                <button
                                                    onClick={() => updateMedicationPatientStatus(log.id, 'PENDING')}
                                                    className="text-xs text-slate-400 hover:text-slate-600 underline"
                                                >
                                                    Undo
                                                </button>
                                            </div>
                                        ) : log.status_patient === 'SKIPPED' ? (
                                            <div className="flex items-center gap-2">
                                                <span className="text-red-600 font-medium bg-red-50 px-3 py-1.5 rounded-full border border-red-200 text-sm">
                                                    ❌ Skipped
                                                </span>
                                                <button
                                                    onClick={() => updateMedicationPatientStatus(log.id, 'PENDING')}
                                                    className="text-xs text-slate-400 hover:text-slate-600 underline"
                                                >
                                                    Undo
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => updateMedicationPatientStatus(log.id, 'TAKEN')}
                                                    className="bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-emerald-700 transition shadow-sm"
                                                >
                                                    ✓ Taken
                                                </button>
                                                <button
                                                    onClick={() => updateMedicationPatientStatus(log.id, 'SKIPPED')}
                                                    className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-slate-200 transition"
                                                >
                                                    Skip
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Daily Tasks Section */}
            <TaskGrid
                tasks={tasks}
                isCompleted={(task) => task.status_patient === 'COMPLETED'}
                renderAction={(task) => (
                    <button
                        onClick={() => toggleTaskStatus(task.id, task.status_patient)}
                        className={`relative flex items-center justify-center w-8 h-8 rounded-full border transition-all duration-300 ${task.status_patient === 'COMPLETED'
                            ? "bg-emerald-500 border-emerald-500"
                            : "border-slate-300 hover:border-emerald-400"
                            }`}
                    >
                        <CheckCircle
                            className={`w-5 h-5 transition-all duration-300 ${task.status_patient === 'COMPLETED'
                                ? "text-white scale-100"
                                : "text-transparent group-hover:text-emerald-400 scale-90"
                                }`}
                        />
                    </button>
                )}
            />

            {tasks.length === 0 && (
                <div className="text-center py-8 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <Sparkles className="h-6 w-6 mx-auto mb-2 text-slate-400" />
                    <p className="text-slate-500 mb-3">No tasks assigned for today.</p>
                    <button
                        onClick={generateAiPlan}
                        disabled={generatingPlan}
                        className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50"
                    >
                        {generatingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        Generate My Plan
                    </button>
                </div>
            )}

            {/* History Table */}
            <div className="glass-panel rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-800">Assessment History</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                            <tr>
                                <th className="px-6 py-3">Date</th>
                                <th className="px-6 py-3">Risk Level</th>
                                <th className="px-6 py-3">Score</th>
                                <th className="px-6 py-3">Alerts</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((record) => (
                                <tr key={record.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                                    <td className="px-6 py-4 font-medium text-slate-900">
                                        {format(new Date(record.created_at), 'PPP p')}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${record.risk_level === 'High' ? 'bg-red-100 text-red-800' :
                                            record.risk_level === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                                                'bg-green-100 text-green-800'
                                            }`}>
                                            {record.risk_level}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-600">{record.risk_score}</td>
                                    <td className="px-6 py-4">
                                        {record.risk_level === 'High' || record.risk_level === 'Critical' ? (
                                            <span className="flex items-center gap-1 text-red-600">
                                                <AlertTriangle className="w-4 h-4" /> Action Required
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-emerald-600">
                                                <CheckCircle className="w-4 h-4" /> Stable
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {history.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="px-6 py-8 text-center text-slate-500">
                                        No history found. Start your first check-up!
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <VideoCallModal
                isOpen={isVideoCallOpen}
                onClose={() => { setIsVideoCallOpen(false); setSignalQueue([]); }}
                onSignal={handleWebRTCSignal}
                signalQueue={signalQueue}
                isInitiator={isInitiator}
            />
        </div>
    );
};

export default PatientDashboardPage;
