'use client';

import { useState } from 'react';
import { Tag, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useVariables, type CustomVariable } from '@/hooks/useVariables';
import { useToast } from '@/hooks/useToast';
import VariableTable from '@/components/variables/VariableTable';
import VariableModal from '@/components/variables/VariableModal';

export default function VariablesPage() {
  const { variables, loading, createVariable, updateVariable, deleteVariable } = useVariables();
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CustomVariable | null>(null);

  const handleSave = async (data: { name: string; type: string; options?: string[]; color?: string }) => {
    if (editing) {
      await updateVariable(editing.id, data);
      showToast('Variable updated', 'success');
    } else {
      await createVariable(data);
      showToast('Variable created', 'success');
    }
  };

  const handleEdit = (variable: CustomVariable) => {
    setEditing(variable);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    await deleteVariable(id);
    showToast('Variable deleted', 'success');
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Tag className="h-5 w-5 text-[var(--primary)]" />
          <h1 className="text-xl font-bold">Variables</h1>
          <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">
            {variables.length}
          </span>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setModalOpen(true); }}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Variable
        </Button>
      </div>

      <VariableTable variables={variables} onEdit={handleEdit} onDelete={handleDelete} />

      <VariableModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        variable={editing}
      />
    </div>
  );
}
