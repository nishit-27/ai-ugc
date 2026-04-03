import { NextRequest, NextResponse } from 'next/server';
import { ensureDatabaseReady, updatePipelineBatchProgress, failProcessingJobsInBatch } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/pipeline-batches/[id]/fail-processing
 *
 * Marks all template_jobs with status='processing' in the given batch as 'failed'.
 * This is a manual escape hatch for jobs that appear stuck and lets users
 * regenerate them individually afterward.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: batchId } = await params;

  if (!batchId) {
    return NextResponse.json({ error: 'Missing batch ID' }, { status: 400 });
  }

  await ensureDatabaseReady();

  const failedCount = await failProcessingJobsInBatch(batchId);

  if (failedCount > 0) {
    try {
      await updatePipelineBatchProgress(batchId);
    } catch (e) {
      console.error('[FailProcessing] Error updating batch progress:', e);
    }
  }

  return NextResponse.json({
    ok: true,
    failedCount,
    message: failedCount > 0
      ? `Marked ${failedCount} processing job${failedCount > 1 ? 's' : ''} as failed`
      : 'No processing jobs found in this batch',
  });
}
