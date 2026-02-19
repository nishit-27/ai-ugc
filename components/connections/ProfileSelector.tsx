'use client';

import { useState, useRef, useEffect } from 'react';
import type { Profile, Account } from '@/types';
import { useToast } from '@/hooks/useToast';
import { copyToClipboard } from '@/lib/dateUtils';
import { ChevronDown, Pencil, Trash2, Copy, Check, UserRound } from 'lucide-react';
import { getProfileInitials, getProfileAvatarClassFromProfile } from './profileAvatar';
import GlBadge from '@/components/ui/GlBadge';

function getAccountProfileId(account: Account): string | undefined {
  if (!account?.profileId) return undefined;
  if (typeof account.profileId === 'object') return account.profileId._id;
  return account.profileId;
}

function getProfileImage(profileId: string | undefined, accounts: Account[]): string | undefined {
  if (!profileId) return undefined;
  const matched = accounts.find((account) => getAccountProfileId(account) === profileId && !!account.profilePicture);
  return matched?.profilePicture;
}

export default function ProfileSelector({
  profiles,
  accounts,
  currentProfile,
  setCurrentProfile,
  onEdit,
  onDelete,
  isLoading = false,
}: {
  profiles: Profile[];
  accounts: Account[];
  currentProfile: Profile | null;
  setCurrentProfile: (p: Profile | null) => void;
  onEdit: () => void;
  onDelete: () => void;
  isLoading?: boolean;
}) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div className="h-4 w-28 animate-pulse rounded bg-[var(--background)]" />
          <div className="flex gap-2">
            <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--background)]" />
            <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--background)]" />
          </div>
        </div>
        <div className="mt-3 h-14 animate-pulse rounded-xl bg-[var(--background)]" />
      </div>
    );
  }

  if (!profiles.length) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center">
        <div className="mx-auto mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--text-muted)]">
          <UserRound className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium">No profiles yet</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Create a profile to connect accounts.</p>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Active Profile</h3>
          <p className="text-xs text-[var(--text-muted)]">Select which profile receives new connections</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            disabled={!currentProfile}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--background)] text-[var(--text-muted)] transition-colors hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
            title="Edit profile"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            disabled={!currentProfile}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10 text-red-500 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            title="Delete profile"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-3 flex w-full items-center justify-between rounded-xl bg-[var(--background)] px-3 py-3 text-left transition-colors hover:bg-[var(--accent)]"
      >
        <div className="min-w-0 flex items-center gap-3">
          {currentProfile && getProfileImage(currentProfile._id, accounts) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={getProfileImage(currentProfile._id, accounts)}
              alt={currentProfile.name}
              className="h-10 w-10 shrink-0 rounded-xl object-cover"
            />
          ) : currentProfile ? (
            <div className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-semibold ${getProfileAvatarClassFromProfile(currentProfile)}`}>
              {getProfileInitials(currentProfile.name)}
            </div>
          ) : (
            <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--text-muted)]">
              <UserRound className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
              {currentProfile?.name || 'Select profile'}
              <GlBadge index={currentProfile?.apiKeyIndex} />
            </p>
            <p className="truncate text-xs text-[var(--text-muted)]">{currentProfile?.description || 'No description'}</p>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)]">
          <div className="max-h-72 overflow-auto p-1">
            {profiles.map((profile) => {
              const active = currentProfile?._id === profile._id;
              const accountImage = getProfileImage(profile._id, accounts);
              return (
                <button
                  key={profile._id}
                  onClick={() => {
                    setCurrentProfile(profile);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    active ? 'bg-[var(--accent)]' : 'hover:bg-[var(--accent)]'
                  }`}
                >
                  {accountImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={accountImage}
                      alt={profile.name}
                      className="h-8 w-8 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold ${getProfileAvatarClassFromProfile(profile)}`}>
                      {getProfileInitials(profile.name)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {profile.name}
                      <GlBadge index={profile.apiKeyIndex} />
                    </p>
                    {profile.description && <p className="truncate text-xs text-[var(--text-muted)]">{profile.description}</p>}
                  </div>
                  {active && <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--background)] px-2.5 py-1">
          id <span className="font-mono">{currentProfile?._id ?? '-'}</span>
          <button
            onClick={() => currentProfile && copyToClipboard(currentProfile._id, showToast)}
            disabled={!currentProfile}
            className="inline-flex h-4 w-4 items-center justify-center rounded hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
            title="Copy profile ID"
          >
            <Copy className="h-2.5 w-2.5" />
          </button>
        </span>
        <span className="inline-flex rounded-full bg-[var(--background)] px-2.5 py-1">
          {profiles.length} profile{profiles.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}
