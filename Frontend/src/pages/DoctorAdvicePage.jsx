import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Stethoscope, User, AlertCircle, CheckCircle } from 'lucide-react';
import client from '../api/client';
import { format } from 'date-fns';

const DoctorAdvicePage = () => {
    const [recommendations, setRecommendations] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRecs = async () => {
            try {
                const response = await client.get('/callbacks/recommendations');
                setRecommendations(response.data);
            } catch (error) {
                console.error("Failed to fetch recommendations", error);
            } finally {
                setLoading(false);
            }
        };
        fetchRecs();
    }, []);

    if (loading) return <div className="p-8 text-center text-slate-500">Loading recommendations...</div>;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Doctor Recommendations</h1>
                <p className="mt-1 text-slate-500">Medical advice received from on-call physicians via escalation.</p>
            </div>

            <div className="grid gap-4">
                {recommendations.length > 0 ? (
                    recommendations.map((rec) => (
                        <motion.div
                            key={rec.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="glass-panel overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                        >
                            <div className="border-b border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="rounded-full bg-indigo-100 p-2 text-indigo-600">
                                        <Stethoscope className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-slate-900">{rec.doctor_name || "Medical Officer"}</h3>
                                        <p className="text-xs text-slate-500">Patient ID: {rec.patient_id}</p>
                                    </div>
                                </div>
                                <span className="text-xs text-slate-400">{format(new Date(rec.created_at), 'MMM d, p')}</span>
                            </div>
                            <div className="p-4 space-y-4">
                                <div>
                                    <span className="block text-xs font-medium uppercase tracking-wider text-slate-400">Recommendation</span>
                                    <p className="mt-1 text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100">{rec.recommendation_summary}</p>
                                </div>
                                {rec.medication_advice && (
                                    <div>
                                        <span className="block text-xs font-medium uppercase tracking-wider text-slate-400">Medication Advice</span>
                                        <p className="mt-1 text-sm text-slate-700 bg-green-50 p-3 rounded-lg border border-green-100">{rec.medication_advice}</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ))
                ) : (
                    <div className="text-center p-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        <CheckCircle className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                        <p className="text-slate-500">No active escalations or recommendations found.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DoctorAdvicePage;
