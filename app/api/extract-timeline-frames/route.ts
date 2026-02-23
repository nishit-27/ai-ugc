import { NextResponse } from 'next/server';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { downloadFile, extractEvenlySpacedFrames, getVideoDuration } from '@/lib/serverUtils';
import { uploadImage, getSignedUrlFromPublicUrl } from '@/lib/storage.js';

export async function POST(req: Request) {
  let tmpVideoPath: string | null = null;

  try {
    const { videoUrl, count } = await req.json();
    if (!videoUrl) {
      return NextResponse.json({ error: 'videoUrl is required' }, { status: 400 });
    }

    const tmpDir = os.tmpdir();
    tmpVideoPath = path.join(tmpDir, `timeline-${uuidv4()}.mp4`);
    await downloadFile(videoUrl, tmpVideoPath);

    const duration = getVideoDuration(tmpVideoPath);
    const frameCount = count || 15;
    const rawFrames = extractEvenlySpacedFrames(tmpVideoPath, frameCount);

    if (rawFrames.length === 0) {
      return NextResponse.json({ error: 'No frames could be extracted' }, { status: 500 });
    }

    const uploaded = await Promise.all(
      rawFrames.map(async (frame) => {
        const filename = `timeline-frame-${uuidv4()}.jpg`;
        const { url: gcsUrl } = await uploadImage(frame.buffer, filename);
        const signedUrl = await getSignedUrlFromPublicUrl(gcsUrl);
        return { signedUrl, timestamp: frame.timestamp };
      })
    );

    return NextResponse.json({ frames: uploaded, duration });
  } catch (error: unknown) {
    console.error('Extract timeline frames error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (tmpVideoPath && fs.existsSync(tmpVideoPath)) {
      fs.unlinkSync(tmpVideoPath);
    }
  }
}
