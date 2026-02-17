'use client';

import { useState } from 'react';
import { X, Send, CalendarClock, ListOrdered, FileText, Loader2 } from 'lucide-react';
import type { MasterConfig } from '@/types';

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
];

type Props = {
  masterConfig: MasterConfig;
  onClose: () => void;
  onSave: (updates: { caption: string; publishMode: MasterConfig['publishMode']; scheduledFor?: string; timezone?: string }) => Promise<void>;
};

export default function EditMasterConfigModal({ masterConfig, onClose, onSave }: Props) {
  const [caption, setCaption] = useState(masterConfig.caption || '');
  const [publishMode, setPublishMode] = useState<MasterConfig['publishMode']>(masterConfig.publishMode || 'now');
  const [scheduledFor, setScheduledFor] = useState(masterConfig.scheduledFor || '');
  const [timezone, setTimezone] = useState(masterConfig.timezone || 'America/New_York');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        caption,
        publishMode,
        scheduledFor: publishMode === 'schedule' ? scheduledFor : undefined,
        timezone: publishMode === 'schedule' ? timezone : undefined,
      });
      onClose();
    } catch {
      // parent handles toast
    } finally {
      setSaving(false);
    }
  };

  const modes = [
    { value: 'now' as const, label: 'Now', icon: Send, desc: 'Post immediately' },
    { value: 'schedule' as const, label: 'Schedule', icon: CalendarClock, desc: 'Pick date & time' },
    { value: 'queue' as const, label: 'Queue', icon: ListOrdered, desc: 'Add to queue' },
    { value: 'draft' as const, label: 'Draft', icon: FileText, desc: 'Save as draft' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-[var(--surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h3 className="text-sm font-semibold">Edit Global Caption & Timing</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--accent)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-4">
          {/* Caption */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Caption (applies to all videos)</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              placeholder="Enter caption..."
            />
          </div>

          {/* Publish Mode */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Publish Mode</label>
            <div className="grid grid-cols-2 gap-2">
              {modes.map(({ value, label, icon: Icon, desc }) => (
                <button
                  key={value}
                  onClick={() => setPublishMode(value)}
                  className={`flex items-center gap-2 rounded-lg border p-2.5 text-left transition-all ${
                    publishMode === value
                      ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                      : 'border-[var(--border)] hover:border-[var(--primary)]/50'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${publishMode === value ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`} />
                  <div>
                    <div className="text-xs font-medium">{label}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Schedule fields */}
          {publishMode === 'schedule' && (
            <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
              <div>
                <label className="mb-1 block text-[10px] font-medium text-[var(--text-muted)]">Date & Time</label>
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-[var(--text-muted)]">Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-xs font-medium transition-colors hover:bg-[var(--accent)]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-master px-4 py-2 text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 dark:text-master-foreground"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
