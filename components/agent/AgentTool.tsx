'use client';

import { useState } from 'react';
import { ChevronDown, Database, Table2, Terminal } from 'lucide-react';
import { BarsLoader } from './AgentLoader';

export type ToolState = 'running' | 'done' | 'error';

export type AgentToolPart = {
  name: string;
  state: ToolState;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
};

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  run_sql: Terminal,
  describe_table: Table2,
  list_tables: Database,
};

function summarizeInput(input: Record<string, unknown>): string {
  const entries = Object.entries(input);
  if (entries.length === 0) return '—';
  return entries
    .map(([k, v]) => {
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      return `${k}: ${s}`;
    })
    .join(' · ');
}

export function AgentTool({ part }: { part: AgentToolPart }) {
  const [open, setOpen] = useState(false);
  const Icon = TOOL_ICONS[part.name] || Terminal;
  const summary = summarizeInput(part.input);

  const stateColor =
    part.state === 'running'
      ? 'text-[var(--text-muted)]'
      : part.state === 'error'
      ? 'text-red-500'
      : 'text-[var(--success)]';

  const stateLabel =
    part.state === 'running' ? 'RUNNING' : part.state === 'error' ? 'ERROR' : 'DONE';

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--bg-tertiary)]"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
        <span className="shrink-0 font-mono text-[var(--text-primary)]">{part.name}</span>
        <span className="truncate font-mono text-[var(--text-muted)]">{summary}</span>
        <span className={`ml-auto flex shrink-0 items-center gap-1 text-[10px] font-semibold tracking-widest ${stateColor}`}>
          {part.state === 'running' && <BarsLoader size={10} />}
          {stateLabel}
          <ChevronDown
            className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--border)]">
          <div className="border-b border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Input
            </div>
            <pre className="overflow-x-auto font-mono text-[11px] text-[var(--text-secondary)]">
              {JSON.stringify(part.input, null, 2)}
            </pre>
          </div>
          {part.output && (
            <div className="bg-[var(--bg-primary)] px-3 py-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                Output
              </div>
              <pre className="max-h-80 overflow-auto font-mono text-[11px] text-[var(--text-secondary)]">
                {JSON.stringify(part.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
