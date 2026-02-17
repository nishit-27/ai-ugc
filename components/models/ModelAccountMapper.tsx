'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { X, Plus, Loader2, ExternalLink, Search } from 'lucide-react';
import { FaTiktok, FaInstagram, FaYoutube, FaFacebook, FaXTwitter, FaLinkedin } from 'react-icons/fa6';
import type { ModelAccountMapping, Account } from '@/types';

const PLATFORM_META: Record<string, { label: string; icon: ReactNode; color: string; bg: string }> = {
  tiktok:    { label: 'TikTok',    icon: <FaTiktok className="h-3.5 w-3.5" />,    color: '#00f2ea', bg: 'bg-[#00f2ea]/10' },
  instagram: { label: 'Instagram', icon: <FaInstagram className="h-3.5 w-3.5" />, color: '#E1306C', bg: 'bg-[#E1306C]/10' },
  youtube:   { label: 'YouTube',   icon: <FaYoutube className="h-3.5 w-3.5" />,   color: '#FF0000', bg: 'bg-[#FF0000]/10' },
  facebook:  { label: 'Facebook',  icon: <FaFacebook className="h-3.5 w-3.5" />,  color: '#1877F2', bg: 'bg-[#1877F2]/10' },
  twitter:   { label: 'X',         icon: <FaXTwitter className="h-3.5 w-3.5" />,  color: '#ffffff', bg: 'bg-white/10' },
  linkedin:  { label: 'LinkedIn',  icon: <FaLinkedin className="h-3.5 w-3.5" />,  color: '#0A66C2', bg: 'bg-[#0A66C2]/10' },
};

function PlatformIcon({ platform, size = 'sm' }: { platform: string; size?: 'sm' | 'md' }) {
  const meta = PLATFORM_META[platform];
  const sizeClass = size === 'md' ? 'h-8 w-8' : 'h-6 w-6';
  if (!meta) {
    return (
      <div className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full bg-gray-500/10 text-[9px] font-bold text-gray-500`}>
        {platform.charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <div
      className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full ${meta.bg}`}
      style={{ color: meta.color }}
    >
      {meta.icon}
    </div>
  );
}

