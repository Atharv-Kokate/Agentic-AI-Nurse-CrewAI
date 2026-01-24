import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertTriangle, MessageSquare, CheckCircle, Activity, ShieldAlert, Send } from 'lucide-react';
import client from '../api/client';
import { cn } from '../utils/cn';

const AssessmentMonitorPage = () => {
    const { patientId } = useParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState('RUNNING');
    const [statusMessage, setStatusMessage] = useState('Initializing...');
    const [pollingData, setPollingData] = useState(null);
    const [userAnswer, setUserAnswer] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Ref to track last seen interaction ID to avoid reprocessing same q
    const lastInteractionIdRef = useRef(null);

    useEffect(() => {
        // WebSocket Connection
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//127.0.0.1:8000/ws/${patientId}`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log("Connected to Analysis WebSocket");
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log("WS Status Update:", data);

                if (data.status) {
                    setStatus(data.status);
                }

                if (data.message) {
                    setStatusMessage(data.message);
                }

                // If 'result' is present, it means COMPLETED
                if (data.result) {
                    setPollingData({ status: 'COMPLETED', result: data.result });
                }

                // Keep pollingData structure compatible for now
                if (data.status === 'WAITING_FOR_INPUT') {
                    setPollingData(data);
                }

            } catch (err) {
                console.error("Failed to parse WS message", err);
            }
        };

        ws.onclose = () => {
            console.log("Disconnected from WebSocket");
        };

        // Fallback: Initial check (in case we re-connected to an already finished job)
        const checkInitialStatus = async () => {
            try {
                const response = await client.get(`/status/${patientId}`);
                const data = response.data;
                if (data.status !== 'RUNNING') {
                    setStatus(data.status);
                    setPollingData(data);
                }
            } catch (e) {
                console.error("Initial status check failed", e);
            }
        };
        checkInitialStatus();

        return () => {
            ws.close();
        };
    }, [patientId]);

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

    const renderContent = () => {
        switch (status) {
            case 'RUNNING':
                return (
                    <div className="flex flex-col items-center justify-center py-20">
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
                        <div className="mt-8 flex gap-2">
                            <span className="h-2 w-2 rounded-full bg-sky-500 animate-bounce delay-75" />
                            <span className="h-2 w-2 rounded-full bg-sky-500 animate-bounce delay-150" />
                            <span className="h-2 w-2 rounded-full bg-sky-500 animate-bounce delay-300" />
                        </div>
                    </div>
                );

            case 'WAITING_FOR_INPUT':
                return (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="rounded-2xl border border-sky-100 bg-sky-50/50 p-8 shadow-sm"
                    >
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
                                    {typeof result.reasoning === 'string'
                                        ? result.reasoning
                                        : JSON.stringify(result.reasoning, null, 2)}
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
                return <div>Unknown Status</div>;
        }
    };

    return (
        <div className="mx-auto max-w-3xl">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Assessment Monitor</h1>
                    <p className="text-slate-500">Patient ID: <span className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">{patientId}</span></p>
                </div>
                <div className={cn(
                    "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                    status === 'RUNNING' ? "bg-amber-100 text-amber-700" :
                        status === 'WAITING_FOR_INPUT' ? "bg-sky-100 text-sky-700" :
                            "bg-emerald-100 text-emerald-700"
                )}>
                    {status.replace(/_/g, " ")}
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
        </div>
    );
};

export default AssessmentMonitorPage;
