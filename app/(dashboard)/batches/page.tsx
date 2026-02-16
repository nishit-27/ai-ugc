'use client';

import { useBatches } from '@/hooks/useBatches';
import BatchList from '@/components/batches/BatchList';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

export default function BatchesPage() {
  const { batches, isLoadingPage, refresh } = useBatches();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--primary)]">Batches</h1>
          <p className="text-xs text-[var(--text-muted)]">
            {batches.length} batch{batches.length !== 1 ? 'es' : ''}
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={refresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh</TooltipContent>
        </Tooltip>
      </div>

      <BatchList batches={batches} isLoading={isLoadingPage} />
    </div>
  );
}