export default function ModelAccountMapper({
  modelId,
  mappings,
  allAccounts,
  onSave,
  loading,
}: {
  modelId: string;
  mappings: ModelAccountMapping[];
  allAccounts: Account[];
  onSave: (accounts: { lateAccountId: string; platform: string }[]) => Promise<void>;
  loading?: boolean;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState('');
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (showDropdown && addBtnRef.current) {
      const rect = addBtnRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [showDropdown]);

  // Accounts not yet mapped to this model
  const availableAccounts = allAccounts.filter(
    (a) => !mappings.some((m) => m.lateAccountId === a._id)
  );

  // Filter by search
  const filteredAccounts = search.trim()
    ? availableAccounts.filter((a) => {
        const q = search.toLowerCase();
        return (
          (a.username || '').toLowerCase().includes(q) ||
          (a.displayName || '').toLowerCase().includes(q) ||
          a.platform.toLowerCase().includes(q)
        );
      })
    : availableAccounts;

  const handleAdd = async (account: Account) => {
    setIsSaving(true);
    setShowDropdown(false);
    setSearch('');
    const newAccounts = [
      ...mappings.map((m) => ({ lateAccountId: m.lateAccountId, platform: m.platform })),
      { lateAccountId: account._id, platform: account.platform },
    ];
    await onSave(newAccounts);
    setIsSaving(false);
  };

  const handleRemove = async (lateAccountId: string) => {
    setIsSaving(true);
    const newAccounts = mappings
      .filter((m) => m.lateAccountId !== lateAccountId)
      .map((m) => ({ lateAccountId: m.lateAccountId, platform: m.platform }));
    await onSave(newAccounts);
    setIsSaving(false);
  };

  const getAccountInfo = (lateAccountId: string) => {
    return allAccounts.find((a) => a._id === lateAccountId);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-[var(--text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading accounts...
      </div>
    );
  }

  const noAccountsConnected = allAccounts.length === 0;

  return (
    <div>
      {/* Mapped accounts */}
      {mappings.length > 0 ? (
        <div className="space-y-2">
          {mappings.map((mapping) => {
            const account = getAccountInfo(mapping.lateAccountId);
            const meta = PLATFORM_META[mapping.platform];
            return (
              <div
                key={mapping.id}
                className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
              >
                <PlatformIcon platform={mapping.platform} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {account?.username || account?.displayName || mapping.lateAccountId}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">{meta?.label || mapping.platform}</div>
                </div>
                <button
                  onClick={() => handleRemove(mapping.lateAccountId)}
                  disabled={isSaving}
                  className="shrink-0 rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-950/30"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      ) : noAccountsConnected ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-5 text-center">
          <p className="text-xs text-[var(--text-muted)]">No social accounts connected yet</p>
          <Link
            href="/connections"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Go to Connections to add accounts
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] py-4 text-center text-xs text-[var(--text-muted)]">
          No social accounts linked
        </div>
      )}

      {/* Add button — only show if there are accounts to add */}
      {!noAccountsConnected && (
        <div className="mt-2">
          <button
            ref={addBtnRef}
            onClick={() => { setShowDropdown(!showDropdown); setSearch(''); }}
            disabled={isSaving || availableAccounts.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-40 disabled:pointer-events-none"
          >
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            {availableAccounts.length === 0 ? 'All accounts linked' : 'Add Account'}
          </button>

          {showDropdown && dropdownPos && createPortal(
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => { setShowDropdown(false); setSearch(''); }} />
              <div className="fixed z-[70] w-72 overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-2xl dark:bg-neutral-800" style={{ top: dropdownPos.top, left: dropdownPos.left }}>
                {availableAccounts.length > 3 && (
                  <div className="border-b border-[var(--border)] px-3 py-2">
                    <div className="flex items-center gap-2 rounded-lg bg-neutral-100 px-2.5 py-1.5 dark:bg-neutral-700">
                      <Search className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search accounts..."
                        className="w-full bg-transparent text-xs text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100"
                        autoFocus
                      />
                    </div>
                  </div>
                )}

                <div className="max-h-60 overflow-y-auto p-1">
                  {filteredAccounts.length === 0 ? (
                    <div className="px-3 py-3 text-center text-xs text-neutral-500">
                      {search ? 'No matching accounts' : 'No available accounts'}
                    </div>
                  ) : (
                    (() => {
                      const platformOrder = ['tiktok', 'instagram', 'youtube', 'facebook', 'twitter', 'linkedin'];
                      const grouped = new Map<string, Account[]>();
                      for (const account of filteredAccounts) {
                        const list = grouped.get(account.platform) || [];
                        list.push(account);
                        grouped.set(account.platform, list);
                      }
                      const sortedPlatforms = [...grouped.keys()].sort((a, b) => {
                        const ai = platformOrder.indexOf(a);
                        const bi = platformOrder.indexOf(b);
                        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
                      });

                      return sortedPlatforms.map((platform, gi) => {
                        const accounts = grouped.get(platform)!;
                        const meta = PLATFORM_META[platform];
                        return (
                          <div key={platform}>
                            {gi > 0 && <div className="mx-2 my-1 border-t border-neutral-200 dark:border-neutral-700" />}
                            <div className="flex items-center gap-1.5 px-3 py-1.5">
                              <PlatformIcon platform={platform} size="sm" />
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                                {meta?.label || platform}
                              </span>
                            </div>
                            {accounts.map((account) => (
                              <button
                                key={account._id}
                                onClick={() => handleAdd(account)}
                                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700"
                              >
                                {account.profilePicture ? (
                                  <img src={account.profilePicture} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                                ) : (
                                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[10px] font-bold text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300">
                                    {(account.username || account.displayName || '?').charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-xs font-medium text-neutral-900 dark:text-neutral-100">{account.username || account.displayName || account._id}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        );
                      });
                    })()
                  )}
                </div>
              </div>
            </>,
            document.body,
          )}
        </div>
      )}
    </div>
  );
}
