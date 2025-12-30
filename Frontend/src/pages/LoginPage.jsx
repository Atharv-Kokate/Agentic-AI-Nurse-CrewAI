import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Lock, Loader2, AlertCircle, Activity } from 'lucide-react';
import { cn } from '../utils/cn';

const LoginPage = () => {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const { register, handleSubmit, formState: { errors } } = useForm();

    const onSubmit = async (data) => {
        setIsLoading(true);
        setError('');
        try {
            await login(data.email, data.password);
            navigate('/');
        } catch (err) {
            console.error(err);
            setError('Invalid email or password. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen w-full items-center justify-center bg-slate-50 relative overflow-hidden">
            {/* Background Decor */}
            <div className="absolute top-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full bg-sky-200/30 blur-3xl" />
            <div className="absolute bottom-[-20%] right-[-10%] h-[600px] w-[600px] rounded-full bg-teal-200/30 blur-3xl" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="glass-panel w-full max-w-md rounded-2xl p-8 z-10"
            >
                <div className="flex flex-col items-center mb-8">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-sky-500 to-teal-400 flex items-center justify-center shadow-lg mb-4">
                        <Activity className="h-7 w-7 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900">Agentic AI Nurse</h1>
                    <p className="text-slate-500 mt-2">Clinical Assessment Platform</p>
                </div>

                {error && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mb-6 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-100"
                    >
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <p>{error}</p>
                    </motion.div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Email Address</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input
                                {...register('email', { required: 'Email is required' })}
                                type="email"
                                placeholder="doctor@hospital.com"
                                className={cn(
                                    "w-full rounded-lg border bg-white/50 pl-10 px-4 py-2.5 outline-none transition-all placeholder:text-slate-400 focus:bg-white",
                                    errors.email
                                        ? "border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                                        : "border-slate-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                                )}
                            />
                        </div>
                        {errors.email && (
                            <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input
                                {...register('password', { required: 'Password is required' })}
                                type="password"
                                placeholder="••••••••"
                                className={cn(
                                    "w-full rounded-lg border bg-white/50 pl-10 px-4 py-2.5 outline-none transition-all placeholder:text-slate-400 focus:bg-white",
                                    errors.password
                                        ? "border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                                        : "border-slate-200 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                                )}
                            />
                        </div>
                        {errors.password && (
                            <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full rounded-lg bg-gradient-to-r from-sky-500 to-teal-500 py-2.5 font-medium text-white shadow-lg shadow-sky-500/20 transition-all hover:shadow-sky-500/30 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Signing in...</span>
                            </>
                        ) : (
                            'Sign In'
                        )}
                    </button>
                </form>

                <div className="mt-8 text-center text-xs text-slate-400">
                    <p>Protected System • Authorized Personnel Only</p>
                </div>
            </motion.div>
        </div>
    );
};

export default LoginPage;
