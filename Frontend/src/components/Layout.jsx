import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, Wifi, WifiOff } from 'lucide-react';
import Sidebar from './Sidebar';
import useLocationTracking from '../hooks/useLocationTracking';

const Layout = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const { status } = useLocationTracking();

    return (
        <div className="flex min-h-screen bg-slate-50">
            {/* Mobile Header */}
            <div className="fixed top-0 left-0 right-0 z-30 flex h-16 items-center border-b border-slate-200 bg-white px-4 md:hidden">
                <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="mr-4 rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                >
                    <Menu className="h-6 w-6" />
                </button>
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-sky-500 to-teal-400 flex items-center justify-center text-white font-bold text-sm">
                        AI
                    </div>
                    <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-sky-600 to-teal-500">
                        NurseAgent
                    </span>
                </div>
            </div>

            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            <main className="flex-1 overflow-y-auto p-4 md:p-8 pt-20 md:pt-8 w-full relative">
                <div className="mx-auto max-w-7xl">
                    <Outlet />
                </div>

                {/* Location Status Badge (Only shows if status is relevant) */}
                {status !== 'idle' && (
                    <div className={`fixed bottom-4 right-4 z-50 px-3 py-2 rounded-full shadow-lg flex items-center gap-2 text-xs font-medium border ${status === 'connected' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            status === 'connecting' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                'bg-red-50 text-red-700 border-red-200'
                        }`}>
                        {status === 'connected' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                        <span>
                            {status === 'connected' ? 'Location Active' :
                                status === 'connecting' ? 'Connecting...' :
                                    'Location Disconnected'}
                        </span>
                    </div>
                )}
            </main>
        </div>
    );
};

export default Layout;
