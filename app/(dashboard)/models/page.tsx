'use client';

import { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import type { Model } from '@/types';
import { useModels } from '@/hooks/useModels';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import ModelGrid from '@/components/models/ModelGrid';
import NewModelModal from '@/components/models/NewModelModal';
import ModelDetailModal from '@/components/models/ModelDetailModal';

export default function ModelsPage() {
  const { models, modelImages, isLoadingPage, refresh, loadModelImages } = useModels();
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [newModelModal, setNewModelModal] = useState(false);
  const [modelDetailModal, setModelDetailModal] = useState(false);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)]">Models</h1>
          <p className="text-xs text-[var(--text-muted)]">
            {models.length} model{models.length !== 1 ? 's' : ''} &middot; Manage personas and link social accounts
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={refresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
          <button
            onClick={() => setNewModelModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-medium text-white transition-colors hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            New Model
          </button>
        </div>
      </div>

      <ModelGrid
        models={models}
        isLoading={isLoadingPage}
        onModelClick={(model) => {
          setSelectedModel(model);
          loadModelImages(model.id);
          setModelDetailModal(true);
        }}
        onNewModel={() => setNewModelModal(true)}
      />

      <NewModelModal
        open={newModelModal}
        onClose={() => setNewModelModal(false)}
        onCreated={refresh}
      />

      <ModelDetailModal
        open={modelDetailModal}
        onClose={() => setModelDetailModal(false)}
        model={selectedModel}
        modelImages={modelImages}
        loadModelImages={loadModelImages}
        loadModels={refresh}
      />
    </div>
  );
}
