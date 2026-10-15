import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { PublicHome } from './pages/PublicHome';
import { PublicDoctors } from './pages/PublicDoctors';
import { PatientLogin } from './pages/PatientLogin';
import { PatientSignup } from './pages/PatientSignup';
import { PatientDashboard } from './pages/PatientDashboard';
import { PatientAppointments } from './pages/PatientAppointments';
import { AdminLogin } from './pages/AdminLogin';
import { AdminPatients } from './pages/AdminPatients';
import { Overview } from './pages/Overview';
import { LiveDemo } from './pages/LiveDemo';
import { Schedule } from './pages/Schedule';
import { Appointments } from './pages/Appointments';
import { Calls } from './pages/Calls';
import { Evals } from './pages/Evals';
import { Settings } from './pages/Settings';
import { api } from './api';

function AdminLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isAdminAuth, setIsAdminAuth] = useState<boolean | null>(null);

  useEffect(() => {
    api.checkAdminAuth().then((auth) => {
      setIsAdminAuth(auth);
    }).catch(() => setIsAdminAuth(false));
  }, []);

  const handleLogout = async () => {
    await api.adminLogout();
    window.location.href = '/admin/login';
  };

  if (isAdminAuth === null) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-xs text-slate-500">Loading admin security...</div>;
  }

  if (!isAdminAuth) {
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased flex">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onLogout={handleLogout}
      />
      <div
        className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${
          sidebarCollapsed ? 'ml-16' : 'ml-64'
        }`}
      >
        <Header collapsed={sidebarCollapsed} />
        <main className="flex-1 mt-16 p-6 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<PublicHome />} />
        <Route path="/doctors" element={<PublicDoctors />} />
        <Route path="/login" element={<PatientLogin />} />
        <Route path="/signup" element={<PatientSignup />} />
        <Route path="/admin/login" element={<AdminLogin />} />

        {/* Patient Portal Routes */}
        <Route path="/patient/dashboard" element={<PatientDashboard />} />
        <Route path="/patient/appointments" element={<PatientAppointments />} />

        {/* Admin Portal Routes */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Overview />} />
          <Route path="live-demo" element={<LiveDemo />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="appointments" element={<Appointments />} />
          <Route path="patients" element={<AdminPatients />} />
          <Route path="calls" element={<Calls />} />
          <Route path="evals" element={<Evals />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
