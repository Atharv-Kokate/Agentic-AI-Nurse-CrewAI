import React, { useState } from 'react';
import { CheckCircle2, Circle, Utensils, Dumbbell, Sun, ListChecks, ChevronDown, ChevronUp, Activity, Clock } from 'lucide-react';

const categoryConfig = {
    Diet: {
        icon: Utensils,
        label: 'Diet',
        gradient: 'from-emerald-500 to-green-500',
        lightBg: 'bg-emerald-50',
        border: 'border-emerald-200',
        iconColor: 'text-emerald-600',
        checkColor: 'text-emerald-500',
        hoverBg: 'hover:bg-emerald-50/50',
        progressBg: 'bg-emerald-100',
        progressFill: 'bg-emerald-500',
        completedBg: 'bg-emerald-50 border-emerald-100',
        pendingBg: 'bg-white border-slate-100 hover:shadow-sm',
    },
    Exercise: {
        icon: Activity,
        label: 'Exercise',
        gradient: 'from-orange-500 to-amber-500',
        lightBg: 'bg-orange-50',
        border: 'border-orange-200',
        iconColor: 'text-orange-600',
        checkColor: 'text-orange-500',
        hoverBg: 'hover:bg-orange-50/50',
        progressBg: 'bg-orange-100',
        progressFill: 'bg-orange-500',
        completedBg: 'bg-orange-50 border-orange-100',
        pendingBg: 'bg-white border-slate-100 hover:shadow-sm',
    },
    Lifestyle: {
        icon: Sun,
        label: 'Lifestyle',
        gradient: 'from-indigo-500 to-violet-500',
        lightBg: 'bg-indigo-50',
        border: 'border-indigo-200',
        iconColor: 'text-indigo-600',
        checkColor: 'text-indigo-500',
        hoverBg: 'hover:bg-indigo-50/50',
        progressBg: 'bg-indigo-100',
        progressFill: 'bg-indigo-500',
        completedBg: 'bg-indigo-50 border-indigo-100',
        pendingBg: 'bg-white border-slate-100 hover:shadow-sm',
    },
};

const defaultConfig = {
    icon: Clock,
    label: 'General',
    gradient: 'from-slate-500 to-gray-500',
    lightBg: 'bg-slate-50',
    border: 'border-slate-200',
    iconColor: 'text-slate-600',
    checkColor: 'text-slate-500',
    hoverBg: 'hover:bg-slate-50/50',
    progressBg: 'bg-slate-100',
    progressFill: 'bg-slate-500',
    completedBg: 'bg-slate-50 border-slate-100',
    pendingBg: 'bg-white border-slate-100 hover:shadow-sm',
};

