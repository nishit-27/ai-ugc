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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: jobId } = await params;

  if (!jobId) {
    return NextResponse.json({ error: 'Missing job ID' }, { status: 400 });
  }

  await initDatabase();
  let fromStepIndex: number | undefined;
  try {
    const body = await request.json();
    if (body?.fromStepIndex !== undefined) {
      if (!Number.isInteger(body.fromStepIndex) || body.fromStepIndex < 0) {
        return NextResponse.json({ error: 'fromStepIndex must be a non-negative integer' }, { status: 400 });
      }
      fromStepIndex = body.fromStepIndex;
    }
  } catch {}

  after(async () => {
    try {
      await processTemplateJob(jobId, fromStepIndex);
    } catch (err) {
      console.error(`[ProcessEndpoint] processTemplateJob(${jobId}, ${fromStepIndex ?? 'full'}) failed:`, err);
    }
  });

  return NextResponse.json({ ok: true, jobId, fromStepIndex: fromStepIndex ?? null });
}
