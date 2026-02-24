'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CustomVariable } from '@/hooks/useVariables';

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (data: { name: string; type: string; options?: string[]; color?: string }) => Promise<void>;
  variable?: CustomVariable | null;
};

const TYPE_OPTIONS = [
  { value: 'boolean', label: 'Boolean', desc: 'True / False toggle' },
  { value: 'categorical', label: 'Categorical', desc: 'Pick from predefined options' },
  { value: 'numeric', label: 'Numeric', desc: 'Number value' },
];

const COLORS = ['#7c3aed', '#2563eb', '#059669', '#ea580c', '#dc2626', '#d97706', '#db2777', '#6366f1'];

export default function VariableModal({ open, onClose, onSave, variable }: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState('boolean');
  const [options, setOptions] = useState<string[]>(['']);
  const [color, setColor] = useState<string>(COLORS[0]);
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
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (type === 'categorical') {
      const validOpts = options.filter(o => o.trim());
      if (validOpts.length === 0) {
        setError('Add at least one option');
        return;
      }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-sm font-semibold">{variable ? 'Edit Variable' : 'New Variable'}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-[var(--text-muted)] hover:text-[var(--text)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Hook Type, Is Question, Rating..."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Type</label>
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setType(opt.value)}
                  className={`rounded-lg border px-3 py-2 text-left transition-all ${
                    type === opt.value
                      ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                      : 'border-[var(--border)] hover:border-[var(--primary)]/50'
                  }`}
                >
                  <div className="text-xs font-medium">{opt.label}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {type === 'categorical' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Options</label>
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={opt}
                      onChange={e => {
                        const next = [...options];
                        next[i] = e.target.value;
                        setOptions(next);
                      }}
                      placeholder={`Option ${i + 1}`}
                      className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none"
                    />
                    {options.length > 1 && (
                      <button
                        onClick={() => setOptions(options.filter((_, j) => j !== i))}
                        className="rounded-md p-1 text-[var(--text-muted)] hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setOptions([...options, ''])}
                  className="flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline"
                >
                  <Plus className="h-3 w-3" /> Add Option
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Color</label>
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-6 w-6 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-2 ring-[var(--primary)]' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : variable ? 'Update' : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  );
}
