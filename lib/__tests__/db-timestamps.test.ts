import { describe, expect, it } from 'vitest';
import { coerceTimestampValue } from '@/lib/db-timestamps';

describe('coerceTimestampValue', () => {
  it('returns valid Date instances unchanged', () => {
    const value = new Date('2026-03-16T10:00:00.000Z');
    expect(coerceTimestampValue(value, 'completedAt')).toBe(value);
  });

  it('parses ISO strings into Date instances', () => {
    const value = coerceTimestampValue('2026-03-16T10:00:00.000Z', 'completedAt');
    expect(value).toBeInstanceOf(Date);
    expect(value?.toISOString()).toBe('2026-03-16T10:00:00.000Z');
  });

  it('returns null for empty timestamp values', () => {
    expect(coerceTimestampValue(null, 'completedAt')).toBeNull();
    expect(coerceTimestampValue(undefined, 'completedAt')).toBeNull();
    expect(coerceTimestampValue('', 'completedAt')).toBeNull();
  });

  it('throws for invalid timestamp strings', () => {
    expect(() => coerceTimestampValue('not-a-date', 'completedAt')).toThrow('Invalid completedAt value');
  });
});
