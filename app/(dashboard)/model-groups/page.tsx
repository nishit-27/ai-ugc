'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderPlus, RefreshCw, Pencil, Trash2, Users, FolderOpen, Loader2, GripVertical } from 'lucide-react';
import { useModels } from '@/hooks/useModels';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type ModelGroupSummary = {
  name: string;
  count: number;
};

const UNGROUPED_KEY = '__ungrouped__';

function normalizeGroupName(value?: string | null): string {
  return (value || '').trim();
}

export default function ModelGroupsPage() {
  const { models, refresh: refreshModels, isLoadingPage } = useModels();
  const { showToast } = useToast();
  const [groups, setGroups] = useState<ModelGroupSummary[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [newGroupName, setNewGroupName] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [savingModelId, setSavingModelId] = useState<string | null>(null);
  const [busyGroupName, setBusyGroupName] = useState<string | null>(null);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [draggingModelId, setDraggingModelId] = useState<string | null>(null);
  const [dragOverGroupKey, setDragOverGroupKey] = useState<string | null>(null);
  const [pendingGroupByModelId, setPendingGroupByModelId] = useState<Record<string, string>>({});

  const getEffectiveGroup = useCallback(
    (modelId: string, rawGroupName?: string | null) => pendingGroupByModelId[modelId] ?? normalizeGroupName(rawGroupName),
    [pendingGroupByModelId],
  );

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const res = await fetch('/api/model-groups', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) {
        setGroups(Array.isArray(data.groups) ? data.groups : []);
      } else {
        showToast(data.error || 'Failed to load groups', 'error');
      }
    } catch {
      showToast('Failed to load groups', 'error');
    } finally {
      setGroupsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    setPendingGroupByModelId((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const [modelId, pendingGroup] of Object.entries(prev)) {
        const model = models.find((entry) => entry.id === modelId);
        if (!model) {
          delete next[modelId];
          changed = true;
          continue;
        }

        const actualGroup = normalizeGroupName(model.groupName);
        if (actualGroup === pendingGroup) {
          delete next[modelId];
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [models]);

  const groupNames = useMemo(
    () => groups.map((group) => group.name),
    [groups],
  );

  const availableGroupKeys = useMemo(
    () => new Set<string>([UNGROUPED_KEY, ...groups.map((group) => group.name)]),
    [groups],
  );

  const resolvedSelectedGroupKey = selectedGroupKey && availableGroupKeys.has(selectedGroupKey)
    ? selectedGroupKey
    : null;

  const ungroupedCount = useMemo(
    () => models.filter((model) => getEffectiveGroup(model.id, model.groupName).length === 0).length,
    [models, getEffectiveGroup],
  );

  const assignedCount = useMemo(
    () => models.filter((model) => getEffectiveGroup(model.id, model.groupName).length > 0).length,
    [models, getEffectiveGroup],
  );

  const visibleModels = useMemo(() => {
    const rows = [...models].sort((a, b) => a.name.localeCompare(b.name));
    if (!resolvedSelectedGroupKey) return rows;

    if (resolvedSelectedGroupKey === UNGROUPED_KEY) {
      return rows.filter((model) => getEffectiveGroup(model.id, model.groupName).length === 0);
    }

    return rows.filter((model) => getEffectiveGroup(model.id, model.groupName) === resolvedSelectedGroupKey);
  }, [models, resolvedSelectedGroupKey, getEffectiveGroup]);

  const selectedGroupLabel = resolvedSelectedGroupKey === UNGROUPED_KEY
    ? 'Ungrouped'
    : resolvedSelectedGroupKey || 'All Models';

  const handleRefresh = async () => {
    await Promise.all([refreshModels(), loadGroups()]);
  };

  const handleCreateGroup = async () => {
    const normalized = normalizeGroupName(newGroupName);
    if (!normalized) {
      showToast('Group name is required', 'error');
      return;
    }

    setIsCreatingGroup(true);
    try {
      const res = await fetch('/api/model-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: normalized }),
      });
      const data = await res.json();
      if (res.ok) {
        setGroups(Array.isArray(data.groups) ? data.groups : []);
        setNewGroupName('');
        showToast('Group created', 'success');
      } else {
        showToast(data.error || 'Failed to create group', 'error');
      }
    } catch {
      showToast('Failed to create group', 'error');
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const handleRenameGroup = async (groupName: string) => {
    const promptValue = window.prompt('New group name', groupName);
    if (promptValue === null) return;
    const normalized = normalizeGroupName(promptValue);
    if (!normalized || normalized.toLowerCase() === groupName.toLowerCase()) return;

    setBusyGroupName(groupName);
    try {
      const res = await fetch('/api/model-groups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName: groupName, newName: normalized }),
      });
      const data = await res.json();
      if (res.ok) {
        setGroups(Array.isArray(data.groups) ? data.groups : []);
        await refreshModels();
        showToast('Group renamed', 'success');
      } else {
        showToast(data.error || 'Failed to rename group', 'error');
      }
    } catch {
      showToast('Failed to rename group', 'error');
    } finally {
      setBusyGroupName(null);
    }
  };

  const handleDeleteGroup = async (groupName: string) => {
    const shouldDelete = window.confirm(
      `Delete "${groupName}" group?\n\nAll models in this group will become ungrouped.`,
    );
    if (!shouldDelete) return;

    setBusyGroupName(groupName);
    try {
      const res = await fetch('/api/model-groups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: groupName }),
      });
      const data = await res.json();
      if (res.ok) {
        setGroups(Array.isArray(data.groups) ? data.groups : []);
        await refreshModels();
        showToast('Group deleted', 'success');
      } else {
        showToast(data.error || 'Failed to delete group', 'error');
      }
    } catch {
      showToast('Failed to delete group', 'error');
    } finally {
      setBusyGroupName(null);
    }
  };

  const handleAssignModel = async (modelId: string, nextGroupKey: string) => {
    const model = models.find((entry) => entry.id === modelId);
    if (!model) return;

    const currentGroup = getEffectiveGroup(model.id, model.groupName);
    const targetGroup = nextGroupKey === UNGROUPED_KEY ? '' : normalizeGroupName(nextGroupKey);
    if (currentGroup === targetGroup) return;

    setPendingGroupByModelId((prev) => ({ ...prev, [modelId]: targetGroup }));
    setSavingModelId(modelId);
    try {
      const res = await fetch(`/api/models/${modelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupName: targetGroup || null }),
      });

      if (res.ok) {
        await Promise.all([refreshModels(), loadGroups()]);
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to assign group', 'error');
        setPendingGroupByModelId((prev) => {
          const next = { ...prev };
          delete next[modelId];
          return next;
        });
      }
    } catch {
      showToast('Failed to assign group', 'error');
      setPendingGroupByModelId((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
    } finally {
      setSavingModelId(null);
    }
  };

  const handleModelDragStart = (modelId: string, event: React.DragEvent<HTMLDivElement>) => {
    setDraggingModelId(modelId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', modelId);
  };

  const handleModelDragEnd = () => {
    setDraggingModelId(null);
    setDragOverGroupKey(null);
  };

  const handleGroupDragOver = (event: React.DragEvent<HTMLDivElement>, groupKey: string) => {
    if (!draggingModelId) return;
    event.preventDefault();
    if (dragOverGroupKey !== groupKey) setDragOverGroupKey(groupKey);
  };

  const handleGroupDrop = (event: React.DragEvent<HTMLDivElement>, groupKey: string) => {
    event.preventDefault();
    const droppedModelId = draggingModelId || event.dataTransfer.getData('text/plain');
    setDragOverGroupKey(null);
    setDraggingModelId(null);
    if (!droppedModelId) return;
    void handleAssignModel(droppedModelId, groupKey);
  };

  const handleGroupDragLeave = (groupKey: string) => {
    if (dragOverGroupKey === groupKey) setDragOverGroupKey(null);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)]">Model Groups</h1>
          <p className="text-xs text-[var(--text-muted)]">
            {groups.length} group{groups.length !== 1 ? 's' : ''} &middot; {assignedCount} model{assignedCount !== 1 ? 's' : ''} assigned
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savingModelId && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[11px] text-[var(--text-muted)]">
              <Loader2 className="h-3 w-3 animate-spin" />
              Updating model group...
            </div>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mb-3 flex items-center gap-2">
          <FolderPlus className="h-4 w-4 text-[var(--primary)]" />
          <h2 className="text-sm font-semibold">Create Group</h2>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateGroup(); }}
            placeholder="e.g., Education Creators"
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          />
          <button
            onClick={() => void handleCreateGroup()}
            disabled={isCreatingGroup}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isCreatingGroup ? 'Creating...' : 'Create Group'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1.8fr]">
        <div className="flex h-[68vh] flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-[var(--primary)]" />
            <h2 className="text-sm font-semibold">Groups</h2>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {groupsLoading ? (
              <div className="py-8 text-center text-xs text-[var(--text-muted)]">Loading groups...</div>
            ) : groups.length === 0 && ungroupedCount === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-6 text-center text-xs text-[var(--text-muted)]">
                No groups yet
              </div>
            ) : (
              <div className="space-y-2">
                {groups.map((group) => (
                  <div
                    key={group.name}
                    onClick={() => setSelectedGroupKey(group.name)}
                    onDragOver={(event) => handleGroupDragOver(event, group.name)}
                    onDrop={(event) => handleGroupDrop(event, group.name)}
                    onDragLeave={() => handleGroupDragLeave(group.name)}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 transition-colors ${
                      resolvedSelectedGroupKey === group.name
                        ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                        : 'border-[var(--border)] bg-[var(--background)]'
                    } ${
                      dragOverGroupKey === group.name
                        ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/20'
                        : ''
                    } ${
                      draggingModelId ? 'cursor-copy' : 'cursor-pointer'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{group.name}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {group.count} model{group.count !== 1 ? 's' : ''}
                      </p>
                      {dragOverGroupKey === group.name && (
                        <p className="text-[10px] font-medium text-[var(--primary)]">Release to add model here</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {busyGroupName === group.name && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-muted)]" />
                      )}
                      <button
                        disabled={busyGroupName === group.name}
                        onClick={() => void handleRenameGroup(group.name)}
                        className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)]"
                        title="Rename group"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        disabled={busyGroupName === group.name}
                        onClick={() => void handleDeleteGroup(group.name)}
                        className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-500"
                        title="Delete group"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

                <div
                  onClick={() => setSelectedGroupKey(UNGROUPED_KEY)}
                  onDragOver={(event) => handleGroupDragOver(event, UNGROUPED_KEY)}
                  onDrop={(event) => handleGroupDrop(event, UNGROUPED_KEY)}
                  onDragLeave={() => handleGroupDragLeave(UNGROUPED_KEY)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 transition-colors ${
                    resolvedSelectedGroupKey === UNGROUPED_KEY
                      ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                      : 'border-[var(--border)] bg-[var(--background)]'
                  } ${
                    dragOverGroupKey === UNGROUPED_KEY
                      ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/20'
                      : ''
                  } ${
                    draggingModelId ? 'cursor-copy' : 'cursor-pointer'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">Ungrouped</p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {ungroupedCount} model{ungroupedCount !== 1 ? 's' : ''}
                    </p>
                    {dragOverGroupKey === UNGROUPED_KEY && (
                      <p className="text-[10px] font-medium text-[var(--primary)]">Release to ungroup model</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex h-[68vh] flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-[var(--primary)]" />
            <h2 className="text-sm font-semibold">{selectedGroupLabel} Members</h2>
          </div>
          <p className="mb-3 text-[10px] text-[var(--text-muted)]">
            Click a group on the left to view its members. Drag models into a group to assign them.
          </p>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {isLoadingPage ? (
              <div className="py-8 text-center text-xs text-[var(--text-muted)]">Loading models...</div>
            ) : visibleModels.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-6 text-center text-xs text-[var(--text-muted)]">
                No members in this group
              </div>
            ) : (
              <div className="space-y-2">
                {visibleModels.map((model) => (
                  <div
                    key={model.id}
                    draggable={savingModelId !== model.id}
                    onDragStart={(event) => handleModelDragStart(model.id, event)}
                    onDragEnd={handleModelDragEnd}
                    className={`flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 ${
                      savingModelId === model.id ? 'opacity-60' : 'cursor-grab'
                    }`}
                  >
                    <div className="text-[var(--text-muted)]">
                      <GripVertical className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium">{model.name}</p>
                      {savingModelId === model.id && (
                        <Loader2 className="h-3 w-3 animate-spin text-[var(--text-muted)]" />
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Current: {getEffectiveGroup(model.id, model.groupName) || 'Ungrouped'}
                    </p>
                  </div>
                  <select
                    value={getEffectiveGroup(model.id, model.groupName)}
                    onChange={(e) => void handleAssignModel(model.id, e.target.value || UNGROUPED_KEY)}
                    disabled={savingModelId === model.id}
                    className="w-44 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs"
                    >
                      <option value="">Ungrouped</option>
                      {groupNames.map((groupName) => (
                        <option key={groupName} value={groupName}>
                          {groupName}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
