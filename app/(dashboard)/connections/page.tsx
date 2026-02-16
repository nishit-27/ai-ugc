'use client';

import { useState } from 'react';
import type { Profile } from '@/types';
import { useToast } from '@/hooks/useToast';
import { useConnections } from '@/hooks/useConnections';
import { RefreshCw, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import ProfileSelector from '@/components/connections/ProfileSelector';
import PlatformGrid from '@/components/connections/PlatformGrid';
import NewProfileModal from '@/components/connections/NewProfileModal';
import EditProfileModal from '@/components/connections/EditProfileModal';

export default function ConnectionsPage() {
  const { showToast } = useToast();
  const {
    profiles,
    accounts,
    currentProfile,
    setCurrentProfile,
    profileAccounts,
    refresh,
  } = useConnections();

  const [newProfileModal, setNewProfileModal] = useState(false);
  const [editProfileModal, setEditProfileModal] = useState(false);

  const handleDeleteProfile = async () => {
    if (!currentProfile) return;
    const accs = accounts.filter((a) => {
      const pId = typeof a.profileId === 'object' ? (a.profileId as { _id: string })?._id : a.profileId;
      return pId === currentProfile._id;
    });
    if (accs.length > 0) {
      showToast('Disconnect all accounts before deleting profile', 'error');
      return;
    }
    if (!confirm(`Delete "${currentProfile.name}"?`)) return;
    await fetch(`/api/late/profiles/${currentProfile._id}`, { method: 'DELETE' });
    showToast('Profile deleted', 'success');
    setCurrentProfile(null as unknown as Profile);
    refresh();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)]">Connections</h1>
          <p className="text-xs text-[var(--text-muted)]">
            {profiles.length} profile{profiles.length !== 1 ? 's' : ''} &middot; {accounts.length} account{accounts.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={refresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
          <button
            onClick={() => setNewProfileModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-medium text-white transition-colors hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            New Profile
          </button>
        </div>
      </div>

      <ProfileSelector
        profiles={profiles}
        currentProfile={currentProfile}
        setCurrentProfile={setCurrentProfile}
        onEdit={() => setEditProfileModal(true)}
        onDelete={handleDeleteProfile}
      />

      <PlatformGrid
        profileAccounts={profileAccounts}
        currentProfile={currentProfile}
        loadConnections={refresh}
      />

      <NewProfileModal
        open={newProfileModal}
        onClose={() => setNewProfileModal(false)}
        onCreated={refresh}
      />

      <EditProfileModal
        open={editProfileModal}
        onClose={() => setEditProfileModal(false)}
        profile={currentProfile}
        onSaved={(updated) => {
          if (currentProfile && updated._id === currentProfile._id) {
            setCurrentProfile(updated);
          }
          refresh();
        }}
      />
    </div>
  );
}
