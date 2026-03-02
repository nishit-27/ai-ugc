import { NextRequest, NextResponse, after } from 'next/server';
import { initDatabase } from '@/lib/db';
import { processTemplateJob } from '@/lib/processTemplateJob';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/templates/[id]/process
 *
 * Lightweight trigger that starts processing a single template job
 * in a background `after()` callback. Each call gets its own serverless
 * invocation with a fresh 5-minute timeout, preventing the queue
 * starvation that occurs when processPipelineBatch tries to run all
 * jobs in a single function.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: jobId } = await params;

  if (!jobId) {
    return NextResponse.json({ error: 'Missing job ID' }, { status: 400 });
  }

  await initDatabase();

  after(async () => {
    try {
      await processTemplateJob(jobId);
    } catch (err) {
      console.error(`[ProcessEndpoint] processTemplateJob(${jobId}) failed:`, err);
    }
  });

  return NextResponse.json({ ok: true, jobId });
}
