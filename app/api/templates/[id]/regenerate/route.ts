import { NextRequest, NextResponse, after } from 'next/server';
import { initDatabase, getTemplateJob, createTemplateJob } from '@/lib/db';
import { processTemplateJob } from '@/lib/processTemplateJob';
import type { MiniAppStep, VideoGenConfig } from '@/types';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initDatabase();
    const { id } = await params;

    const original = await getTemplateJob(id);
    if (!original) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Parse optional overrides from request body
    let overrideImageUrl: string | undefined;
    let overrideImageId: string | undefined;
    try {
      const body = await request.json();
      overrideImageUrl = body.imageUrl;
      overrideImageId = body.imageId;
    } catch {
      // No body or invalid JSON — proceed with original config
    }

    // Clone the pipeline, applying image overrides to video-generation steps
    let pipeline = original.pipeline;
    if (overrideImageUrl || overrideImageId) {
      pipeline = pipeline.map((step: MiniAppStep) => {
        if (step.type === 'video-generation') {
          const cfg = { ...step.config } as VideoGenConfig;
          if (overrideImageUrl) {
            cfg.imageUrl = overrideImageUrl;
            delete cfg.imageId;
          } else if (overrideImageId) {
            cfg.imageId = overrideImageId;
            delete cfg.imageUrl;
          }
          return { ...step, config: cfg };
        }
        return step;
      });
    }

    // Clone the job — keep the original intact, create a new one with the updated pipeline
    const session = await auth();
    const createdBy = session?.user?.name?.split(' ')[0] || null;

    const cloned = await createTemplateJob({
      name: original.name,
      pipeline,
      videoSource: original.videoSource,
      tiktokUrl: original.tiktokUrl,
      videoUrl: original.videoUrl,
      pipelineBatchId: original.pipelineBatchId,
      modelId: original.modelId,
      regeneratedFrom: original.id,
      createdBy,
    }) as { id: string };

    // Process the cloned job in background
    after(async () => {
      try {
        await processTemplateJob(cloned.id);
      } catch (err) {
        console.error(`[Regenerate] Cloned job ${cloned.id} failed:`, err);
      }
    });

    return NextResponse.json({ success: true, jobId: cloned.id, originalJobId: id });
  } catch (err) {
    console.error('Regenerate job error:', err);
    return NextResponse.json({ error: 'Failed to regenerate' }, { status: 500 });
  }
}
