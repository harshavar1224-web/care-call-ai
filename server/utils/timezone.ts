/**
 * CareCall Centralized Timezone Utilities
 * 
 * Strict IANA timezone handling using built-in Intl.DateTimeFormat APIs.
 * Clinic Timezone: Asia/Kolkata (IST, UTC+05:30)
 * 
 * Guarantees:
 * 1. Zero hardcoded UTC offset strings (no appending '+05:30').
 * 2. Absolute UTC storage in PostgreSQL (timestamptz) and API payloads.
 * 3. Exact calculations for UTC midnight crossings and local calendar dates.
 */

export const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || 'Asia/Kolkata';

export interface ZonedParts {
  year: number;
  month: string;  // "01" - "12"
  day: string;    // "01" - "31"
  hour: number;   // 0 - 23
  minute: number; // 0 - 59
  second: number; // 0 - 59
  weekday: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  dateString: string; // "YYYY-MM-DD"
  timeString: string; // "HH:MM"
}

/**
 * Extract zoned calendar date and time parts using Intl.DateTimeFormat
 */
export function getZonedDateParts(date: Date, timezone: string = CLINIC_TIMEZONE): ZonedParts {
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

  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekday = weekdayNames.indexOf(partMap.weekday);

  return {
    year: parseInt(partMap.year, 10),
    month: partMap.month,
    day: partMap.day,
    hour: parseInt(partMap.hour, 10),
    minute: parseInt(partMap.minute, 10),
    second: parseInt(partMap.second || '0', 10),
    weekday: weekday >= 0 ? weekday : 0,
    dateString: `${partMap.year}-${partMap.month}-${partMap.day}`,
    timeString: `${partMap.hour}:${partMap.minute}`,
  };
}

/**
 * Construct a UTC Date from a clinic-local YYYY-MM-DD and HH:MM in a specific IANA timezone.
 * Uses exact iterative convergence via Intl.DateTimeFormat with zero manual offset strings.
 */
export function createUtcFromZoned(
  dateStr: string,
  timeStr: string,
  timezone: string = CLINIC_TIMEZONE
): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute, second = 0] = timeStr.split(':').map(Number);

  // Initial candidate in UTC
  let candidateTime = Date.UTC(year, month - 1, day, hour, minute, second);

  // Converge to the exact UTC timestamp matching target local calendar time in target timezone
  for (let i = 0; i < 3; i++) {
    const candidateDate = new Date(candidateTime);
    const parts = getZonedDateParts(candidateDate, timezone);
    const zonedTime = Date.UTC(
      parts.year,
      parseInt(parts.month, 10) - 1,
      parseInt(parts.day, 10),
      parts.hour,
      parts.minute,
      parts.second
    );
    const diff = zonedTime - Date.UTC(year, month - 1, day, hour, minute, second);
    if (diff === 0) {
      break;
    }
    candidateTime -= diff;
  }

  return new Date(candidateTime);
}

/**
 * Get the current local calendar date string ("YYYY-MM-DD") in the clinic timezone
 */
export function getCurrentClinicDate(timezone: string = CLINIC_TIMEZONE): string {
  return getZonedDateParts(new Date(), timezone).dateString;
}

/**
 * Add days to a YYYY-MM-DD string
 */
export function addZonedDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/**
 * Format a slot into human-spoken voice text (e.g. "Monday, October 19, 10:00 AM IST")
 */
export function formatHumanVoiceSlot(
  utcDateOrIso: Date | string,
  timezone: string = CLINIC_TIMEZONE
): string {
  const date = typeof utcDateOrIso === 'string' ? new Date(utcDateOrIso) : utcDateOrIso;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${formatter.format(date)} IST`;
}

/**
 * Format timestamp for clinic dashboard display with explicit IST designation
 */
export function formatClinicDisplayDateTime(
  utcDateOrIso: Date | string,
  timezone: string = CLINIC_TIMEZONE
): string {
  const date = typeof utcDateOrIso === 'string' ? new Date(utcDateOrIso) : utcDateOrIso;
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
  return `${formatted} IST`;
}

/**
 * Format time only with IST suffix
 */
export function formatClinicTimeOnly(
  utcDateOrIso: Date | string,
  timezone: string = CLINIC_TIMEZONE
): string {
  const date = typeof utcDateOrIso === 'string' ? new Date(utcDateOrIso) : utcDateOrIso;
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
  return `${formatted} IST`;
}
