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
