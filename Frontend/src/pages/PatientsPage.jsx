import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, User, Calendar, Loader2, HeartPulse } from 'lucide-react';
import { motion } from 'framer-motion';
import client from '../api/client';
import { format } from 'date-fns';

const PatientsPage = () => {
    const navigate = useNavigate();
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchPatients = async () => {
            try {
                const response = await client.get('/patients/');
                setPatients(response.data);
            } catch (error) {
                console.error("Failed to fetch patients", error);
            } finally {
                setLoading(false);
            }
        };
        fetchPatients();
    }, []);

    const filteredPatients = patients.filter(patient =>
        patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        patient.contact_number.includes(searchTerm)
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Patient Records</h1>
                    <p className="mt-1 text-slate-500">Manage and view all registered patients.</p>
                </div>
                <button
                    onClick={() => navigate('/patients/register')}
                    className="flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-sky-600 hover:shadow-md"
                >
                    <Plus className="h-4 w-4" />
                    Add Patient
                </button>
            </div>

            {/* Search Bar */}
            <div className="glass-panel p-4 rounded-xl">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search by name or contact number..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white pl-10 px-4 py-2.5 outline-none transition-all placeholder:text-slate-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                    />
                </div>
            </div>

            {/* Patients List */}
            {loading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredPatients.map((patient) => (
                        <motion.div
                            key={patient.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ y: -2 }}
                            className="glass-panel rounded-xl p-5 cursor-pointer transition-shadow hover:shadow-md"
                            onClick={() => navigate(`/assessments/monitor/${patient.id}`)} // Go to Monitor/Detail page
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                                        <User className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-slate-900">{patient.name}</h3>
                                        <p className="text-xs text-slate-500">{patient.gender}, {patient.age} years</p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 space-y-2 border-t border-slate-50 pt-3">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-500">Contact:</span>
                                    <span className="font-medium text-slate-700">{patient.contact_number}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-500">Created:</span>
                                    <span className="flex items-center gap-1 text-slate-700">
                                        <Calendar className="h-3 w-3" />
                                        {format(new Date(patient.created_at), 'MMM d, yyyy')}
                                    </span>
                                </div>
                            </div>

                            <div className="mt-4 flex items-center gap-2">
                                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                                    Active
                                </span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); navigate(`/health-dashboard/${patient.id}`); }}
                                    className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-600/20 hover:bg-sky-100 transition-colors"
                                >
                                    <HeartPulse className="h-3 w-3" />
                                    Health
                                </button>
                            </div>
                        </motion.div>
                    ))}

                    {filteredPatients.length === 0 && (
                        <div className="col-span-full py-10 text-center text-slate-500">
                            No patients found matching your search.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default PatientsPage;
