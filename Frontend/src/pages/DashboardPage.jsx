import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Activity, AlertTriangle, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import client from '../api/client';

const StatCard = ({ title, value, subtext, icon: Icon, color }) => (
    <motion.div
        whileHover={{ y: -2 }}
        className="glass-panel rounded-xl p-6"
    >
        <div className="flex items-start justify-between">
            <div>
                <p className="text-sm font-medium text-slate-500">{title}</p>
                <h3 className="mt-2 text-3xl font-bold text-slate-900">{value}</h3>
            </div>
            <div className={`rounded-lg p-2 ${color}`}>
                <Icon className="h-6 w-6 text-white" />
            </div>
        </div>
        <div className="mt-4">
            <p className="text-xs text-slate-400">{subtext}</p>
        </div>
    </motion.div>
);

const DashboardPage = () => {
    const [stats, setStats] = useState({
        total_patients: 0,
        critical_alerts: 0,
        active_monitoring: 0,
        completed_today: 0,
        recent_activity: []
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await client.get('/dashboard/stats');
                setStats(response.data);
            } catch (error) {
                console.error("Failed to fetch dashboard stats", error);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    if (loading) {
        return <div className="p-8 text-center text-slate-500">Loading dashboard data...</div>;
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Dashboard Overview</h1>
                <p className="mt-1 text-slate-500">Welcome back. Here's what's happening today.</p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Total Patients"
                    value={stats.total_patients}
                    subtext="Total registered patients"
                    icon={Users}
                    color="bg-sky-500"
                />
                <StatCard
                    title="Critical Alerts"
                    value={stats.critical_alerts}
                    subtext="Unresolved alerts"
                    icon={AlertTriangle}
                    color="bg-red-500"
                />
                <StatCard
                    title="Active Monitoring"
                    value={stats.active_monitoring}
                    subtext="Pending interactions"
                    icon={Activity}
                    color="bg-indigo-500"
                />
                <StatCard
                    title="Completed Today"
                    value={stats.completed_today}
                    subtext="Assessments finalized today"
                    icon={CheckCircle}
                    color="bg-emerald-500"
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <div className="glass-panel rounded-xl p-6">
                    <h3 className="font-bold text-slate-900 mb-4">Recent Activity</h3>
                    <div className="space-y-4">
                        {stats.recent_activity.length > 0 ? (
                            stats.recent_activity.map((activity) => (
                                <div key={activity.id} className="flex items-center gap-4 border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                                    <div className="h-2 w-2 rounded-full bg-sky-500" />
                                    <div>
                                        <p className="text-sm font-medium text-slate-900">{activity.patient_name}</p>
                                        <p className="text-xs text-slate-500">{activity.description}</p>
                                        <p className="text-xs text-slate-400">{format(new Date(activity.time), 'p')}</p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-slate-500">No recent activity.</p>
                        )}
                    </div>
                </div>

                <div className="glass-panel rounded-xl p-6">
                    <h3 className="font-bold text-slate-900 mb-4">Quick Actions</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => window.location.href = '/assessments/new'} className="flex flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white p-6 transition-all hover:bg-slate-50 hover:border-sky-200 hover:shadow-sm">
                            <div className="rounded-full bg-sky-100 p-3 text-sky-600">
                                <Activity className="h-6 w-6" />
                            </div>
                            <span className="text-sm font-medium text-slate-700">New Assessment</span>
                        </button>
                        <button onClick={() => window.location.href = '/patients/register'} className="flex flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white p-6 transition-all hover:bg-slate-50 hover:border-emerald-200 hover:shadow-sm">
                            <div className="rounded-full bg-emerald-100 p-3 text-emerald-600">
                                <Users className="h-6 w-6" />
                            </div>
                            <span className="text-sm font-medium text-slate-700">Add Patient</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardPage;