function CategoryColumn({ categoryKey, tasks, config, isCompleted, renderAction, renderBadges }) {
    const Icon = config.icon;
    const completed = tasks.filter(t => isCompleted(t)).length;
    const total = tasks.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    const [collapsed, setCollapsed] = useState(false);

    return (
        <div className={`rounded-2xl border ${config.border} bg-white shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden flex flex-col`}>
            {/* Category Header with Gradient */}
            <div className={`bg-gradient-to-r ${config.gradient} px-5 py-4`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 backdrop-blur-sm rounded-xl p-2">
                            <Icon className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-base">{config.label}</h3>
                            <p className="text-white/80 text-xs">{completed}/{total} completed</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Circular Progress */}
                        <div className="relative w-10 h-10">
                            <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
                                <circle cx="20" cy="20" r="16" stroke="rgba(255,255,255,0.25)" strokeWidth="3" fill="none" />
                                <circle
                                    cx="20" cy="20" r="16"
                                    stroke="white"
                                    strokeWidth="3"
                                    fill="none"
                                    strokeDasharray={`${2 * Math.PI * 16}`}
                                    strokeDashoffset={`${2 * Math.PI * 16 * (1 - percentage / 100)}`}
                                    strokeLinecap="round"
                                    className="transition-all duration-700 ease-out"
                                />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-white text-[10px] font-bold">
                                {percentage}%
                            </span>
                        </div>
                        <button
                            onClick={() => setCollapsed(!collapsed)}
                            className="text-white/70 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                        >
                            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Task List */}
            {!collapsed && (
                <div className="p-3 flex-1 flex flex-col gap-2">
                    {tasks.map((task, index) => {
                        const done = isCompleted(task);
                        return (
                            <div
                                key={task.id || index}
                                className={`group flex items-start gap-3 p-3.5 rounded-xl border transition-all duration-200 ${
                                    done ? config.completedBg : config.pendingBg
                                }`}
                            >
                                {/* Task Content */}
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm leading-relaxed ${
                                        done ? 'line-through text-slate-400' : 'text-slate-800'
                                    }`}>
                                        {task.task_description}
                                    </p>
                                    {renderBadges && (
                                        <div className="mt-1.5">
                                            {renderBadges(task)}
                                        </div>
                                    )}
                                </div>

                                {/* Action Area */}
                                {renderAction && (
                                    <div className="flex-shrink-0">
                                        {renderAction(task)}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Bottom Progress Bar */}
            {!collapsed && total > 0 && (
                <div className="px-4 pb-3 mt-auto">
                    <div className={`w-full h-1.5 ${config.progressBg} rounded-full overflow-hidden`}>
                        <div
                            className={`h-full ${config.progressFill} rounded-full transition-all duration-700 ease-out`}
                            style={{ width: `${percentage}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * TaskGrid — Groups tasks by category and renders them in a responsive column grid.
 *
 * Props:
 * - tasks: Array of task objects with { id, task_description, category, status_patient, status_caretaker }
 * - isCompleted: (task) => boolean — determines if a task is completed
 * - renderAction: (task) => JSX — renders the action button area for each task
 * - renderBadges: (task) => JSX — renders status badges below task text (optional)
 * - compact: boolean — if true, uses smaller padding (for modals)
 */
export default function TaskGrid({ tasks = [], isCompleted, renderAction, renderBadges, compact = false }) {
    // Default isCompleted if not provided
    const checkCompleted = isCompleted || ((task) => task.status_patient === 'COMPLETED');

    // Group tasks by category
    const grouped = {};
    tasks.forEach((task) => {
        const cat = task.category || 'General';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(task);
    });

    // Ordered categories
    const orderedKeys = ['Diet', 'Exercise', 'Lifestyle'];
    Object.keys(grouped).forEach((key) => {
        if (!orderedKeys.includes(key)) orderedKeys.push(key);
    });

    const activeCategories = orderedKeys.filter((key) => grouped[key] && grouped[key].length > 0);

    if (activeCategories.length === 0) {
        return (
            <div className="text-center py-10 text-slate-400">
                <ListChecks className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-base font-medium">No tasks assigned yet</p>
                <p className="text-sm mt-1">Tasks will appear here after an assessment</p>
            </div>
        );
    }

    // Grid class based on count and context
    let gridClass = 'grid gap-4 ';
    if (compact) {
        // In modals, use 1 or 2 columns
        gridClass += activeCategories.length === 1
            ? 'grid-cols-1'
            : 'grid-cols-1 md:grid-cols-2';
    } else {
        if (activeCategories.length === 1) {
            gridClass += 'grid-cols-1 max-w-lg mx-auto';
        } else if (activeCategories.length === 2) {
            gridClass += 'grid-cols-1 md:grid-cols-2';
        } else {
            gridClass += 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
        }
    }

    return (
        <div className={gridClass}>
            {activeCategories.map((key) => (
                <CategoryColumn
                    key={key}
                    categoryKey={key}
                    tasks={grouped[key]}
                    config={categoryConfig[key] || { ...defaultConfig, label: key }}
                    isCompleted={checkCompleted}
                    renderAction={renderAction}
                    renderBadges={renderBadges}
                />
            ))}
        </div>
    );
}
