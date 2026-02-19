'use client';

import { useState, useEffect } from 'react';
import type { Profile } from '@/types';
import { useToast } from '@/hooks/useToast';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import { getProfileInitials, getProfileAvatarClassFromProfile, getProfileAvatarClass } from './profileAvatar';
import GlBadge from '@/components/ui/GlBadge';

export default function EditProfileModal({
  open,
  onClose,
  profile,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile | null;
  onSaved: (updated: Profile) => void;
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState({ name: '', description: '' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (profile && open) {
      setForm({
        name: profile.name,
        description: profile.description || '',
      });
    }
  }, [profile, open]);

  const handleSave = async () => {
    if (!profile) return;
    if (!form.name.trim()) {
      showToast('Profile name is required', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/late/profiles/${profile._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        onClose();
        showToast('Profile updated!', 'success');
        const updated = (data.profile || data) as Profile;
        onSaved(updated);
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit Profile" maxWidth="max-w-md">
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-3 rounded-xl bg-[var(--muted)] px-3 py-2">
          <div
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold ${
              profile ? getProfileAvatarClassFromProfile(profile) : getProfileAvatarClass(form.name || 'profile')
            }`}
          >
            {getProfileInitials(form.name || profile?.name || 'P')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
              {form.name || profile?.name || 'Profile'}
              <GlBadge index={profile?.apiKeyIndex} />
            </p>
            <p className="truncate text-xs text-[var(--text-muted)]">{form.description || 'Update name or description'}</p>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm text-[var(--text-muted)]">Profile Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2.5"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm text-[var(--text-muted)]">Description (optional)</label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2.5"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--master)] py-3 font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <Spinner />
              Saving...
            </>
          ) : (
            'Save Changes'
          )}
        </button>
      </div>
    </Modal>
  );
}
