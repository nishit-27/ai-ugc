'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';

export default function NewModelModal({
  open,
  onClose,
  onCreated,
  existingGroupNames = [],
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  existingGroupNames?: string[];
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState({ name: '', description: '' });
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const toggleGroup = (groupName: string) => {
    setSelectedGroups((prev) =>
      prev.includes(groupName) ? prev.filter((g) => g !== groupName) : [...prev, groupName],
    );
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      showToast('Model name is required', 'error');
      return;
    }
    setIsCreating(true);
    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          groupNames: selectedGroups,
        }),
      });
      if (res.ok) {
        onClose();
        setForm({ name: '', description: '' });
        setSelectedGroups([]);
        showToast('Model created!', 'success');
        onCreated();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed', 'error');
      }
    } catch {
      showToast('Error creating model', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create New Model" maxWidth="max-w-md">
      <div className="space-y-4 p-4">
        <div>
          <label className="mb-2 block text-sm text-[var(--text-muted)]">Model Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g., Sarah"
            className="w-full rounded-lg border border-[var(--border)] px-4 py-2"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm text-[var(--text-muted)]">Description (optional)</label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="e.g., Main UGC persona"
            className="w-full rounded-lg border border-[var(--border)] px-4 py-2"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm text-[var(--text-muted)]">Groups (optional)</label>
          {existingGroupNames.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {existingGroupNames.map((groupName) => {
                const checked = selectedGroups.includes(groupName);
                return (
                  <button
                    key={groupName}
                    type="button"
                    onClick={() => toggleGroup(groupName)}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      checked
                        ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                        : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--primary)]/50'
                    }`}
                  >
                    {checked && <Check className="h-3 w-3" />}
                    {groupName}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">No groups created yet. Create groups from the Model Groups page.</p>
          )}
        </div>
        <button
          onClick={handleCreate}
          disabled={isCreating}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] py-3 font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
        >
          {isCreating ? (
            <>
              <Spinner />
              Creating...
            </>
          ) : (
            'Create Model'
          )}
        </button>
      </div>
    </Modal>
  );
}
