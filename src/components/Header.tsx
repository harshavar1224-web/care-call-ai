import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Mic, ShieldCheck, Activity } from 'lucide-react';

interface HeaderProps {
  collapsed: boolean;
  dbStatus?: string;
}

export const Header: React.FC<HeaderProps> = ({ collapsed, dbStatus = 'healthy' }) => {
  const location = useLocation();

  const getBreadcrumb = () => {
    switch (location.pathname) {
      case '/':
        return 'Overview';
      case '/live-demo':
        return 'Live Voice Agent Demo';
      case '/schedule':
        return 'Doctor Weekly Schedule';
      case '/appointments':
        return 'Appointment Registry';
      case '/calls':
        return 'Voice Call Transcripts';
      case '/evals':
        return 'Evaluation Suite & Rubrics';
      case '/settings':
        return 'Clinic Settings & Environment';
      default:
        return 'Clinic Operations';
    }
  };

  return (
    <header
      className={`fixed top-0 right-0 z-30 h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 transition-all duration-300 flex items-center justify-between px-6 ${
        collapsed ? 'left-16' : 'left-64'
      }`}
    >
      {/* Zone 1: Breadcrumb Trail */}
      <div className="flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap overflow-hidden">
        <span className="font-medium text-slate-700">CareCall</span>
        <span className="text-slate-300">/</span>
        <span className="font-semibold text-slate-900">{getBreadcrumb()}</span>
      </div>

      {/* Zone 2 & 3: Database status & Primary Action */}
      <div className="flex items-center gap-4 shrink-0">
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-600 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
          <ShieldCheck className="w-3.5 h-3.5 text-teal-600 shrink-0" />
          <span>Exclusion Engine: Active</span>
          <span className="text-slate-300">·</span>
          <span className="font-mono text-[11px] text-slate-500">Asia/Kolkata</span>
        </div>

        {location.pathname !== '/live-demo' && (
          <Link
            to="/live-demo"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors whitespace-nowrap shrink-0"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Launch Voice Demo</span>
          </Link>
        )}
      </div>
    </header>
  );
};
