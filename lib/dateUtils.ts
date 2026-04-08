export const DEFAULT_APP_TIMEZONE = 'Asia/Kolkata';
export const ANALYTICS_START_DATE = '2020-01-01';

function padTwo(value: number): string {
  return String(value).padStart(2, '0');
}

function parseDateKey(dateKey: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function formatUtcDate(date: Date): string {
  return `${date.getUTCFullYear()}-${padTwo(date.getUTCMonth() + 1)}-${padTwo(date.getUTCDate())}`;
}

export function getDateKeyInTimeZone(
  value: Date | string | number,
  timezone = DEFAULT_APP_TIMEZONE
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
}

export function getTodayDateKey(timezone = DEFAULT_APP_TIMEZONE): string {
  return getDateKeyInTimeZone(new Date(), timezone);
}

export function resolveAnalyticsDateRange(params: {
  dateRange: string;
  customFrom?: string;
  customTo?: string;
  today?: string;
  startDate?: string;
}): { fromDate: string; toDate: string } {
  const {
    dateRange,
    customFrom,
    customTo,
    today = getTodayDateKey(),
    startDate = ANALYTICS_START_DATE,
  } = params;

  if (dateRange === 'custom') {
    return {
      fromDate: customFrom || startDate,
      toDate: customTo || today,
    };
  }

  if (dateRange === 'yesterday') {
    const yesterday = shiftDateKey(today, -1);
    return {
      fromDate: yesterday,
      toDate: yesterday,
    };
  }

  const presetDays = dateRange === '7d'
    ? 7
    : dateRange === '30d'
      ? 30
      : dateRange === '90d'
        ? 90
        : dateRange === '180d'
          ? 180
          : dateRange === '365d'
            ? 365
            : 0;

  return {
    fromDate: presetDays > 0 ? shiftDateKey(today, -(presetDays - 1)) : startDate,
    toDate: today,
  };
}

export function shiftDateKey(dateKey: string, days: number): string {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return dateKey;

  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDate(date);
}

export function listDateKeysInRange(fromDate: string, toDate: string): string[] {
  const from = parseDateKey(fromDate);
  const to = parseDateKey(toDate);
  if (!from || !to) return [];

  const cursor = new Date(Date.UTC(from.year, from.month - 1, from.day));
  const end = new Date(Date.UTC(to.year, to.month - 1, to.day));
  if (cursor.getTime() > end.getTime()) return [];

  const dates: string[] = [];
  while (cursor.getTime() <= end.getTime()) {
    dates.push(formatUtcDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function getCreatedDateDisplay(createdAt?: string): string {
  if (!createdAt) return '-';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return date.toLocaleDateString('en-GB');
}

export function getScheduledDateDisplay(scheduledFor?: string, timezone = 'Asia/Kolkata'): string {
  if (!scheduledFor) return '-';
  const date = new Date(scheduledFor);
  if (Number.isNaN(date.getTime())) return scheduledFor;

  const datePart = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone,
  }).format(date);
  const timePart = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  }).format(date);

  let offset = 'GMT';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    }).formatToParts(date);
    offset = parts.find((part) => part.type === 'timeZoneName')?.value || offset;
  } catch {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(date);
    offset = parts.find((part) => part.type === 'timeZoneName')?.value || offset;
  }

  return `${datePart}, ${timePart} ${offset}`;
}

// Re-exported from domUtils.ts for backwards compatibility
export { downloadVideo, copyToClipboard } from './domUtils';
