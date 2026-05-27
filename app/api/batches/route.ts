import { NextResponse } from 'next/server';
import { getAllBatches, getModel } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Batch {
  id: string;
  name: string;
  status: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  modelId?: string | null;
}

// GET /api/batches - List all batches with model info
export async function GET() {
  try {
    const batches = await getAllBatches();

    // Add model info to each batch
    const batchesWithModels = await Promise.all(
      batches.map(async (batch: Batch) => {
        let model = null;
        if (batch.modelId) {
          model = await getModel(batch.modelId);
        }
        return {
          ...batch,
          model: model ? { id: model.id, name: model.name, avatarUrl: model.avatarUrl } : null,
          progress: batch.totalJobs > 0
            ? Math.round(((batch.completedJobs + batch.failedJobs) / batch.totalJobs) * 100)
            : 0,
        };
      })
    );

    return NextResponse.json(batchesWithModels);
  } catch (err) {
    console.error('Get batches error:', err);
    return NextResponse.json({ error: 'Failed to fetch batches' }, { status: 500 });
  }
}
