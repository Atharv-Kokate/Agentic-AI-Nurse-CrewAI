import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import NewAssessmentPage from './pages/NewAssessmentPage';
import AssessmentMonitorPage from './pages/AssessmentMonitorPage';
import PatientsPage from './pages/PatientsPage';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

import RegisterPatientPage from './pages/RegisterPatientPage';
import PatientDashboardPage from './pages/PatientDashboardPage';
import MedicineRemindersPage from './pages/MedicineRemindersPage';
import DoctorAdvicePage from './pages/DoctorAdvicePage';
import CaretakerDashboardPage from './pages/CaretakerDashboardPage';
import NotificationSetup from './components/NotificationSetup';
import { useAuth } from './contexts/AuthContext';

function App() {
    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
            <NotificationSetup />
            <Routes>
                <Route path="/login" element={<LoginPage />} />

                {/* Protected Routes for All Authenticated Users */}
                <Route element={<ProtectedRoute roles={['ADMIN', 'NURSE', 'DOCTOR', 'PATIENT', 'CARETAKER']} />}>
                    <Route element={<Layout />}>
                        {/* Shared Routes */}
                        <Route path="/assessments/new" element={<NewAssessmentPage />} />
                        <Route path="/assessments/monitor/:patientId" element={<AssessmentMonitorPage />} />
                        <Route path="/doctor-advice" element={<DoctorAdvicePage />} />

                        {/* Staff Only Routes */}
                        <Route element={<ProtectedRoute roles={['ADMIN', 'NURSE', 'DOCTOR']} />}>
                            <Route path="/" element={<DashboardPage />} />
                            <Route path="/patients" element={<PatientsPage />} />
                            <Route path="/patients/register" element={<RegisterPatientPage />} />
                        </Route>

                        {/* Patient Only Routes */}
                        <Route element={<ProtectedRoute roles={['PATIENT']} />}>
                            <Route path="/my-dashboard" element={<PatientDashboardPage />} />
                            <Route path="/reminders" element={<MedicineRemindersPage />} />
                        </Route>


                        {/* Caretaker Only Routes */}
                        <Route element={<ProtectedRoute roles={['CARETAKER']} />}>
                            <Route path="/caretaker-dashboard" element={<CaretakerDashboardPage />} />
                        </Route>
                    </Route>
                </Route>

                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        </div>
    );
}

export default App;
