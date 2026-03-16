import { describe, it, expect } from 'vitest';
import { getCreatedDateDisplay, getScheduledDateDisplay } from '../dateUtils';

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
