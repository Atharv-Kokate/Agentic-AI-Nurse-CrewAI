import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { Bell, Plus, Trash2, Clock, Pill } from 'lucide-react';
import client from '../api/client';
import { format } from 'date-fns';

const MedicineRemindersPage = () => {
    const [reminders, setReminders] = useState([]);
    const [loading, setLoading] = useState(true);
    const { register, handleSubmit, reset, formState: { errors } } = useForm();

    const fetchReminders = async () => {
        try {
            const res = await client.get('/reminders/');
            setReminders(res.data);
        } catch (error) {
            console.error("Failed to fetch reminders", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReminders();
    }, []);

    const onSubmit = async (data) => {
        try {
            await client.post('/reminders/', data);
            reset();
            fetchReminders();
        } catch (error) {
            alert("Failed to create reminder");
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm("Are you sure you want to delete this reminder?")) {
            try {
                await client.delete(`/reminders/${id}`);
                fetchReminders();
            } catch (error) {
                alert("Failed to delete reminder");
            }
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Medicine Reminders</h1>
                <p className="text-slate-500">Set daily reminders for your medications.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Form Section */}
                <div className="md:col-span-1">
                    <div className="glass-panel p-6 rounded-xl">
                        <div className="flex items-center gap-2 mb-4">
                            <Plus className="w-5 h-5 text-sky-500" />
                            <h3 className="font-semibold text-slate-900">Add New Reminder</h3>
                        </div>
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Medicine Name</label>
                                <input
                                    {...register('medicine_name', { required: 'Required' })}
                                    className="mt-1 w-full rounded-md border border-slate-200 bg-slate-800 text-white p-2.5 focus:border-sky-500 focus:outline-none placeholder:text-slate-400"
                                    placeholder="e.g. Aspirin"
                                />
                                {errors.medicine_name && <p className="text-xs text-red-500">{errors.medicine_name.message}</p>}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Dosage</label>
                                <input
                                    {...register('dosage', { required: 'Required' })}
                                    className="mt-1 w-full rounded-md border border-slate-200 bg-slate-800 text-white p-2.5 focus:border-sky-500 focus:outline-none placeholder:text-slate-400"
                                    placeholder="e.g. 1 tablet"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Time (Daily)</label>
                                <input
                                    type="time"
                                    {...register('schedule_time', { required: 'Required' })}
                                    className="mt-1 w-full rounded-md border border-slate-200 bg-slate-800 text-white p-2.5 focus:border-sky-500 focus:outline-none"
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full bg-sky-500 text-white py-2 rounded-lg hover:bg-sky-600 transition-colors font-medium"
                            >
                                Set Reminder
                            </button>
                        </form>
                    </div>
                </div>

                {/* List Section */}
                <div className="md:col-span-2 space-y-4">
                    {loading ? (
                        <p>Loading reminders...</p>
                    ) : reminders.length === 0 ? (
                        <div className="text-center p-10 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                            <Bell className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                            <p className="text-slate-500">No reminders set yet.</p>
                        </div>
                    ) : (
                        reminders.map((reminder) => (
                            <motion.div
                                key={reminder.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="glass-panel p-4 rounded-xl flex items-center justify-between"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                                        <Pill className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-slate-900">{reminder.medicine_name}</h4>
                                        <p className="text-sm text-slate-500">{reminder.dosage}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div className="flex items-center gap-2 text-slate-600 bg-slate-100 px-3 py-1 rounded-full text-sm">
                                        <Clock className="w-4 h-4" />
                                        <span>{reminder.schedule_time}</span>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(reminder.id)}
                                        className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default MedicineRemindersPage;
