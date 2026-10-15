/**
 * CareCall Availability Engine
 * 
 * Computes available booking slots for clinic doctors based on:
 * - Weekly recurring schedule (day of week: 0=Sun .. 6=Sat)
 * - Schedule exceptions (leaves 'off', or 'custom_hours')
 * - Existing booked appointments (excluding cancelled ones)
 * - Current timestamp (never offering past slots)
 * - Step increments governed by doctor's slot_minutes
 * 
 * TIMEZONE HANDLING WHY:
 * 1. Physical clinic operational hours and patient requests are always anchored in the
 *    clinic's local timezone (default: Asia/Kolkata, UTC+05:30).
 * 2. Storing everything in UTC ISO 8601 strings in the database avoids DST and offset ambiguity,
 *    but recurring schedules like "Monday 09:00 - 13:00" refer to 09:00 IST, NOT 09:00 UTC.
 * 3. Therefore, this engine computes slot start and end boundaries in local calendar time
 *    for each target day, maps those boundaries precisely to UTC timestamps, and renders
 *    human-friendly speech text (e.g., "Thursday, Oct 15 at 10:00 AM") in the clinic's timezone
 *    so the voice assistant speaks natural local times to the caller.
 */

export interface DoctorSchedule {
  id: string;
  doctorId: string;
  weekday: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  startTime: string; // "HH:MM" e.g. "09:00"
  endTime: string;   // "HH:MM" e.g. "13:00"
}

export interface ScheduleException {
  id: string;
  doctorId: string;
  date: string; // "YYYY-MM-DD"
  kind: 'off' | 'custom_hours';
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
}

export interface BookedSlot {
  id: string;
  doctorId: string;
  startsAt: string; // ISO UTC
  endsAt: string;   // ISO UTC
  status: 'booked' | 'cancelled' | 'completed' | 'no_show';
}

export interface DoctorProfile {
  id: string;
  name: string;
  specialty: string;
  slotMinutes: number;
  active: boolean;
}

export interface AvailableSlot {
  doctorId: string;
  doctorName: string;
  specialty: string;
  startsAt: string; // ISO 8601 UTC
  endsAt: string;   // ISO 8601 UTC
  localDate: string; // "YYYY-MM-DD"
  localTime: string; // "HH:MM"
  humanText: string; // Voice-friendly e.g. "Thursday, October 15 at 10:00 AM"
}

export interface AvailabilityOptions {
  doctor: DoctorProfile;
  schedules: DoctorSchedule[];
  exceptions: ScheduleException[];
  bookedAppointments: BookedSlot[];
  dateFrom: string; // "YYYY-MM-DD" in clinic timezone
  dateTo: string;   // "YYYY-MM-DD" in clinic timezone
  partOfDay?: 'morning' | 'afternoon' | 'evening' | null;
  clinicTimezone?: string; // defaults to 'Asia/Kolkata'
  now?: Date; // Reference time for past-date filtering
  maxSlots?: number; // default 5
}

/**
 * Format a Date object into local date and time components in a given timezone.
 */
export function getZonedDateParts(date: Date, timezone: string = 'Asia/Kolkata') {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }

  // weekday index 0 (Sun) to 6 (Sat)
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekday = weekdayNames.indexOf(partMap.weekday);

  return {
    year: parseInt(partMap.year, 10),
    month: partMap.month,
    day: partMap.day,
    hour: parseInt(partMap.hour, 10),
    minute: parseInt(partMap.minute, 10),
    dateString: `${partMap.year}-${partMap.month}-${partMap.day}`,
    weekday: weekday >= 0 ? weekday : 0,
  };
}

/**
 * Construct a UTC Date from a local YYYY-MM-DD and HH:MM in a specific timezone.
 * Uses binary/offset approximation or standard Intl offsets.
 */
export function createUtcFromZoned(
  dateStr: string,
  timeStr: string,
  timezone: string = 'Asia/Kolkata'
): Date {
  // For Asia/Kolkata, UTC offset is fixed at +05:30 (no Daylight Saving Time).
  // We compute dynamically using Intl to support any timezone cleanly.
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);

  // Initial naive UTC date
  const naiveUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  
  // Find timezone offset in minutes at that instant
  const parts = getZonedDateParts(naiveUtc, timezone);
  const zonedAsUtc = Date.UTC(
    parts.year,
    parseInt(parts.month, 10) - 1,
    parseInt(parts.day, 10),
    parts.hour,
    parts.minute,
    0
  );

  const offsetMs = zonedAsUtc - naiveUtc.getTime();
  return new Date(naiveUtc.getTime() - offsetMs);
}

/**
 * Format a slot into human-spoken audio description.
 * E.g., "Thursday, October 15 at 10:00 AM"
 */
export function formatHumanVoiceSlot(utcDate: Date, timezone: string = 'Asia/Kolkata'): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return formatter.format(utcDate);
}

