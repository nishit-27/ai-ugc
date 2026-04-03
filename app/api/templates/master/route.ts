import { NextRequest, NextResponse, after } from 'next/server';
import { initDatabase, createPipelineBatch, createTemplateJob, updateTemplateJob, updatePipelineBatch, updatePipelineBatchProgress, getModelAccountMappingsForModels, getAllModels, getModelImages } from '@/lib/db';
import { processPipelineBatch } from '@/lib/processTemplateJob';
import type { MiniAppStep, VideoGenConfig, BatchVideoGenConfig, ComposeConfig, CarouselConfig, MasterConfig } from '@/types';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    const body = await request.json();
    const { name, pipeline, videoSource, tiktokUrl, videoUrl, libraryVideos, sourceTrimStart, sourceTrimEnd, modelIds, caption, scheduledFor, timezone, publishMode } = body;

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

    // Determine whether the pipeline actually needs an input video
    let needsInputVideo = false;

    if (firstIsBatchVideo) {
      const batchConfig = firstEnabled.config as BatchVideoGenConfig;
      if (batchConfig.mode !== 'subtle-animation') {
        needsInputVideo = true;
        if (!tiktokUrl && !videoUrl && videoSource !== 'library') {
          return NextResponse.json({ error: 'A video source is required for Motion Control mode' }, { status: 400 });
        }
      }
    } else if (firstIsVideo) {
      const videoConfig = firstEnabled.config as VideoGenConfig;
      if (videoConfig.mode !== 'subtle-animation') {
        needsInputVideo = true;
        if (!tiktokUrl && !videoUrl && videoSource !== 'library') {
          return NextResponse.json({ error: 'A video source is required (TikTok URL or uploaded video)' }, { status: 400 });
        }
      }
    } else if (firstEnabled.type !== 'compose' && firstEnabled.type !== 'carousel') {
      // Non-video, non-compose, non-carousel first step always needs input video
      needsInputVideo = true;
      if (!tiktokUrl && !videoUrl && videoSource !== 'library') {
        return NextResponse.json({ error: 'A video source is required (TikTok URL or uploaded video)' }, { status: 400 });
      }
    }

    // Library mode: validate per-model video URLs only when pipeline needs input video
    if (needsInputVideo && videoSource === 'library') {
      if (!libraryVideos || typeof libraryVideos !== 'object') {
        return NextResponse.json({ error: 'Library videos mapping is required for library mode' }, { status: 400 });
      }
      const missing = modelIds.filter((id: string) => !libraryVideos[id]);
      if (missing.length > 0) {
        return NextResponse.json({ error: `Missing library video for ${missing.length} model(s)` }, { status: 400 });
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
            trimStart: batchConfig.trimStart,
            trimEnd: batchConfig.trimEnd,
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

        if (step.type === 'compose') {
          // Swap layer URLs so each model gets its own video/image
          const composeConfig = step.config as ComposeConfig;
          const updatedLayers = composeConfig.layers.map((layer) => {
            const src = layer.source;
            if (src.type !== 'step-output' || !src.stepId) return layer;

            // Library video source (virtual step)
            if (src.stepId === '__video-source') {
              const modelVideoUrl = libraryVideos?.[model.id];
              if (modelVideoUrl) {
                return {
                  ...layer,
                  source: { ...src, url: modelVideoUrl, modelId: model.id },
                };
              }
              return layer;
            }

            // Video generation step — swap first frame / primary image for image layers
            const referencedStep = pipeline.find((s: MiniAppStep) => s.id === src.stepId);
            if (referencedStep && (referencedStep.type === 'video-generation' || referencedStep.type === 'batch-video-generation')) {
              if (layer.type === 'image') {
                // First frame / primary image layer
                const vgConfig = referencedStep.config as VideoGenConfig;
                const modelFirstFrame = vgConfig.masterFirstFrames?.[model.id];
                return {
                  ...layer,
                  source: { ...src, url: modelFirstFrame || modelPrimaryImageUrl, modelId: model.id },
                };
              }
              // Video layer — will be resolved via stepOutputs at runtime, just update modelId
              return {
                ...layer,
                source: { ...src, modelId: model.id },
              };
            }

            return layer;
          });
          return {
            ...step,
            config: { ...composeConfig, layers: updatedLayers },
          };
        }

        if (step.type === 'carousel') {
          // Inject this model's carousel images from masterCarouselImages into config.images
          const carouselConfig = step.config as CarouselConfig;
          const modelImages = carouselConfig.masterCarouselImages?.[model.id] || [];
          return {
            ...step,
            config: {
              ...carouselConfig,
              images: modelImages,
              modelId: model.id,
              masterCarouselImages: undefined, // Don't store the full map in child jobs
            },
          };
        }

        return { ...step };
      });

      const jobName = `${name} - ${model.name}`;

      // Determine per-job video source
      let jobVideoSource: 'tiktok' | 'upload' = videoUrl ? 'upload' : 'tiktok';
      let jobTiktokUrl = tiktokUrl || null;
      let jobVideoUrl = videoUrl || null;

      if (videoSource === 'library' && libraryVideos?.[model.id]) {
        jobVideoSource = 'upload';
        jobTiktokUrl = null;
        jobVideoUrl = libraryVideos[model.id];
      }

      const job = await createTemplateJob({
        name: jobName,
        pipeline: clonedPipeline,
        videoSource: jobVideoSource,
        tiktokUrl: jobTiktokUrl,
        videoUrl: jobVideoUrl,
        sourceTrimStart: typeof sourceTrimStart === 'number' ? sourceTrimStart : undefined,
        sourceTrimEnd: typeof sourceTrimEnd === 'number' ? sourceTrimEnd : undefined,
        pipelineBatchId: batch.id,
        modelId: model.id,
        createdBy,
      });
      childJobs.push(job);
    }

    // --- Detect carousel-only pipeline (no processing needed) ---
    const enabledTypes = new Set(
      pipeline.filter((s: MiniAppStep) => s.enabled).map((s: MiniAppStep) => s.type)
    );
    const isCarouselOnly = enabledTypes.has('carousel') &&
      !enabledTypes.has('video-generation') &&
      !enabledTypes.has('batch-video-generation') &&
      !enabledTypes.has('text-overlay') &&
      !enabledTypes.has('bg-music') &&
      !enabledTypes.has('attach-video') &&
      !enabledTypes.has('compose');

    const allChildJobIds = childJobs.filter(Boolean).map((j) => j!.id);

    if (isCarouselOnly) {
      // --- Carousel-only: complete all jobs instantly (images already exist) ---
      console.log(`[Master] Carousel-only pipeline — completing ${allChildJobIds.length} jobs instantly`);

      for (const job of childJobs) {
        if (!job) continue;
        const carouselStep = (job.pipeline || pipeline).find(
          (s: MiniAppStep) => s.enabled && s.type === 'carousel'
        );
        if (!carouselStep) continue;

        const carouselConfig = carouselStep.config as CarouselConfig;
        const imageUrls = (carouselConfig.images || [])
          .map((img: { imageUrl?: string }) => img.imageUrl)
          .filter(Boolean) as string[];

        if (imageUrls.length > 0) {
          const outputUrl = `carousel:${JSON.stringify(imageUrls)}`;
          await updateTemplateJob(job.id, {
            status: 'completed',
            step: 'Done!',
            outputUrl,
            stepResults: [{
              stepId: carouselStep.id,
              type: 'carousel',
              label: 'Carousel images',
              outputUrl: imageUrls[0],
              outputUrls: imageUrls,
              isCarousel: true,
            }],
            completedAt: new Date(),
          });
        } else {
          // No images for this model — mark as failed so it doesn't stay queued forever
          await updateTemplateJob(job.id, {
            status: 'failed',
            step: 'Failed',
            error: 'No carousel images found for this model',
            completedAt: new Date(),
          });
        }
      }

      // Mark batch as completed
      await updatePipelineBatchProgress(batch.id);

      return NextResponse.json({
        ...batch,
        isBatch: true,
        isMaster: true,
        childJobIds: allChildJobIds,
      });
    }

    // --- Update batch status to processing ---
    await updatePipelineBatch(batch.id, { status: 'processing' });

    // --- Schedule batch processing ---
    const batchTiktokUrl = videoSource === 'library' ? null : (tiktokUrl || null);
    const batchVideoUrl = videoSource === 'library' ? null : (videoUrl || null);
    after(async () => {
      try {
        await processPipelineBatch(allChildJobIds, batchTiktokUrl, batchVideoUrl);
      } catch (err) {
        console.error(`processPipelineBatch error for master batch ${batch.id}:`, err);
      }
    });

    return NextResponse.json({
      ...batch,
      isBatch: true,
      isMaster: true,
      childJobIds: allChildJobIds,
    });
  } catch (err) {
    console.error('Create master batch error:', err);
    return NextResponse.json({ error: 'Failed to create master batch' }, { status: 500 });
  }
}
