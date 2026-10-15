/**
 * Client-Side Clinic Timezone Utilities
 * 
 * IANA Timezone: Asia/Kolkata (Indian Standard Time - IST)
 * Strictly utilizes built-in Intl.DateTimeFormat with zero manual offset concatenation.
 */

export const CLINIC_TIMEZONE = 'Asia/Kolkata';

export interface ZonedParts {
  year: number;
  month: string;
  day: string;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sun .. 6 = Sat
  dateString: string; // "YYYY-MM-DD"
  timeString: string; // "HH:MM"
}

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

export function createUtcFromZoned(
  dateStr: string,
  timeStr: string,
  timezone: string = CLINIC_TIMEZONE
): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute, second = 0] = timeStr.split(':').map(Number);

  let candidateTime = Date.UTC(year, month - 1, day, hour, minute, second);

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

export function addZonedDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function getCurrentClinicDate(timezone: string = CLINIC_TIMEZONE): string {
  return getZonedDateParts(new Date(), timezone).dateString;
}

export function formatClinicDateTime(
  utcDateOrIso: Date | string,
  timezone: string = CLINIC_TIMEZONE
): string {
  if (!utcDateOrIso) return '—';
  const date = typeof utcDateOrIso === 'string' ? new Date(utcDateOrIso) : utcDateOrIso;
  if (isNaN(date.getTime())) return '—';

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

export function formatClinicTimeOnly(
  utcDateOrIso: Date | string,
  timezone: string = CLINIC_TIMEZONE
): string {
  if (!utcDateOrIso) return '—';
  const date = typeof utcDateOrIso === 'string' ? new Date(utcDateOrIso) : utcDateOrIso;
  if (isNaN(date.getTime())) return '—';

  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
  return `${formatted} IST`;
}

export function formatClinicDateOnly(
  utcDateOrIso: Date | string,
  timezone: string = CLINIC_TIMEZONE
): string {
  if (!utcDateOrIso) return '—';
  const date = typeof utcDateOrIso === 'string' ? new Date(utcDateOrIso) : utcDateOrIso;
  if (isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}