/**
 * Parse time "HH:MM" into minutes since midnight.
 */
function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Format minutes since midnight into "HH:MM".
 */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Add days to YYYY-MM-DD string.
 */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/**
 * Core pure TypeScript availability computation.
 */
export function computeDoctorAvailability(options: AvailabilityOptions): AvailableSlot[] {
  const {
    doctor,
    schedules,
    exceptions,
    bookedAppointments,
    dateFrom,
    dateTo,
    partOfDay,
    clinicTimezone = 'Asia/Kolkata',
    now = new Date(),
    maxSlots = 5,
  } = options;

  if (!doctor.active) {
    return [];
  }

  const slotMinutes = doctor.slotMinutes || 30;
  const availableSlots: AvailableSlot[] = [];

  // Active booked intervals in milliseconds
  const activeBookings = bookedAppointments
    .filter((a) => a.doctorId === doctor.id && a.status === 'booked')
    .map((a) => ({
      startMs: new Date(a.startsAt).getTime(),
      endMs: new Date(a.endsAt).getTime(),
    }));

  let currentDateStr = dateFrom;
  const endComparison = dateTo;

  // Iterate day by day
  while (currentDateStr <= endComparison) {
    // 1. Check if the doctor has an exception on this date
    const exception = exceptions.find(
      (e) => e.doctorId === doctor.id && e.date === currentDateStr
    );

    // If completely off, skip this entire day
    if (exception && exception.kind === 'off') {
      currentDateStr = addDays(currentDateStr, 1);
      continue;
    }

    // Determine working windows for this date
    let workingWindows: Array<{ start: string; end: string }> = [];

    if (exception && exception.kind === 'custom_hours' && exception.startTime && exception.endTime) {
      workingWindows.push({ start: exception.startTime, end: exception.endTime });
    } else {
      // Find weekday for this date in clinic timezone
      const refDate = createUtcFromZoned(currentDateStr, '12:00', clinicTimezone);
      const weekday = getZonedDateParts(refDate, clinicTimezone).weekday;

      const daySchedules = schedules.filter(
        (s) => s.doctorId === doctor.id && s.weekday === weekday
      );
      workingWindows = daySchedules.map((s) => ({
        start: s.startTime,
        end: s.endTime,
      }));
    }

    // Generate slots for each working window
    for (const window of workingWindows) {
      const windowStartMin = timeToMinutes(window.start);
      const windowEndMin = timeToMinutes(window.end);

      let slotStartMin = windowStartMin;

      while (slotStartMin + slotMinutes <= windowEndMin) {
        const slotEndMin = slotStartMin + slotMinutes;
        const slotStartTimeStr = minutesToTime(slotStartMin);
        const slotEndTimeStr = minutesToTime(slotEndMin);

        // Filter by partOfDay if requested
        // morning: < 12:00, afternoon: 12:00 - 17:00, evening: >= 17:00
        let matchesPartOfDay = true;
        if (partOfDay === 'morning') {
          matchesPartOfDay = slotStartMin < 12 * 60;
        } else if (partOfDay === 'afternoon') {
          matchesPartOfDay = slotStartMin >= 12 * 60 && slotStartMin < 17 * 60;
        } else if (partOfDay === 'evening') {
          matchesPartOfDay = slotStartMin >= 17 * 60;
        }

        if (matchesPartOfDay) {
          const slotUtcStart = createUtcFromZoned(currentDateStr, slotStartTimeStr, clinicTimezone);
          const slotUtcEnd = createUtcFromZoned(currentDateStr, slotEndTimeStr, clinicTimezone);

          const slotStartMs = slotUtcStart.getTime();
          const slotEndMs = slotUtcEnd.getTime();

          // Condition 1: Must NOT be in the past
          const isFuture = slotStartMs > now.getTime();

          // Condition 2: Must NOT overlap any existing booked appointment
          // Overlap formula: (slotStart < bookingEnd) && (slotEnd > bookingStart)
          const isConflict = activeBookings.some(
            (b) => slotStartMs < b.endMs && slotEndMs > b.startMs
          );

          if (isFuture && !isConflict) {
            availableSlots.push({
              doctorId: doctor.id,
              doctorName: doctor.name,
              specialty: doctor.specialty,
              startsAt: slotUtcStart.toISOString(),
              endsAt: slotUtcEnd.toISOString(),
              localDate: currentDateStr,
              localTime: slotStartTimeStr,
              humanText: formatHumanVoiceSlot(slotUtcStart, clinicTimezone),
            });

            if (availableSlots.length >= maxSlots) {
              return availableSlots;
            }
          }
        }

        slotStartMin += slotMinutes;
      }
    }

    currentDateStr = addDays(currentDateStr, 1);
  }

  return availableSlots;
}
