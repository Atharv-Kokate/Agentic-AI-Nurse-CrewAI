import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import PatientAssessmentMonitor from './PatientAssessmentMonitor';
import CaretakerAssessmentMonitor from './CaretakerAssessmentMonitor';

const AssessmentMonitorPage = () => {
    const { user } = useAuth();

    // Safety check just in case
    if (!user || !user.role) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
            </div>
        );
    }

    if (user.role === 'PATIENT') {
        return <PatientAssessmentMonitor />;
    }

    // Default to Caretaker Monitor for CARETAKER, NURSE, DOCTOR, ADMIN
    return <CaretakerAssessmentMonitor />;
};

export default AssessmentMonitorPage;
