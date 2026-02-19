'use client';

import { useState, type ReactNode } from 'react';
import type { Profile, Account } from '@/types';
import { useToast } from '@/hooks/useToast';
import { copyToClipboard } from '@/lib/dateUtils';
import { Link2, Link2Off, Copy, ExternalLink, UserRound } from 'lucide-react';
import { FaTiktok, FaInstagram, FaYoutube, FaFacebook, FaXTwitter, FaLinkedin } from 'react-icons/fa6';
import Spinner from '@/components/ui/Spinner';
import GlBadge from '@/components/ui/GlBadge';

const PLATFORMS: { id: string; label: string; icon: ReactNode; color: string }[] = [
  { id: 'tiktok', label: 'TikTok', icon: <FaTiktok className="h-5 w-5" />, color: '#00f2ea' },
  { id: 'instagram', label: 'Instagram', icon: <FaInstagram className="h-5 w-5" />, color: '#E1306C' },
  { id: 'youtube', label: 'YouTube', icon: <FaYoutube className="h-5 w-5" />, color: '#FF0000' },
  { id: 'facebook', label: 'Facebook', icon: <FaFacebook className="h-5 w-5" />, color: '#1877F2' },
  { id: 'twitter', label: 'X (Twitter)', icon: <FaXTwitter className="h-5 w-5" />, color: '#9ca3af' },
  { id: 'linkedin', label: 'LinkedIn', icon: <FaLinkedin className="h-5 w-5" />, color: '#0A66C2' },
];

