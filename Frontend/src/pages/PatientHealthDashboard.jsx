import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Activity, Heart, Thermometer, ShieldAlert, CheckCircle, Loader2,
    TrendingUp, TrendingDown, Minus, AlertTriangle, Pill, ListChecks,
    Bell, User, Calendar, Brain, ArrowLeft, RefreshCw, Droplets,
    Moon, Clock, ChevronDown, ChevronUp, Zap, Shield, Star
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../utils/cn';
import { getWsUrl } from '../utils/websocket';
import {
    LineChart, Line, AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    RadialBarChart, RadialBar, Legend, Cell
} from 'recharts';

const API = import.meta.env.VITE_API_URL || '';

// ─── Helpers ───────────────────────────────────────────────
const getHealthColor = (score) => {
    if (score >= 75) return { bg: 'from-emerald-500 to-teal-500', text: 'text-emerald-600', ring: 'ring-emerald-200', label: 'Excellent', bgLight: 'bg-emerald-50' };
    if (score >= 50) return { bg: 'from-amber-400 to-orange-500', text: 'text-amber-600', ring: 'ring-amber-200', label: 'Fair', bgLight: 'bg-amber-50' };
    if (score >= 25) return { bg: 'from-orange-500 to-red-500', text: 'text-orange-600', ring: 'ring-orange-200', label: 'Poor', bgLight: 'bg-orange-50' };
    return { bg: 'from-red-500 to-rose-600', text: 'text-red-600', ring: 'ring-red-200', label: 'Critical', bgLight: 'bg-red-50' };
};

const getRiskColor = (level) => {
    const map = { LOW: 'text-emerald-600 bg-emerald-50 border-emerald-200', MODERATE: 'text-amber-600 bg-amber-50 border-amber-200', HIGH: 'text-orange-600 bg-orange-50 border-orange-200', CRITICAL: 'text-red-600 bg-red-50 border-red-200' };
    return map[level] || 'text-slate-600 bg-slate-50 border-slate-200';
};

const getTrendIcon = (trend) => {
    if (trend === 'improving') return <TrendingUp className="h-5 w-5 text-emerald-500" />;
    if (trend === 'deteriorating') return <TrendingDown className="h-5 w-5 text-red-500" />;
    return <Minus className="h-5 w-5 text-amber-500" />;
};

const getTrendLabel = (trend) => {
    if (trend === 'improving') return { text: 'Improving', color: 'text-emerald-600 bg-emerald-50' };
    if (trend === 'deteriorating') return { text: 'Deteriorating', color: 'text-red-600 bg-red-50' };
    return { text: 'Stable', color: 'text-amber-600 bg-amber-50' };
};

const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4, ease: 'easeOut' } }),
};

// ─── Health Score Gauge ───────────────────────────────────
const HealthScoreGauge = ({ score, trend, label }) => {
    const healthStyle = getHealthColor(score);
    const trendInfo = getTrendLabel(trend);
    const gaugeData = [{ name: 'Health', value: score, fill: 'url(#healthGradient)' }];

    return (
        <div className="flex flex-col items-center">
            <div className="relative w-44 h-44 md:w-52 md:h-52">
                <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="90%" barSize={14} data={gaugeData} startAngle={225} endAngle={-45}>
                        <defs>
                            <linearGradient id="healthGradient" x1="0" y1="0" x2="1" y2="1">
                                {score >= 75 && <><stop offset="0%" stopColor="#10b981" /><stop offset="100%" stopColor="#14b8a6" /></>}
                                {score >= 50 && score < 75 && <><stop offset="0%" stopColor="#f59e0b" /><stop offset="100%" stopColor="#f97316" /></>}
                                {score >= 25 && score < 50 && <><stop offset="0%" stopColor="#f97316" /><stop offset="100%" stopColor="#ef4444" /></>}
                                {score < 25 && <><stop offset="0%" stopColor="#ef4444" /><stop offset="100%" stopColor="#e11d48" /></>}
                            </linearGradient>
                        </defs>
                        <RadialBar background={{ fill: '#f1f5f9' }} clockWise dataKey="value" cornerRadius={10} domain={[0, 100]} />
                    </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={cn("text-4xl md:text-5xl font-bold", healthStyle.text)}>{Math.round(score)}</span>
                    <span className="text-xs text-slate-400 font-medium mt-1">/100</span>
                </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
                <span className={cn("text-sm font-semibold px-3 py-1 rounded-full", trendInfo.color)}>
                    {getTrendIcon(trend)}
                </span>
                <span className={cn("text-sm font-semibold", trendInfo.color.split(' ')[0])}>{trendInfo.text}</span>
            </div>
            <span className={cn("text-lg font-bold mt-1", healthStyle.text)}>{healthStyle.label}</span>
        </div>
    );
};

