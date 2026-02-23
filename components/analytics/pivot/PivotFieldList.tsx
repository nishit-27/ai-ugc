'use client';

import PivotField, { type PivotFieldData } from './PivotField';

type Props = {
  fields: PivotFieldData[];
  usedFieldIds: Set<string>;
};

export default function PivotFieldList({ fields, usedFieldIds }: Props) {
  const available = fields.filter(f => !usedFieldIds.has(f.id));

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Available Fields
      </label>
      {available.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {available.map(f => (
            <PivotField key={f.id} field={f} />
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-[var(--text-muted)]">All fields are in use</p>
      )}
    </div>
  );
}
