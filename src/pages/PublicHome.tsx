import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Stethoscope, Calendar, Shield, PhoneCall, Clock, MapPin, Sparkles, User, Lock } from 'lucide-react';
import { api } from '../api';
import { ClinicInfo, Doctor } from '../types';

export const PublicHome: React.FC = () => {
  const [clinic, setClinic] = useState<ClinicInfo | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.getPublicClinic().then((res) => setClinic(res.clinic)).catch(() => {});
    api.getPublicDoctors().then((res) => setDoctors(res.doctors)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 px-6 py-4 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold shadow-sm">
            CC
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">
              {clinic?.name || 'CityCare Multispecialty Clinic'}
            </h1>
            <p className="text-xs text-slate-500 font-mono">
              Bengaluru, India · Asia/Kolkata Timezone
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/doctors"
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
          >
            Find Doctors
          </Link>
          <Link
            to="/login"
            className="px-4 py-2 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-all flex items-center gap-1.5"
          >
            <User className="w-3.5 h-3.5" />
            <span>Patient Login</span>
          </Link>
          <Link
            to="/signup"
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm transition-all"
          >
            Sign Up
          </Link>
          <Link
            to="/admin/login"
            className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-900 rounded-lg transition-all flex items-center gap-1"
            title="Admin Portal"
          >
            <Lock className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-teal-900 to-slate-900 text-white py-20 px-6 text-center relative overflow-hidden">
        <div className="max-w-4xl mx-auto space-y-6 relative z-10">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-800/80 border border-teal-700 text-teal-200 text-xs font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            AI-Powered Voice Reception & Instant Patient Portal
          </span>
          <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            Exceptional Healthcare, Seamlessly Booked
          </h2>
          <p className="text-slate-300 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
            Consult Bengaluru's top specialists in General Medicine, Cardiology, Pediatrics, Dermatology, and more. Book online instantly or call our AI voice receptionist Maya 24/7.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <Link
              to="/signup"
              className="px-6 py-3 bg-teal-500 hover:bg-teal-600 text-white font-semibold text-sm rounded-xl shadow-lg transition-all flex items-center gap-2"
            >
              <Calendar className="w-4 h-4" />
              <span>Book Appointment Now</span>
            </Link>
            <Link
              to="/doctors"
              className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm rounded-xl border border-white/20 transition-all"
            >
              Browse Doctor Directory
            </Link>
          </div>
        </div>
      </section>

      {/* Clinic Info Highlights */}
      <section className="max-w-7xl mx-auto px-6 -mt-10 relative z-20 grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-md flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Working Hours</h3>
            <p className="text-xs text-slate-600 mt-1">Mon - Sat: 8:00 AM - 8:00 PM IST</p>
            <p className="text-[11px] text-teal-700 font-medium mt-1">Closed on Sundays</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-md flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Location</h3>
            <p className="text-xs text-slate-600 mt-1">{clinic?.address || 'Indiranagar, Bengaluru'}</p>
            <p className="text-[11px] text-slate-400 font-mono mt-1">Phone: {clinic?.phone || '+91 80 4123 4567'}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-md flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Secure & Verified</h3>
            <p className="text-xs text-slate-600 mt-1">Atomic double-booking prevention & instant confirmation codes.</p>
          </div>
        </div>
      </section>

      {/* Featured Doctors */}
      <section className="max-w-7xl mx-auto px-6 py-12 flex-1 w-full">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-xl font-bold text-slate-900">Our Medical Specialists</h3>
            <p className="text-xs text-slate-500 mt-0.5">Experienced specialists dedicated to your family's health.</p>
          </div>
          <Link to="/doctors" className="text-xs font-semibold text-teal-700 hover:underline">
            View All Doctors →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {doctors.slice(0, 6).map((doc) => (
            <div key={doc.id} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-semibold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-full">
                    {doc.specialty}
                  </span>
                  <span className="text-xs font-mono text-slate-400">{doc.slotMinutes} min slot</span>
                </div>
                <h4 className="font-bold text-slate-900 text-base">{doc.name}</h4>
                <p className="text-xs text-slate-500 mt-1">{doc.qualification || 'MBBS, MD Specialist'}</p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Available This Week
                </span>
                <Link
                  to="/login"
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-all"
                >
                  Book Visit
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-8 px-6 text-center text-xs border-t border-slate-800 mt-16">
        <p>© 2026 {clinic?.name || 'CityCare Multispecialty Clinic'}. All rights reserved. Configured for Asia/Kolkata (IST).</p>
      </footer>
    </div>
  );
};
