import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { createMediaFile, getMediaFileByFilename } from '@/lib/db';
import { getVideoObjectMetadata } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function isAllowedObjectPath(objectPath: string): boolean {
  return objectPath.startsWith('ai-ugc/videos/');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const objectPath = String(body?.objectPath || '');
    const originalName = String(body?.originalName || path.basename(objectPath || 'video.mp4'));

    if (!objectPath || !isAllowedObjectPath(objectPath)) {
      return NextResponse.json(
        { error: 'Invalid object path' },
        { status: 400 }
      );
    }

    const metadata = await getVideoObjectMetadata(objectPath);
    if (!metadata) {
      return NextResponse.json(
        { error: 'Uploaded file not found in storage' },
        { status: 404 }
      );
    }

    const filename = path.basename(objectPath);
    const existing = await getMediaFileByFilename(filename);
    if (!existing) {
      await createMediaFile({
        filename,
        originalName,
        fileType: 'video',
        gcsUrl: metadata.gcsUrl,
        fileSize: metadata.size,
        mimeType: metadata.contentType,
        jobId: null,
      });
    }

    // R2 URLs are public — no signing needed
    return NextResponse.json({
      success: true,
      filename,
      gcsUrl: metadata.gcsUrl,
      url: metadata.gcsUrl,
      path: metadata.gcsUrl,
      size: metadata.size,
      mimeType: metadata.contentType,
    });
  } catch (err) {
    console.error('Complete upload error:', err);
    return NextResponse.json(
      { error: 'Failed to finalize uploaded video' },
      { status: 500 }
    );
  }
}
