```
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Calendar, Clock, AlertTriangle, CheckCircle, Plus, Copy, Sparkles, Utensils, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import client from '../api/client';
import { cn } from '../utils/cn';
import { useAuth } from '../contexts/AuthContext';
import { getWsUrl } from '../utils/websocket';

const PatientDashboardPage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [patient, setPatient] = useState(null);
    const [history, setHistory] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // 1. Get My Patient Record
                const meRes = await client.get('/patients/me');
                setPatient(meRes.data);

                // 2. Get Assessment History
                if (meRes.data.id) {
                    const historyRes = await client.get(`/ patients / ${ meRes.data.id }/history`);
setHistory(historyRes.data);

// 3. Get Today's Tasks
const tasksRes = await client.get(`/tasks/${meRes.data.id}`);
setTasks(tasksRes.data);
                }
            } catch (error) {
    console.error("Failed to fetch dashboard data", error);
} finally {
    setLoading(false);
}
        };
fetchData();

return () => {
    if (wsRef.current) wsRef.current.close();
};
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

const wsRef = React.useRef(null);

const startLocationTracking = (patientId) => {
    if (!navigator.geolocation) return;

    // Connect WS
    // 2. WebSocket Connection
    const wsUrl = getWsUrl(user.patient_id);
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
        console.log("Connected to Location Stream");
        // Send initial location
        paramsNavigator(wsRef.current);
    };

    // Watch Position
    navigator.geolocation.watchPosition(
        (position) => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: "LOCATION_UPDATE",
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                }));
            }
        },
        (err) => console.error("Geo Error", err),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
};

const paramsNavigator = (ws) => {
    navigator.geolocation.getCurrentPosition(pos => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "LOCATION_UPDATE",
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude
            }));
        }
    });
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

        {/* Daily Tasks Section */}
        <div className="glass-panel p-6 rounded-xl">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900">Today's Health Tasks</h2>
                <span className="text-sm text-slate-500 font-medium">
                    {format(new Date(), 'EEEE, MMMM d')}
                </span>
            </div>

            {tasks.length === 0 ? (
                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg">
                    <Sparkles className="h-6 w-6 mx-auto mb-2 text-slate-400" />
                    <p className="mb-3">No tasks assigned for today.</p>
                    <button
                        onClick={generateAiPlan}
                        disabled={generatingPlan}
                        className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50"
                    >
                        {generatingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        Generate My Plan
                    </button>
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {tasks.map((task) => (
                        <div
                            key={task.id}
                            className={cn(
                                "p-4 rounded-xl border transition-all",
                                task.status_patient === 'COMPLETED'
                                    ? "bg-emerald-50 border-emerald-100 opacity-75"
                                    : "bg-white border-slate-100 hover:shadow-md"
                            )}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-3">
                                    <div className={cn("p-2 rounded-lg mt-0.5",
                                        task.category === 'Diet' ? 'bg-green-100 text-green-600' :
                                            task.category === 'Exercise' ? 'bg-orange-100 text-orange-600' :
                                                'bg-blue-100 text-blue-600'
                                    )}>
                                        {task.category === 'Diet' ? <Utensils className="h-4 w-4" /> :
                                            task.category === 'Exercise' ? <Activity className="h-4 w-4" /> :
                                                <Clock className="h-4 w-4" />}
                                    </div>
                                    <div>
                                        <p className={cn("font-medium text-slate-900", task.status_patient === 'COMPLETED' && "line-through text-slate-500")}>
                                            {task.task_description}
                                        </p>
                                        <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">{task.category}</span>
                                    </div>
                                </div>

                                <button
                                    onClick={() => toggleTaskStatus(task.id, task.status_patient)}
                                    className={cn(
                                        "flex items-center justify-center w-6 h-6 rounded-full border transition-all",
                                        task.status_patient === 'COMPLETED'
                                            ? "bg-emerald-500 border-emerald-500 text-white"
                                            : "bg-transparent border-slate-300 text-transparent hover:border-emerald-500"
                                    )}
                                >
                                    <CheckCircle className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>

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
    </div>
);
};

export default PatientDashboardPage;
