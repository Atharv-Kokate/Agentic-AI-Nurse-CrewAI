import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';

const Layout = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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

            <main className="flex-1 overflow-y-auto p-4 md:p-8 pt-20 md:pt-8 w-full">
                <div className="mx-auto max-w-7xl">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default Layout;
