import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { processJob } from '@/lib/processJob';
import { processBatchInBackground } from '@/lib/batchProcessor';
import {
  createJob,
  createBatch,
  getModel,
  getModelImages,
  getImagesByIds,
} from '@/lib/db';
import { auth } from '@/lib/auth';

interface BatchGenerateRequest {
  // Batch info
  name?: string;

  // TikTok URLs
  tiktokUrls?: string[];

  // Image selection - Option 1: Use all images from a model (random cycling)
  modelId?: string;

  // Image selection - Option 2: Use specific images (random cycling)
  imageIds?: string[];

  // Legacy support: single image URL
  imageUrl?: string;
  imageName?: string;

  // Generation options
  customPrompt?: string;
  maxSeconds?: number;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as BatchGenerateRequest;
  const {
    name,
    tiktokUrls,
    modelId,
    imageIds,
    imageUrl,
    imageName,
    customPrompt,
    maxSeconds,
  } = body;

  // Validate TikTok URLs
  if (!Array.isArray(tiktokUrls) || tiktokUrls.length === 0) {
    return NextResponse.json({ error: 'TikTok URLs array is required' }, { status: 400 });
  }

  // Filter valid URLs
  const validUrls = tiktokUrls.filter((url) => url?.trim());
  if (validUrls.length === 0) {
    return NextResponse.json({ error: 'No valid TikTok URLs provided' }, { status: 400 });
  }

  // Validate API keys
  if (!config.FAL_KEY) {
    return NextResponse.json({ error: 'FAL API key not configured' }, { status: 500 });
  }
  if (!config.RAPIDAPI_KEY) {
    return NextResponse.json({ error: 'RapidAPI key not configured' }, { status: 500 });
  }

  const parsedMaxSeconds =
    typeof maxSeconds === 'number' ? maxSeconds : config.defaultMaxSeconds;

  try {
    const session = await auth();
    const createdBy = session?.user?.name?.split(' ')[0] || null;

    // Determine image selection mode
    let imageSelectionMode: 'model' | 'specific' | 'single' = 'single';
    let selectedImageIds: string[] | null = null;
    let finalImageUrl: string | null = null;

    if (modelId) {
      // Option 1: Use all images from a model
      const model = await getModel(modelId);
      if (!model) {
        return NextResponse.json({ error: 'Model not found' }, { status: 404 });
      }
      const modelImages = await getModelImages(modelId);
      if (modelImages.length === 0) {
        return NextResponse.json({ error: 'Model has no images' }, { status: 400 });
      }
      imageSelectionMode = 'model';
      // For single job creation, use the first/primary image
      finalImageUrl = modelImages.find((img: { isPrimary?: boolean; gcsUrl: string }) => img.isPrimary)?.gcsUrl || modelImages[0].gcsUrl;
    } else if (imageIds && imageIds.length > 0) {
      // Option 2: Use specific images
      const images = await getImagesByIds(imageIds);
      if (images.length === 0) {
        return NextResponse.json({ error: 'No valid images found' }, { status: 400 });
      }
      imageSelectionMode = 'specific';
      selectedImageIds = imageIds;
      finalImageUrl = images[0].gcsUrl;
    } else if (imageUrl || imageName) {
      // Legacy: single image URL
      finalImageUrl = imageUrl || imageName || null;
    }

    if (!finalImageUrl) {
      return NextResponse.json(
        { error: 'Image selection required: provide modelId, imageIds, or imageUrl' },
        { status: 400 }
      );
    }

    // Create batch if using model or specific images (or if name provided)
    const useBatch = imageSelectionMode !== 'single' || name;
    let batchId: string | null = null;

    if (useBatch) {
      const batch = await createBatch({
        name: name || `Batch ${new Date().toLocaleString()}`,
        modelId: modelId || null,
        imageSelectionMode: imageSelectionMode === 'single' ? 'specific' : imageSelectionMode,
        selectedImageIds: selectedImageIds,
        totalJobs: validUrls.length,
      });
      if (batch) {
        batchId = batch.id;
      }
    }

    // Create jobs
    const jobIds: string[] = [];

    for (const url of validUrls) {
      const job = await createJob({
        tiktokUrl: url.trim(),
        videoUrl: null,
        videoSource: 'tiktok',
        imageUrl: finalImageUrl,
        customPrompt,
        maxSeconds: parsedMaxSeconds,
        batchId,
        createdBy,
      });

      if (job) {
        jobIds.push(job.id);
      }
    }

    // Start processing
    if (batchId && (imageSelectionMode === 'model' || imageSelectionMode === 'specific')) {
      // Use batch processor for image cycling
      processBatchInBackground(batchId);
    } else {
      // Legacy: process each job individually
      for (const jobId of jobIds) {
        processJob(jobId, config.prompt, config.FAL_KEY, config.RAPIDAPI_KEY).catch((err) => {
          console.error('processJob error:', err);
        });
      }
    }

    return NextResponse.json({
      batchId,
      jobIds,
      count: jobIds.length,
      imageSelectionMode,
    });
  } catch (err) {
    console.error('Batch generate error:', err);
    return NextResponse.json({ error: 'Failed to create batch' }, { status: 500 });
  }
}
