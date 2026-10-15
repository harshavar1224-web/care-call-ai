import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, Clock, Stethoscope, User, LogOut, CheckCircle2, Sparkles, AlertCircle, Edit3, X } from 'lucide-react';
import { api } from '../api';
import { Doctor } from '../types';

export const PatientDashboard: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoad] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [successBooking, setSuccessBooking] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);

  const navigate = useNavigate();

  const loadUserProfile = async () => {
    try {
      const res = await api.getPatientProfile();
      if (res.ok && res.patient) {
        setUser(res.patient);
        setEditName(res.patient.name || '');
        setEditEmail(res.patient.email || '');
        setEditPhone(res.patient.phone || '');
      }
    } catch {
      // fallback to auth check
      api.checkPatientAuth().then((res) => {
        if (!res.authenticated) {
          navigate('/login');
        } else {
          setUser(res.user);
          setEditName(res.user?.name || '');
          setEditEmail(res.user?.email || '');
        }
      }).catch(() => navigate('/login'));
    }
  };

  useEffect(() => {
    loadUserProfile().finally(() => setLoad(false));

    api.getPublicDoctors().then((res) => {
      setDoctors(res.doctors);
      if (res.doctors.length > 0) {
        setSelectedDoctorId(res.doctors[0].id);
      }
    }).catch(() => {});
  }, [navigate]);

  useEffect(() => {
    if (selectedDoctorId) {
      api.getPublicAvailability({ doctorId: selectedDoctorId })
        .then((res) => {
          const docMatch = res.availability.find((a) => a.doctor.id === selectedDoctorId);
          setAvailableSlots(docMatch ? docMatch.slots : []);
          setSelectedSlot(null);
        })
        .catch(() => setAvailableSlots([]));
    }
  }, [selectedDoctorId]);

  const handleLogout = async () => {
    await api.logoutPatient();
    navigate('/login');
  };

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot || !selectedDoctorId) {
      setError('Please select an available doctor and time slot.');
      return;
    }
    setError(null);
    setBookingLoading(true);
    try {
      const res = await api.bookPatientAppointment({
        doctorId: selectedDoctorId,
        startsAt: selectedSlot,
        reason,
      });
      setSuccessBooking(res.appointment);
      setReason('');
      setSelectedSlot(null);
    } catch (err: any) {
      setError(err.message || 'Failed to book appointment');
    } finally {
      setBookingLoading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileSuccess(null);
    setError(null);
    try {
      const res = await api.updatePatientProfile({
        name: editName,
        email: editEmail,
        phone: editPhone,
      });
      setUser(res.patient);
      setProfileSuccess('Profile updated successfully!');
      setIsEditingProfile(false);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-40 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold">
            CC
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">Patient Portal</h1>
            <p className="text-xs text-slate-500">Welcome, {user?.name || 'Patient'} · Asia/Kolkata (IST)</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/patient/appointments"
            className="px-4 py-2 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-all"
          >
            My Appointments
          </Link>
          <button
            onClick={handleLogout}
            className="p-2 text-slate-500 hover:text-red-600 rounded-lg transition-all cursor-pointer"
            title="Sign out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 flex-1 w-full space-y-6">
        {successBooking && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 shadow-sm flex items-start gap-4">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-bold text-emerald-900 text-sm">Appointment Successfully Booked!</h3>
              <p className="text-xs text-emerald-700 mt-0.5">
                Confirmation Code: <span className="font-mono font-bold text-emerald-900 text-sm">{successBooking.confirmationCode}</span>
              </p>
              <p className="text-xs text-slate-600 mt-2">
                Dr. {successBooking.doctorName} ({successBooking.doctorSpecialty}) · {new Date(successBooking.startsAt).toLocaleString('en-US', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' })} IST
              </p>
            </div>
            <button
              onClick={() => setSuccessBooking(null)}
              className="text-xs font-semibold text-emerald-800 hover:underline cursor-pointer"
            >
              Book Another
            </button>
          </div>
        )}

        {profileSuccess && (
          <div className="bg-teal-50 border border-teal-200 text-teal-800 px-4 py-3 rounded-lg text-xs flex items-center justify-between">
            <span>{profileSuccess}</span>
            <button onClick={() => setProfileSuccess(null)} className="font-bold hover:opacity-75">×</button>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Booking Form / Slot Selector */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
            <div>
              <h2 className="text-base font-bold text-slate-900">Book a Consultation</h2>
              <p className="text-xs text-slate-500 mt-0.5">Select a specialist and choose from real-time available slots.</p>
            </div>

            <form onSubmit={handleBook} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Specialist</label>
                <select
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-teal-600"
                >
                  {doctors.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.name} — {doc.specialty} ({doc.slotMinutes}m slots)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Available Slots (Asia/Kolkata IST)</label>
                {availableSlots.length === 0 ? (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 text-center">
                    No open slots found for this doctor in the upcoming days.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1">
                    {availableSlots.map((slot, idx) => {
                      const isSelected = selectedSlot === slot.startsAt;
                      const formattedTime = new Date(slot.startsAt).toLocaleString('en-US', {
                        timeZone: 'Asia/Kolkata',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      });
                      return (
                        <button
                          type="button"
                          key={idx}
                          onClick={() => setSelectedSlot(slot.startsAt)}
                          className={`p-2.5 text-xs font-mono rounded-lg border text-center transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {formattedTime}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Visit / Symptoms</label>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Describe your symptoms or reason for visit..."
                  className="w-full p-3 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600"
                />
              </div>

              <button
                type="submit"
                disabled={bookingLoading || !selectedSlot}
                className="w-full py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
              >
                {bookingLoading ? 'Confirming Booking...' : 'Confirm and Book Appointment'}
              </button>
            </form>
          </div>

          {/* Quick Stats / Sidebar / Profile */}
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Patient Profile</h3>
                <button
                  onClick={() => setIsEditingProfile(true)}
                  className="text-xs text-teal-700 hover:text-teal-800 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit Profile
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Name</span>
                  <span className="font-medium text-slate-900">{user?.name}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Email</span>
                  <span className="font-medium text-slate-900">{user?.email}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Phone</span>
                  <span className="font-medium text-slate-900">{user?.phone || 'Not set'}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Role</span>
                  <span className="font-medium text-teal-700 uppercase">Patient</span>
                </div>
              </div>

              <Link
                to="/patient/appointments"
                className="block w-full text-center py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-all"
              >
                View My Appointments History
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* Edit Profile Modal */}
      {isEditingProfile && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Edit Patient Profile</h3>
              <button
                onClick={() => setIsEditingProfile(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm cursor-pointer"
                >
                  {profileSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
