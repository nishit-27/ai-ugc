import { NextRequest, NextResponse, after } from 'next/server';
import { initDatabase, getTemplateJob, updateTemplateJob } from '@/lib/db';
import { processTemplateJob } from '@/lib/processTemplateJob';
import type { MiniAppStep } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/templates/[id]/regen-step
 * Body: { stepIndex: number }
 *
 * Regenerates a single pipeline step (and all subsequent steps).
 * Reuses results from steps before stepIndex.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await initDatabase();
    const { id: jobId } = await params;

    const job = await getTemplateJob(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (!['queued', 'completed', 'failed', 'partial'].includes(job.status)) {
      return NextResponse.json({ error: 'Can only regen steps on queued, completed, failed, or partial jobs' }, { status: 400 });
    }

    let body: { stepIndex?: number } = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { stepIndex } = body;
    if (stepIndex === undefined || stepIndex === null || typeof stepIndex !== 'number') {
      return NextResponse.json({ error: 'stepIndex is required' }, { status: 400 });
    }

    const enabledSteps = (job.pipeline || []).filter((s: MiniAppStep) => s.enabled);
    if (stepIndex < 0 || stepIndex >= enabledSteps.length) {
      return NextResponse.json({ error: `stepIndex must be 0-${enabledSteps.length - 1}` }, { status: 400 });
    }

    // For stepIndex > 0, verify we have results for all prior steps
    if (stepIndex > 0) {
      const stepResults = job.stepResults || [];
      const completedStepIds = new Set(stepResults.map((r: { stepId: string }) => r.stepId));
      for (let i = 0; i < stepIndex; i++) {
        if (!completedStepIds.has(enabledSteps[i].id)) {
          return NextResponse.json({
            error: `Step ${i} (${enabledSteps[i].type}) has no result — cannot resume from step ${stepIndex}`,
          }, { status: 400 });
        }
      }
    }

    // Keep results for steps before stepIndex
    const priorStepIds = new Set(enabledSteps.slice(0, stepIndex).map((s: MiniAppStep) => s.id));
    const priorResults = (job.stepResults || []).filter((sr: { stepId: string }) => priorStepIds.has(sr.stepId));

    await updateTemplateJob(jobId, {
      status: 'processing',
      step: `Re-running from step ${stepIndex + 1}...`,
      currentStep: stepIndex,
      error: null,
      outputUrl: null,
      completedAt: null,
      stepResults: priorResults,
    });

    after(async () => {
      try {
        await processTemplateJob(jobId, stepIndex);
      } catch (err) {
        console.error(`[RegenStep] Job ${jobId} from step ${stepIndex} failed:`, err);
      }
    });

    return NextResponse.json({ success: true, jobId, fromStep: stepIndex });
  } catch (err) {
    console.error('Regen-step error:', err);
    return NextResponse.json({ error: 'Failed to regenerate step' }, { status: 500 });
  }
}
