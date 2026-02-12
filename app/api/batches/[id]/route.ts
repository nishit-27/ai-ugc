import { NextRequest, NextResponse } from 'next/server';
import { getBatch, deleteBatch, getJobsByBatchId, getModel } from '@/lib/db';
import { getSignedUrlFromPublicUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

type Job = {
  id: string;
  outputUrl?: string;
  [key: string]: unknown;
};

// GET /api/batches/[id] - Get batch with all jobs
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const batch = await getBatch(id);

    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    const jobs = await getJobsByBatchId(id) as Job[];
    let model = null;
    if (batch.modelId) {
      model = await getModel(batch.modelId);
    }

    // Add signed URLs to jobs with outputUrl
    const jobsWithSignedUrls = await Promise.all(
      jobs.map(async (job) => {
        if (job.outputUrl && job.outputUrl.includes('storage.googleapis.com')) {
          try {
            const signedUrl = await getSignedUrlFromPublicUrl(job.outputUrl);
            return { ...job, signedUrl };
          } catch {
            return { ...job, signedUrl: job.outputUrl };
          }
        }
        return { ...job, signedUrl: job.outputUrl };
      })
    );

    return NextResponse.json({
      ...batch,
      model: model ? { id: model.id, name: model.name, avatarUrl: model.avatarUrl } : null,
      jobs: jobsWithSignedUrls,
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
