import { describe, it, expect } from 'vitest';
import {
  computeDoctorAvailability,
  createUtcFromZoned,
  getZonedDateParts,
  formatHumanVoiceSlot,
  DoctorProfile,
  DoctorSchedule,
  ScheduleException,
  BookedSlot,
} from '../server/availability';

describe('CareCall Availability Engine', () => {
  const sampleDoctor: DoctorProfile = {
    id: 'doc-001',
    name: 'Dr. Rajesh Rao',
    specialty: 'General Physician',
    slotMinutes: 30,
    active: true,
  };

  // Monday schedule: 09:00 - 11:00 (4 x 30m slots: 09:00, 09:30, 10:00, 10:30)
  // weekday 1 = Monday
  const sampleSchedules: DoctorSchedule[] = [
    {
      id: 'sch-1',
      doctorId: 'doc-001',
      weekday: 1,
      startTime: '09:00',
      endTime: '11:00',
    },
  ];

  it('1. Asia/Kolkata to UTC conversion handles UTC+05:30 offset properly', () => {
    // 2026-10-19 is a Monday
    // 09:00 AM IST should be 03:30 AM UTC on the same day
    const utcDate = createUtcFromZoned('2026-10-19', '09:00', 'Asia/Kolkata');
    expect(utcDate.toISOString()).toBe('2026-10-19T03:30:00.000Z');

    // And reverse check with getZonedDateParts
    const parts = getZonedDateParts(utcDate, 'Asia/Kolkata');
    expect(parts.dateString).toBe('2026-10-19');
    expect(parts.hour).toBe(9);
    expect(parts.minute).toBe(0);
    expect(parts.weekday).toBe(1); // Monday
  });

  it('2. Leave day: returns zero slots when doctor has an "off" exception', () => {
    const exceptions: ScheduleException[] = [
      {
        id: 'exc-1',
        doctorId: 'doc-001',
        date: '2026-10-19',
        kind: 'off',
        reason: 'Attending medical conference',
      },
    ];

    const slots = computeDoctorAvailability({
      doctor: sampleDoctor,
      schedules: sampleSchedules,
      exceptions,
      bookedAppointments: [],
      dateFrom: '2026-10-19',
      dateTo: '2026-10-19',
      now: new Date('2026-10-18T00:00:00Z'),
    });

    expect(slots.length).toBe(0);
  });

  it('3. Back-to-back slots: yields exact non-overlapping consecutive slot intervals', () => {
    const slots = computeDoctorAvailability({
      doctor: sampleDoctor,
      schedules: sampleSchedules,
      exceptions: [],
      bookedAppointments: [],
      dateFrom: '2026-10-19',
      dateTo: '2026-10-19',
      now: new Date('2026-10-18T00:00:00Z'),
    });

    // 09:00 - 11:00 with 30m slots = 4 slots
    expect(slots.length).toBe(4);
    expect(slots[0].localTime).toBe('09:00');
    expect(slots[1].localTime).toBe('09:30');
    expect(slots[2].localTime).toBe('10:00');
    expect(slots[3].localTime).toBe('10:30');

    // Slot 0 ends exactly when Slot 1 starts
    expect(slots[0].endsAt).toBe(slots[1].startsAt);
    expect(slots[1].endsAt).toBe(slots[2].startsAt);
    expect(slots[2].endsAt).toBe(slots[3].startsAt);
  });

  it('4. Partial overlap: booked appointment excludes only conflicting slot and leaves adjacent slots open', () => {
    // Book 09:30 - 10:00
    const bookedAppointments: BookedSlot[] = [
      {
        id: 'apt-1',
        doctorId: 'doc-001',
        startsAt: '2026-10-19T04:00:00.000Z', // 09:30 IST
        endsAt: '2026-10-19T04:30:00.000Z',   // 10:00 IST
        status: 'booked',
      },
    ];

    const slots = computeDoctorAvailability({
      doctor: sampleDoctor,
      schedules: sampleSchedules,
      exceptions: [],
      bookedAppointments,
      dateFrom: '2026-10-19',
      dateTo: '2026-10-19',
      now: new Date('2026-10-18T00:00:00Z'),
    });

    // Should return 3 slots: 09:00, 10:00, 10:30 (09:30 is booked)
    expect(slots.map((s) => s.localTime)).toEqual(['09:00', '10:00', '10:30']);
  });

  it('5. Cancelled appointments do NOT block availability', () => {
    const bookedAppointments: BookedSlot[] = [
      {
        id: 'apt-cancelled',
        doctorId: 'doc-001',
        startsAt: '2026-10-19T04:00:00.000Z', // 09:30 IST
        endsAt: '2026-10-19T04:30:00.000Z',
        status: 'cancelled',
      },
    ];

    const slots = computeDoctorAvailability({
      doctor: sampleDoctor,
      schedules: sampleSchedules,
      exceptions: [],
      bookedAppointments,
      dateFrom: '2026-10-19',
      dateTo: '2026-10-19',
      now: new Date('2026-10-18T00:00:00Z'),
    });

    // 09:30 is available because status is 'cancelled'
    expect(slots.length).toBe(4);
    expect(slots.map((s) => s.localTime)).toContain('09:30');
  });

  it('6. Past times: slots before "now" are pruned', () => {
    // Current time is 09:45 AM IST (04:15 UTC)
    const nowInMiddle = new Date('2026-10-19T04:15:00.000Z');

    const slots = computeDoctorAvailability({
      doctor: sampleDoctor,
      schedules: sampleSchedules,
      exceptions: [],
      bookedAppointments: [],
      dateFrom: '2026-10-19',
      dateTo: '2026-10-19',
      now: nowInMiddle,
    });

    // 09:00 and 09:30 have already started/passed.
    // Only 10:00 and 10:30 remain available.
    expect(slots.map((s) => s.localTime)).toEqual(['10:00', '10:30']);
  });

  it('7. Midnight boundary & custom hours exception', () => {
    const customException: ScheduleException[] = [
      {
        id: 'exc-2',
        doctorId: 'doc-001',
        date: '2026-10-19',
        kind: 'custom_hours',
        startTime: '10:00',
        endTime: '11:00',
        reason: 'Shift delayed',
      },
    ];

    const slots = computeDoctorAvailability({
      doctor: sampleDoctor,
      schedules: sampleSchedules,
      exceptions: customException,
      bookedAppointments: [],
      dateFrom: '2026-10-19',
      dateTo: '2026-10-19',
      now: new Date('2026-10-18T00:00:00Z'),
    });

    expect(slots.map((s) => s.localTime)).toEqual(['10:00', '10:30']);
  });

  it('8. Voice-friendly formatting output', () => {
    const utcDate = createUtcFromZoned('2026-10-19', '10:00', 'Asia/Kolkata');
    const humanText = formatHumanVoiceSlot(utcDate, 'Asia/Kolkata');
    expect(humanText).toContain('Monday');
    expect(humanText).toContain('October');
    expect(humanText).toContain('10:00 AM');
  });
});
