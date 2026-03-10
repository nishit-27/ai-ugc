'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, AlertTriangle, ChevronDown, ExternalLink } from 'lucide-react';
import { FaTiktok, FaInstagram, FaYoutube, FaFacebook, FaXTwitter, FaLinkedin } from 'react-icons/fa6';
import { useModels } from '@/hooks/useModels';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import ModelGrid from '@/components/models/ModelGrid';
import NewModelModal from '@/components/models/NewModelModal';
import ModelDetailModal from '@/components/models/ModelDetailModal';

const ALL_GROUPS_KEY = '__all__';
const UNGROUPED_KEY = '__ungrouped__';

type InactiveAccount = {
  modelId: string;
  modelName: string;
  lateAccountId: string;
  platform: string;
  username?: string;
  displayName?: string;
  status: string;
  issues: string[];
  needsReconnect: boolean;
  apiKeyIndex: number;
  accountLabel: string;
};

const PLATFORM_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  tiktok:    { label: 'TikTok',    icon: <FaTiktok className="h-3.5 w-3.5" />,    color: '#00f2ea' },
  instagram: { label: 'Instagram', icon: <FaInstagram className="h-3.5 w-3.5" />, color: '#E1306C' },
  youtube:   { label: 'YouTube',   icon: <FaYoutube className="h-3.5 w-3.5" />,   color: '#FF0000' },
  facebook:  { label: 'Facebook',  icon: <FaFacebook className="h-3.5 w-3.5" />,  color: '#1877F2' },
  twitter:   { label: 'X',         icon: <FaXTwitter className="h-3.5 w-3.5" />,  color: '#9ca3af' },
  linkedin:  { label: 'LinkedIn',  icon: <FaLinkedin className="h-3.5 w-3.5" />,  color: '#0A66C2' },
};

