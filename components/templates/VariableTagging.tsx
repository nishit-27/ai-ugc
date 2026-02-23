'use client';

import { useEffect } from 'react';
import { Tag } from 'lucide-react';
import { useVariables, type CustomVariable } from '@/hooks/useVariables';

type Props = {
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
};

export default function VariableTagging({ values, onChange }: Props) {
  const { variables, loading } = useVariables();

  // Auto-default boolean variables to "false" when not yet set
  useEffect(() => {
    if (loading || variables.length === 0) return;
    const defaults: Record<string, string> = {};
    let hasNew = false;
    for (const v of variables) {
      if (v.type === 'boolean' && !values[v.id]) {
        defaults[v.id] = 'false';
        hasNew = true;
      }
    }
    if (hasNew) {
      onChange({ ...defaults, ...values });
    }
  }, [variables, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || variables.length === 0) return null;

  const handleChange = (variableId: string, value: string) => {
    onChange({ ...values, [variableId]: value });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Tag className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Variables</span>
      </div>
      <div className="space-y-2.5">
        {variables.map(v => (
          <VariableInput key={v.id} variable={v} value={values[v.id] || ''} onChange={(val) => handleChange(v.id, val)} />
        ))}
      </div>
    </div>
  );
}

function VariableInput({ variable, value, onChange }: { variable: CustomVariable; value: string; onChange: (val: string) => void }) {
  if (variable.type === 'boolean') {
    const isTrue = value === 'true';
    return (
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-[var(--text)]">
          {variable.color && <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: variable.color }} />}
          {variable.name}
        </label>
        <button
          type="button"
          onClick={() => onChange(isTrue ? 'false' : 'true')}
          className={`relative h-5 w-9 rounded-full transition-colors ${isTrue ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'}`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${isTrue ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      </div>
    );
  }

  if (variable.type === 'categorical') {
    return (
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text)]">
          {variable.color && <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: variable.color }} />}
          {variable.name}
        </label>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
        >
          <option value="">Select...</option>
          {variable.options?.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  if (variable.type === 'numeric') {
    return (
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text)]">
          {variable.color && <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: variable.color }} />}
          {variable.name}
        </label>
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="0"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none"
        />
      </div>
    );
  }

  return null;
}
