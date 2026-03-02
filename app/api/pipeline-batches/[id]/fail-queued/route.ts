import { NextRequest, NextResponse } from 'next/server';
import { ensureDatabaseReady, updatePipelineBatchProgress } from '@/lib/db';
import { sql } from '@/lib/db-client';

export const dynamic = 'force-dynamic';

/**
 * POST /api/pipeline-batches/[id]/fail-queued
 *
 * Marks all template_jobs with status='queued' in the given batch as 'failed'.
 * This allows users to retry them individually via the regenerate button
 * instead of leaving them stuck in queue forever.
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

  // Fail all queued jobs in this batch
  const result = await sql`
    UPDATE template_jobs
    SET status = 'failed',
        step = 'Failed',
        error = 'Marked as failed — job was stuck in queue and never started processing.'
    WHERE pipeline_batch_id = ${batchId}
      AND status = 'queued'
    RETURNING id
  `;

  const failedCount = result.length;

  // Update batch progress to reflect the newly failed jobs
  if (failedCount > 0) {
    try {
      await updatePipelineBatchProgress(batchId);
    } catch (e) {
      console.error('[FailQueued] Error updating batch progress:', e);
    }
  }

  return NextResponse.json({
    ok: true,
    failedCount,
    message: failedCount > 0
      ? `Marked ${failedCount} queued job${failedCount > 1 ? 's' : ''} as failed`
      : 'No queued jobs found in this batch',
  });
}
