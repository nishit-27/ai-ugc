'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import type { KeyUsageInfo } from '@/hooks/useConnections';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import GlBadge from '@/components/ui/GlBadge';
import { getProfileInitials, getProfileAvatarClass } from './profileAvatar';

export default function NewProfileModal({
  open,
  onClose,
  onCreated,
  apiKeyCount = 1,
  keyUsage = [],
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  apiKeyCount?: number;
  keyUsage?: KeyUsageInfo[];
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState({ name: '', description: '' });
  const [selectedKeyIndex, setSelectedKeyIndex] = useState<number | 'auto'>('auto');
  const [isCreating, setIsCreating] = useState(false);

  // A key with `limitSource === 'unknown'` has no detected cap yet — don't
  // count it toward "all keys full" (we'll let the API tell us when it is).
  const allKeysFull =
    keyUsage.length > 0 &&
    keyUsage.every((k) => k.limitSource !== 'unknown' && k.count >= k.max);

  const handleSetCap = async (apiKeyIndex: number, label: string, currentMax?: number) => {
    const input = window.prompt(
      `Set the profile cap for ${label}.\nThis is the max number of social accounts your Late plan allows for this key.\nLeave blank to cancel.`,
      currentMax && currentMax < 1_000_000 ? String(currentMax) : '',
    );
    if (input === null) return;
    const trimmed = input.trim();
    if (!trimmed) return;
    const value = parseInt(trimmed, 10);
    if (!Number.isFinite(value) || value < 1) {
      showToast('Cap must be a positive number', 'error');
      return;
    }
    const res = await fetch('/api/late/profiles/limits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKeyIndex, max: value }),
    });
    if (res.ok) {
      showToast(`${label} cap set to ${value}`, 'success');
      onCreated(); // triggers a refresh of keyUsage
    } else {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'Failed to set cap', 'error');
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      showToast('Profile name is required', 'error');
      return;
    }
    setIsCreating(true);
    try {
      const body: Record<string, unknown> = { ...form };
      if (selectedKeyIndex !== 'auto') {
        body.apiKeyIndex = selectedKeyIndex;
      }
      const res = await fetch('/api/late/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        onClose();
        setForm({ name: '', description: '' });
        setSelectedKeyIndex('auto');
        showToast('Profile created!', 'success');
        onCreated();
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Profile" maxWidth="max-w-md">
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-3 rounded-xl bg-[var(--muted)] px-3 py-2">
          <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold ${getProfileAvatarClass(form.name || 'new-profile')}`}>
            {getProfileInitials(form.name || 'New')}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{form.name || 'New Profile'}</p>
            <p className="truncate text-xs text-[var(--text-muted)]">{form.description || 'Add a short description to identify this profile'}</p>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm text-[var(--text-muted)]">Profile Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g., TikTok Account 3"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2.5"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm text-[var(--text-muted)]">Description (optional)</label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="e.g., Eastern Europe accounts"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2.5"
          />
        </div>

        {apiKeyCount > 1 && (
          <div>
            <label className="mb-2 block text-sm text-[var(--text-muted)]">GetLate Account</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedKeyIndex('auto')}
                disabled={allKeysFull}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  selectedKeyIndex === 'auto'
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                    : 'border-[var(--border)] bg-[var(--background)] text-[var(--text-muted)] hover:border-[var(--primary)]'
                } disabled:opacity-40 disabled:pointer-events-none`}
              >
                Auto-balance
              </button>
              {keyUsage.length > 0
                ? keyUsage.map((k) => {
                    const capUnknown = k.limitSource === 'unknown';
                    const isFull = !capUnknown && k.count >= k.max;
                    const display = capUnknown ? `${k.count}` : `${k.count}/${k.max}`;
                    const label = `GL-${k.index + 1}`;
                    return (
                      <div
                        key={k.index}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
                          selectedKeyIndex === k.index
                            ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                            : 'border-[var(--border)] bg-[var(--background)] text-[var(--text-muted)] hover:border-[var(--primary)]'
                        } ${isFull ? 'opacity-60' : ''}`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedKeyIndex(k.index)}
                          disabled={isFull}
                          className="inline-flex items-center gap-1.5 disabled:pointer-events-none"
                          title={
                            k.limitSource === 'learned'
                              ? `Cap set to ${k.max}. Click pencil to edit.`
                              : 'Cap not set — click the pencil to set it once.'
                          }
                        >
                          <GlBadge index={k.index} />
                          <span className={`text-[10px] ${isFull ? 'text-red-400' : 'text-[var(--text-muted)]'}`}>
                            {display}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetCap(k.index, label, capUnknown ? undefined : k.max);
                          }}
                          className="ml-0.5 rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--muted)] hover:text-[var(--primary)]"
                          title={`Set ${label} profile cap`}
                          aria-label={`Set ${label} profile cap`}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })
                : Array.from({ length: apiKeyCount }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedKeyIndex(i)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        selectedKeyIndex === i
                          ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                          : 'border-[var(--border)] bg-[var(--background)] text-[var(--text-muted)] hover:border-[var(--primary)]'
                      }`}
                    >
                      <GlBadge index={i} />
                    </button>
                  ))}
            </div>
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={isCreating || allKeysFull}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--master)] py-3 font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {isCreating ? (
            <>
              <Spinner />
              Creating...
            </>
          ) : allKeysFull ? (
            'All accounts full'
          ) : (
            'Create Profile'
          )}
        </button>
      </div>
    </Modal>
  );
}
