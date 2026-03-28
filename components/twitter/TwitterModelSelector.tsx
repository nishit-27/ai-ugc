'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { Search, CheckSquare, Square, Check, Minus, Loader2, AlertTriangle } from 'lucide-react';
import gsap from 'gsap';
import type { Model } from '@/types';

const UNGROUPED_KEY = '__ungrouped__';
const UNGROUPED_LABEL = 'Ungrouped';

type ModelGroup = {
  key: string;
  label: string;
  models: Model[];
};

function groupModels(models: Model[]): ModelGroup[] {
  const grouped = new Map<string, Model[]>();
  const seen = new Map<string, Set<string>>();

  for (const model of models) {
    const groups = model.groupNames?.filter((g) => g.trim()) || [];

    if (groups.length === 0) {
      const existing = grouped.get(UNGROUPED_KEY) || [];
      existing.push(model);
      grouped.set(UNGROUPED_KEY, existing);
    } else {
      for (const groupName of groups) {
        const ids = seen.get(groupName) || new Set();
        if (ids.has(model.id)) continue;
        ids.add(model.id);
        seen.set(groupName, ids);

        const existing = grouped.get(groupName) || [];
        existing.push(model);
        grouped.set(groupName, existing);
      }
    }
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => {
      if (a === UNGROUPED_KEY) return 1;
      if (b === UNGROUPED_KEY) return -1;
      return a.localeCompare(b);
    })
    .map(([key, entries]) => ({
      key,
      label: key === UNGROUPED_KEY ? UNGROUPED_LABEL : key,
      models: [...entries].sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

type InactiveInfo = { platform: string; username?: string };

export default function TwitterModelSelector({
  models,
  isLoading,
  selectedIds,
  onChange,
  twitterAccountCounts,
}: {
  models: Model[];
  isLoading?: boolean;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  twitterAccountCounts?: Record<string, number>;
}) {
  const [search, setSearch] = useState('');
  const [inactiveByModel, setInactiveByModel] = useState<Record<string, InactiveInfo[]>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Only show models that have Twitter connected
  const twitterModels = useMemo(
    () => models.filter((m) => (twitterAccountCounts?.[m.id] || 0) > 0),
    [models, twitterAccountCounts]
  );

  useEffect(() => {
    let cancelled = false;
    fetch('/api/models/inactive-accounts', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const map: Record<string, InactiveInfo[]> = {};
        for (const acc of data.inactiveAccounts || []) {
          if (acc.platform !== 'twitter') continue; // Only show Twitter-related inactive
          if (!map[acc.modelId]) map[acc.modelId] = [];
          map[acc.modelId].push({ platform: acc.platform, username: acc.username });
        }
        setInactiveByModel(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Animate on mount
  useEffect(() => {
    if (!containerRef.current || isLoading) return;
    gsap.fromTo(
      containerRef.current,
      { y: 10, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: 0.3, ease: 'power2.out' }
    );
  }, [isLoading]);

  const groupedModels = useMemo(() => groupModels(twitterModels), [twitterModels]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groupedModels;

    return groupedModels
      .map((group) => {
        if (group.label.toLowerCase().includes(q)) return group;
        const matchingModels = group.models.filter((model) => model.name.toLowerCase().includes(q));
        if (matchingModels.length === 0) return null;
        return { ...group, models: matchingModels };
      })
      .filter((group): group is ModelGroup => group !== null);
  }, [groupedModels, search]);

  const filteredModelIds = useMemo(
    () => filteredGroups.flatMap((group) => group.models.map((model) => model.id)),
    [filteredGroups],
  );

  const allFilteredSelected = filteredModelIds.length > 0 && filteredModelIds.every((id) => selectedIds.includes(id));

  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      const filteredIdSet = new Set(filteredModelIds);
      onChange(selectedIds.filter((id) => !filteredIdSet.has(id)));
      return;
    }
    const next = new Set(selectedIds);
    filteredModelIds.forEach((id) => next.add(id));
    onChange(Array.from(next));
  };

  const toggleGroup = (group: ModelGroup) => {
    const groupIds = group.models.map((model) => model.id);
    const isFullySelected = groupIds.every((id) => selectedIds.includes(id));

    if (isFullySelected) {
      const groupIdSet = new Set(groupIds);
      onChange(selectedIds.filter((id) => !groupIdSet.has(id)));
      return;
    }

    const next = new Set(selectedIds);
    groupIds.forEach((id) => next.add(id));
    onChange(Array.from(next));
  };

  const toggleModel = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((existingId) => existingId !== id)
        : [...selectedIds, id],
    );
  };

  const renderGroupIndicator = (group: ModelGroup) => {
    const groupIds = group.models.map((model) => model.id);
    const selectedCount = groupIds.filter((id) => selectedIds.includes(id)).length;
    const isFullySelected = selectedCount > 0 && selectedCount === groupIds.length;
    const isPartiallySelected = selectedCount > 0 && selectedCount < groupIds.length;

    if (isFullySelected) return <CheckSquare className="h-3 w-3 text-[#1DA1F2]" />;
    if (isPartiallySelected) {
      return (
        <span className="flex h-3 w-3 items-center justify-center rounded-[3px] border border-[#1DA1F2] text-[#1DA1F2]">
          <Minus className="h-2.5 w-2.5" />
        </span>
      );
    }
    return <Square className="h-3 w-3" />;
  };

  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading models...
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg border border-[var(--border)] p-2">
            <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[var(--bg-tertiary)]" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-20 animate-pulse rounded bg-[var(--bg-tertiary)]" />
              <div className="h-2 w-14 animate-pulse rounded bg-[var(--bg-tertiary)]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (twitterModels.length === 0) {
    return (
      <div className="py-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
          <svg className="h-5 w-5 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </div>
        <p className="mb-1 text-xs font-medium text-[var(--text-primary)]">No models with X connected</p>
        <p className="text-[10px] text-[var(--text-muted)]">
          Connect X/Twitter accounts to your models in{' '}
          <a href="/models" className="text-[#1DA1F2] underline">Models</a>
          {' '}or{' '}
          <a href="/connections" className="text-[#1DA1F2] underline">Connections</a>
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      {/* Search + All toggle */}
      <div className="mb-2 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models or groups..."
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1.5 pl-7 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#1DA1F2] focus:outline-none"
          />
        </div>
        <button
          onClick={toggleAllFiltered}
          className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-[10px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)]"
        >
          {allFilteredSelected ? <CheckSquare className="h-3 w-3 text-[#1DA1F2]" /> : <Square className="h-3 w-3" />}
          {allFilteredSelected ? 'Clear' : 'All'}
        </button>
      </div>

      {/* Group pills */}
      {groupedModels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {groupedModels.map((group) => (
            <button
              key={group.key}
              onClick={() => toggleGroup(group)}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--text-muted)] transition-colors hover:border-[#1DA1F2]/50 hover:text-[var(--text-primary)]"
              title={`Toggle ${group.label}`}
            >
              {renderGroupIndicator(group)}
              <span className="max-w-28 truncate">{group.label}</span>
              <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[9px] leading-none dark:bg-white/10">
                {group.models.length}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mb-2 text-[10px] text-[var(--text-muted)]">
        {selectedIds.length} of {twitterModels.length} selected
      </div>

      {/* Groups with model cards */}
      <div className="space-y-2 pr-1">
        {filteredGroups.map((group) => {
          const groupIds = group.models.map((model) => model.id);
          const selectedCount = groupIds.filter((id) => selectedIds.includes(id)).length;
          const isFullySelected = selectedCount > 0 && selectedCount === groupIds.length;
          const groupActionLabel = isFullySelected ? 'Clear group' : 'Select group';

          return (
            <div key={group.key} className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]/50 p-2">
              <div className="mb-2 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold text-[var(--text-primary)]">{group.label}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {selectedCount}/{group.models.length} selected
                  </p>
                </div>
                <button
                  onClick={() => toggleGroup(group)}
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--text-muted)] transition-colors hover:border-[#1DA1F2]/50 hover:text-[var(--text-primary)]"
                >
                  {groupActionLabel}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {group.models.map((model) => {
                  const isSelected = selectedIds.includes(model.id);
                  const twitterCount = twitterAccountCounts?.[model.id] || 0;
                  const inactive = inactiveByModel[model.id];
                  const hasInactive = inactive && inactive.length > 0;
                  return (
                    <button
                      key={model.id}
                      onClick={() => toggleModel(model.id)}
                      className={`flex items-center gap-2 rounded-lg border p-2 text-left transition-all ${
                        isSelected
                          ? hasInactive
                            ? 'border-red-400 bg-red-50 dark:border-red-700 dark:bg-red-950/30'
                            : 'border-[#1DA1F2] bg-[#1DA1F2]/5'
                          : hasInactive
                            ? 'border-red-300 hover:border-red-400 dark:border-red-800 dark:hover:border-red-600'
                            : 'border-[var(--border)] hover:border-[#1DA1F2]/50'
                      }`}
                    >
                      <div className="relative shrink-0">
                        {model.avatarUrl ? (
                          <img src={model.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-xs font-bold text-[var(--text-muted)]">
                            {model.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        {hasInactive && (
                          <div className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500">
                            <AlertTriangle className="h-2 w-2 text-white" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-[var(--text-primary)]">{model.name}</div>
                        {hasInactive ? (
                          <div className="text-[10px] font-medium text-red-600 dark:text-red-400">
                            {inactive.length} expired
                          </div>
                        ) : twitterCount > 0 ? (
                          <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                            <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                            </svg>
                            {twitterCount} account{twitterCount !== 1 ? 's' : ''}
                          </div>
                        ) : null}
                      </div>

                      {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-[#1DA1F2]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {filteredGroups.length === 0 && (
        <div className="py-6 text-center text-xs text-[var(--text-muted)]">
          {search ? 'No models or groups match search' : 'No models with X connected'}
        </div>
      )}
    </div>
  );
}
