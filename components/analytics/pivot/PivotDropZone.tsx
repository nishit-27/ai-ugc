'use client';

import { useDroppable } from '@dnd-kit/core';
import PivotField, { type PivotFieldData } from './PivotField';

type Props = {
  id: string;
  label: string;
  fields: PivotFieldData[];
  onRemove: (fieldId: string) => void;
  children?: React.ReactNode;
};

export default function PivotDropZone({ id, label, fields, onRemove, children }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{label}</label>
      <div
        ref={setNodeRef}
        className={`min-h-[36px] rounded-lg border-2 border-dashed p-1.5 transition-colors ${
          isOver
            ? 'border-[var(--primary)] bg-[var(--primary)]/5'
            : 'border-[var(--border)] bg-[var(--muted)]/30'
        }`}
      >
        {fields.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {fields.map(f => (
              <PivotField key={f.id} field={f} onRemove={() => onRemove(f.id)} compact />
            ))}
          </div>
        ) : (
          <p className="py-0.5 text-center text-[10px] text-[var(--text-muted)]">
            Drop fields here
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
