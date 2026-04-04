import { NextRequest, NextResponse } from 'next/server';
import {
  ensureDatabaseReady,
  getPipelineBatch,
  getTemplateJobsByBatchId,
  initDatabase,
  updatePipelineBatch,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDatabaseReady();
    const { id } = await params;
    const batch = await getPipelineBatch(id);
    if (!batch) {
      return NextResponse.json({ error: 'Pipeline batch not found' }, { status: 404 });
    }

    const childJobs = await getTemplateJobsByBatchId(id);

    // URLs are R2 public — set signedUrl directly
    const jobsWithUrls = childJobs.map((job: { status?: string; outputUrl?: string; stepResults?: { stepId: string; type: string; label: string; outputUrl: string; signedUrl?: string }[]; [key: string]: unknown }) => {
      const result = { ...job };

      if (job.status === 'completed' && job.outputUrl) {
        result.signedUrl = job.outputUrl;
      }

      if (Array.isArray(job.stepResults) && job.stepResults.length > 0) {
        result.stepResults = job.stepResults.map((sr) => ({
          ...sr,
          signedUrl: sr.outputUrl || undefined,
        }));
      }

      return result;
    });

    return NextResponse.json({ ...batch, jobs: jobsWithUrls }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err) {
    console.error('Get pipeline batch error:', err);
    return NextResponse.json({ error: 'Failed to get pipeline batch' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initDatabase();
    const { id } = await params;
    const body = await request.json();
    const { name } = body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    const updated = await updatePipelineBatch(id, { name: name.trim() });
    if (!updated) {
      return NextResponse.json({ error: 'Pipeline batch not found' }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err) {
    console.error('Update pipeline batch error:', err);
    return NextResponse.json({ error: 'Failed to update pipeline batch' }, { status: 500 });
  }
}

export async function DELETE() {
  return NextResponse.json({ error: 'Batch deletion is disabled' }, { status: 405 });
}
