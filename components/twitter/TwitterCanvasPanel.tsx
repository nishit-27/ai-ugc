'use client';

import { useState, useRef, useEffect } from 'react';
import { Users, CalendarClock, Send, FileText, ListOrdered } from 'lucide-react';
import gsap from 'gsap';
import TwitterModelSelector from './TwitterModelSelector';
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

interface TwitterCanvasPanelProps {
  models: Model[];
  isLoadingModels?: boolean;
  selectedModelIds: string[];
  onSelectedModelIdsChange: (ids: string[]) => void;
  twitterAccountCounts: Record<string, number>;
  publishMode: 'now' | 'schedule' | 'queue' | 'draft';
  onPublishModeChange: (v: 'now' | 'schedule' | 'queue' | 'draft') => void;
  scheduledFor: string;
  onScheduledForChange: (v: string) => void;
  timezone: string;
  onTimezoneChange: (v: string) => void;
}

export default function TwitterCanvasPanel({
  models,
  isLoadingModels,
  selectedModelIds,
  onSelectedModelIdsChange,
  twitterAccountCounts,
  publishMode,
  onPublishModeChange,
  scheduledFor,
  onScheduledForChange,
  timezone,
  onTimezoneChange,
}: TwitterCanvasPanelProps) {
  const [section, setSection] = useState<'models' | 'schedule'>('models');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelRef.current) return;
    gsap.fromTo(
      panelRef.current,
      { x: 20, autoAlpha: 0 },
      { x: 0, autoAlpha: 1, duration: 0.35, ease: 'power3.out' }
    );
  }, []);

  return (
    <div ref={panelRef} className="flex h-full w-full flex-col border-l border-[var(--border)] bg-[var(--bg-primary)]">
      {/* Tabs */}
      <div className="flex border-b border-[var(--border)]">
        <button
          onClick={() => setSection('models')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${
            section === 'models'
              ? 'border-b-2 border-[#1DA1F2] text-[#1DA1F2]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          Models ({selectedModelIds.length})
        </button>
        <button
          onClick={() => setSection('schedule')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${
            section === 'schedule'
              ? 'border-b-2 border-[#1DA1F2] text-[#1DA1F2]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          Schedule
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {section === 'models' && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Select Models</h3>
            <p className="mb-3 text-[10px] text-[var(--text-muted)]">
              Only models with X/Twitter accounts connected are shown. Each selected model will execute the pipeline from its linked X account.
            </p>
            <TwitterModelSelector
              models={models}
              isLoading={isLoadingModels}
              selectedIds={selectedModelIds}
              onChange={onSelectedModelIdsChange}
              twitterAccountCounts={twitterAccountCounts}
            />
          </div>
        )}

        {section === 'schedule' && (
          <div className="space-y-4">
            {/* Publish Mode */}
            <div>
              <label className="mb-2 block text-xs font-semibold text-[var(--text-primary)]">Publish Mode</label>
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
                        ? 'border-[#1DA1F2] bg-[#1DA1F2]/5'
                        : 'border-[var(--border)] hover:border-[#1DA1F2]/50'
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${publishMode === value ? 'text-[#1DA1F2]' : 'text-[var(--text-muted)]'}`} />
                    <div>
                      <div className="text-xs font-medium text-[var(--text-primary)]">{label}</div>
                      <div className="text-[10px] text-[var(--text-muted)]">{desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Schedule fields */}
            {publishMode === 'schedule' && (
              <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--text-muted)]">Date & Time</label>
                  <input
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(e) => onScheduledForChange(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#1DA1F2] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[var(--text-muted)]">Timezone</label>
                  <select
                    value={timezone}
                    onChange={(e) => onTimezoneChange(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#1DA1F2] focus:outline-none"
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
