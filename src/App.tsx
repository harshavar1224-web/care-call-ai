import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { AdminLoginModal } from './components/AdminLoginModal';
import { Overview } from './pages/Overview';
import { LiveDemo } from './pages/LiveDemo';
import { Schedule } from './pages/Schedule';
import { Appointments } from './pages/Appointments';
import { Calls } from './pages/Calls';
import { Evals } from './pages/Evals';
import { Settings } from './pages/Settings';
import { api } from './api';

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  useEffect(() => {
    api
      .checkAuth()
      .then((auth) => {
        setIsAuthenticated(auth);
        setLoginModalOpen(!auth);
      })
      .catch(() => {
        setIsAuthenticated(true);
      });
  }, []);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (e) {}
    setIsAuthenticated(false);
    setLoginModalOpen(true);
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    setLoginModalOpen(false);
  };

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased flex">
        {/* Collapsible Sidebar */}
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          onLogout={handleLogout}
        />

        {/* Main Content Area */}
        <div
          className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${
            sidebarCollapsed ? 'ml-16' : 'ml-64'
          }`}
        >
          {/* Top Bar Header */}
          <Header collapsed={sidebarCollapsed} />

          {/* Viewport Content */}
          <main className="flex-1 mt-16 p-6 max-w-7xl w-full mx-auto">
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/live-demo" element={<LiveDemo />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/appointments" element={<Appointments />} />
              <Route path="/calls" element={<Calls />} />
              <Route path="/evals" element={<Evals />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>

        {/* Admin Password Authentication Gate Modal */}
        <AdminLoginModal
          isOpen={loginModalOpen}
          onSuccess={handleLoginSuccess}
        />
      </div>
    </BrowserRouter>
  );
}
