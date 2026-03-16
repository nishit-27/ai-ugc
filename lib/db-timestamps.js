export function coerceTimestampValue(value, fieldName = 'timestamp') {
  if (value == null || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`Invalid ${fieldName} value`);
    }
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid ${fieldName} value: ${value}`);
    }
    return parsed;
  }

  throw new Error(`Unsupported ${fieldName} value type: ${typeof value}`);
}