export default function ModelsPage() {
  const { models, modelImages, isLoadingPage, imagesLoading, refresh, loadModelImages } = useModels();
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [newModelModal, setNewModelModal] = useState(false);
  const [modelDetailModal, setModelDetailModal] = useState(false);
  const [search, setSearch] = useState('');
  const [activeGroupKey, setActiveGroupKey] = useState(ALL_GROUPS_KEY);
  const [viewMode, setViewMode] = useState<'active' | 'inactive'>('active');
  const [inactiveAccounts, setInactiveAccounts] = useState<InactiveAccount[]>([]);
  const [inactiveLoading, setInactiveLoading] = useState(false);
  const [inactiveLoaded, setInactiveLoaded] = useState(false);
  const handleRefresh = refresh;

  const loadInactiveAccounts = useCallback(async () => {
    setInactiveLoading(true);
    try {
      const res = await fetch('/api/models/inactive-accounts', { cache: 'no-store' });
      const data = await res.json();
      setInactiveAccounts(data.inactiveAccounts || []);
      setInactiveLoaded(true);
    } catch (e) {
      console.error('Failed to load inactive accounts:', e);
    } finally {
      setInactiveLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!inactiveLoaded) {
      loadInactiveAccounts();
    }
  }, [inactiveLoaded, loadInactiveAccounts]);

  const groupData = useMemo(() => {
    const groupCounts = new Map<string, number>();
    let ungroupedCount = 0;

    for (const model of models) {
      const groups = model.groupNames?.filter((g) => g.trim()) || [];
      if (groups.length === 0) {
        ungroupedCount += 1;
      }
      for (const groupName of groups) {
        groupCounts.set(groupName, (groupCounts.get(groupName) || 0) + 1);
      }
    }

    const existingGroupNames = Array.from(groupCounts.keys()).sort((a, b) => a.localeCompare(b));

    const groupOptions = [
      { key: ALL_GROUPS_KEY, label: 'All Models', count: models.length },
      ...existingGroupNames.map((groupName) => ({
        key: `group:${groupName}`,
        label: groupName,
        count: groupCounts.get(groupName) || 0,
      })),
    ];

    if (ungroupedCount > 0) {
      groupOptions.push({ key: UNGROUPED_KEY, label: 'Ungrouped', count: ungroupedCount });
    }

    return {
      groupOptions,
      existingGroupNames,
    };
  }, [models]);

  const resolvedGroupKey = groupData.groupOptions.some((group) => group.key === activeGroupKey)
    ? activeGroupKey
    : ALL_GROUPS_KEY;

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) || null,
    [models, selectedModelId],
  );

  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models.filter((model) => {
      const groups = model.groupNames?.filter((g) => g.trim()) || [];

      const groupMatch = resolvedGroupKey === ALL_GROUPS_KEY
        ? true
        : resolvedGroupKey === UNGROUPED_KEY
          ? groups.length === 0
          : groups.includes(resolvedGroupKey.slice('group:'.length));

      if (!groupMatch) return false;
      if (!q) return true;

      return (
        model.name.toLowerCase().includes(q) ||
        groups.some((g) => g.toLowerCase().includes(q)) ||
        (model.linkedPlatforms || []).some((platform) => platform.toLowerCase().includes(q))
      );
    });
  }, [models, search, resolvedGroupKey]);

  const filteredInactive = inactiveAccounts;

  const inactiveByModel = useMemo(() => {
    const map = new Map<string, { modelId: string; modelName: string; accounts: InactiveAccount[] }>();
    for (const acc of filteredInactive) {
      if (!map.has(acc.modelId)) {
        map.set(acc.modelId, { modelId: acc.modelId, modelName: acc.modelName, accounts: [] });
      }
      map.get(acc.modelId)!.accounts.push(acc);
    }
    return Array.from(map.values());
  }, [filteredInactive]);

  const currentGroupOption = groupData.groupOptions.find((g) => g.key === resolvedGroupKey);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)]">Models</h1>
          <p className="text-xs text-[var(--text-muted)]">
            {models.length} model{models.length !== 1 ? 's' : ''} &middot; {groupData.existingGroupNames.length} group{groupData.existingGroupNames.length !== 1 ? 's' : ''} &middot; Manage personas and link social accounts
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={() => { handleRefresh(); if (viewMode === 'inactive') { setInactiveLoaded(false); } }}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
          <Link
            href="/model-groups"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--primary)]/40 hover:text-[var(--text)]"
          >
            Manage Groups
          </Link>
          <button
            onClick={() => setNewModelModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-medium text-white transition-colors hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            New Model
          </button>
        </div>
      </div>

      {/* Controls: Dropdown + Toggle + Search */}
      {(models.length > 0 || groupData.existingGroupNames.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {/* Group Dropdown */}
            <div className="relative">
              <select
                value={resolvedGroupKey}
                onChange={(e) => setActiveGroupKey(e.target.value)}
                className="appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-3 pr-8 text-sm font-medium text-[var(--text)] transition-colors hover:border-[var(--primary)]/40 focus:border-[var(--primary)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--primary)]/20"
              >
                {groupData.groupOptions.map((group) => (
                  <option key={group.key} value={group.key}>
                    {group.label} ({group.count})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            </div>

            {/* Active / Inactive Toggle */}
            <div className="flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
              <button
                onClick={() => setViewMode('active')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === 'active'
                    ? 'bg-[var(--primary)] text-white shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setViewMode('inactive')}
                className={`relative rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === 'inactive'
                    ? 'bg-red-500 text-white shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                Inactive
                {inactiveLoaded && filteredInactive.length > 0 && viewMode !== 'inactive' && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {filteredInactive.length}
                  </span>
                )}
              </button>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Folder count */}
            <span className="hidden text-[10px] text-[var(--text-muted)] sm:block">
              {groupData.existingGroupNames.length} folder{groupData.existingGroupNames.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Search - only in active mode */}
          {viewMode === 'active' && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by model, group, or platform..."
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-10 pr-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--primary)]/20"
              />
            </div>
          )}
        </div>
      )}

      {/* Active View: Model Grid */}
      {viewMode === 'active' && (
        <ModelGrid
          models={filteredModels}
          isLoading={isLoadingPage}
          onModelClick={(model) => {
            setSelectedModelId(model.id);
            loadModelImages(model.id);
            setModelDetailModal(true);
          }}
          onNewModel={() => setNewModelModal(true)}
        />
      )}

      {/* Inactive View: Card grid matching active view style */}
      {viewMode === 'inactive' && (
        <div className="space-y-4">
          {inactiveLoading && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                  <div className="aspect-[3/4] animate-pulse bg-[var(--background)]" />
                </div>
              ))}
            </div>
          )}

          {!inactiveLoading && inactiveByModel.length === 0 && (
            <div className="rounded-xl border border-dashed border-green-300 bg-green-50 p-12 text-center dark:border-green-800 dark:bg-green-950/30">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
                <svg className="h-7 w-7 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="mb-1 text-lg font-semibold text-green-800 dark:text-green-200">All accounts are healthy</h3>
              <p className="text-sm text-green-600 dark:text-green-400">No accounts need reconnection right now.</p>
            </div>
          )}

          {!inactiveLoading && inactiveByModel.length > 0 && (
            <>
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/30">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                <p className="text-sm text-red-700 dark:text-red-300">
                  <span className="font-semibold">{filteredInactive.length}</span> account{filteredInactive.length !== 1 ? 's' : ''} across{' '}
                  <span className="font-semibold">{inactiveByModel.length}</span> model{inactiveByModel.length !== 1 ? 's' : ''} need reconnection.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {inactiveByModel.map(({ modelId, modelName, accounts }) => {
                  const model = models.find((m) => m.id === modelId);
                  const groupNames = model?.groupNames?.filter((g) => g.trim()) || [];
                  const groupLabel = groupNames.length > 0 ? groupNames.join(', ') : '';

                  return (
                    <div
                      key={modelId}
                      className="group overflow-hidden rounded-xl border border-red-300 bg-[var(--surface)] transition-all hover:border-red-400 hover:shadow-lg dark:border-red-800 dark:hover:border-red-600"
                    >
                      {/* Card image area — same aspect ratio as active cards */}
                      <div className="relative aspect-[3/4] bg-[var(--background)]">
                        {model?.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={model.avatarUrl}
                            alt={modelName}
                            loading="lazy"
                            className="absolute inset-0 h-full w-full object-cover brightness-75"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]/30">
                            <AlertTriangle className="h-16 w-16" />
                          </div>
                        )}

                        {/* Inactive platform badges — top right */}
                        <div className="absolute right-2 top-2 flex items-center gap-1">
                          {accounts.map((acc) => {
                            const meta = PLATFORM_META[acc.platform];
                            return (
                              <div
                                key={acc.lateAccountId}
                                className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/80 backdrop-blur-sm"
                                title={`${meta?.label || acc.platform} — ${acc.status === 'error' ? 'Expired' : 'Needs reconnection'}`}
                                style={{ color: '#fff' }}
                              >
                                {meta?.icon || <span className="text-[8px] font-bold">{acc.platform.charAt(0).toUpperCase()}</span>}
                              </div>
                            );
                          })}
                        </div>

                        {/* Red warning badge — top left */}
                        <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          {accounts.length} expired
                        </div>

                        {/* Bottom gradient with name + reconnect */}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-3 pt-10">
                          {groupLabel && (
                            <span className="mb-1 inline-flex max-w-full truncate rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white/90 backdrop-blur-sm">
                              {groupLabel}
                            </span>
                          )}
                          <div className="truncate text-sm font-semibold text-white">{modelName}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {accounts.map((acc) => {
                              const meta = PLATFORM_META[acc.platform];
                              return (
                                <span
                                  key={acc.lateAccountId}
                                  className="inline-flex items-center gap-1 rounded-full bg-red-500/30 px-1.5 py-0.5 text-[9px] text-white/90 backdrop-blur-sm"
                                >
                                  {meta?.label || acc.platform}
                                  {acc.username ? `: @${acc.username}` : ''}
                                </span>
                              );
                            })}
                          </div>
                          <Link
                            href="/connections"
                            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/30"
                          >
                            Reconnect
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      <NewModelModal
        open={newModelModal}
        onClose={() => setNewModelModal(false)}
        onCreated={handleRefresh}
        existingGroupNames={groupData.existingGroupNames}
      />

      <ModelDetailModal
        open={modelDetailModal}
        onClose={() => setModelDetailModal(false)}
        model={selectedModel}
        modelImages={modelImages}
        imagesLoading={imagesLoading}
        loadModelImages={loadModelImages}
        loadModels={handleRefresh}
        existingGroupNames={groupData.existingGroupNames}
      />
    </div>
  );
}
