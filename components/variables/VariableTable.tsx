'use client';

import { useState } from 'react';
import { Pencil, Trash2, ToggleLeft, List, Hash, MoreVertical } from 'lucide-react';
import type { CustomVariable } from '@/hooks/useVariables';
import { getColorClass, getColorTextClass, getColorLightClass } from './variable-colors';

type Props = {
  variables: CustomVariable[];
  onEdit: (variable: CustomVariable) => void;
  onDelete: (id: string) => void;
};

const TYPE_CONFIG: Record<string, { label: string; icon: typeof ToggleLeft }> = {
  boolean: { label: 'Boolean', icon: ToggleLeft },
  categorical: { label: 'Categorical', icon: List },
  numeric: { label: 'Numeric', icon: Hash },
};

function VariableCard({
  variable: v,
  onEdit,
  onDelete,
}: {
  variable: CustomVariable;
  onEdit: (v: CustomVariable) => void;
  onDelete: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const config = TYPE_CONFIG[v.type] || TYPE_CONFIG.boolean;
  const Icon = config.icon;

  return (
    <div className="group relative rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm transition-all hover:shadow-md hover:border-[var(--primary)]/25">
      <div className="px-5 py-5">
        {/* Top row: icon + name + menu */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${getColorLightClass(v.color)}`}>
              <Icon className={`h-5 w-5 ${getColorTextClass(v.color)}`} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold">{v.name}</h3>
              <span className="text-[11px] text-[var(--text-muted)]">{config.label}</span>
            </div>
          </div>

          {/* Menu */}
          <div className="relative shrink-0">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="rounded-lg p-1.5 text-[var(--text-muted)] opacity-0 transition-all hover:bg-[var(--accent)] hover:text-[var(--text)] group-hover:opacity-100"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl">
                  <button
                    onClick={() => { setMenuOpen(false); onEdit(v); }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium transition-colors hover:bg-[var(--accent)]"
                  >
                    <Pencil className="h-3.5 w-3.5 text-[var(--text-muted)]" /> Edit Variable
                  </button>
                  <div className="mx-3 border-t border-[var(--border)]" />
                  <button
                    onClick={() => { setMenuOpen(false); onDelete(v.id); }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Values/options display */}
        <div className="min-h-[2rem]">
          {v.type === 'categorical' && v.options?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {v.options.map((opt, i) => (
                <span
                  key={i}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${getColorLightClass(v.color)} ${getColorTextClass(v.color)}`}
                >
                  {opt}
                </span>
              ))}
            </div>
          ) : v.type === 'boolean' ? (
            <div className="flex gap-2">
              <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
                True
              </span>
              <span className="rounded-lg bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-500 dark:bg-red-950/30 dark:text-red-400">
                False
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg bg-[var(--accent)]/60 px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)]">
              <Hash className="h-3 w-3" />
              Number input
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VariableTable({ variables, onEdit, onDelete }: Props) {
  if (variables.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {variables.map(v => (
        <VariableCard key={v.id} variable={v} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  );
}
