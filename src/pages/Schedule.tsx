import React, { useEffect, useState } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Plus,
  AlertCircle,
  X,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../api';
import { Doctor, DoctorSchedule, ScheduleException, Appointment } from '../types';
import { CardSkeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import {
  CLINIC_TIMEZONE,
  createUtcFromZoned,
  getZonedDateParts,
  addZonedDays,
  formatClinicDateTime,
  getCurrentClinicDate,
} from '../utils/timezone';

export const Schedule: React.FC = () => {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [schedules, setSchedules] = useState<DoctorSchedule[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Manual Booking Modal
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [selectedSlotTime, setSelectedSlotTime] = useState<string>('');
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('+91');
  const [reason, setReason] = useState('');
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [alternativeSlots, setAlternativeSlots] = useState<any[]>([]);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);

  // Appointment Drawer / Detail Modal
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSchedules();
      setDoctors(data.doctors);
      setSchedules(data.schedules);
      setExceptions(data.exceptions);
      setAppointments(data.appointments);
      if (data.doctors.length > 0 && !selectedDoctorId) {
        setSelectedDoctorId(data.doctors[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeDoctor = doctors.find((d) => d.id === selectedDoctorId) || doctors[0];

  // Generate 7 days starting from current Monday in Asia/Kolkata
  const getWeekDays = () => {
    const todayClinicParts = getZonedDateParts(new Date(), CLINIC_TIMEZONE);
    const currentWeekday = todayClinicParts.weekday; // 0=Sun .. 6=Sat
    // Find distance to Monday (1)
    const distanceToMon = currentWeekday === 0 ? -6 : 1 - currentWeekday;

    const days: Array<{ dateStr: string; dayName: string; dayNum: string; weekday: number }> = [];
    for (let i = 0; i < 7; i++) {
      const targetDateStr = addZonedDays(todayClinicParts.dateString, distanceToMon + i);
      const targetDateObj = createUtcFromZoned(targetDateStr, '12:00', CLINIC_TIMEZONE);
      days.push({
        dateStr: targetDateStr,
        dayName: new Intl.DateTimeFormat('en-US', { timeZone: CLINIC_TIMEZONE, weekday: 'short' }).format(targetDateObj),
        dayNum: new Intl.DateTimeFormat('en-US', { timeZone: CLINIC_TIMEZONE, month: 'short', day: 'numeric' }).format(targetDateObj),
        weekday: (1 + i) % 7, // Mon=1 .. Sat=6, Sun=0
      });
    }
    return days;
  };

  const weekDays = getWeekDays();

  const handleSlotClick = (dateStr: string, timeStr: string) => {
    // Construct exact UTC instant from clinic-local date and time in Asia/Kolkata
    const utcDate = createUtcFromZoned(dateStr, timeStr, CLINIC_TIMEZONE);
    setSelectedSlotTime(utcDate.toISOString());
    setBookingError(null);
    setAlternativeSlots([]);
    setPatientName('');
    setPatientPhone('+91');
    setReason('');
    setBookingModalOpen(true);
  };

  const handleManualBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDoctor || !selectedSlotTime || !patientName || !patientPhone) return;

    setBookingSubmitting(true);
    setBookingError(null);
    setAlternativeSlots([]);

    try {
      await api.manualBookAppointment({
        doctorId: activeDoctor.id,
        patientName,
        phone: patientPhone,
        startsAt: selectedSlotTime,
        reason: reason || 'Manual front-desk booking',
      });
      setBookingModalOpen(false);
      loadData();
    } catch (err: any) {
      if (err.code === 'SLOT_TAKEN') {
        setBookingError('That slot was just taken by another patient.');
        if (err.data?.alternativeSlots) {
          setAlternativeSlots(err.data.alternativeSlots);
        }
      } else {
        setBookingError(err.message || 'Unable to book appointment');
      }
    } finally {
      setBookingSubmitting(false);
    }
  };

  const handleCancelAppointment = async (apt: Appointment) => {
    setActionError(null);
    try {
      const res = await fetch('/api/tools/cancel_appointment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmation_code: apt.confirmationCode,
          phone: apt.patientPhone || '+919876543210',
          reason: 'Cancelled via front desk dashboard',
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setActionError(data.message || 'Cancellation rejected');
        return;
      }
      setSelectedAppointment(null);
      loadData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to cancel');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex gap-2 pb-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 w-32 bg-slate-200 animate-pulse rounded-lg" />
          ))}
        </div>
        <CardSkeleton />
      </div>
    );
  }

  if (error || doctors.length === 0) {
    return <ErrorState message={error || 'No doctors found'} onRetry={loadData} />;
  }

  // Doctor working hours for selected doctor
  const doctorSchedules = schedules.filter((s) => s.doctorId === activeDoctor.id);
  const doctorExceptions = exceptions.filter((e) => e.doctorId === activeDoctor.id);

  // Time grid rows from 09:00 to 18:00
  const timeHours = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00', '17:30',
  ];

  return (
    <div className="space-y-6">
      {/* Doctor Tabs Filter (Functional segmented tabs) */}
      <div className="bg-white border border-slate-200 rounded-xl p-2 shadow-sm overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-max">
          {doctors.map((doc) => (
            <button
              key={doc.id}
              onClick={() => setSelectedDoctorId(doc.id)}
              className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                doc.id === activeDoctor.id
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{doc.name}</span>
              <span className="opacity-75 font-normal ml-1">({doc.specialty})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Doctor Info Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">{activeDoctor.name}</h2>
            <span className="text-slate-300">·</span>
            <span className="text-xs text-slate-600 font-medium">{activeDoctor.specialty}</span>
            <span className="text-slate-300">·</span>
            <span className="text-xs text-slate-500 font-mono">{activeDoctor.slotMinutes} min slots</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{activeDoctor.qualification}</p>
        </div>

        <div className="text-xs text-slate-500 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-teal-50 border border-teal-200" />
            <span>Available</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-indigo-50 border border-indigo-200" />
            <span>Booked</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-rose-50 border border-rose-200" />
            <span>On Leave</span>
          </div>
        </div>
      </div>

      {/* Weekly Schedule Grid */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-8 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
          <div className="p-3 text-center border-r border-slate-200 text-slate-400 font-mono">
            Time (IST)
          </div>
          {weekDays.map((day) => {
            const hasLeave = doctorExceptions.some((e) => e.date === day.dateStr && e.kind === 'off');
            return (
              <div
                key={day.dateStr}
                className={`p-3 text-center border-r border-slate-200 last:border-r-0 ${
                  hasLeave ? 'bg-rose-50/70 text-rose-900' : ''
                }`}
              >
                <div>{day.dayName}</div>
                <div className="text-[11px] font-normal text-slate-500">{day.dayNum}</div>
                {hasLeave && (
                  <span className="text-[10px] text-rose-700 font-medium block mt-0.5">Leave</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
          {timeHours.map((timeStr) => (
            <div key={timeStr} className="grid grid-cols-8 min-h-[48px]">
              {/* Time Column */}
              <div className="p-2 border-r border-slate-200 text-center text-xs font-mono text-slate-500 bg-slate-50/40 flex items-center justify-center">
                {timeStr}
              </div>

              {/* Day Columns */}
              {weekDays.map((day) => {
                const isLeaveDay = doctorExceptions.some((e) => e.date === day.dateStr && e.kind === 'off');

                // Check doctor schedule for this weekday
                const isWorkingDay = doctorSchedules.some(
                  (s) => s.weekday === day.weekday && s.startTime <= timeStr && s.endTime > timeStr
                );

                // Find booked appointment at this exact slot
                const appointmentAtSlot = appointments.find((a) => {
                  if (a.doctorId !== activeDoctor.id || a.status !== 'booked') return false;
                  const aptParts = getZonedDateParts(new Date(a.startsAt), CLINIC_TIMEZONE);
                  return aptParts.dateString === day.dateStr && aptParts.timeString === timeStr;
                });

                if (isLeaveDay) {
                  return (
                    <div
                      key={day.dateStr}
                      className="p-1 border-r border-slate-100 last:border-r-0 bg-rose-50/30 flex items-center justify-center"
                    >
                      <span className="text-[10px] text-rose-300 select-none">—</span>
                    </div>
                  );
                }

                if (appointmentAtSlot) {
                  return (
                    <div
                      key={day.dateStr}
                      onClick={() => setSelectedAppointment(appointmentAtSlot)}
                      className="p-1 border-r border-slate-100 last:border-r-0 bg-indigo-50/80 hover:bg-indigo-100 transition-colors cursor-pointer flex flex-col justify-center overflow-hidden"
                      title="Click to view appointment details"
                    >
                      <div className="text-[11px] font-bold text-indigo-900 truncate">
                        {appointmentAtSlot.patientName}
                      </div>
                      <div className="text-[10px] font-mono text-indigo-700 truncate">
                        {appointmentAtSlot.confirmationCode}
                      </div>
                    </div>
                  );
                }

                if (isWorkingDay) {
                  return (
                    <div
                      key={day.dateStr}
                      onClick={() => handleSlotClick(day.dateStr, timeStr)}
                      className="p-1 border-r border-slate-100 last:border-r-0 bg-teal-50/20 hover:bg-teal-50 transition-colors cursor-pointer flex items-center justify-center group"
                      title="Available. Click to book manually."
                    >
                      <Plus className="w-3.5 h-3.5 text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  );
                }

                // Off hours
                return (
                  <div
                    key={day.dateStr}
                    className="p-1 border-r border-slate-100 last:border-r-0 bg-slate-50/20"
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Manual Booking Modal */}
      {bookingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-sm font-bold text-slate-900">
                Book Appointment with {activeDoctor.name}
              </h3>
              <button
                onClick={() => setBookingModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {bookingError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 space-y-2">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{bookingError}</span>
                </div>
                {alternativeSlots.length > 0 && (
                  <div>
                    <span className="block text-[11px] font-medium text-slate-700 mb-1">
                      Available Alternatives:
                    </span>
                    <div className="space-y-1">
                      {alternativeSlots.map((slot, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setSelectedSlotTime(slot.startsAt);
                            setBookingError(null);
                          }}
                          className="w-full text-left p-1.5 bg-white border border-slate-200 rounded text-[11px] text-teal-800 hover:bg-teal-50"
                        >
                          {slot.humanText}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleManualBook} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Selected Slot Time (Asia/Kolkata)
                </label>
                <div className="w-full px-3 py-2 bg-teal-50 border border-teal-200 rounded-lg text-teal-900 font-medium text-xs flex flex-col gap-0.5">
                  <span className="font-semibold">{selectedSlotTime ? formatClinicDateTime(selectedSlotTime) : '—'}</span>
                  <span className="text-[10px] font-mono text-slate-500">
                    UTC Timestamp: {selectedSlotTime}
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Patient Full Name</label>
                <input
                  type="text"
                  required
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Mobile Phone Number</label>
                <input
                  type="tel"
                  required
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                  placeholder="+919876543210"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Reason / Symptoms</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Routine consultation"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBookingModalOpen(false)}
                  className="px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bookingSubmitting}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg shadow-sm"
                >
                  {bookingSubmitting ? 'Confirming...' : 'Confirm Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Appointment Detail Modal */}
      {selectedAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-teal-700">Appointment Record</span>
                <h3 className="text-sm font-bold text-slate-900 font-mono">
                  {selectedAppointment.confirmationCode}
                </h3>
              </div>
              <button
                onClick={() => setSelectedAppointment(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {actionError && (
              <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-xs">
                {actionError}
              </div>
            )}

            <div className="space-y-2.5 text-xs text-slate-600 mb-6">
              <div>
                <span className="font-semibold text-slate-800">Doctor:</span> {selectedAppointment.doctorName}
              </div>
              <div>
                <span className="font-semibold text-slate-800">Patient:</span> {selectedAppointment.patientName}
              </div>
              <div>
                <span className="font-semibold text-slate-800">Phone:</span>{' '}
                <span className="font-mono">{selectedAppointment.patientPhone}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-800">Time:</span>{' '}
                {new Intl.DateTimeFormat('en-US', {
                  timeZone: 'Asia/Kolkata',
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(selectedAppointment.startsAt))}
              </div>
              <div>
                <span className="font-semibold text-slate-800">Source:</span> {selectedAppointment.source}
              </div>
              {selectedAppointment.reason && (
                <div>
                  <span className="font-semibold text-slate-800">Reason:</span> {selectedAppointment.reason}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => handleCancelAppointment(selectedAppointment)}
                className="px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg"
              >
                Cancel Booking
              </button>
              <button
                onClick={() => setSelectedAppointment(null)}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
