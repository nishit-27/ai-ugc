import { NextRequest, NextResponse, after } from 'next/server';
import { initDatabase, createPipelineBatch, createTemplateJob, updatePipelineBatch, getModelAccountMappingsForModels, getAllModels, getModelImages } from '@/lib/db';
import { processPipelineBatch } from '@/lib/processTemplateJob';
import type { MiniAppStep, VideoGenConfig, BatchVideoGenConfig, MasterConfig } from '@/types';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    const body = await request.json();
    const { name, pipeline, videoSource, tiktokUrl, videoUrl, modelIds, caption, scheduledFor, timezone, publishMode } = body;

    const session = await auth();
    const createdBy = session?.user?.name?.split(' ')[0] || null;

    // --- Validation ---
    if (!name || !pipeline || !Array.isArray(pipeline) || pipeline.length === 0) {
      return NextResponse.json({ error: 'Name and pipeline steps are required' }, { status: 400 });
    }

    const enabledSteps = pipeline.filter((s: { enabled: boolean }) => s.enabled);
    if (enabledSteps.length === 0) {
      return NextResponse.json({ error: 'At least one pipeline step must be enabled' }, { status: 400 });
    }

    if (!modelIds || !Array.isArray(modelIds) || modelIds.length === 0) {
      return NextResponse.json({ error: 'At least one model must be selected' }, { status: 400 });
    }

    // --- Video source validation ---
    // Check if the first enabled step needs an input video
    const firstEnabled = enabledSteps[0] as MiniAppStep;
    const firstIsBatchVideo = firstEnabled.type === 'batch-video-generation';
    const firstIsVideo = firstEnabled.type === 'video-generation';

    if (firstIsBatchVideo) {
      const batchConfig = firstEnabled.config as BatchVideoGenConfig;
      if (batchConfig.mode !== 'subtle-animation') {
        // Motion control needs input video
        if (!tiktokUrl && !videoUrl) {
          return NextResponse.json({ error: 'A video source is required for Motion Control mode' }, { status: 400 });
        }
      }
    } else if (firstIsVideo) {
      const videoConfig = firstEnabled.config as VideoGenConfig;
      if (videoConfig.mode !== 'subtle-animation') {
        if (!tiktokUrl && !videoUrl) {
          return NextResponse.json({ error: 'A video source is required (TikTok URL or uploaded video)' }, { status: 400 });
        }
      }
    } else {
      // Non-video first step always needs input video
      if (!tiktokUrl && !videoUrl) {
        return NextResponse.json({ error: 'A video source is required (TikTok URL or uploaded video)' }, { status: 400 });
      }
    }

    // --- Fetch models and their primary images ---
    const allModels = await getAllModels();
    const selectedModels = allModels.filter((m: { id: string }) => modelIds.includes(m.id));

    if (selectedModels.length === 0) {
      return NextResponse.json({ error: 'No valid models found for the given model IDs' }, { status: 400 });
    }

    // For each model, find primary image
    const primaryImages: Record<string, string> = {};
    for (const model of selectedModels) {
      const images = await getModelImages(model.id);
      const primary = images.find((img: { isPrimary?: boolean }) => img.isPrimary) || images[0];
      if (primary) {
        primaryImages[model.id] = primary.gcsUrl;
      }
    }

    // --- Get account mappings ---
    const mappings = await getModelAccountMappingsForModels(modelIds);

    // --- Build master config ---
    const masterConfig: MasterConfig = {
      caption,
      scheduledFor,
      timezone,
      publishMode: publishMode || 'draft',
      models: selectedModels.map((m: { id: string; name: string }) => ({
        modelId: m.id,
        modelName: m.name,
        primaryImageUrl: primaryImages[m.id] || '',
        accountIds: mappings
          .filter((am: { modelId: string }) => am.modelId === m.id)
          .map((am: { lateAccountId: string }) => am.lateAccountId),
      })),
    };

    // --- Create pipeline batch ---
    const batch = await createPipelineBatch({
      name,
      pipeline,
      totalJobs: selectedModels.length,
      isMaster: true,
      masterConfig,
      createdBy,
    });

    if (!batch) {
      return NextResponse.json({ error: 'Failed to create master pipeline batch' }, { status: 500 });
    }

    // --- Create a child template job for each model ---
    const childJobs = [];
    for (const model of selectedModels) {
      const modelPrimaryImageUrl = primaryImages[model.id] || '';

      // Clone pipeline and inject model's primary image into video generation steps
      const clonedPipeline: MiniAppStep[] = pipeline.map((step: MiniAppStep) => {
        if (!step.enabled) {
          return { ...step };
        }

        if (step.type === 'batch-video-generation') {
          // Convert batch-video-generation to video-generation with this model's primary image
          const batchConfig = step.config as BatchVideoGenConfig;
          const singleConfig: VideoGenConfig = {
            mode: batchConfig.mode,
            imageUrl: modelPrimaryImageUrl,
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

        if (step.type === 'video-generation') {
          // Use master first frame if user generated one, otherwise fall back to primary image
          const videoConfig = step.config as VideoGenConfig;
          const firstFrameUrl = videoConfig.masterFirstFrames?.[model.id];
          return {
            ...step,
            config: {
              ...videoConfig,
              imageUrl: firstFrameUrl || modelPrimaryImageUrl,
              masterFirstFrames: undefined, // Don't store the full map in child jobs
            },
          };
        }

        return { ...step };
      });

      const jobName = `${name} - ${model.name}`;
      const job = await createTemplateJob({
        name: jobName,
        pipeline: clonedPipeline,
        videoSource: videoUrl ? 'upload' : 'tiktok',
        tiktokUrl: tiktokUrl || null,
        videoUrl: videoUrl || null,
        pipelineBatchId: batch.id,
        modelId: model.id,
        createdBy,
      });
      childJobs.push(job);
    }

    // --- Update batch status to processing ---
    await updatePipelineBatch(batch.id, { status: 'processing' });

    // --- Schedule batch processing ---
    const childJobIds = childJobs.filter(Boolean).map((j) => j!.id);
    after(async () => {
      try {
        await processPipelineBatch(childJobIds, tiktokUrl || null, videoUrl || null);
      } catch (err) {
        console.error(`processPipelineBatch error for master batch ${batch.id}:`, err);
      }
    });

    return NextResponse.json({
      ...batch,
      isBatch: true,
      isMaster: true,
      childJobIds,
    });
  } catch (err) {
    console.error('Create master batch error:', err);
    return NextResponse.json({ error: 'Failed to create master batch' }, { status: 500 });
  }
}
