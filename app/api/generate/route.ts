import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { processJob } from '@/lib/processJob';
import { createJob } from '@/lib/db';
import { auth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    tiktokUrl,
    videoUrl,
    imageUrl,
    imageName,
    image_url: imageUrlSnake,
    customPrompt,
    maxSeconds,
  } = body as {
    tiktokUrl?: string;
    videoUrl?: string;
    imageUrl?: string;
    imageName?: string;
    image_url?: string;
    customPrompt?: string;
    maxSeconds?: number;
  };

  // Either tiktokUrl OR videoUrl is required
  if (!tiktokUrl && !videoUrl) {
    return NextResponse.json({ error: 'Either a video URL or uploaded video is required' }, { status: 400 });
  }

  // Determine video source
  const videoSource = videoUrl ? 'upload' : 'tiktok';

  // Support imageUrl, imageName, and image_url (same as batch-motion-control link flow)
  const finalImageUrl = imageUrl || imageName || imageUrlSnake;
  if (!finalImageUrl) {
    return NextResponse.json({ error: 'Model image URL is required' }, { status: 400 });
  }

  if (!config.FAL_KEY) {
    return NextResponse.json({ error: 'FAL API key not configured' }, { status: 500 });
  }
  // RapidAPI key required for TikTok and Instagram downloads
  if (videoSource === 'tiktok' && !config.RAPIDAPI_KEY) {
    return NextResponse.json({ error: 'RapidAPI key not configured' }, { status: 500 });
  }

  try {
    const session = await auth();
    const createdBy = session?.user?.name?.split(' ')[0] || null;

    // Create job in database
    const job = await createJob({
      tiktokUrl: tiktokUrl || null,
      videoUrl: videoUrl || null,
      videoSource,
      imageUrl: finalImageUrl,
      customPrompt,
      maxSeconds: typeof maxSeconds === 'number' ? maxSeconds : config.defaultMaxSeconds,
      batchId: null,
      createdBy,
    });

    if (!job) {
      return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
    }

    // Start processing in background
    // Note: RAPIDAPI_KEY is only needed for TikTok downloads, pass empty string if not available
    processJob(job.id, config.prompt, config.FAL_KEY, config.RAPIDAPI_KEY || '').catch((err) => {
      console.error('processJob error:', err);
    });

    return NextResponse.json({ jobId: job.id, job });
  } catch (err) {
    console.error('Create job error:', err);
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
  }
}
