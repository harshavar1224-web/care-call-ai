import { describe, it, expect, beforeEach } from 'vitest';
import {
  CLINIC_TIMEZONE,
  createUtcFromZoned,
  getZonedDateParts,
  formatHumanVoiceSlot,
  formatClinicDisplayDateTime,
  formatClinicTimeOnly,
  addZonedDays,
  getCurrentClinicDate,
} from '../server/utils/timezone';
import {
  computeDoctorAvailability,
  DoctorProfile,
  DoctorSchedule,
} from '../server/availability';
import { repository } from '../server/db/repository';

describe('Clinic Timezone Verification (Asia/Kolkata - IST, UTC+05:30)', () => {
  beforeEach(() => {
    repository.resetToSeedData();
  });

  // ==========================================================================
  // 1. 10:00 AM IST is stored and interpreted as the correct UTC instant
  // ==========================================================================
  describe('1. 10:00 AM IST UTC Instant Conversion & Storage', () => {
    it('accurately resolves 10:00 AM IST to 04:30 AM UTC (exact +05:30 offset)', () => {
      const dateStr = '2026-10-19'; // Monday
      const timeStr = '10:00';      // 10:00 AM IST

      const utcInstant = createUtcFromZoned(dateStr, timeStr, CLINIC_TIMEZONE);
      // 10:00 AM minus 5h30m = 04:30 AM UTC
      expect(utcInstant.toISOString()).toBe('2026-10-19T04:30:00.000Z');

      // Round-trip verification: Converting UTC instant back into Asia/Kolkata parts
      const parts = getZonedDateParts(utcInstant, CLINIC_TIMEZONE);
      expect(parts.year).toBe(2026);
      expect(parts.month).toBe('10');
      expect(parts.day).toBe('19');
      expect(parts.hour).toBe(10);
      expect(parts.minute).toBe(0);
      expect(parts.weekday).toBe(1); // Monday
      expect(parts.dateString).toBe('2026-10-19');
      expect(parts.timeString).toBe('10:00');
    });

    it('stores appointment with exact timestamptz UTC instant and retrieves it with local IST representation', async () => {
      const startsAt = createUtcFromZoned('2026-11-02', '10:00', CLINIC_TIMEZONE).toISOString();
      expect(startsAt).toBe('2026-11-02T04:30:00.000Z');

      const booked = await repository.bookAppointment({
        doctorId: 'b0000000-0000-0000-0000-000000000001',
        patientName: 'Vikram Malhotra',
        phone: '+919876500001',
        startsAt,
        reason: 'Health Checkup',
      });

      expect(booked.appointment.startsAt).toBe('2026-11-02T04:30:00.000Z');
      expect(booked.appointment.endsAt).toBe('2026-11-02T05:00:00.000Z'); // 30-min slot

      // Formatted in clinic timezone gives 10:00 AM IST
      const voiceText = formatHumanVoiceSlot(booked.appointment.startsAt, CLINIC_TIMEZONE);
      expect(voiceText).toContain('10:00 AM');
      expect(voiceText).toContain('IST');
      expect(voiceText).toContain('November 2');
    });
  });

  // ==========================================================================
  // 2. Availability is calculated using the clinic's local working hours
  // ==========================================================================
  describe("2. Clinic Local Working Hours Availability Calculation", () => {
    it("calculates slots adhering strictly to doctor's local IST shifts (not UTC)", () => {
      const sampleDoctor: DoctorProfile = {
        id: 'doc-ist-1',
        name: 'Dr. Local Hours',
        specialty: 'General Physician',
        slotMinutes: 30,
        active: true,
      };

      // Monday local shift: 09:00 - 11:00 IST
      const mondaySchedule: DoctorSchedule[] = [
        {
          id: 'sch-ist-1',
          doctorId: 'doc-ist-1',
          weekday: 1, // Monday
          startTime: '09:00',
          endTime: '11:00',
        },
      ];

      // Monday 2026-10-19
      const slots = computeDoctorAvailability({
        doctor: sampleDoctor,
        schedules: mondaySchedule,
        exceptions: [],
        bookedAppointments: [],
        dateFrom: '2026-10-19',
        dateTo: '2026-10-19',
        clinicTimezone: CLINIC_TIMEZONE,
        now: new Date('2026-10-18T00:00:00.000Z'),
        maxSlots: 10,
      });

      expect(slots.length).toBe(4);
      // Local times must be 09:00, 09:30, 10:00, 10:30 IST
      expect(slots.map((s) => s.localTime)).toEqual(['09:00', '09:30', '10:00', '10:30']);

      // Corresponding UTC start times must be:
      // 09:00 IST -> 03:30 UTC
      // 09:30 IST -> 04:00 UTC
      // 10:00 IST -> 04:30 UTC
      // 10:30 IST -> 05:00 UTC
      expect(slots[0].startsAt).toBe('2026-10-19T03:30:00.000Z');
      expect(slots[1].startsAt).toBe('2026-10-19T04:00:00.000Z');
      expect(slots[2].startsAt).toBe('2026-10-19T04:30:00.000Z');
      expect(slots[3].startsAt).toBe('2026-10-19T05:00:00.000Z');
    });

    it('returns zero slots for Sundays when clinic is closed locally', () => {
      const sampleDoctor: DoctorProfile = {
        id: 'doc-ist-1',
        name: 'Dr. Rajesh Rao',
        specialty: 'General Physician',
        slotMinutes: 30,
        active: true,
      };

      // Monday-Saturday only
      const weekdaySchedules: DoctorSchedule[] = [1, 2, 3, 4, 5, 6].map((w) => ({
        id: `sch-${w}`,
        doctorId: 'doc-ist-1',
        weekday: w,
        startTime: '09:00',
        endTime: '13:00',
      }));

      // 2026-10-25 is a Sunday in Asia/Kolkata
      const sundaySlots = computeDoctorAvailability({
        doctor: sampleDoctor,
        schedules: weekdaySchedules,
        exceptions: [],
        bookedAppointments: [],
        dateFrom: '2026-10-25',
        dateTo: '2026-10-25',
        clinicTimezone: CLINIC_TIMEZONE,
        now: new Date('2026-10-24T00:00:00.000Z'),
      });

      expect(sundaySlots.length).toBe(0);
    });
  });

  // ==========================================================================
  // 3. Appointments display in IST even if the server runs in UTC
  // ==========================================================================
  describe('3. Display in IST Independent of Server System Timezone', () => {
    it('formats UTC ISO timestamp into explicit IST appointment display regardless of local environment', () => {
      // 2026-10-19T04:30:00.000Z is 10:00 AM IST
      const appointmentUtc = '2026-10-19T04:30:00.000Z';

      const display = formatClinicDisplayDateTime(appointmentUtc, CLINIC_TIMEZONE);
      expect(display).toContain('Oct 19, 2026');
      expect(display).toContain('10:00 AM');
      expect(display).toContain('IST');

      const timeOnly = formatClinicTimeOnly(appointmentUtc, CLINIC_TIMEZONE);
      expect(timeOnly).toBe('10:00 AM IST');

      const spokenSlot = formatHumanVoiceSlot(appointmentUtc, CLINIC_TIMEZONE);
      expect(spokenSlot).toContain('Monday');
      expect(spokenSlot).toContain('October 19');
      expect(spokenSlot).toContain('10:00 AM');
      expect(spokenSlot).toContain('IST');
    });
  });

  // ==========================================================================
  // 4. Relative dates crossing UTC midnight resolve to correct clinic-local date
  // ==========================================================================
  describe('4. Relative Dates Crossing UTC Midnight Boundaries', () => {
    it('correctly shifts to the next clinic calendar day when UTC is in late evening', () => {
      // At 20:00 UTC on 2026-10-19:
      // In Asia/Kolkata (+05:30), 20:00 + 5h30m = 01:30 AM on 2026-10-20 (Tuesday)
      const lateEveningUtc = new Date('2026-10-19T20:00:00.000Z');

      const parts = getZonedDateParts(lateEveningUtc, CLINIC_TIMEZONE);
      expect(parts.dateString).toBe('2026-10-20');
      expect(parts.hour).toBe(1);
      expect(parts.minute).toBe(30);
      expect(parts.weekday).toBe(2); // Tuesday
    });

    it('correctly identifies the exact midnight boundary in IST', () => {
      // At 18:30:00 UTC on 2026-10-19:
      // 18:30 + 05:30 = 00:00:00 (exact midnight start of 2026-10-20 in Asia/Kolkata)
      const exactMidnightUtc = new Date('2026-10-19T18:30:00.000Z');
      const midnightParts = getZonedDateParts(exactMidnightUtc, CLINIC_TIMEZONE);
      expect(midnightParts.dateString).toBe('2026-10-20');
      expect(midnightParts.hour).toBe(0);
      expect(midnightParts.minute).toBe(0);

      // At 18:29:59 UTC on 2026-10-19:
      // One second prior to midnight in Asia/Kolkata (still 2026-10-19 at 23:59:59)
      const preMidnightUtc = new Date('2026-10-19T18:29:59.000Z');
      const preMidnightParts = getZonedDateParts(preMidnightUtc, CLINIC_TIMEZONE);
      expect(preMidnightParts.dateString).toBe('2026-10-19');
      expect(preMidnightParts.hour).toBe(23);
      expect(preMidnightParts.minute).toBe(59);
    });

    it('addZonedDays operates on local clinic dates without UTC offset distortion', () => {
      const baseDate = '2026-10-31';
      const nextDay = addZonedDays(baseDate, 1);
      expect(nextDay).toBe('2026-11-01');

      const prevDay = addZonedDays(baseDate, -1);
      expect(prevDay).toBe('2026-10-30');
    });
  });

  // ==========================================================================
  // 5. Booking and double-booking protection continue to work correctly
  // ==========================================================================
  describe('5. Concurrency & Double-Booking Protection with Timestamptz', () => {
    it('allows booking a slot in IST and rejects conflicting overlapping bookings with SLOT_TAKEN (23P01)', async () => {
      const doctorId = 'b0000000-0000-0000-0000-000000000001'; // Dr. Rajesh Rao
      // Book Nov 2, 2026 at 10:00 AM IST (04:30 UTC)
      const slotUtc = createUtcFromZoned('2026-11-02', '10:00', CLINIC_TIMEZONE).toISOString();

      // First booking succeeds
      const firstBooking = await repository.bookAppointment({
        doctorId,
        patientName: 'Karan Mehra',
        phone: '+919876511111',
        startsAt: slotUtc,
        reason: 'Consultation',
      });
      expect(firstBooking.appointment.status).toBe('booked');
      expect(firstBooking.appointment.confirmationCode).toMatch(/^APT-\d{4}$/);

      // Second booking for the exact same slot MUST throw SLOT_TAKEN (23P01)
      let conflictError: any = null;
      try {
        await repository.bookAppointment({
          doctorId,
          patientName: 'Ritu Sen',
          phone: '+919876522222',
          startsAt: slotUtc,
          reason: 'Fever',
        });
      } catch (err: any) {
        conflictError = err;
      }

      expect(conflictError).not.toBeNull();
      expect(conflictError.code).toBe('SLOT_TAKEN');
      expect(conflictError.sqlstate).toBe('23P01');

      // Next consecutive non-overlapping slot (10:30 AM IST / 05:00 UTC) must succeed
      const nextSlotUtc = createUtcFromZoned('2026-11-02', '10:30', CLINIC_TIMEZONE).toISOString();
      const adjacentBooking = await repository.bookAppointment({
        doctorId,
        patientName: 'Ritu Sen',
        phone: '+919876522222',
        startsAt: nextSlotUtc,
        reason: 'Fever',
      });
      expect(adjacentBooking.appointment.status).toBe('booked');
      expect(adjacentBooking.appointment.startsAt).toBe(nextSlotUtc);
    });
  });
});
