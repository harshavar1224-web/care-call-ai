import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PhoneCall,
  CalendarCheck,
  TrendingUp,
  Clock,
  ArrowRight,
  User,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { api } from '../api';
import { OverviewData } from '../types';
import { CardSkeleton, TableSkeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';

export const Overview: React.FC = () => {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getOverview();
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load clinic overview');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm h-72 animate-pulse" />
        <TableSkeleton rows={4} />
      </div>
    );
  }

  if (error || !data) {
    return <ErrorState message={error || 'Failed to load dashboard metrics'} onRetry={loadData} />;
  }

  const { kpis, bookingsOverTime, upcomingAppointments, recentCalls } = data;

  return (
    <div className="space-y-6">
      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Calls Today</span>
            <PhoneCall className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {kpis.callsToday}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Processed by Maya voice agent</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Bookings Today</span>
            <CalendarCheck className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {kpis.bookingsToday}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Confirmed with exclusion lock</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Booking Success Rate</span>
            <TrendingUp className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {kpis.bookingSuccessRate}%
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Completed voice scheduling</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Avg Call Duration</span>
            <Clock className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {kpis.avgDurationS}s
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Optimal caller experience</p>
        </div>
      </div>

      {/* Bookings & Calls Over Time Chart */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Booking Activity (Past 7 Days)</h3>
            <p className="text-xs text-slate-500">Daily appointment volume compared with inbound calls</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-600" />
              <span>Bookings</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
              <span>Inbound Calls</span>
            </div>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={bookingsOverTime} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="tealGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0D9488" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="indigoGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0F172A',
                  color: '#FFFFFF',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '12px',
                }}
              />
              <Area type="monotone" dataKey="calls" stroke="#6366F1" strokeWidth={2} fillOpacity={1} fill="url(#indigoGrad)" />
              <Area type="monotone" dataKey="bookings" stroke="#0D9488" strokeWidth={2} fillOpacity={1} fill="url(#tealGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Two Column Section: Upcoming Appointments & Recent Calls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Appointments */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Upcoming Appointments</h3>
            <Link to="/appointments" className="text-xs text-teal-600 hover:text-teal-700 font-medium inline-flex items-center gap-1">
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100 flex-1">
            {upcomingAppointments.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No upcoming appointments scheduled.</p>
            ) : (
              upcomingAppointments.map((apt) => (
                <div key={apt.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 truncate">
                      {apt.patientName}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {apt.doctorName} · {apt.doctorSpecialty}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono font-medium text-slate-900 tabular-nums">
                      {new Intl.DateTimeFormat('en-US', {
                        timeZone: 'Asia/Kolkata',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      }).format(new Date(apt.startsAt))}
                    </div>
                    <span className="text-[11px] font-mono text-teal-700">
                      {apt.confirmationCode}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Calls */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Recent Voice Inquiries</h3>
            <Link to="/calls" className="text-xs text-teal-600 hover:text-teal-700 font-medium inline-flex items-center gap-1">
              <span>View Logs</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100 flex-1">
            {recentCalls.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No recent voice calls recorded.</p>
            ) : (
              recentCalls.map((call) => (
                <div key={call.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-900 truncate font-mono">
                      {call.fromNumber ? call.fromNumber : 'Web Simulator Call'}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {call.analysis?.booking_successful ? 'Appointment Confirmed' : 'General Inquiry'} · {call.durationS || 0}s duration
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[11px] text-slate-400">
                      {new Intl.DateTimeFormat('en-US', {
                        timeZone: 'Asia/Kolkata',
                        hour: 'numeric',
                        minute: '2-digit',
                      }).format(new Date(call.startedAt || call.createdAt))}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
