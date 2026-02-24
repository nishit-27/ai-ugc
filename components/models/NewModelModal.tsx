'use client';

import { useState } from 'react';
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
  const [form, setForm] = useState({ name: '', description: '', groupName: '' });
  const [isCreating, setIsCreating] = useState(false);

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
        body: JSON.stringify(form),
      });
      if (res.ok) {
        onClose();
        setForm({ name: '', description: '', groupName: '' });
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
          <label className="mb-2 block text-sm text-[var(--text-muted)]">Group / Folder (optional)</label>
          <input
            type="text"
            list="model-group-suggestions"
            value={form.groupName}
            onChange={(e) => setForm((p) => ({ ...p, groupName: e.target.value }))}
            placeholder="e.g., Education Creators"
            className="w-full rounded-lg border border-[var(--border)] px-4 py-2"
          />
          {existingGroupNames.length > 0 && (
            <datalist id="model-group-suggestions">
              {existingGroupNames.map((groupName) => (
                <option key={groupName} value={groupName} />
              ))}
            </datalist>
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
