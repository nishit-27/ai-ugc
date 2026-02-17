'use client';

import { useState } from 'react';
import { X, Send, CalendarClock, ListOrdered, FileText, Loader2 } from 'lucide-react';
import type { TemplateJob, MasterConfig } from '@/types';

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
  job: TemplateJob;
  masterConfig: MasterConfig;
  modelName?: string;
  onClose: () => void;
  onSave: (jobId: string, overrides: {
    captionOverride: string | null;
    publishModeOverride: MasterConfig['publishMode'] | null;
    scheduledForOverride: string | null;
    timezoneOverride: string | null;
  }) => Promise<void>;
};

export default function EditJobOverridesModal({ job, masterConfig, modelName, onClose, onSave }: Props) {
  const hasExistingOverride = !!(job.captionOverride || job.publishModeOverride);

  const [useCustomCaption, setUseCustomCaption] = useState(!!job.captionOverride);
  const [caption, setCaption] = useState(job.captionOverride || masterConfig.caption || '');

  const [useCustomTiming, setUseCustomTiming] = useState(!!job.publishModeOverride);
  const [publishMode, setPublishMode] = useState<MasterConfig['publishMode']>(
    job.publishModeOverride || masterConfig.publishMode || 'now'
  );
  const [scheduledFor, setScheduledFor] = useState(job.scheduledForOverride || masterConfig.scheduledFor || '');
  const [timezone, setTimezone] = useState(job.timezoneOverride || masterConfig.timezone || 'America/New_York');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(job.id, {
        captionOverride: useCustomCaption ? caption : null,
        publishModeOverride: useCustomTiming ? publishMode : null,
        scheduledForOverride: useCustomTiming && publishMode === 'schedule' ? scheduledFor : null,
        timezoneOverride: useCustomTiming && publishMode === 'schedule' ? timezone : null,
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
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-[var(--surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Edit Video Settings</h3>
            <p className="text-[10px] text-[var(--text-muted)]">{modelName || job.name}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--accent)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-4">
          {/* Custom Caption Toggle */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium">Caption</label>
              <button
                onClick={() => {
                  setUseCustomCaption(!useCustomCaption);
                  if (useCustomCaption) setCaption(masterConfig.caption || '');
                }}
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-colors ${
                  useCustomCaption
                    ? 'bg-master/10 text-master dark:text-master-foreground'
                    : 'bg-[var(--accent)] text-[var(--text-muted)]'
                }`}
              >
                {useCustomCaption ? 'Custom' : 'Using Global'}
              </button>
            </div>
            {!useCustomCaption && (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--text-muted)]">
                {masterConfig.caption || '(no global caption)'}
              </div>
            )}
            {useCustomCaption && (
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-master/30 bg-[var(--background)] px-3 py-2 text-sm focus:border-master focus:outline-none focus:ring-1 focus:ring-master"
                placeholder="Custom caption for this video..."
              />
            )}
          </div>

          {/* Custom Timing Toggle */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium">Publish Timing</label>
              <button
                onClick={() => {
                  setUseCustomTiming(!useCustomTiming);
                  if (useCustomTiming) {
                    setPublishMode(masterConfig.publishMode || 'now');
                    setScheduledFor(masterConfig.scheduledFor || '');
                    setTimezone(masterConfig.timezone || 'America/New_York');
                  }
                }}
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-colors ${
                  useCustomTiming
                    ? 'bg-master/10 text-master dark:text-master-foreground'
                    : 'bg-[var(--accent)] text-[var(--text-muted)]'
                }`}
              >
                {useCustomTiming ? 'Custom' : 'Using Global'}
              </button>
            </div>

            {!useCustomTiming && (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--text-muted)]">
                {masterConfig.publishMode === 'schedule'
                  ? `Scheduled: ${masterConfig.scheduledFor || '(not set)'}`
                  : masterConfig.publishMode === 'queue'
                  ? 'Queued'
                  : masterConfig.publishMode === 'draft'
                  ? 'Draft'
                  : 'Post Now'}
              </div>
            )}

            {useCustomTiming && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {modes.map(({ value, label, icon: Icon, desc }) => (
                    <button
                      key={value}
                      onClick={() => setPublishMode(value)}
                      className={`flex items-center gap-2 rounded-lg border p-2.5 text-left transition-all ${
                        publishMode === value
                          ? 'border-master bg-master/5'
                          : 'border-[var(--border)] hover:border-master/50'
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${publishMode === value ? 'text-master dark:text-master-foreground' : 'text-[var(--text-muted)]'}`} />
                      <div>
                        <div className="text-xs font-medium">{label}</div>
                        <div className="text-[10px] text-[var(--text-muted)]">{desc}</div>
                      </div>
                    </button>
                  ))}
                </div>

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
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
          {hasExistingOverride && (
            <button
              onClick={async () => {
                setSaving(true);
                try {
                  await onSave(job.id, {
                    captionOverride: null,
                    publishModeOverride: null,
                    scheduledForOverride: null,
                    timezoneOverride: null,
                  });
                  onClose();
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
              className="mr-auto rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:hover:bg-red-950/30"
            >
              Reset to Global
            </button>
          )}
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
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