// ─── Vital Card ───────────────────────────────────────────
const VitalCard = ({ icon: Icon, label, value, unit, status, color }) => {
    const statusColors = {
        normal: 'border-emerald-200 bg-emerald-50/50',
        warning: 'border-amber-200 bg-amber-50/50',
        critical: 'border-red-200 bg-red-50/50',
        default: 'border-slate-200 bg-white'
    };
    return (
        <div className={cn("rounded-xl border-2 p-4 transition-all duration-300 hover:shadow-md", statusColors[status] || statusColors.default)}>
            <div className="flex items-center gap-2 mb-2">
                <div className={cn("p-2 rounded-lg", color)}>
                    <Icon className="h-4 w-4 text-white" />
                </div>
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
            </div>
            <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-slate-800">{value || '—'}</span>
                {unit && <span className="text-sm text-slate-400">{unit}</span>}
            </div>
        </div>
    );
};

// ─── Section Card Wrapper ─────────────────────────────────
const SectionCard = ({ title, icon: Icon, children, className, headerRight, accentColor = 'bg-sky-500' }) => (
    <motion.div
        className={cn("bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden", className)}
        variants={cardVariants}
    >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-xl", accentColor)}>
                    <Icon className="h-4 w-4 text-white" />
                </div>
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">{title}</h3>
            </div>
            {headerRight}
        </div>
        <div className="p-5">{children}</div>
    </motion.div>
);

