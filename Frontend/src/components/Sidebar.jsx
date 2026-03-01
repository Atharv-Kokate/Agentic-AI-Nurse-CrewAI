import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Activity, LogOut, Bell, X, FileText, HeartPulse } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Sidebar = ({ isOpen, onClose }) => {
    const { logout, user } = useAuth();
    const isPatient = user?.role === 'PATIENT';

    const isCaretaker = user?.role === 'CARETAKER';

    let navItems = [];
    if (isPatient) {
        navItems = [
            { icon: LayoutDashboard, label: 'My Dashboard', path: '/my-dashboard' },
            { icon: HeartPulse, label: 'Health Dashboard', path: '/my-health' },
            { icon: Activity, label: 'New Check-up', path: '/assessments/new' },
            { icon: Bell, label: 'Reminders', path: '/reminders' },
            { icon: FileText, label: 'Doctor Advice', path: '/doctor-advice' },
        ];
    } else if (isCaretaker) {
        navItems = [
            { icon: LayoutDashboard, label: 'My Patients', path: '/caretaker-dashboard' },
        ];
    } else {
        // Admin, Nurse, Doctor
        navItems = [
            { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
            { icon: Users, label: 'Patients', path: '/patients' },
            { icon: Activity, label: 'New Assessment', path: '/assessments/new' },
            { icon: FileText, label: 'Doctor Advice', path: '/doctor-advice' },
        ];
    }

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar Container */}
            <div className={`
                fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl transition-transform duration-300 ease-in-out border-r border-slate-200
                md:hidden
                ${isOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="flex h-16 items-center justify-between px-6 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center">
                            <img
                                src="/pwa-192x192.png"
                                alt="Logo"
                                className="h-8 w-8 rounded-lg object-cover shadow-sm"
                            />
                        </div>
                        <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-sky-600 to-teal-500">
                            अविरल
                        </span>
                    </div>
                    {/* Close Button (Mobile Only) */}
                    <button
                        onClick={onClose}
                        className="md:hidden p-1 rounded-md hover:bg-slate-100 text-slate-500"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 px-4 py-6">
                    <nav className="space-y-1">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                onClick={() => onClose()} // Close sidebar on navigation (mobile)
                                className={({ isActive }) =>
                                    `flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200 ${isActive
                                        ? 'bg-sky-50 text-sky-700 shadow-sm ring-1 ring-sky-200'
                                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                    }`
                                }
                            >
                                <item.icon className="h-5 w-5" />
                                {item.label}
                            </NavLink>
                        ))}
                    </nav>
                </div>

                <div className="border-t border-slate-100 p-4">
                    <div className="mb-4 px-4">
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Logged in as</p>
                        <p className="font-medium text-slate-900 truncate">{user?.email}</p>
                        <p className="text-xs text-slate-500 capitalize">{user?.role?.toLowerCase()}</p>
                    </div>
                    <button
                        onClick={logout}
                        className="flex w-full items-center gap-3 rounded-lg px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                    >
                        <LogOut className="h-5 w-5" />
                        Sign Out
                    </button>
                </div>
            </div>

            {/* Root Container for Desktop Sidebar */}
            <aside className="hidden md:flex fixed top-0 left-0 h-screen w-64 flex-col border-r border-slate-200 bg-white z-20 overflow-y-auto">
                <div className="flex h-16 items-center justify-between px-6 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center">
                            <img
                                src="/pwa-192x192.png"
                                alt="Logo"
                                className="h-8 w-8 rounded-lg object-cover shadow-sm"
                            />
                        </div>
                        <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-sky-600 to-teal-500">
                            अविरल
                        </span>
                    </div>
                    {/* Close Button (Desktop Only) */}
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-slate-100 text-slate-500"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 px-4 py-6">
                    <nav className="space-y-1">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                onClick={() => onClose()} // Close sidebar on navigation (mobile)
                                className={({ isActive }) =>
                                    `flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200 ${isActive
                                        ? 'bg-sky-50 text-sky-700 shadow-sm ring-1 ring-sky-200'
                                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                    }`
                                }
                            >
                                <item.icon className="h-5 w-5" />
                                {item.label}
                            </NavLink>
                        ))}
                    </nav>
                </div>

                <div className="border-t border-slate-100 p-4">
                    <div className="mb-4 px-4">
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Logged in as</p>
                        <p className="font-medium text-slate-900 truncate">{user?.email}</p>
                        <p className="text-xs text-slate-500 capitalize">{user?.role?.toLowerCase()}</p>
                    </div>
                    <button
                        onClick={logout}
                        className="flex w-full items-center gap-3 rounded-lg px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                    >
                        <LogOut className="h-5 w-5" />
                        Sign Out
                    </button>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
