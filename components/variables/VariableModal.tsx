'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, ToggleLeft, List, Hash, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CustomVariable } from '@/hooks/useVariables';
import { COLOR_MAP, COLORS } from './variable-colors';

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (data: { name: string; type: string; options?: string[]; color?: string }) => Promise<void>;
  variable?: CustomVariable | null;
};

const TYPE_OPTIONS = [
  { value: 'boolean', label: 'Boolean', desc: 'True / False toggle', icon: ToggleLeft },
  { value: 'categorical', label: 'Categorical', desc: 'Pick from a list', icon: List },
  { value: 'numeric', label: 'Numeric', desc: 'Number value', icon: Hash },
] as const;

const COLOR_NAMES: Record<string, string> = {
  '#2563eb': 'Blue',
  '#059669': 'Emerald',
  '#ea580c': 'Orange',
  '#dc2626': 'Red',
  '#d97706': 'Amber',
  '#db2777': 'Pink',
  '#0891b2': 'Cyan',
  '#0d9488': 'Teal',
};

export default function VariableModal({ open, onClose, onSave, variable }: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState('boolean');
  const [options, setOptions] = useState<string[]>(['']);
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (variable) {
      setName(variable.name);
      setType(variable.type);
      setOptions(variable.options?.length ? variable.options : ['']);
      setColor(variable.color || COLORS[0]);
    } else {
      setName('');
      setType('boolean');
      setOptions(['']);
      setColor(COLORS[0]);
    }
    setError('');
  }, [variable, open]);

  if (!open) return null;

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (type === 'categorical') {
      const valid = options.filter(o => o.trim());
      if (valid.length === 0) { setError('Add at least one option'); return; }
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        name: name.trim(),
        type,
        options: type === 'categorical' ? options.filter(o => o.trim()) : undefined,
        color,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pb-0 pt-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary)]/10">
              <Tag className="h-4 w-4 text-[var(--primary)]" />
            </div>
            <h2 className="text-lg font-bold tracking-tight">
              {variable ? 'Edit Variable' : 'New Variable'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-6 px-6 py-6">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-600 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Variable Name
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Hook Type, Is Question, Rating..."
              autoFocus
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm font-medium text-[var(--text)] placeholder:text-[var(--text-muted)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/15"
            />
          </div>

          {/* Type */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Type
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {TYPE_OPTIONS.map(opt => {
                const active = type === opt.value;
                const TypeIcon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setType(opt.value)}
                    className={`relative overflow-hidden rounded-xl border-2 px-3 py-3.5 text-left transition-all ${
                      active
                        ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                        : 'border-[var(--border)] hover:border-[var(--primary)]/30 hover:bg-[var(--accent)]/50'
                    }`}
                  >
                    <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${
                      active ? 'bg-[var(--primary)]/15' : 'bg-[var(--accent)]'
                    }`}>
                      <TypeIcon className={`h-4 w-4 ${active ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`} />
                    </div>
                    <div className={`text-xs font-bold ${active ? 'text-[var(--primary)]' : ''}`}>
                      {opt.label}
                    </div>
                    <div className="mt-0.5 text-[10px] leading-snug text-[var(--text-muted)]">
                      {opt.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Categorical Options */}
          {type === 'categorical' && (
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Options
              </label>
              <div className="space-y-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)]/50 p-3">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[10px] font-bold text-[var(--primary)]">
                      {i + 1}
                    </div>
                    <input
                      value={opt}
                      onChange={e => {
                        const next = [...options];
                        next[i] = e.target.value;
                        setOptions(next);
                      }}
                      placeholder={`Option ${i + 1}`}
                      className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]/15"
                    />
                    {options.length > 1 && (
                      <button
                        onClick={() => setOptions(options.filter((_, j) => j !== i))}
                        className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setOptions([...options, ''])}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--primary)] transition-colors hover:border-[var(--primary)]/40 hover:bg-[var(--primary)]/5"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Option
                </button>
              </div>
            </div>
          )}

          {/* Color */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Color — {COLOR_NAMES[color] || 'Custom'}
            </label>
            <div className="flex gap-3">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  title={COLOR_NAMES[c]}
                  className={`h-8 w-8 rounded-full transition-all ${COLOR_MAP[c]} ${
                    color === c
                      ? 'scale-110 ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--surface)]'
                      : 'opacity-50 hover:opacity-80 hover:scale-105'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] bg-[var(--background)]/50 px-6 py-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : variable ? 'Update Variable' : 'Create Variable'}
          </Button>
        </div>
      </div>
    </div>
  );
}
