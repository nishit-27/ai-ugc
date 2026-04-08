import { describe, it, expect } from 'vitest';
import {
  ANALYTICS_START_DATE,
  getCreatedDateDisplay,
  getDateKeyInTimeZone,
  getScheduledDateDisplay,
  getTodayDateKey,
  listDateKeysInRange,
  resolveAnalyticsDateRange,
  shiftDateKey,
} from '../dateUtils';

describe('getCreatedDateDisplay', () => {
  it('returns "-" for undefined input', () => {
    expect(getCreatedDateDisplay()).toBe('-');
    expect(getCreatedDateDisplay(undefined)).toBe('-');
  });

  it('returns "-" for empty string', () => {
    expect(getCreatedDateDisplay('')).toBe('-');
  });

  it('returns the original string for invalid dates', () => {
    expect(getCreatedDateDisplay('not-a-date')).toBe('not-a-date');
  });

  it('formats valid ISO dates in en-GB locale (DD/MM/YYYY)', () => {
    const result = getCreatedDateDisplay('2024-06-15T10:00:00Z');
    // en-GB format: DD/MM/YYYY
    expect(result).toMatch(/15\/06\/2024/);
  });
});

describe('getScheduledDateDisplay', () => {
  it('returns "-" for undefined input', () => {
    expect(getScheduledDateDisplay()).toBe('-');
    expect(getScheduledDateDisplay(undefined)).toBe('-');
  });

  it('returns "-" for empty string', () => {
    expect(getScheduledDateDisplay('')).toBe('-');
  });

  it('returns the original string for invalid dates', () => {
    expect(getScheduledDateDisplay('not-a-date')).toBe('not-a-date');
  });

  it('formats valid dates with timezone offset', () => {
    const result = getScheduledDateDisplay('2024-06-15T10:00:00Z', 'UTC');
    expect(result).toContain('Jun');
    expect(result).toContain('15');
    expect(result).toContain('2024');
  });

  it('respects timezone parameter', () => {
    const utcResult = getScheduledDateDisplay('2024-06-15T23:30:00Z', 'UTC');
    const istResult = getScheduledDateDisplay('2024-06-15T23:30:00Z', 'Asia/Kolkata');
    // IST is UTC+5:30, so 23:30 UTC = 05:00 IST next day
    expect(utcResult).not.toBe(istResult);
  });
});

describe('date key helpers', () => {
  it('builds a timezone-aware day key', () => {
    expect(getDateKeyInTimeZone('2024-06-15T23:30:00Z', 'UTC')).toBe('2024-06-15');
    expect(getDateKeyInTimeZone('2024-06-15T23:30:00Z', 'Asia/Kolkata')).toBe('2024-06-16');
  });

  it('shifts day keys without timezone drift', () => {
    expect(shiftDateKey('2026-03-18', -6)).toBe('2026-03-12');
    expect(shiftDateKey('2026-03-18', 1)).toBe('2026-03-19');
  });

  it('lists every day in an inclusive range', () => {
    expect(listDateKeysInRange('2026-03-16', '2026-03-18')).toEqual([
      '2026-03-16',
      '2026-03-17',
      '2026-03-18',
    ]);
  });

  it('returns today in the requested timezone', () => {
    const today = getTodayDateKey('Asia/Kolkata');
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('resolves yesterday to the previous calendar day only', () => {
    expect(resolveAnalyticsDateRange({
      dateRange: 'yesterday',
      today: '2026-04-08',
    })).toEqual({
      fromDate: '2026-04-07',
      toDate: '2026-04-07',
    });
  });

  it('resolves custom ranges with fallback bounds', () => {
    expect(resolveAnalyticsDateRange({
      dateRange: 'custom',
      today: '2026-04-08',
    })).toEqual({
      fromDate: ANALYTICS_START_DATE,
      toDate: '2026-04-08',
    });
  });
});
