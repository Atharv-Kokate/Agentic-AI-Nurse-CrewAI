import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { format } from 'date-fns';
import { Stethoscope, FileText, AlertCircle, CheckCircle } from 'lucide-react';

const DoctorAdvicePage = () => {
    const [recommendations, setRecommendations] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRecommendations = async () => {
            try {
                // Fetch all recommendations
                // Note: In a real app, this should be filtered by patient ID for patients
                // or show all for nurses/admins. 
                // Currently the backend returns all, which is fine for the MVP/Demo.
                const res = await client.get('/callbacks/recommendations');
                setRecommendations(res.data);
            } catch (error) {
                console.error("Failed to fetch recommendations", error);
            } finally {
                setLoading(false);
            }
        };

        fetchRecommendations();
    }, []);

    if (loading) return <div className="p-10 text-center">Loading advice...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-100 rounded-lg text-indigo-600">
                    <Stethoscope className="w-8 h-8" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Doctor's Advice</h1>
                    <p className="text-slate-500">Recommendations and prescriptions from medical officers.</p>
                </div>
            </div>

            <div className="grid gap-4">
                {recommendations.length === 0 ? (
                    <div className="text-center p-10 bg-slate-50 rounded-xl border border-slate-200">
                        <p className="text-slate-500">No recommendations received yet.</p>
                    </div>
                ) : (
                    recommendations.map((rec) => (
                        <div key={rec.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-bold text-lg text-slate-900">{rec.doctor_name || "Medical Officer"}</h3>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rec.escalation_level === 'Critical' ? 'bg-red-100 text-red-700' :
                                                rec.escalation_level === 'Urgent' ? 'bg-orange-100 text-orange-700' :
                                                    'bg-blue-100 text-blue-700'
                                            }`}>
                                            {rec.escalation_level}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-500">
                                        Received: {format(new Date(rec.created_at), 'PPP p')}
                                    </p>
                                </div>
                                <div className="text-sm text-slate-400 font-mono bg-slate-50 px-2 py-1 rounded">
                                    Ref: {rec.id.slice(0, 8)}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                    <h4 className="flex items-center gap-2 font-medium text-slate-700 mb-2">
                                        <FileText className="w-4 h-4" /> Recommendation
                                    </h4>
                                    <p className="text-slate-600 leading-relaxed">
                                        {rec.recommendation_summary}
                                    </p>
                                </div>

                                {rec.medication_advice && (
                                    <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                                        <h4 className="flex items-center gap-2 font-medium text-emerald-800 mb-2">
                                            <CheckCircle className="w-4 h-4" /> Medication Advice
                                        </h4>
                                        <p className="text-emerald-700 leading-relaxed">
                                            {rec.medication_advice}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default DoctorAdvicePage;
