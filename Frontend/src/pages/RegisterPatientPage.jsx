import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { UserPlus, User, Lock, Mail, Activity, Loader2 } from 'lucide-react';
import client from '../api/client';
import { motion } from 'framer-motion';

const RegisterPatientPage = () => {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const { register, handleSubmit, formState: { errors } } = useForm();

    const onSubmit = async (data) => {
        setIsLoading(true);
        try {
            // 1. Create Patient Record
            const patientPayload = {
                name: data.name,
                age: parseInt(data.age),
                gender: data.gender,
                contact_number: data.contact_number,
                known_conditions: { conditions: data.known_conditions.split(',').map(c => c.trim()) },
                reported_symptoms: {}, // Empty initially
                assigned_doctor: data.assigned_doctor
            };

            const patientResponse = await client.post('/patients/', patientPayload);
            const patientId = patientResponse.data.id;

            // 2. Create User Account for Patient
            const userPayload = {
                email: data.email,
                password: data.password,
                full_name: data.name,
                role: 'PATIENT',
                patient_id: patientId
            };

            await client.post('/auth/register', userPayload);

            alert('Patient registered successfully! They can now login.');
            navigate('/patients');

        } catch (error) {
            console.error("Registration failed", error);
            alert(error.response?.data?.detail || "Failed to register patient");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900">Register New Patient</h1>
                <p className="mt-1 text-slate-500">Create a patient record and a user account for them.</p>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-panel p-8 rounded-xl"
            >
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

                    {/* Section 1: Clinical Info */}
                    <div className="border-b border-slate-100 pb-6">
                        <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                            <Activity className="w-5 h-5 text-sky-500" />
                            Clinical Information
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Full Name</label>
                                <input {...register('name', { required: 'Name is required' })} className="mt-1 w-full rounded-md border border-slate-200 text-white p-2.5 focus:border-sky-500 focus:outline-none" placeholder="Jane Doe" />
                                {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Age</label>
                                <input type="number" {...register('age', { required: 'Required' })} className="mt-1 w-full rounded-md border border-slate-200 text-white p-2.5 focus:border-sky-500 focus:outline-none" placeholder="30" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Gender</label>
                                <select {...register('gender')} className="mt-1 w-full rounded-md border border-slate-200 text-white p-2.5 focus:border-sky-500 focus:outline-none">
                                    <option>Male</option>
                                    <option>Female</option>
                                    <option>Other</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Contact Number</label>
                                <input {...register('contact_number', { required: 'Required' })} className="mt-1 w-full rounded-md border border-slate-200 text-white p-2.5 focus:border-sky-500 focus:outline-none" placeholder="555-0000" />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-slate-700">Known Conditions</label>
                                <textarea {...register('known_conditions')} className="mt-1 w-full rounded-md border border-slate-200 text-white p-2.5 focus:border-sky-500 focus:outline-none" placeholder="e.g. Asthma, Hypertension (comma separated)" rows={2} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Assigned Doctor (Optional)</label>
                                <input {...register('assigned_doctor')} className="mt-1 w-full rounded-md border border-slate-200 text-white p-2.5 focus:border-sky-500 focus:outline-none" placeholder="Dr. Smith" />
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Account Info */}
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                            <User className="w-5 h-5 text-sky-500" />
                            User Account (For Patient Login)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Email Address</label>
                                <div className="relative mt-1">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                    <input type="email" {...register('email', { required: 'Email is required' })} className="w-full rounded-md border border-slate-200 text-white pl-9 p-2.5 focus:border-sky-500 focus:outline-none" placeholder="patient@example.com" />
                                </div>
                                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Password</label>
                                <div className="relative mt-1">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                    <input type="password" {...register('password', { required: 'Password is required', minLength: { value: 6, message: 'Min 6 chars' } })} className="w-full rounded-md border border-slate-200 text-white pl-9 p-2.5 focus:border-sky-500 focus:outline-none" placeholder="••••••" />
                                </div>
                                {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => navigate('/patients')}
                            className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-sky-500 rounded-lg hover:bg-sky-600 transition-colors disabled:opacity-70"
                        >
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserPlus className="h-4 w-4" /> Register Patient</>}
                        </button>
                    </div>

                </form>
            </motion.div>
        </div>
    );
};

export default RegisterPatientPage;
