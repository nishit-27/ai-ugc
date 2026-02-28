'use client';

import { useMemo, useState } from 'react';
import { Search, CheckSquare, Square, Check, Minus, Loader2 } from 'lucide-react';
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
  const seen = new Map<string, Set<string>>(); // group -> set of model IDs (dedup)

  for (const model of models) {
    const groups = model.groupNames?.filter((g) => g.trim()) || [];

    if (groups.length === 0) {
      // Ungrouped
      const existing = grouped.get(UNGROUPED_KEY) || [];
      existing.push(model);
      grouped.set(UNGROUPED_KEY, existing);
    } else {
      // Model appears in each of its groups
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

export default function ModelSelector({
  models,
  isLoading,
  selectedIds,
  onChange,
  accountCounts,
}: {
  models: Model[];
  isLoading?: boolean;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  accountCounts?: Record<string, number>;
}) {
  const [search, setSearch] = useState('');

  const groupedModels = useMemo(() => groupModels(models), [models]);

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

    if (isFullySelected) return <CheckSquare className="h-3 w-3" />;
    if (isPartiallySelected) {
      return (
        <span className="flex h-3 w-3 items-center justify-center rounded-[3px] border border-[var(--primary)] text-[var(--primary)]">
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
            <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[var(--accent)]" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-20 animate-pulse rounded bg-[var(--accent)]" />
              <div className="h-2 w-14 animate-pulse rounded bg-[var(--accent)]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models or groups..."
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-1.5 pl-7 pr-3 text-xs"
          />
        </div>
        <button
          onClick={toggleAllFiltered}
          className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-[10px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)]"
        >
          {allFilteredSelected ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />}
          {allFilteredSelected ? 'Clear' : 'All'}
        </button>
      </div>

      {groupedModels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {groupedModels.map((group) => (
            <button
              key={group.key}
              onClick={() => toggleGroup(group)}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--primary)]/50 hover:text-[var(--text)]"
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
        {selectedIds.length} of {models.length} selected
      </div>

      <div className="space-y-2 pr-1">
        {filteredGroups.map((group) => {
          const groupIds = group.models.map((model) => model.id);
          const selectedCount = groupIds.filter((id) => selectedIds.includes(id)).length;
          const isFullySelected = selectedCount > 0 && selectedCount === groupIds.length;
          const groupActionLabel = isFullySelected ? 'Clear group' : 'Select group';

          return (
            <div key={group.key} className="rounded-lg border border-[var(--border)] bg-[var(--background)]/50 p-2">
              <div className="mb-2 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold text-[var(--text)]">{group.label}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {selectedCount}/{group.models.length} selected
                  </p>
                </div>
                <button
                  onClick={() => toggleGroup(group)}
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--primary)]/50 hover:text-[var(--text)]"
                >
                  {groupActionLabel}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {group.models.map((model) => {
                  const isSelected = selectedIds.includes(model.id);
                  const accountCount = accountCounts?.[model.id] || 0;
                  return (
                    <button
                      key={model.id}
                      onClick={() => toggleModel(model.id)}
                      className={`flex items-center gap-2 rounded-lg border p-2 text-left transition-all ${
                        isSelected
                          ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                          : 'border-[var(--border)] hover:border-[var(--primary)]/50'
                      }`}
                    >
                      {model.avatarUrl ? (
                        <img src={model.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--background)] text-xs font-bold text-[var(--text-muted)]">
                          {model.name.charAt(0).toUpperCase()}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{model.name}</div>
                        {accountCount > 0 && (
                          <div className="text-[10px] text-[var(--text-muted)]">
                            {accountCount} account{accountCount !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>

                      {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />}
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
          {search ? 'No models or groups match search' : 'No models available'}
        </div>
      )}
    </div>
  );
}
