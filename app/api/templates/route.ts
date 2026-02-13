import { NextRequest, NextResponse, after } from 'next/server';
import { createTemplateJob, getAllTemplateJobs, createPipelineBatch, updatePipelineBatch, initDatabase } from '@/lib/db';
import { processTemplateJob, processPipelineBatch } from '@/lib/processTemplateJob';
import type { MiniAppStep, BatchVideoGenConfig, VideoGenConfig } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes — video processing needs more than the default 10s/60s

export async function GET() {
  try {
    await initDatabase();
    const jobs = await getAllTemplateJobs();

    // Return jobs immediately — no URL signing here.
    // Signed URLs are resolved lazily on the client via /api/signed-url
    // or on-demand via /api/templates/[id].
    return NextResponse.json(jobs, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err) {
    console.error('List template jobs error:', err);
    return NextResponse.json({ error: 'Failed to list template jobs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    const body = await request.json();
    const { name, pipeline, videoSource, tiktokUrl, videoUrl } = body;

    if (!name || !pipeline || !Array.isArray(pipeline) || pipeline.length === 0) {
      return NextResponse.json({ error: 'Name and pipeline steps are required' }, { status: 400 });
    }

    const enabledSteps = pipeline.filter((s: { enabled: boolean }) => s.enabled);
    if (enabledSteps.length === 0) {
      return NextResponse.json({ error: 'At least one pipeline step must be enabled' }, { status: 400 });
    }

    // Check if any enabled step is batch-video-generation
    const batchStep = enabledSteps.find((s: MiniAppStep) => s.type === 'batch-video-generation');

    if (batchStep) {
      // ── Batch pipeline path ──
      const batchConfig = batchStep.config as BatchVideoGenConfig;
      const images = batchConfig.images || [];

      if (images.length === 0) {
        return NextResponse.json({ error: 'Batch Video Gen step requires at least one image' }, { status: 400 });
      }

      // Video source validation for batch: check if non-batch steps need input video
      // The batch step replaces itself with video-generation, so check if resulting pipeline needs input video
      const firstEnabled = enabledSteps[0];
      const batchIsFirst = firstEnabled.id === batchStep.id;
      const batchModeIsSubtle = batchConfig.mode === 'subtle-animation';

      if (batchIsFirst && !batchModeIsSubtle) {
        // Motion control needs input video
        if (!tiktokUrl && !videoUrl) {
          return NextResponse.json({ error: 'A video source is required for Motion Control mode' }, { status: 400 });
        }
      } else if (!batchIsFirst) {
        // Batch step is not first, so we need to check if the first step needs input video
        const needsInputVideo = !(firstEnabled.type === 'video-generation'
          && (firstEnabled.config as { mode?: string }).mode === 'subtle-animation');
        if (needsInputVideo && !tiktokUrl && !videoUrl) {
          return NextResponse.json({ error: 'A video source is required (TikTok URL or uploaded video)' }, { status: 400 });
        }
      }

      // Create the pipeline batch record
      const batch = await createPipelineBatch({
        name,
        pipeline,
        totalJobs: images.length,
      });

      if (!batch) {
        return NextResponse.json({ error: 'Failed to create pipeline batch' }, { status: 500 });
      }

      // For each image: clone pipeline, replace batch-video-generation with regular video-generation
      const childJobs = [];
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const clonedPipeline: MiniAppStep[] = pipeline.map((step: MiniAppStep) => {
          if (step.id === batchStep.id) {
            // Replace with regular video-generation containing this single image
            const singleConfig: VideoGenConfig = {
              mode: batchConfig.mode,
              imageId: img.imageId,
              imageUrl: img.imageUrl,
              prompt: batchConfig.prompt,
              aspectRatio: batchConfig.aspectRatio,
              duration: batchConfig.duration,
              generateAudio: batchConfig.generateAudio,
              negativePrompt: batchConfig.negativePrompt,
              resolution: batchConfig.resolution,
              maxSeconds: batchConfig.maxSeconds,
            };
            return {
              ...step,
              type: 'video-generation' as const,
              config: singleConfig,
            };
          }
          return { ...step };
        });

        const jobName = `${name} #${i + 1}${img.filename ? ` (${img.filename})` : ''}`;
        const job = await createTemplateJob({
          name: jobName,
          pipeline: clonedPipeline,
          videoSource: videoUrl ? 'upload' : 'tiktok',
          tiktokUrl: tiktokUrl || null,
          videoUrl: videoUrl || null,
          pipelineBatchId: batch.id,
        });
        childJobs.push(job);
      }

      // Update batch status to processing
      await updatePipelineBatch(batch.id, { status: 'processing' });

      // Schedule batch processing: resolve TikTok URL ONCE, then process all child jobs
      const childJobIds = childJobs.filter(Boolean).map((j) => j!.id);
      after(async () => {
        try {
          await processPipelineBatch(childJobIds, tiktokUrl || null, videoUrl || null);
        } catch (err) {
          console.error(`processPipelineBatch error for batch ${batch.id}:`, err);
        }
      });

      return NextResponse.json({
        ...batch,
        isBatch: true,
        childJobIds: childJobs.filter(Boolean).map((j) => j!.id),
      });
    }

    // ── Single pipeline path (unchanged) ──
    const firstStep = enabledSteps[0];
    const needsInputVideo = !(firstStep.type === 'video-generation'
      && (firstStep.config as { mode?: string }).mode === 'subtle-animation');
    if (needsInputVideo) {
      if (!tiktokUrl && !videoUrl) {
        return NextResponse.json({ error: 'A video source is required (TikTok URL or uploaded video)' }, { status: 400 });
      }
    }

    const job = await createTemplateJob({
      name,
      pipeline,
      videoSource: videoUrl ? 'upload' : 'tiktok',
      tiktokUrl: tiktokUrl || null,
      videoUrl: videoUrl || null,
      pipelineBatchId: null,
    });

    if (!job) {
      return NextResponse.json({ error: 'Failed to create template job' }, { status: 500 });
    }

    // Schedule via after() so Vercel keeps the Lambda alive for processing
    after(async () => {
      try { await processTemplateJob(job.id); }
      catch (err) { console.error('processTemplateJob error:', err); }
    });

    return NextResponse.json(job);
  } catch (err) {
    console.error('Create template job error:', err);
    return NextResponse.json({ error: 'Failed to create template job' }, { status: 500 });
  }
}
