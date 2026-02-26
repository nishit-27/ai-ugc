'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FolderPlus, RefreshCw, Pencil, Trash2, Users, FolderOpen, Loader2, GripVertical, Search, Check, ChevronDown } from 'lucide-react';
import { useModels } from '@/hooks/useModels';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type ModelGroupSummary = {
  name: string;
  count: number;
};

const UNGROUPED_KEY = '__ungrouped__';

function getEffectiveGroups(groupNames?: string[]): string[] {
  if (!groupNames || groupNames.length === 0) return [];
  return groupNames.map((g) => g.trim()).filter(Boolean);
}

function MultiGroupSelect({
  modelId,
  currentGroups,
  allGroupNames,
  disabled,
  onSave,
}: {
  modelId: string;
  currentGroups: string[];
  allGroupNames: string[];
  disabled: boolean;
  onSave: (modelId: string, groupNames: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState<string[]>(currentGroups);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPending(currentGroups);
  }, [currentGroups]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
        // Save on close if changed
        const changed = pending.length !== currentGroups.length || pending.some((g) => !currentGroups.includes(g));
        if (changed) onSave(modelId, pending);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, pending, currentGroups, modelId, onSave]);

  const toggle = (groupName: string) => {
    setPending((prev) =>
      prev.includes(groupName) ? prev.filter((g) => g !== groupName) : [...prev, groupName],
    );
  };

  const label = pending.length === 0 ? 'Ungrouped' : pending.join(', ');

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex w-44 items-center justify-between gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg">
          <div className="max-h-48 overflow-y-auto p-1">
            {allGroupNames.map((groupName) => {
              const checked = pending.includes(groupName);
              return (
                <button
                  key={groupName}
                  onClick={() => toggle(groupName)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-[var(--accent)]"
                >
                  <div className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                    checked ? 'border-[var(--primary)] bg-[var(--primary)] text-white' : 'border-[var(--border)]'
                  }`}>
                    {checked && <Check className="h-2.5 w-2.5" />}
                  </div>
                  <span className="truncate">{groupName}</span>
                </button>
              );
            })}
            {allGroupNames.length === 0 && (
              <p className="px-2 py-3 text-center text-[10px] text-[var(--text-muted)]">No groups created yet</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
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
  const [pendingGroupsByModelId, setPendingGroupsByModelId] = useState<Record<string, string[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  // Counter-based approach to prevent dragLeave flicker on child elements
  const dragCounterRef = useRef<Map<string, number>>(new Map());

  const getModelGroups = useCallback(
    (modelId: string, modelGroupNames?: string[]) => {
      if (pendingGroupsByModelId[modelId]) return pendingGroupsByModelId[modelId];
      return getEffectiveGroups(modelGroupNames);
    },
    [pendingGroupsByModelId],
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
    setPendingGroupsByModelId((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const [modelId, pendingGroups] of Object.entries(prev)) {
        const model = models.find((entry) => entry.id === modelId);
        if (!model) {
          delete next[modelId];
          changed = true;
          continue;
        }

        const actualGroups = getEffectiveGroups(model.groupNames);
        const same = pendingGroups.length === actualGroups.length &&
          pendingGroups.every((g) => actualGroups.includes(g));
        if (same) {
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
    () => models.filter((model) => getModelGroups(model.id, model.groupNames).length === 0).length,
    [models, getModelGroups],
  );

  const assignedCount = useMemo(
    () => models.filter((model) => getModelGroups(model.id, model.groupNames).length > 0).length,
    [models, getModelGroups],
  );

  const visibleModels = useMemo(() => {
    let rows = [...models].sort((a, b) => a.name.localeCompare(b.name));

    if (resolvedSelectedGroupKey === UNGROUPED_KEY) {
      rows = rows.filter((model) => getModelGroups(model.id, model.groupNames).length === 0);
    } else if (resolvedSelectedGroupKey) {
      rows = rows.filter((model) => getModelGroups(model.id, model.groupNames).includes(resolvedSelectedGroupKey));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      rows = rows.filter((model) => model.name.toLowerCase().includes(q));
    }

    return rows;
  }, [models, resolvedSelectedGroupKey, getModelGroups, searchQuery]);

  const selectedGroupLabel = resolvedSelectedGroupKey === UNGROUPED_KEY
    ? 'Ungrouped'
    : resolvedSelectedGroupKey || 'All Models';

  const handleRefresh = async () => {
    await Promise.all([refreshModels(), loadGroups()]);
  };

  const handleCreateGroup = async () => {
    const normalized = (newGroupName || '').trim();
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
    const normalized = (promptValue || '').trim();
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
      `Delete "${groupName}" group?\n\nModels will be removed from this group but keep their other group memberships.`,
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

  const handleSetModelGroups = useCallback(async (modelId: string, nextGroups: string[]) => {
    const model = models.find((entry) => entry.id === modelId);
    if (!model) return;

    const currentGroups = getEffectiveGroups(model.groupNames);
    const same = nextGroups.length === currentGroups.length && nextGroups.every((g) => currentGroups.includes(g));
    if (same) return;

    setPendingGroupsByModelId((prev) => ({ ...prev, [modelId]: nextGroups }));
    setSavingModelId(modelId);
    try {
      const res = await fetch(`/api/models/${modelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupNames: nextGroups }),
      });

      if (res.ok) {
        await Promise.all([refreshModels(), loadGroups()]);
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to assign groups', 'error');
        setPendingGroupsByModelId((prev) => {
          const next = { ...prev };
          delete next[modelId];
          return next;
        });
      }
    } catch {
      showToast('Failed to assign groups', 'error');
      setPendingGroupsByModelId((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
    } finally {
      setSavingModelId(null);
    }
  }, [models, refreshModels, loadGroups, showToast]);

  const handleDragAddToGroup = async (modelId: string, targetGroupKey: string) => {
    const model = models.find((entry) => entry.id === modelId);
    if (!model) return;

    const currentGroups = getModelGroups(model.id, model.groupNames);

    if (targetGroupKey === UNGROUPED_KEY) {
      // Remove all groups
      await handleSetModelGroups(modelId, []);
    } else {
      // Add to group (keep existing)
      if (currentGroups.includes(targetGroupKey)) return;
      await handleSetModelGroups(modelId, [...currentGroups, targetGroupKey]);
    }
  };

  const handleModelDragStart = (modelId: string, event: React.DragEvent<HTMLDivElement>) => {
    const model = models.find((m) => m.id === modelId);
    // Create a clean, compact drag preview
    const ghost = document.createElement('div');
    ghost.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:10px;background:#fff;border:2px solid var(--primary,#6366f1);box-shadow:0 8px 24px rgba(0,0,0,.18);font:600 13px/1 system-ui,sans-serif;color:#1e1e2e;position:fixed;top:-200px;left:-200px;z-index:9999;pointer-events:none;';
    ghost.textContent = model?.name || 'Model';
    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
    // Clean up ghost after browser captures it
    requestAnimationFrame(() => {
      requestAnimationFrame(() => document.body.removeChild(ghost));
    });
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData('text/plain', modelId);
    // Slight delay so the browser captures the ghost before we dim the source
    requestAnimationFrame(() => setDraggingModelId(modelId));
  };

  const handleModelDragEnd = () => {
    setDraggingModelId(null);
    setDragOverGroupKey(null);
    dragCounterRef.current.clear();
  };

  const handleGroupDragEnter = (event: React.DragEvent<HTMLDivElement>, groupKey: string) => {
    event.preventDefault();
    const counter = dragCounterRef.current;
    counter.set(groupKey, (counter.get(groupKey) || 0) + 1);
    if (dragOverGroupKey !== groupKey) setDragOverGroupKey(groupKey);
  };

  const handleGroupDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleGroupDrop = (event: React.DragEvent<HTMLDivElement>, groupKey: string) => {
    event.preventDefault();
    const droppedModelId = draggingModelId || event.dataTransfer.getData('text/plain');
    dragCounterRef.current.clear();
    setDragOverGroupKey(null);
    setDraggingModelId(null);
    if (!droppedModelId) return;
    void handleDragAddToGroup(droppedModelId, groupKey);
  };

  const handleGroupDragLeave = (event: React.DragEvent<HTMLDivElement>, groupKey: string) => {
    event.preventDefault();
    const counter = dragCounterRef.current;
    const count = (counter.get(groupKey) || 1) - 1;
    counter.set(groupKey, count);
    // Only clear highlight when we've truly left the element (not just a child)
    if (count <= 0) {
      counter.delete(groupKey);
      if (dragOverGroupKey === groupKey) setDragOverGroupKey(null);
    }
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
              Updating model groups...
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

          <div className="min-h-0 flex-1 overflow-y-auto p-1 -m-1">
            {groupsLoading ? (
              <div className="py-8 text-center text-xs text-[var(--text-muted)]">Loading groups...</div>
            ) : groups.length === 0 && ungroupedCount === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-6 text-center text-xs text-[var(--text-muted)]">
                No groups yet
              </div>
            ) : (
              <div className="space-y-2">
                {groups.map((group) => {
                  const isDropTarget = dragOverGroupKey === group.name;
                  return (
                    <div
                      key={group.name}
                      onClick={() => setSelectedGroupKey(group.name)}
                      onDragEnter={(event) => handleGroupDragEnter(event, group.name)}
                      onDragOver={handleGroupDragOver}
                      onDrop={(event) => handleGroupDrop(event, group.name)}
                      onDragLeave={(event) => handleGroupDragLeave(event, group.name)}
                      style={{
                        borderColor: isDropTarget
                          ? 'var(--primary)'
                          : resolvedSelectedGroupKey === group.name
                            ? 'var(--primary)'
                            : 'var(--border)',
                        backgroundColor: isDropTarget
                          ? 'color-mix(in srgb, var(--primary) 12%, transparent)'
                          : resolvedSelectedGroupKey === group.name
                            ? 'color-mix(in srgb, var(--primary) 5%, transparent)'
                            : 'var(--background)',
                        boxShadow: isDropTarget
                          ? '0 0 0 3px color-mix(in srgb, var(--primary) 20%, transparent)'
                          : 'none',
                      }}
                      className={`flex items-center justify-between rounded-lg border-2 px-3 py-2 transition-[border-color,background-color,box-shadow] duration-200 ease-in-out ${
                        draggingModelId ? 'cursor-copy' : 'cursor-pointer'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{group.name}</p>
                        <p className={`text-[11px] transition-colors duration-200 ${isDropTarget ? 'text-[var(--primary)] font-medium' : 'text-[var(--text-muted)]'}`}>
                          {isDropTarget ? 'Release to add model here' : `${group.count} model${group.count !== 1 ? 's' : ''}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {busyGroupName === group.name && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-muted)]" />
                        )}
                        <button
                          disabled={busyGroupName === group.name}
                          onClick={(e) => { e.stopPropagation(); void handleRenameGroup(group.name); }}
                          className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text)]"
                          title="Rename group"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          disabled={busyGroupName === group.name}
                          onClick={(e) => { e.stopPropagation(); void handleDeleteGroup(group.name); }}
                          className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-red-50 hover:text-red-500"
                          title="Delete group"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {(() => {
                  const isDropTarget = dragOverGroupKey === UNGROUPED_KEY;
                  return (
                    <div
                      onClick={() => setSelectedGroupKey(UNGROUPED_KEY)}
                      onDragEnter={(event) => handleGroupDragEnter(event, UNGROUPED_KEY)}
                      onDragOver={handleGroupDragOver}
                      onDrop={(event) => handleGroupDrop(event, UNGROUPED_KEY)}
                      onDragLeave={(event) => handleGroupDragLeave(event, UNGROUPED_KEY)}
                      style={{
                        borderColor: isDropTarget
                          ? 'var(--primary)'
                          : resolvedSelectedGroupKey === UNGROUPED_KEY
                            ? 'var(--primary)'
                            : 'var(--border)',
                        backgroundColor: isDropTarget
                          ? 'color-mix(in srgb, var(--primary) 12%, transparent)'
                          : resolvedSelectedGroupKey === UNGROUPED_KEY
                            ? 'color-mix(in srgb, var(--primary) 5%, transparent)'
                            : 'var(--background)',
                        boxShadow: isDropTarget
                          ? '0 0 0 3px color-mix(in srgb, var(--primary) 20%, transparent)'
                          : 'none',
                      }}
                      className={`flex items-center justify-between rounded-lg border-2 px-3 py-2 transition-[border-color,background-color,box-shadow] duration-200 ease-in-out ${
                        draggingModelId ? 'cursor-copy' : 'cursor-pointer'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">Ungrouped</p>
                        <p className={`text-[11px] transition-colors duration-200 ${isDropTarget ? 'text-[var(--primary)] font-medium' : 'text-[var(--text-muted)]'}`}>
                          {isDropTarget ? 'Release to ungroup model' : `${ungroupedCount} model${ungroupedCount !== 1 ? 's' : ''}`}
                        </p>
                      </div>
                    </div>
                  );
                })()}
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
            Click a group on the left to view its members. Drag models into a group to add them (models keep existing groups).
          </p>

          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search models..."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-1.5 pl-8 pr-3 text-xs placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)] focus:outline-none"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-1 -m-1">
            {isLoadingPage ? (
              <div className="py-8 text-center text-xs text-[var(--text-muted)]">Loading models...</div>
            ) : visibleModels.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-6 text-center text-xs text-[var(--text-muted)]">
                No members in this group
              </div>
            ) : (
              <div className="space-y-2">
                {visibleModels.map((model) => {
                  const modelGroups = getModelGroups(model.id, model.groupNames);
                  const groupsLabel = modelGroups.length > 0 ? modelGroups.join(', ') : 'Ungrouped';
                  const isDragging = draggingModelId === model.id;
                  const isSaving = savingModelId === model.id;
                  return (
                    <div
                      key={model.id}
                      draggable={!isSaving}
                      onDragStart={(event) => handleModelDragStart(model.id, event)}
                      onDragEnd={handleModelDragEnd}
                      style={{
                        opacity: isDragging ? 0.35 : isSaving ? 0.6 : 1,
                        borderColor: isDragging ? 'var(--primary)' : 'var(--border)',
                        boxShadow: isDragging ? '0 0 0 2px color-mix(in srgb, var(--primary) 25%, transparent)' : 'none',
                      }}
                      className={`flex items-center gap-3 rounded-lg border bg-[var(--background)] px-3 py-2 transition-[opacity,border-color,box-shadow] duration-200 ease-in-out ${
                        !isDragging && !isSaving ? 'cursor-grab' : ''
                      }`}
                    >
                      <div className={`transition-colors duration-200 ${isDragging ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`}>
                        <GripVertical className="h-4 w-4" />
                      </div>
                      {model.avatarUrl ? (
                        <img src={model.avatarUrl} alt={model.name} className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-semibold text-[var(--text-muted)]">
                          {model.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium">{model.name}</p>
                          {savingModelId === model.id && (
                            <Loader2 className="h-3 w-3 animate-spin text-[var(--text-muted)]" />
                          )}
                        </div>
                        <p className="truncate text-[11px] text-[var(--text-muted)]">
                          {groupsLabel}
                        </p>
                      </div>
                      <MultiGroupSelect
                        modelId={model.id}
                        currentGroups={modelGroups}
                        allGroupNames={groupNames}
                        disabled={savingModelId === model.id}
                        onSave={handleSetModelGroups}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
