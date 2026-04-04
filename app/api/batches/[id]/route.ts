import { NextRequest, NextResponse } from 'next/server';
import { getBatch, getJobsByBatchId, getModel } from '@/lib/db';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/batches/[id] - Get batch with all jobs
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const batch = await getBatch(id);

    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    const jobs = await getJobsByBatchId(id);
    let model = null;
    if (batch.modelId) {
      model = await getModel(batch.modelId);
    }

    return NextResponse.json({
      ...batch,
      model: model ? { id: model.id, name: model.name, avatarUrl: model.avatarUrl } : null,
      jobs,
      progress: (batch.totalJobs || 0) > 0
        ? Math.round((((batch.completedJobs || 0) + (batch.failedJobs || 0)) / (batch.totalJobs || 1)) * 100)
        : 0,
    });
  } catch (err) {
    console.error('Get batch error:', err);
    return NextResponse.json({ error: 'Failed to fetch batch' }, { status: 500 });
  }
}

// DELETE /api/batches/[id] - Batch deletion is disabled
export async function DELETE() {
  return NextResponse.json({ error: 'Batch deletion is disabled' }, { status: 405 });
}
