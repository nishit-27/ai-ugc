'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/useToast';
import { useConnections } from '@/hooks/useConnections';
import { RefreshCw, Plus, Users, Link2, CheckCircle2 } from 'lucide-react';
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
    apiKeyCount,
    keyUsage,
    currentProfile,
    setCurrentProfile,
    profileAccounts,
    isLoadingPage,
    refreshing,
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
    const res = await fetch(`/api/late/profiles/${currentProfile._id}`, { method: 'DELETE' });
    if (!res.ok) {
      showToast('Failed to delete profile', 'error');
      return;
    }
    showToast('Profile deleted', 'success');
    setCurrentProfile(null);
    await refresh();
  };

  const stats = [
    { label: 'Profiles', value: profiles.length, icon: <Users className="h-4 w-4" /> },
    { label: 'Accounts', value: accounts.length, icon: <Link2 className="h-4 w-4" /> },
    { label: 'Connected', value: profileAccounts.length, icon: <CheckCircle2 className="h-4 w-4" /> },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Connections</h1>
            <p className="text-xs text-[var(--text-muted)]">Manage connected platforms per profile</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={() => void refresh()} disabled={refreshing}>
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
            <button
              onClick={() => setNewProfileModal(true)}
              className="flex items-center gap-1.5 rounded-xl bg-[var(--master)] px-4 py-2 text-xs font-medium text-white transition-colors hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              New Profile
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {stats.map((stat) => (
            <div key={stat.label} className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5">
              <div className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--text-muted)]">
                {stat.icon}
              </div>
              <p className="text-sm font-semibold">{stat.value}</p>
              <p className="text-xs text-[var(--text-muted)]">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <ProfileSelector
        profiles={profiles}
        accounts={accounts}
        currentProfile={currentProfile}
        setCurrentProfile={setCurrentProfile}
        onEdit={() => setEditProfileModal(true)}
        onDelete={handleDeleteProfile}
        isLoading={isLoadingPage}
      />

      <PlatformGrid
        profileAccounts={profileAccounts}
        currentProfile={currentProfile}
        loadConnections={refresh}
        isLoading={isLoadingPage}
      />

      <NewProfileModal
        open={newProfileModal}
        onClose={() => setNewProfileModal(false)}
        onCreated={refresh}
        apiKeyCount={apiKeyCount}
        keyUsage={keyUsage}
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
