import { NextRequest, NextResponse } from 'next/server';
import { getBatch, deleteBatch, getJobsByBatchId, getModel } from '@/lib/db';

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
      progress: batch.totalJobs > 0
        ? Math.round(((batch.completedJobs + batch.failedJobs) / batch.totalJobs) * 100)
        : 0,
    });
  } catch (err) {
    console.error('Get batch error:', err);
    return NextResponse.json({ error: 'Failed to fetch batch' }, { status: 500 });
  }
}

// DELETE /api/batches/[id] - Delete batch (keeps completed videos)
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const batch = await getBatch(id);

    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    // Jobs will have batch_id set to NULL, preserving completed videos
    await deleteBatch(id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete batch error:', err);
    return NextResponse.json({ error: 'Failed to delete batch' }, { status: 500 });
  }
}
