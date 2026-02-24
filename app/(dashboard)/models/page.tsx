'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';
import { useModels } from '@/hooks/useModels';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import ModelGrid from '@/components/models/ModelGrid';
import NewModelModal from '@/components/models/NewModelModal';
import ModelDetailModal from '@/components/models/ModelDetailModal';

const ALL_GROUPS_KEY = '__all__';
const UNGROUPED_KEY = '__ungrouped__';

export default function ModelsPage() {
  const { models, modelImages, isLoadingPage, imagesLoading, refresh, loadModelImages } = useModels();
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [newModelModal, setNewModelModal] = useState(false);
  const [modelDetailModal, setModelDetailModal] = useState(false);
  const [search, setSearch] = useState('');
  const [activeGroupKey, setActiveGroupKey] = useState(ALL_GROUPS_KEY);
  const handleRefresh = refresh;

  const groupData = useMemo(() => {
    const groupCounts = new Map<string, number>();
    let ungroupedCount = 0;

    for (const model of models) {
      const groupName = model.groupName?.trim();
      if (!groupName) {
        ungroupedCount += 1;
        continue;
      }
      groupCounts.set(groupName, (groupCounts.get(groupName) || 0) + 1);
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
      const groupName = model.groupName?.trim() || '';

      const groupMatch = resolvedGroupKey === ALL_GROUPS_KEY
        ? true
        : resolvedGroupKey === UNGROUPED_KEY
          ? !groupName
          : groupName === resolvedGroupKey.slice('group:'.length);

      if (!groupMatch) return false;
      if (!q) return true;

      return (
        model.name.toLowerCase().includes(q) ||
        groupName.toLowerCase().includes(q) ||
        (model.linkedPlatforms || []).some((platform) => platform.toLowerCase().includes(q))
      );
    });
  }, [models, search, resolvedGroupKey]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
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
              <Button variant="ghost" size="icon-sm" onClick={handleRefresh}>
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

      {(models.length > 0 || groupData.existingGroupNames.length > 0) && (
        <div className="space-y-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Model Groups</p>
              <span className="text-[10px] text-[var(--text-muted)]">
                {groupData.existingGroupNames.length} folder{groupData.existingGroupNames.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {groupData.groupOptions.map((group) => {
                const isActive = resolvedGroupKey === group.key;
                return (
                  <button
                    key={group.key}
                    onClick={() => setActiveGroupKey(group.key)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                        : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--primary)]/40 hover:text-[var(--text)]'
                    }`}
                  >
                    <span className="max-w-44 truncate">{group.label}</span>
                    <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] leading-none dark:bg-white/10">
                      {group.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

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
        </div>
      )}

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
