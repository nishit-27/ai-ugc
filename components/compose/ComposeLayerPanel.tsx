'use client';

import { GripVertical, Trash2, Eye, EyeOff, Film, ImageIcon } from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ComposeLayer } from '@/types';

type ComposeLayerPanelProps = {
  layers: ComposeLayer[];
  selectedLayerId: string | null;
  onSelect: (id: string | null) => void;
  onRemove: (id: string) => void;
  onReorder: (fromIdx: number, toIdx: number) => void;
};

function SortableLayerRow({
  layer,
  index,
  isSelected,
  onSelect,
  onRemove,
}: {
  layer: ComposeLayer;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: layer.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 0,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`group flex items-center gap-2 rounded-lg border px-2 py-2 cursor-pointer transition-all ${
        isDragging ? 'shadow-lg' : ''
      } ${
        isSelected
          ? 'border-[var(--primary)] bg-[var(--accent)]'
          : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--accent)]'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="cursor-grab touch-none text-[var(--border)] opacity-0 transition-opacity group-hover:opacity-100"
      >
        <GripVertical className="h-3 w-3" />
      </button>

      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[var(--background)]">
        {layer.type === 'video' ? (
          <Film className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        ) : (
          <ImageIcon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium text-[var(--text)]">
          {layer.source.label || `Layer ${index + 1}`}
        </div>
        <div className="text-[10px] text-[var(--text-muted)]">
          {layer.type} &middot; {Math.round(layer.width * 100)}% &times; {Math.round(layer.height * 100)}%
        </div>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="shrink-0 rounded p-1 text-[var(--text-muted)] opacity-0 transition-all hover:text-red-500 group-hover:opacity-100"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

export default function ComposeLayerPanel({
  layers,
  selectedLayerId,
  onSelect,
  onRemove,
  onReorder,
}: ComposeLayerPanelProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = layers.findIndex((l) => l.id === active.id);
    const toIdx = layers.findIndex((l) => l.id === over.id);
    if (fromIdx !== -1 && toIdx !== -1) onReorder(fromIdx, toIdx);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Layers
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">{layers.length}</span>
      </div>

      {layers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] py-6 text-center">
          <p className="text-xs text-[var(--text-muted)]">No layers yet</p>
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">Add media from the left panel</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={layers.map((l) => l.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {layers.map((layer, i) => (
                <SortableLayerRow
                  key={layer.id}
                  layer={layer}
                  index={i}
                  isSelected={selectedLayerId === layer.id}
                  onSelect={() => onSelect(layer.id)}
                  onRemove={() => onRemove(layer.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
