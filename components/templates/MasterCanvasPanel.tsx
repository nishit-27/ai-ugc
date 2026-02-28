'use client';

import { useState } from 'react';
import { Users, MessageSquare, Send, CalendarClock, FileText, ListOrdered } from 'lucide-react';
import ModelSelector from '@/components/templates/ModelSelector';
import type { Model } from '@/types';

const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'IST (India)' },
  { value: 'America/New_York', label: 'EST (New York)' },
  { value: 'America/Los_Angeles', label: 'PST (Los Angeles)' },
  { value: 'Europe/London', label: 'GMT (London)' },
  { value: 'Europe/Berlin', label: 'CET (Berlin)' },
  { value: 'Asia/Tokyo', label: 'JST (Tokyo)' },
  { value: 'Australia/Sydney', label: 'AEST (Sydney)' },
  { value: 'UTC', label: 'UTC' },
];

export default function MasterCanvasPanel({
  models,
  isLoadingModels,
  selectedModelIds,
  onSelectedModelIdsChange,
  caption,
  onCaptionChange,
  publishMode,
  onPublishModeChange,
  scheduledFor,
  onScheduledForChange,
  timezone,
  onTimezoneChange,
  accountCounts,
}: {
  models: Model[];
  isLoadingModels?: boolean;
  selectedModelIds: string[];
  onSelectedModelIdsChange: (ids: string[]) => void;
  caption: string;
  onCaptionChange: (v: string) => void;
  publishMode: 'now' | 'schedule' | 'queue' | 'draft';
  onPublishModeChange: (v: 'now' | 'schedule' | 'queue' | 'draft') => void;
  scheduledFor: string;
  onScheduledForChange: (v: string) => void;
  timezone: string;
  onTimezoneChange: (v: string) => void;
  accountCounts?: Record<string, number>;
}) {
  const [section, setSection] = useState<'models' | 'caption'>('models');

  return (
    <div className="flex h-full flex-col">
      {/* Section Tabs */}
      <div className="flex border-b border-[var(--border)]">
        <button
          onClick={() => setSection('models')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${
            section === 'models'
              ? 'border-b-2 border-[var(--primary)] text-[var(--primary)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          Models ({selectedModelIds.length})
        </button>
        <button
          onClick={() => setSection('caption')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${
            section === 'caption'
              ? 'border-b-2 border-[var(--primary)] text-[var(--primary)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Caption & Schedule
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {section === 'models' && (
          <div>
            <h3 className="mb-3 text-sm font-semibold">Select Models</h3>
            <p className="mb-3 text-[10px] text-[var(--text-muted)]">
              Select full groups or individual models. Each model gets its own video using its primary image,
              then posts to linked social accounts.
            </p>
            <ModelSelector
              models={models}
              isLoading={isLoadingModels}
              selectedIds={selectedModelIds}
              onChange={onSelectedModelIdsChange}
              accountCounts={accountCounts}
            />
          </div>
        )}

        {section === 'caption' && (
          <div className="space-y-4">
            {/* Caption */}
            <div>
              <label className="mb-1 block text-xs font-semibold">Caption</label>
              <textarea
                value={caption}
                onChange={(e) => onCaptionChange(e.target.value)}
                placeholder="Write your caption... #fyp #viral"
                rows={4}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm resize-none"
              />
            </div>

            {/* Publish Mode */}
            <div>
              <label className="mb-2 block text-xs font-semibold">Publish Mode</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'now' as const, label: 'Now', icon: Send, desc: 'Post immediately' },
                  { value: 'schedule' as const, label: 'Schedule', icon: CalendarClock, desc: 'Pick date & time' },
                  { value: 'queue' as const, label: 'Queue', icon: ListOrdered, desc: 'Add to queue' },
                  { value: 'draft' as const, label: 'Draft', icon: FileText, desc: 'Save as draft' },
                ].map(({ value, label, icon: Icon, desc }) => (
                  <button
                    key={value}
                    onClick={() => onPublishModeChange(value)}
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
                    onChange={(e) => onScheduledForChange(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--text-muted)]">Timezone</label>
                  <select
                    value={timezone}
                    onChange={(e) => onTimezoneChange(e.target.value)}
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
  );
}
