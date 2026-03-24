'use client';

import { useState } from 'react';
import { Tag, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useVariables, type CustomVariable } from '@/hooks/useVariables';
import { useToast } from '@/hooks/useToast';
import VariableTable from '@/components/variables/VariableTable';
import VariableModal from '@/components/variables/VariableModal';
import PageTransition from '@/components/ui/PageTransition';

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

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-2xl" />
            <div>
              <Skeleton className="h-7 w-36" />
              <Skeleton className="mt-1.5 h-4 w-56" />
            </div>
          </div>
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-2xl border border-[var(--border)]">
              <div className="space-y-4 p-5">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div>
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="mt-1.5 h-3 w-16" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-16 rounded-lg" />
                  <Skeleton className="h-6 w-20 rounded-lg" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <PageTransition className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary)]/10">
            <Tag className="h-6 w-6 text-[var(--primary)]" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight">Variables</h1>
              {variables.length > 0 && (
                <span className="rounded-full bg-[var(--primary)]/10 px-2.5 py-0.5 text-xs font-bold text-[var(--primary)]">
                  {variables.length}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              Tag videos with custom attributes and analyze what performs best
            </p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New Variable
        </Button>
      </div>

      {/* Grid or empty state */}
      {variables.length > 0 ? (
        <VariableTable variables={variables} onEdit={handleEdit} onDelete={handleDelete} />
      ) : (
        <div className="relative overflow-hidden rounded-3xl border border-dashed border-[var(--border)] bg-[var(--surface)]">
          {/* Decorative gradient blob */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[var(--primary)]/5 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-violet-500/5 blur-3xl" />

          <div className="relative flex flex-col items-center gap-5 px-6 py-24">
            <div className="relative">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--primary)]/10">
                <Tag className="h-9 w-9 text-[var(--primary)]" />
              </div>
              <div className="absolute -right-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary)] shadow-lg shadow-[var(--primary)]/25">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold">Create your first variable</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--text-muted)]">
                Variables let you tag videos with custom attributes — hook type, tone, rating, and more. Then analyze which combinations drive the best performance.
              </p>
            </div>
            <Button onClick={openCreate} className="mt-1">
              <Plus className="mr-2 h-4 w-4" />
              Create Variable
            </Button>
          </div>
        </div>
      )}

      <VariableModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        variable={editing}
      />
    </PageTransition>
  );
}
