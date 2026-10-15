import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, Clock, ArrowLeft, XCircle, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../api';
import { Appointment } from '../types';

export const PatientAppointments: React.FC = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadAppointments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPatientAppointments();
      setAppointments(res.appointments);
    } catch (err: any) {
      if (err.status === 401) {
        navigate('/login');
      } else {
        setError(err.message || 'Failed to load appointments');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAppointments();
  }, []);

  const handleCancel = async (id: string) => {
    if (!window.confirm('Are you sure you want to cancel this appointment?')) return;
    try {
      await api.cancelPatientAppointment(id);
      await loadAppointments();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel appointment');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <Link to="/patient/dashboard" className="text-slate-500 hover:text-slate-900 p-1 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-base font-bold text-slate-900">My Appointments</h1>
        </div>
        <Link
          to="/patient/dashboard"
          className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm"
        >
          Book New Appointment
        </Link>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 flex-1 w-full space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-slate-400 text-xs">Loading your appointments...</div>
        ) : appointments.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
            <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="font-bold text-slate-800 text-sm">No Appointments Found</h3>
            <p className="text-xs text-slate-500">You haven't booked any appointments yet.</p>
            <Link
              to="/patient/dashboard"
              className="inline-block mt-2 px-4 py-2 bg-teal-600 text-white text-xs font-semibold rounded-lg"
            >
              Book First Appointment
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {appointments.map((apt) => {
              const isBooked = apt.status === 'booked';
              const dateStr = new Date(apt.startsAt).toLocaleString('en-US', {
                timeZone: 'Asia/Kolkata',
                dateStyle: 'full',
                timeStyle: 'short',
              });

              return (
                <div key={apt.id} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded border border-teal-200">
                        {apt.confirmationCode}
                      </span>
                      <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded uppercase ${
                        apt.status === 'booked' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                        apt.status === 'cancelled' ? 'bg-rose-50 text-rose-800 border border-rose-200' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {apt.status}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono uppercase bg-slate-100 px-2 py-0.5 rounded">
                        Source: {apt.source}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900 mt-1">
                      {apt.doctorName || 'Doctor'} · <span className="text-teal-700 text-xs font-semibold">{apt.doctorSpecialty}</span>
                    </h3>

                    <p className="text-xs text-slate-600 flex items-center gap-1.5 font-medium">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{dateStr} IST</span>
                    </p>

                    {apt.reason && (
                      <p className="text-xs text-slate-500 mt-1">
                        Reason: {apt.reason}
                      </p>
                    )}
                  </div>

                  {isBooked && (
                    <button
                      onClick={() => handleCancel(apt.id)}
                      className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Cancel Appointment</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
