import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { uploadVideo } from '@/lib/storage';
import { createMediaFile } from '@/lib/db';
import { requireSession } from '@/lib/api-helpers';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const { error } = await requireSession();
    if (error) return error;

    const formData = await request.formData();
    const file = formData.get('video') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No video uploaded' }, { status: 400 });
    }
    if (file.size > MAX_VIDEO_BYTES) {
      return NextResponse.json(
        { error: `Video too large (max ${MAX_VIDEO_BYTES / 1024 / 1024} MB)` },
        { status: 413 }
      );
    }
    const ext = path.extname(file.name) || '.mp4';
    const allowed = /\.(mp4|mov|webm)$/i;
    if (!allowed.test(ext)) {
      return NextResponse.json(
        { error: 'Only video files (mp4, mov, webm) are allowed' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to R2
    const result = await uploadVideo(buffer, file.name);

    // Store in database
    await createMediaFile({
      filename: result.filename,
      originalName: file.name,
      fileType: 'video',
      gcsUrl: result.url,
      fileSize: buffer.length,
      mimeType: result.contentType,
      jobId: null,
    });

    // R2 URLs are public — no signing needed
    return NextResponse.json({
      success: true,
      filename: result.filename,
      url: result.url,
      gcsUrl: result.url,
      path: result.url,
      size: buffer.length,
    });
  } catch (err) {
    console.error('Upload video error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
