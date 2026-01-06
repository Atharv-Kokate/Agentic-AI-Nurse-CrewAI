import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Activity, LogOut, Bell } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Sidebar = () => {
    const { logout, user } = useAuth();
    const isPatient = user?.role === 'PATIENT';

    const navItems = isPatient ? [
        { icon: LayoutDashboard, label: 'My Dashboard', path: '/my-dashboard' },
        { icon: Activity, label: 'New Check-up', path: '/assessments/new' },
        { icon: Bell, label: 'Reminders', path: '/reminders' },
    ] : [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
        { icon: Users, label: 'Patients', path: '/patients' },
        { icon: Activity, label: 'New Assessment', path: '/assessments/new' },
    ];

    return (
        <div className="flex h-screen w-64 flex-col border-r border-slate-200 bg-white shadow-sm">
            <div className="flex h-16 items-center px-6 border-b border-slate-100">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-sky-500 to-teal-400 flex items-center justify-center text-white font-bold">
                        AI
                    </div>
                    <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-sky-600 to-teal-500">
                        NurseAgent
                    </span>
                </div>
            </div>

            <div className="flex-1 px-4 py-6">
                <nav className="space-y-1">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
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
    );
};

export default Sidebar;