export default function PlatformGrid({
  profileAccounts,
  currentProfile,
  loadConnections,
  isLoading = false,
}: {
  profileAccounts: Account[];
  currentProfile: Profile | null;
  loadConnections: () => Promise<void>;
  isLoading?: boolean;
}) {
  const { showToast } = useToast();
  const [isConnecting, setIsConnecting] = useState<string | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-4 w-40 animate-pulse rounded bg-[var(--accent)]" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="mb-3 flex items-center gap-3">
                <div className="h-10 w-10 animate-pulse rounded-xl bg-[var(--background)]" />
                <div className="space-y-1.5">
                  <div className="h-3.5 w-24 animate-pulse rounded bg-[var(--background)]" />
                  <div className="h-3 w-16 animate-pulse rounded bg-[var(--background)]" />
                </div>
              </div>
              <div className="mb-3 h-12 animate-pulse rounded-xl bg-[var(--background)]" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-9 animate-pulse rounded-xl bg-[var(--background)]" />
                <div className="h-9 animate-pulse rounded-xl bg-[var(--background)]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!currentProfile) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
        <div className="mx-auto mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--text-muted)]">
          <UserRound className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium">Select a profile to manage connections</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Once selected, each platform can be connected here.</p>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-muted)]">Platform Connections</h3>
        <p className="text-xs text-[var(--text-muted)]">
          {profileAccounts.length} connected of {PLATFORMS.length}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {PLATFORMS.map(({ id, label, icon, color }) => {
          const account = profileAccounts.find((item) => item.platform === id);
          const connectBusy = isConnecting === id;
          const disconnectBusy = !!account && isDisconnecting === account._id;
          const inviteBusy = isInviting === id;

          return (
            <article key={id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="mb-3 flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--background)]" style={{ color }}>
                  {icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{label}</p>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      account ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300' : 'bg-[var(--background)] text-[var(--text-muted)]'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${account ? 'bg-emerald-500' : 'bg-[var(--text-muted)]/50'}`} />
                    {account ? 'Connected' : 'Not connected'}
                  </span>
                </div>
              </div>

              {account ? (
                <>
                  <div className="mb-3 rounded-xl bg-[var(--background)] px-2.5 py-2">
                    <div className="flex items-center gap-2.5">
                      <div className="relative h-9 w-9 shrink-0 rounded-full">
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
                          style={{ backgroundColor: color }}
                        >
                          {(account.username || account.displayName || '?').charAt(0).toUpperCase()}
                        </div>
                        {account.profilePicture && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={account.profilePicture}
                            alt={account.username || account.displayName || 'Profile'}
                            className="absolute inset-0 h-full w-full rounded-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-xs font-semibold">
                          @{account.username || account.displayName || 'unknown'}
                          <GlBadge index={account.apiKeyIndex} />
                        </p>
                        {account.createdAt && (
                          <p className="text-[10px] text-[var(--text-muted)]">
                            Connected {new Date(account.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => copyToClipboard(account._id, showToast)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)]"
                        title="Copy account ID"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={async () => {
                        if (!confirm('Disconnect this account?')) return;
                        setIsDisconnecting(account._id);
                        try {
                          const res = await fetch(`/api/late/accounts/${account._id}?apiKeyIndex=${account.apiKeyIndex ?? 0}`, { method: 'DELETE' });
                          if (!res.ok) throw new Error('Failed to disconnect');
                          showToast('Disconnected', 'success');
                          await loadConnections();
                        } catch {
                          showToast('Failed to disconnect account', 'error');
                        } finally {
                          setIsDisconnecting(null);
                        }
                      }}
                      disabled={disconnectBusy}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[var(--background)] text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {disconnectBusy ? <Spinner className="h-3.5 w-3.5" /> : <Link2Off className="h-3.5 w-3.5" />}
                      {disconnectBusy ? 'Removing...' : 'Disconnect'}
                    </button>
                    <button
                      onClick={async () => {
                        setIsInviting(id);
                        try {
                          const res = await fetch(`/api/late/invite/${id}?profileId=${currentProfile._id}`);
                          const data = await res.json();
                          if (!data.inviteUrl) throw new Error('Missing invite URL');
                          copyToClipboard(data.inviteUrl, showToast);
                          showToast('Invite link copied', 'success');
                        } catch {
                          showToast('Failed to get invite link', 'error');
                        } finally {
                          setIsInviting(null);
                        }
                      }}
                      disabled={inviteBusy}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[var(--background)] text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {inviteBusy ? <Spinner className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
                      {inviteBusy ? 'Loading...' : 'Invite'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mb-3 rounded-xl bg-[var(--background)] px-3 py-2 text-xs text-[var(--text-muted)]">
                    Connect this platform for <span className="font-medium text-[var(--text)]">{currentProfile.name}</span>.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={async () => {
                        setIsConnecting(id);
                        try {
                          const res = await fetch(`/api/late/connect/${id}?profileId=${currentProfile._id}`);
                          const data = await res.json();
                          if (!data.connectUrl) throw new Error(data.error || 'Missing connect URL');
                          window.open(data.connectUrl, '_blank', 'noopener,noreferrer');
                          showToast('Authorize in the new tab, then press refresh', 'success');
                        } catch {
                          showToast(`Failed to connect ${label}`, 'error');
                        } finally {
                          setIsConnecting(null);
                        }
                      }}
                      disabled={connectBusy}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[var(--master)] text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {connectBusy ? <Spinner className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                      {connectBusy ? 'Connecting...' : 'Connect'}
                    </button>
                    <button
                      onClick={async () => {
                        setIsInviting(id);
                        try {
                          const res = await fetch(`/api/late/invite/${id}?profileId=${currentProfile._id}`);
                          const data = await res.json();
                          if (!data.inviteUrl) throw new Error('Missing invite URL');
                          copyToClipboard(data.inviteUrl, showToast);
                          showToast('Invite link copied', 'success');
                        } catch {
                          showToast('Failed to get invite link', 'error');
                        } finally {
                          setIsInviting(null);
                        }
                      }}
                      disabled={inviteBusy}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[var(--background)] text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {inviteBusy ? <Spinner className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
                      {inviteBusy ? 'Loading...' : 'Invite'}
                    </button>
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
