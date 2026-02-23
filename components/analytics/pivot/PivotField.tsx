'use client';

import { useDraggable } from '@dnd-kit/core';
import { GripVertical, X } from 'lucide-react';

export type PivotFieldData = {
  id: string;
  label: string;
  type: 'builtin' | 'variable';
  variableType?: 'boolean' | 'categorical' | 'numeric';
  color?: string | null;
};

type Props = {
  field: PivotFieldData;
  onRemove?: () => void;
  compact?: boolean;
};

export default function PivotField({ field, onRemove, compact }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: field.id,
    data: field,
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50, opacity: 0.9 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--card)] text-xs font-medium transition-shadow ${
        isDragging ? 'shadow-lg' : 'shadow-sm hover:shadow-md'
      } ${compact ? 'px-1.5 py-0.5' : 'px-2 py-1'} cursor-grab active:cursor-grabbing`}
      {...listeners}
      {...attributes}
    >
      <GripVertical className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
      {field.color && (
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: field.color }} />
      )}
      <span className="truncate">{field.label}</span>
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 rounded p-0.5 text-[var(--text-muted)] hover:text-red-500"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}
