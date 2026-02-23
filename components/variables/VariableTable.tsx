'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CustomVariable } from '@/hooks/useVariables';

type Props = {
  variables: CustomVariable[];
  onEdit: (variable: CustomVariable) => void;
  onDelete: (id: string) => void;
};

const TYPE_LABELS: Record<string, string> = {
  boolean: 'Boolean',
  categorical: 'Categorical',
  numeric: 'Numeric',
};

export default function VariableTable({ variables, onEdit, onDelete }: Props) {
  if (variables.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)]">
          <span className="text-lg">🏷</span>
        </div>
        <p className="text-sm font-medium">No variables yet</p>
        <p className="text-xs text-[var(--text-muted)]">Create variables to tag your videos and track performance.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
            <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">Name</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">Type</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">Options</th>
            <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {variables.map(v => (
            <tr key={v.id} className="border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[var(--muted)]/50">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {v.color && (
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: v.color }} />
                  )}
                  <span className="font-medium">{v.name}</span>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)]">
                  {TYPE_LABELS[v.type] || v.type}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
                {v.type === 'categorical' && v.options?.length
                  ? v.options.join(', ')
                  : v.type === 'boolean'
                  ? 'True / False'
                  : '—'}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(v)} title="Edit">
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-600" onClick={() => onDelete(v.id)} title="Delete">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
