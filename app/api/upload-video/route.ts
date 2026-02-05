import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { uploadVideo, getSignedUrlFromPublicUrl } from '@/lib/storage';
import { createMediaFile } from '@/lib/db';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('video') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No video uploaded' }, { status: 400 });
    }
    const ext = path.extname(file.name) || '.mp4';
    const allowed = /\.(mp4|mov|webm)$/i;
    if (!allowed.test(ext)) {
      return NextResponse.json(
        { error: 'Only video files (mp4, mov, webm) are allowed' },
        { status: 400 }
      );
    }

    // Read file into buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload directly to GCS
    const result = await uploadVideo(buffer, file.name);

    // Get signed URL for frontend preview
    const signedUrl = await getSignedUrlFromPublicUrl(result.url);

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

    return NextResponse.json({
      success: true,
      filename: result.filename,
      url: signedUrl,
      gcsUrl: result.url,
      path: signedUrl,
      size: buffer.length,
    });
  } catch (err) {
    console.error('Upload video error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
