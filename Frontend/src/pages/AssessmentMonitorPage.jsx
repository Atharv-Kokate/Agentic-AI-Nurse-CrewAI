
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Activity, Heart, Thermometer, ShieldAlert, CheckCircle, Loader2,
    Video, Mic, MicOff, Send, Phone, Clock, FileText, User, Sparkles, Utensils, ShieldCheck, Trash2, MessageSquare
} from 'lucide-react';
import client from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../utils/cn';
import VideoCallModal from '../components/VideoCallModal';

const AssessmentMonitorPage = () => {
    const { patientId } = useParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState('RUNNING');
    const [statusMessage, setStatusMessage] = useState('Initializing...');
    const [pollingData, setPollingData] = useState(null);
    const [userAnswer, setUserAnswer] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // History Modals State
    const [showMedicationModal, setShowMedicationModal] = useState(false);
    const [showVitalsModal, setShowVitalsModal] = useState(false);
    const [medicationHistory, setMedicationHistory] = useState([]);
    const [vitalsHistory, setVitalsHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [loadingVitals, setLoadingVitals] = useState(false);

    const [location, setLocation] = useState(null);
    const wsRef = useRef(null);

    // Ref to track last seen interaction ID to avoid reprocessing same q
    const lastInteractionIdRef = useRef(null);

    // WebRTC State
    const [isVideoCallOpen, setIsVideoCallOpen] = useState(false);
    // const [incomingSignal, setIncomingSignal] = useState(null); // Replaced by queue
    const [signalQueue, setSignalQueue] = useState([]);
    const [isInitiator, setIsInitiator] = useState(false);


    useEffect(() => {
        let isMounted = true;

        // 1. Initial REST Fetch (for immediate state)
        const fetchStatus = async () => {
            try {
                const response = await client.get(`/status/${patientId}`);
                const data = response.data;
                if (isMounted) handleStatusUpdate(data);
            } catch (error) {
                console.error("Polling failed", error);
            }
        };

        fetchStatus();

        // 2. WebSocket Connection
        // Determine WS Protocol
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

        // Determine WS Host
        let host = window.location.host; // Default to current host (for same-domain deployment)

        // If VITE_API_URL is set (e.g. separate backend), extract host from it
        const apiUrl = import.meta.env.VITE_API_URL;
        if (apiUrl) {
            try {
                const url = new URL(apiUrl);
                host = url.host;
            } catch (e) {
                console.warn("Invalid VITE_API_URL, falling back to window.location.host");
            }
        }

        const token = localStorage.getItem('token');
        const wsUrl = `${protocol}//${host}/ws/${patientId}?token=${token}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("Connected to Monitor Stream");
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log("Monitor WS Received:", data);
                if (data.type === "LOCATION_UPDATE") {
                    setLocation({ lat: data.latitude, lng: data.longitude });
                } else if (data.status) {
                    handleStatusUpdate(data);
                } else if (data.type === 'WEBRTC_SIGNAL') {
                    if (data.payload) {
                        // Append to queue
                        setSignalQueue(prev => [...prev, data.payload]);
                        // setIncomingSignal(data.payload);
                        setIsInitiator(false);
                        setIsVideoCallOpen(true);
                    }
                }
            } catch (e) {
                console.error("WS Parse Error", e);
            }
        };

        ws.onclose = () => console.log("Monitor Stream Closed");

        // Keep polling as backup (every 5s instead of 2s)
        const intervalId = setInterval(fetchStatus, 5000);

        return () => {
            isMounted = false;
            clearInterval(intervalId);
            if (wsRef.current) wsRef.current.close();
        };
    }, [patientId]);

    const handleStatusUpdate = (data) => {
        if (data.status) {
            setStatus(data.status);
        }

        if (data.current_location && !location) {
            setLocation(data.current_location);
        }

        if (data.status === 'COMPLETED' && data.result) {
            setPollingData({ status: 'COMPLETED', result: data.result });
        }
        else if (data.status === 'WAITING_FOR_INPUT' && data.pending_interaction) {
            if (data.pending_interaction.interaction_id !== lastInteractionIdRef.current) {
                setPollingData(data);
                lastInteractionIdRef.current = data.pending_interaction.interaction_id;
            }
        }
        else {
            // If running, we might want to clear old result
            // setPollingData(null); 
            // Actually, don't clear logic to prevent flashing if we just get a "RUNNING" ping
        }
    };

    const handleWebRTCSignal = (signal) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'WEBRTC_SIGNAL',
                payload: signal
            }));
        }
    };

    const startVideoCall = () => {
        setIsInitiator(true);
        setIsVideoCallOpen(true);
    };

    const fetchMedicationHistory = async () => {
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

    const fetchVitalsHistory = async () => {
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

    const handleSubmitAnswer = async (e) => {
        e.preventDefault();
        if (!userAnswer.trim() || !pollingData?.pending_interaction) return;

        setIsSubmitting(true);
        try {
            const interactionId = pollingData.pending_interaction.interaction_id;
            await client.post(`/interaction/${interactionId}`, {
                answer: userAnswer
            });
            setUserAnswer('');
            setStatus('RUNNING'); // Optimistically update
        } catch (error) {
            console.error("Failed to submit answer", error);
            alert("Failed to send answer. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderMap = () => {
        if (!location) {
            return (
                <div className="mb-6 h-64 rounded-xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-400">
                    <div className="rounded-full bg-slate-100 p-4 mb-2">
                        <Activity className="h-8 w-8 opacity-50" />
                    </div>
                    <p className="font-medium">Waiting for Patient Location...</p>
                    <p className="text-xs mt-1">Patient must be logged in with location enabled.</p>
                </div>
            );
        }
        return (
            <div className="mb-6 rounded-xl overflow-hidden border border-slate-200 shadow-sm relative">
                <div className="absolute top-2 right-2 z-10 bg-white/90 px-2 py-1 rounded text-xs font-bold text-slate-700 shadow-sm">
                    LIVE LOCATION
                </div>
                <iframe
                    width="100%"
                    height="300"
                    frameBorder="0"
                    scrolling="no"
                    marginHeight="0"
                    marginWidth="0"
                    src={`https://maps.google.com/maps?q=${location.lat},${location.lng}&z=15&output=embed`}
                >
                </iframe>
                <div className="bg-slate-50 px-4 py-2 text-xs text-slate-500 flex justify-between">
                    <span>Lat: {location.lat}, Lng: {location.lng}</span>
                    <a
                        href={`https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 font-bold hover:underline"
                    >
                        Open in Google Maps
                    </a>
                </div>
            </div>
        );
    };

    const renderContent = () => {
        switch (status) {
            case 'RUNNING':
                return (
                    <div className="flex flex-col items-center justify-center py-20">
                        {renderMap()}
                        <div className="relative h-24 w-24">
                            <div className="absolute inset-0 animate-ping rounded-full bg-sky-400 opacity-20"></div>
                            <div className="flex h-full w-full items-center justify-center rounded-full bg-sky-50 text-sky-500 shadow-inner">
                                <Activity className="h-10 w-10 animate-pulse" />
                            </div>
                        </div>
                        <h2 className="mt-8 text-xl font-semibold text-slate-800">AI Agents Working...</h2>
                        <p className="mt-2 text-center text-slate-500 max-w-md animate-pulse">
                            {statusMessage}
                        </p>
                    </div>
                );

            case 'WAITING_FOR_INPUT':
                return (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="rounded-2xl border border-sky-100 bg-sky-50/50 p-8 shadow-sm"
                    >
                        {renderMap()}
                        <div className="flex items-start gap-4">
                            <div className="rounded-full bg-white p-3 shadow-sm text-sky-600">
                                <MessageSquare className="h-6 w-6" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-slate-900">Information Required</h3>
                                <p className="mt-1 text-slate-600">The Symptom Inquiry Agent needs clarification.</p>

                                <div className="mt-6 rounded-xl bg-white p-6 shadow-sm border border-slate-100">
                                    <p className="text-lg font-medium text-slate-800">
                                        {pollingData?.pending_interaction?.question}
                                    </p>
                                </div>

                                <form onSubmit={handleSubmitAnswer} className="mt-6 relative">
                                    <input
                                        type="text"
                                        value={userAnswer}
                                        onChange={(e) => setUserAnswer(e.target.value)}
                                        placeholder="Type your answer here..."
                                        autoFocus
                                        className="w-full rounded-xl border border-slate-200 bg-white p-4 pr-14 text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!userAnswer.trim() || isSubmitting}
                                        className="absolute right-2 top-2 bottom-2 rounded-lg bg-sky-500 px-4 text-white transition-all hover:bg-sky-600 disabled:opacity-50 disabled:hover:bg-sky-500"
                                    >
                                        {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                                    </button>
                                </form>
                            </div>
                        </div>
                    </motion.div>
                );

            case 'COMPLETED':
                const result = pollingData?.result;
                if (!result) return null;

                const isHighRisk = result.risk_level === 'HIGH' || result.risk_level === 'CRITICAL';
                const riskColor = isHighRisk ? 'text-red-600 bg-red-50' : 'text-emerald-600 bg-emerald-50';
                const riskBorder = isHighRisk ? 'border-red-200' : 'border-emerald-200';

                return (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                    >
                        {renderMap()}
                        <div className={cn("glass-panel rounded-2xl border-2 p-8 text-center", riskBorder)}>
                            <div className={cn("mb-4 inline-flex items-center justify-center rounded-full p-4", riskColor)}>
                                {isHighRisk ? <ShieldAlert className="h-10 w-10" /> : <CheckCircle className="h-10 w-10" />}
                            </div>
                            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Risk Assessment</h3>
                            <h2 className={cn("mt-2 text-4xl font-black", isHighRisk ? "text-red-900" : "text-emerald-900")}>
                                {result.risk_level}
                                <span className="ml-3 text-2xl font-normal opacity-70">
                                    ({result.risk_score}/100)
                                </span>
                            </h2>
                        </div>

                        <div className="glass-panel rounded-xl p-8">
                            <h3 className="text-lg font-bold text-slate-900 mb-4">Clinical Reasoning</h3>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-700 leading-relaxed">
                                    {(() => {
                                        try {
                                            const r = typeof result.reasoning === 'string' ? JSON.parse(result.reasoning) : result.reasoning;
                                            return r.justification || r.reasoning || JSON.stringify(r, null, 2);
                                        } catch (e) {
                                            return result.reasoning;
                                        }
                                    })()}
                                </p>
                            </div>

                            <div className="mt-8 flex justify-between items-center">
                                <button
                                    onClick={async () => {
                                        if (!confirm("Are you sure you want to escalate this case to the doctor?")) return;
                                        const btn = document.getElementById('escalate-btn');
                                        if (btn) btn.disabled = true;
                                        try {
                                            await client.post('/escalate', { patient_id: patientId });
                                            alert("Doctor has been notified successfully.");
                                        } catch (err) {
                                            alert("Failed to escalate: " + (err.response?.data?.detail || err.message));
                                        } finally {
                                            if (btn) btn.disabled = false;
                                        }
                                    }}
                                    id="escalate-btn"
                                    className="flex items-center gap-2 rounded-lg bg-red-600 px-6 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors shadow-sm"
                                >
                                    <ShieldAlert className="h-4 w-4" />
                                    Call Doctor
                                </button>

                                <button
                                    onClick={() => navigate('/')}
                                    className="rounded-lg border border-slate-200 px-6 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                                >
                                    Return to Dashboard
                                </button>
                            </div>
                        </div>
                    </motion.div>
                );

            default:
                return <div>
                    {renderMap()}
                    <div>Unknown Status</div>
                </div>;
        }
    };


    // --- Task Planning Logic ---
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [tasks, setTasks] = useState([]);
    const [loadingTasks, setLoadingTasks] = useState(false);
    const [generatingPlan, setGeneratingPlan] = useState(false);

    const fetchDailyTasks = async () => {
        setLoadingTasks(true);
        setShowTaskModal(true); // Open modal immediately
        try {
            const response = await client.get(`/tasks/${patientId}`);
            setTasks(response.data);
        } catch (error) {
            console.error("Failed to fetch daily tasks", error);
        } finally {
            setLoadingTasks(false);
        }
    };

    const generateAiPlan = async () => {
        setGeneratingPlan(true);
        try {
            const response = await client.post(`/tasks/generate/${patientId}`);
            setTasks(response.data); // Update with new tasks
        } catch (error) {
            console.error("Failed to generate plan", error);
            const msg = error.response?.data?.detail || "Failed to generate plan. Please try again.";
            alert(msg);
        } finally {
            setGeneratingPlan(false);
        }
    };

    // Manual Task State
    const [isAddingManual, setIsAddingManual] = useState(false);
    const [manualTask, setManualTask] = useState({ description: '', category: 'General' });

    const handleAddManualTask = async () => {
        if (!manualTask.description.trim()) return;
        try {
            const response = await client.post(`/tasks/${patientId}/manual`, {
                task_description: manualTask.description,
                category: manualTask.category
            });
            setTasks([...tasks, response.data]);
            setManualTask({ description: '', category: 'General' });
            setIsAddingManual(false);
        } catch (error) {
            console.error("Failed to add task manually", error);
            alert("Failed to add task.");
        }
    };

    return (
        <div className="mx-auto max-w-3xl pb-12">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <button
                        onClick={() => navigate('/patients')} // Or back to list
                        className="text-slate-400 hover:text-slate-600 text-sm mb-1"
                    >
                        ← Back to Patients
                    </button>
                    <h1 className="text-2xl font-bold text-slate-900">Patient Monitor</h1>
                    <p className="text-slate-500 text-sm">Patient ID: <span className="font-mono bg-slate-100 px-1 py-0.5 rounded text-xs select-all">{patientId}</span></p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Action Buttons */}
                    <button
                        onClick={fetchDailyTasks}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-medium hover:bg-slate-50 hover:shadow-sm"
                    >
                        📋 Tasks
                    </button>
                    <button
                        onClick={fetchMedicationHistory}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-medium hover:bg-slate-50 hover:shadow-sm"
                    >
                        💊 Pills
                    </button>
                    <button
                        onClick={fetchVitalsHistory}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-medium hover:bg-slate-50 hover:shadow-sm"
                    >
                        ❤️ Vitals
                    </button>
                    <button
                        onClick={startVideoCall}
                        className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white border border-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm transition-all"
                    >
                        <Video className="h-4 w-4" />
                        Video Call
                    </button>

                    <div className={cn(
                        "ml-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                        status === 'RUNNING' ? "bg-amber-100 text-amber-700" :
                            status === 'WAITING_FOR_INPUT' ? "bg-sky-100 text-sky-700" :
                                "bg-emerald-100 text-emerald-700"
                    )}>
                        {status.replace(/_/g, " ")}
                    </div>
                </div>
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={status}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                >
                    {renderContent()}
                </motion.div>
            </AnimatePresence>

            <VideoCallModal
                isOpen={isVideoCallOpen}
                onClose={() => setIsVideoCallOpen(false)}
                onSignal={handleWebRTCSignal}
                signalQueue={signalQueue}
                isInitiator={isInitiator}
            />


            {/* Medication History Modal */}
            {showMedicationModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-xl max-h-[80vh] flex flex-col">
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
                                    No records found.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {medicationHistory.map((log) => (
                                        <div key={log.id} className="flex items-center justify-between p-4 border border-slate-100 rounded-lg hover:bg-slate-50">
                                            <div>
                                                <p className="font-semibold text-slate-900">{log.medicine_name}</p>
                                                <p className="text-xs text-slate-500">
                                                    Scheduled: {new Date(log.scheduled_time).toLocaleString(undefined, {
                                                        weekday: 'short', month: 'short', day: 'numeric',
                                                        hour: '2-digit', minute: '2-digit'
                                                    })}
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
                                                        {/* Allow undo */}
                                                        <button
                                                            onClick={() => updateMedicationStatus(log.id, 'TAKEN')}
                                                            className="text-xs text-blue-600 underline hover:text-blue-800"
                                                        >
                                                            Undo
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => updateMedicationStatus(log.id, 'TAKEN')}
                                                            className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-700 transition"
                                                        >
                                                            Mark Taken
                                                        </button>
                                                        <button
                                                            onClick={() => updateMedicationStatus(log.id, 'MISSED')}
                                                            className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-200 transition"
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
                        <div className="mt-4 pt-4 border-t flex justify-end">
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

            {/* Daily Tasks Modal */}
            {showTaskModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[85vh] flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-xl font-bold">Daily Health Plan</h2>
                                <p className="text-sm text-slate-500">Manage patient's daily routine</p>
                            </div>
                            <button onClick={() => setShowTaskModal(false)} className="text-slate-400 hover:text-slate-600">
                                ✕
                            </button>
                        </div>



                        {/* Toolbar */}
                        <div className="flex justify-between items-center mb-4 bg-slate-50 p-3 rounded-lg">
                            <div className="text-sm font-medium text-slate-700">
                                Today's Tasks
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={generateAiPlan}
                                    disabled={generatingPlan}
                                    className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-indigo-700 transition disabled:opacity-50"
                                >
                                    {generatingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                    Generate AI Plan
                                </button>
                                <button
                                    onClick={() => setIsAddingManual(!isAddingManual)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-sm font-medium transition border",
                                        isAddingManual
                                            ? "bg-slate-200 text-slate-700 border-slate-300"
                                            : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                                    )}
                                >
                                    {isAddingManual ? "Cancel" : "+ Add Manual"}
                                </button>
                            </div>
                        </div>

                        {/* Manual Entry Form */}
                        {isAddingManual && (
                            <div className="mb-4 bg-slate-50 p-4 rounded-lg border border-slate-200 animate-in fade-in slide-in-from-top-2">
                                <h3 className="text-sm font-bold text-slate-700 mb-2">New Manual Task</h3>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="e.g. Drink 2L of water..."
                                        className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={manualTask.description}
                                        onChange={(e) => setManualTask({ ...manualTask, description: e.target.value })}
                                        autoFocus
                                    />
                                    <select
                                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                        value={manualTask.category}
                                        onChange={(e) => setManualTask({ ...manualTask, category: e.target.value })}
                                    >
                                        <option value="General">General</option>
                                        <option value="Diet">Diet</option>
                                        <option value="Exercise">Exercise</option>
                                        <option value="Lifestyle">Lifestyle</option>
                                        <option value="Medication">Medication</option>
                                    </select>
                                    <button
                                        onClick={handleAddManualTask}
                                        disabled={!manualTask.description.trim()}
                                        className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="overflow-y-auto flex-1 pr-2">
                            {loadingTasks ? (
                                <div className="text-center py-8">Loading tasks...</div>
                            ) : tasks.length === 0 ? (
                                <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                                    <Sparkles className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                                    <p>No tasks scheduled for today.</p>
                                    <button onClick={generateAiPlan} className="text-indigo-600 font-medium hover:underline mt-1">
                                        Generate a plan using AI
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {tasks.map((task) => (
                                        <div key={task.id} className="flex items-start justify-between p-4 border border-slate-100 rounded-lg hover:bg-slate-50 group">
                                            <div className="flex items-start gap-3">
                                                <div className={cn("mt-1 p-2 rounded-lg",
                                                    task.category === 'Diet' ? 'bg-green-100 text-green-700' :
                                                        task.category === 'Exercise' ? 'bg-orange-100 text-orange-700' :
                                                            'bg-blue-100 text-blue-700'
                                                )}>
                                                    {task.category === 'Diet' ? <Utensils className="h-4 w-4" /> :
                                                        task.category === 'Exercise' ? <Activity className="h-4 w-4" /> :
                                                            <Clock className="h-4 w-4" />}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-slate-900">{task.task_description}</p>
                                                    <div className="flex items-center gap-3 mt-1">
                                                        <span className="text-xs text-slate-500 uppercase tracking-wide font-medium">{task.category}</span>

                                                        {/* Status Badges */}
                                                        {task.status_patient === 'COMPLETED' ? (
                                                            <span className="text-xs flex items-center gap-1 text-emerald-600 font-bold">
                                                                <CheckCircle className="h-3 w-3" /> Patient Done
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-slate-400">Patient: Pending</span>
                                                        )}

                                                        {task.status_caretaker === 'VALIDATED' ? (
                                                            <span className="text-xs flex items-center gap-1 text-indigo-600 font-bold border-l pl-2 border-slate-200">
                                                                <ShieldCheck className="h-3 w-3" /> Verified
                                                            </span>
                                                        ) : task.status_caretaker === 'REFUSED' ? (
                                                            <span className="text-xs text-red-500 font-bold border-l pl-2 border-slate-200">
                                                                Rejected
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-slate-400 border-l pl-2 border-slate-200">
                                                                Unverified
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <button className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}


            {/* Vitals History Modal */}
            {showVitalsModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-xl max-h-[80vh] flex flex-col">
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
                                    <div className="bg-slate-50 p-3 grid grid-cols-4 font-semibold text-slate-700 text-xs uppercase tracking-wider">
                                        <div>Date</div>
                                        <div>BP</div>
                                        <div>HR</div>
                                        <div>Sugar</div>
                                    </div>
                                    {vitalsHistory.map((log) => (
                                        <div key={log.id} className="p-3 grid grid-cols-4 text-sm hover:bg-slate-50 transition-colors">
                                            <div className="text-slate-900 font-medium">
                                                {new Date(log.created_at).toLocaleDateString()}
                                                <div className="text-xs text-slate-400 font-normal">
                                                    {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                            <div className="text-slate-600">{log.blood_pressure}</div>
                                            <div className="text-slate-600">{log.heart_rate} <span className="text-xs text-slate-400">bpm</span></div>
                                            <div className="text-slate-600">{log.blood_sugar} <span className="text-xs text-slate-400">mg/dL</span></div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="mt-4 pt-4 border-t flex justify-end">
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
        </div>
    );
};

export default AssessmentMonitorPage;