// ─── Custom Chart Tooltip ──────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 p-3 text-xs">
            <p className="font-semibold text-slate-600 mb-1">{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.color }} className="font-medium">
                    {p.name}: {p.value}{p.unit || ''}
                </p>
            ))}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export default function PatientHealthDashboard() {
    const { patientId } = useParams();
    const navigate = useNavigate();
    const { user, token } = useAuth();
    const wsRef = useRef(null);

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastRefresh, setLastRefresh] = useState(null);
    const [expandedSections, setExpandedSections] = useState({
        reasoning: false,
        recommendations: false
    });

    const isPatient = user?.role === 'PATIENT';
    const isCaretaker = user?.role === 'CARETAKER';
    const isStaff = ['ADMIN', 'NURSE', 'DOCTOR'].includes(user?.role);

    // --- Resolve Patient ID ---
    const resolvedPatientId = patientId || (isPatient ? user?.patient_id : null);

    // ─── Fetch Data ────────────────────────────────────────
    const fetchData = useCallback(async () => {
        if (!resolvedPatientId) return;
        try {
            const res = await fetch(`${API}/api/v1/patients/${resolvedPatientId}/health-summary`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            setData(json);
            setError(null);
            setLastRefresh(new Date());
        } catch (err) {
            console.error('Failed to fetch health summary:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [resolvedPatientId, token]);

    // ─── Initial Fetch + 30s Poll ──────────────────────────
    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    // ─── WebSocket for Real-time Updates ───────────────────
    useEffect(() => {
        if (!resolvedPatientId || !token) return;

        const wsUrl = `${getWsUrl()}/ws/${resolvedPatientId}?token=${token}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                // If we get a COMPLETED status, refresh all data
                if (msg.status === 'COMPLETED' || msg.type === 'vitals_update') {
                    fetchData();
                }
            } catch { /* ignore non-JSON */ }
        };

        ws.onclose = () => { wsRef.current = null; };

        return () => {
            if (wsRef.current) wsRef.current.close();
        };
    }, [resolvedPatientId, token, fetchData]);

    // ─── Toggle Sections ─────────────────────────────────
    const toggleSection = (key) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));

    // ─── Loading State ───────────────────────────────────
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <Loader2 className="h-10 w-10 text-sky-500 animate-spin" />
                <p className="text-slate-500 font-medium">Loading health dashboard...</p>
            </div>
        );
    }

    // ─── Error State ─────────────────────────────────────
    if (error || !data) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <AlertTriangle className="h-10 w-10 text-red-400" />
                <p className="text-slate-600 font-medium">Failed to load dashboard</p>
                <p className="text-sm text-slate-400">{error}</p>
                <button onClick={fetchData} className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors text-sm font-medium">
                    Retry
                </button>
            </div>
        );
    }

    const { patient, health_score, health_score_trend, risk, vitals, medications, tasks, alerts: alertsData, recommendations, pending_interactions } = data;
    const healthStyle = getHealthColor(health_score);

    // Prepare chart data
    const vitalsChartData = (vitals?.history || []).map(v => ({
        date: v.date?.split(' ')[0]?.slice(5) || '', // MM-DD
        Systolic: v.systolic,
        Diastolic: v.diastolic,
        'Heart Rate': v.heart_rate,
        'Blood Sugar': v.blood_sugar,
        Sleep: v.sleep_hours,
    }));

    const riskChartData = (risk?.history || []).map(r => ({
        date: r.date?.split(' ')[0]?.slice(5) || '',
        'Risk Score': r.score,
    }));

    // Determine vital statuses
    const latest = vitals?.latest || {};
    const bpStatus = latest.systolic && (latest.systolic > 140 || latest.systolic < 90) ? 'critical' : latest.systolic && (latest.systolic > 130 || latest.systolic < 100) ? 'warning' : 'normal';
    const hrStatus = latest.heart_rate && (latest.heart_rate > 100 || latest.heart_rate < 60) ? 'critical' : latest.heart_rate && (latest.heart_rate > 90 || latest.heart_rate < 65) ? 'warning' : 'normal';
    const bsStatus = latest.blood_sugar && (latest.blood_sugar > 140 || latest.blood_sugar < 70) ? 'critical' : latest.blood_sugar && (latest.blood_sugar > 120 || latest.blood_sugar < 80) ? 'warning' : 'normal';

    return (
        <div className="max-w-7xl mx-auto px-4 py-6 pb-24 md:pb-6 space-y-6">

            {/* ════ Header ══════════════════════════════════════ */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm">
                        <ArrowLeft className="h-5 w-5 text-slate-600" />
                    </button>
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-slate-800">{patient?.name}'s Health</h1>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Last updated: {lastRefresh?.toLocaleTimeString() || '—'} · Auto-refreshes every 30s
                        </p>
                    </div>
                </div>
                <button onClick={fetchData} className="p-2.5 rounded-xl bg-white border border-slate-200 hover:bg-sky-50 hover:border-sky-200 transition-all shadow-sm group">
                    <RefreshCw className="h-4 w-4 text-slate-500 group-hover:text-sky-500 transition-colors" />
                </button>
            </div>

            {/* ══════ HERO: Health Score + Profile ══════════════ */}
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className={cn("bg-gradient-to-br from-white via-white to-slate-50 rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8")}
            >
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-8 items-center">
                    {/* Patient Info */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-3 rounded-2xl bg-gradient-to-br from-sky-500 to-teal-500 shadow-md">
                                <User className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-slate-800">{patient?.name}</h2>
                                <p className="text-sm text-slate-400">{patient?.age} yrs · {patient?.gender}</p>
                            </div>
                        </div>

                        {/* Quick Stats */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white rounded-xl border border-slate-100 p-3">
                                <p className="text-[10px] font-semibold text-slate-400 uppercase">Risk Level</p>
                                <span className={cn("inline-block mt-1 text-xs font-bold px-2.5 py-1 rounded-full border", getRiskColor(risk?.current_level))}>
                                    {risk?.current_level || 'N/A'}
                                </span>
                            </div>
                            <div className="bg-white rounded-xl border border-slate-100 p-3">
                                <p className="text-[10px] font-semibold text-slate-400 uppercase">Active Alerts</p>
                                <p className={cn("text-xl font-bold mt-1", alertsData?.active_count > 0 ? 'text-red-500' : 'text-emerald-500')}>
                                    {alertsData?.active_count || 0}
                                </p>
                            </div>
                            <div className="bg-white rounded-xl border border-slate-100 p-3">
                                <p className="text-[10px] font-semibold text-slate-400 uppercase">Med Adherence</p>
                                <p className="text-xl font-bold text-sky-600 mt-1">{medications?.adherence_7d || 0}%</p>
                            </div>
                            <div className="bg-white rounded-xl border border-slate-100 p-3">
                                <p className="text-[10px] font-semibold text-slate-400 uppercase">Tasks Done</p>
                                <p className="text-xl font-bold text-violet-600 mt-1">
                                    {tasks?.completed_today || 0}/{tasks?.total_today || 0}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Divider (Desktop Only) */}
                    <div className="hidden md:block w-px h-48 bg-gradient-to-b from-transparent via-slate-200 to-transparent" />

                    {/* Health Score Gauge */}
                    <div className="flex justify-center">
                        <HealthScoreGauge score={health_score} trend={health_score_trend} label={healthStyle.label} />
                    </div>
                </div>

                {/* Conditions Strip */}
                {patient?.known_conditions && (
                    <div className="mt-5 pt-5 border-t border-slate-100">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase mb-2">Known Conditions</p>
                        <div className="flex flex-wrap gap-2">
                            {(typeof patient.known_conditions === 'object'
                                ? Object.values(patient.known_conditions).flat()
                                : [String(patient.known_conditions)]
                            ).map((c, i) => (
                                <span key={i} className="text-xs font-medium px-3 py-1.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100">
                                    {typeof c === 'string' ? c : JSON.stringify(c)}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </motion.div>

            {/* ══════ Vitals Cards ══════════════════════════════ */}
            <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.06 } } }}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <motion.div variants={cardVariants} custom={0}>
                        <VitalCard icon={Activity} label="Blood Pressure" value={latest.blood_pressure} unit="mmHg" status={bpStatus} color="bg-rose-500" />
                    </motion.div>
                    <motion.div variants={cardVariants} custom={1}>
                        <VitalCard icon={Heart} label="Heart Rate" value={latest.heart_rate} unit="bpm" status={hrStatus} color="bg-red-500" />
                    </motion.div>
                    <motion.div variants={cardVariants} custom={2}>
                        <VitalCard icon={Droplets} label="Blood Sugar" value={latest.blood_sugar} unit="mg/dL" status={bsStatus} color="bg-blue-500" />
                    </motion.div>
                    <motion.div variants={cardVariants} custom={3}>
                        <VitalCard icon={Moon} label="Sleep" value={latest.sleep_hours} unit="hours" status="default" color="bg-indigo-500" />
                    </motion.div>
                </div>
            </motion.div>

            {/* ══════ Charts Grid ══════════════════════════════ */}
            <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }} className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                {/* Blood Pressure Trend */}
                <SectionCard title="Blood Pressure Trend" icon={Activity} accentColor="bg-rose-500">
                    {vitalsChartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={vitalsChartData}>
                                <defs>
                                    <linearGradient id="sysGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.3} />
                                        <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="diaGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} domain={['auto', 'auto']} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="Systolic" stroke="#f43f5e" fill="url(#sysGrad)" strokeWidth={2} dot={{ r: 3, fill: '#f43f5e' }} />
                                <Area type="monotone" dataKey="Diastolic" stroke="#8b5cf6" fill="url(#diaGrad)" strokeWidth={2} dot={{ r: 3, fill: '#8b5cf6' }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="text-sm text-slate-400 text-center py-8">No vitals data available yet</p>
                    )}
                    <div className="flex justify-center gap-6 mt-2 text-xs">
                        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-rose-500 rounded" /> Systolic</span>
                        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-violet-500 rounded" /> Diastolic</span>
                    </div>
                </SectionCard>

                {/* Heart Rate & Blood Sugar */}
                <SectionCard title="Heart Rate & Blood Sugar" icon={Heart} accentColor="bg-red-500">
                    {vitalsChartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={vitalsChartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                <Tooltip content={<CustomTooltip />} />
                                <Line type="monotone" dataKey="Heart Rate" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3, fill: '#ef4444' }} activeDot={{ r: 5 }} />
                                <Line type="monotone" dataKey="Blood Sugar" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: '#3b82f6' }} activeDot={{ r: 5 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="text-sm text-slate-400 text-center py-8">No vitals data available yet</p>
                    )}
                    <div className="flex justify-center gap-6 mt-2 text-xs">
                        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-500 rounded" /> Heart Rate</span>
                        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-blue-500 rounded" /> Blood Sugar</span>
                    </div>
                </SectionCard>

                {/* Risk Score Over Time */}
                <SectionCard title="AI Risk Score Trend" icon={Brain} accentColor="bg-violet-500">
                    {riskChartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={riskChartData}>
                                <defs>
                                    <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="Risk Score" stroke="#8b5cf6" fill="url(#riskGrad)" strokeWidth={2.5} dot={{ r: 3, fill: '#8b5cf6' }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="text-sm text-slate-400 text-center py-8">No assessments yet</p>
                    )}
                </SectionCard>

                {/* Medication Adherence */}
                <SectionCard title="Medication Adherence" icon={Pill} accentColor="bg-teal-500"
                    headerRight={
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">7d:</span>
                            <span className={cn("text-sm font-bold", medications?.adherence_7d >= 80 ? 'text-emerald-600' : medications?.adherence_7d >= 50 ? 'text-amber-600' : 'text-red-600')}>
                                {medications?.adherence_7d || 0}%
                            </span>
                        </div>
                    }
                >
                    {/* Adherence Heatmap */}
                    {medications?.adherence_heatmap?.length > 0 ? (
                        <div className="space-y-3">
                            <div className="flex flex-wrap gap-1.5">
                                {medications.adherence_heatmap.map((d, i) => (
                                    <div key={i} title={`${d.date}: ${d.adherence}%`}
                                        className={cn("w-7 h-7 rounded-md flex items-center justify-center text-[9px] font-bold border transition-all hover:scale-110",
                                            d.adherence >= 80 ? 'bg-emerald-100 border-emerald-200 text-emerald-700' :
                                                d.adherence >= 50 ? 'bg-amber-100 border-amber-200 text-amber-700' :
                                                    d.adherence > 0 ? 'bg-red-100 border-red-200 text-red-700' :
                                                        'bg-slate-50 border-slate-200 text-slate-400'
                                        )}
                                    >
                                        {d.adherence}
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-center gap-4 text-[10px] text-slate-400">
                                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" /> ≥80%</span>
                                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-200" /> 50-79%</span>
                                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-200" /> &lt;50%</span>
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-slate-400 text-center py-4">No medication data yet</p>
                    )}

                    {/* Today's Medications */}
                    {medications?.today?.length > 0 && (
                        <div className="mt-4 border-t border-slate-100 pt-4">
                            <p className="text-xs font-semibold text-slate-500 mb-3">Today's Medications</p>
                            <div className="space-y-2">
                                {medications.today.map((med, i) => (
                                    <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2.5">
                                        <div className="flex items-center gap-2">
                                            <Pill className="h-3.5 w-3.5 text-teal-500" />
                                            <span className="text-sm font-medium text-slate-700">{med.medicine_name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-slate-400">{med.scheduled_time}</span>
                                            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
                                                med.status_patient === 'TAKEN' ? 'bg-emerald-100 text-emerald-700' :
                                                    med.status_patient === 'SKIPPED' ? 'bg-red-100 text-red-700' :
                                                        'bg-slate-200 text-slate-600'
                                            )}>
                                                {med.status_patient}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </SectionCard>
            </motion.div>

            {/* ══════ Lower Grid: Tasks + Alerts + Recommendations ══════ */}
            <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.1 } } }} className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                {/* Daily Tasks */}
                <SectionCard title="Daily Tasks" icon={ListChecks} accentColor="bg-violet-500"
                    headerRight={
                        <span className="text-xs font-medium text-slate-400">
                            {tasks?.completed_today || 0}/{tasks?.total_today || 0} done
                        </span>
                    }
                >
                    {tasks?.today?.length > 0 ? (
                        <div className="space-y-2">
                            {tasks.today.map((task, i) => {
                                const categoryIcons = { Diet: '🍎', Exercise: '🏃', Lifestyle: '🌙', Medication: '💊' };
                                const isDone = task.status_patient === 'COMPLETED';
                                return (
                                    <div key={i} className={cn("flex items-center gap-3 p-3 rounded-lg border transition-all",
                                        isDone ? 'bg-emerald-50/50 border-emerald-200' : 'bg-white border-slate-200'
                                    )}>
                                        <span className="text-lg">{categoryIcons[task.category] || '📋'}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className={cn("text-sm font-medium truncate", isDone ? 'text-emerald-700 line-through' : 'text-slate-700')}>
                                                {task.task_description}
                                            </p>
                                            <p className="text-[10px] text-slate-400 uppercase">{task.category}</p>
                                        </div>
                                        {isDone ? (
                                            <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                                        ) : (
                                            <Clock className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-sm text-slate-400 text-center py-6">No tasks for today</p>
                    )}
                    {tasks?.compliance_7d !== undefined && (
                        <div className="mt-4 pt-3 border-t border-slate-100">
                            <div className="flex items-center justify-between text-xs mb-2">
                                <span className="text-slate-500 font-medium">7-Day Compliance</span>
                                <span className={cn("font-bold", tasks.compliance_7d >= 70 ? 'text-emerald-600' : 'text-amber-600')}>
                                    {tasks.compliance_7d}%
                                </span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2">
                                <div className={cn("h-2 rounded-full transition-all duration-500",
                                    tasks.compliance_7d >= 70 ? 'bg-emerald-500' : tasks.compliance_7d >= 40 ? 'bg-amber-500' : 'bg-red-500'
                                )} style={{ width: `${tasks.compliance_7d}%` }} />
                            </div>
                        </div>
                    )}
                </SectionCard>

                {/* Active Alerts */}
                <SectionCard title="Alerts" icon={Bell} accentColor={alertsData?.active_count > 0 ? 'bg-red-500' : 'bg-slate-400'}
                    headerRight={
                        alertsData?.active_count > 0 && (
                            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-bold animate-pulse">
                                {alertsData.active_count}
                            </span>
                        )
                    }
                >
                    {alertsData?.recent?.length > 0 ? (
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {alertsData.recent.map((alert, i) => (
                                <div key={i} className={cn("p-3 rounded-lg border text-sm",
                                    !alert.call_received ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'
                                )}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                                            !alert.call_received ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-500'
                                        )}>
                                            {!alert.call_received ? '● Active' : '✓ Resolved'}
                                        </span>
                                        <span className="text-[10px] text-slate-400">{alert.created_at}</span>
                                    </div>
                                    <p className="text-slate-700 text-xs leading-relaxed mt-1">{alert.alert_message}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center py-6 text-slate-400">
                            <Shield className="h-8 w-8 mb-2" />
                            <p className="text-sm">No recent alerts</p>
                        </div>
                    )}
                </SectionCard>

                {/* Recommendations */}
                <SectionCard title="Doctor Recommendations" icon={Star} accentColor="bg-amber-500">
                    {recommendations?.length > 0 ? (
                        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                            {recommendations.map((rec, i) => (
                                <div key={i} className="p-3 bg-amber-50/50 rounded-lg border border-amber-100">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-xs font-bold text-amber-700">{rec.doctor_name || 'Dr. AI'}</span>
                                        <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full",
                                            rec.escalation_level === 'Critical' ? 'bg-red-100 text-red-700' :
                                                rec.escalation_level === 'High' ? 'bg-orange-100 text-orange-700' :
                                                    'bg-slate-100 text-slate-600'
                                        )}>
                                            {rec.escalation_level}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-700 leading-relaxed">{rec.recommendation_summary}</p>
                                    <p className="text-[10px] text-slate-400 mt-1.5">{rec.created_at}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center py-6 text-slate-400">
                            <Star className="h-8 w-8 mb-2" />
                            <p className="text-sm">No recommendations yet</p>
                        </div>
                    )}
                </SectionCard>
            </motion.div>

            {/* ══════ AI Reasoning (Expandable — Staff/Caretaker Only) ══════ */}
            {!isPatient && risk?.latest_reasoning && Object.keys(risk.latest_reasoning).length > 0 && (
                <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={0}>
                    <SectionCard title="Latest AI Assessment Reasoning" icon={Brain} accentColor="bg-indigo-500"
                        headerRight={
                            <button onClick={() => toggleSection('reasoning')} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                                {expandedSections.reasoning ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                            </button>
                        }
                    >
                        <AnimatePresence>
                            {expandedSections.reasoning && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="overflow-hidden"
                                >
                                    <pre className="text-xs text-slate-600 bg-slate-50 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap leading-relaxed border border-slate-100">
                                        {JSON.stringify(risk.latest_reasoning, null, 2)}
                                    </pre>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        {!expandedSections.reasoning && (
                            <p className="text-xs text-slate-400 italic">Click the chevron to expand the full AI reasoning...</p>
                        )}
                    </SectionCard>
                </motion.div>
            )}

            {/* ══════ Vitals Anomalies (Staff Only) ══════════════ */}
            {isStaff && vitals?.anomalies?.length > 0 && (
                <SectionCard title="Vitals Anomalies Detected" icon={AlertTriangle} accentColor="bg-orange-500">
                    <div className="space-y-1.5">
                        {vitals.anomalies.map((a, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-orange-700 bg-orange-50 rounded-lg p-2.5 border border-orange-100">
                                <Zap className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                <span>{a}</span>
                            </div>
                        ))}
                    </div>
                </SectionCard>
            )}

            {/* ══════ Patient-Friendly Summary (Patient Only) ═══ */}
            {isPatient && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                    <div className={cn("rounded-2xl p-6 border-2", healthStyle.bgLight, healthStyle.ring.replace('ring-', 'border-'))}>
                        <div className="flex items-center gap-3 mb-3">
                            {health_score >= 75 ? <span className="text-3xl">😊</span> :
                                health_score >= 50 ? <span className="text-3xl">🙂</span> :
                                    health_score >= 25 ? <span className="text-3xl">😐</span> :
                                        <span className="text-3xl">😟</span>}
                            <div>
                                <h3 className={cn("text-lg font-bold", healthStyle.text)}>
                                    {health_score >= 75 ? "You're doing great!" :
                                        health_score >= 50 ? "You're doing okay, keep it up!" :
                                            health_score >= 25 ? "Needs attention — stay on track" :
                                                "Please follow your care plan carefully"}
                                </h3>
                                <p className="text-sm text-slate-500">
                                    Your health score is <strong>{Math.round(health_score)}</strong>/100 and {health_score_trend === 'improving' ? 'improving 📈' : health_score_trend === 'deteriorating' ? 'needs more care 📉' : 'stable ➡️'}.
                                </p>
                            </div>
                        </div>
                        <div className="text-xs text-slate-500 space-y-1">
                            <p>💊 Medication adherence this week: <strong>{medications?.adherence_7d || 0}%</strong></p>
                            <p>✅ Tasks completed today: <strong>{tasks?.completed_today || 0}/{tasks?.total_today || 0}</strong></p>
                            {patient?.next_appointment_date && (
                                <p>📅 Next appointment: <strong>{patient.next_appointment_date}</strong></p>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
