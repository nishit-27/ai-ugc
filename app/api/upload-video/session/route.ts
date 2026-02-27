import { NextRequest, NextResponse } from 'next/server';
import {
  buildVideoObjectPath,
  createVideoResumableUploadSession,
  getVideoPublicUrl,
} from '@/lib/storage';

const ALLOWED_EXTENSIONS = new Set(['.mp4', '.mov', '.webm']);
const ALLOWED_CONTENT_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);
const MAX_VIDEO_BYTES = 20 * 1024 * 1024 * 1024; // 20 GB
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function getExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex < 0) return '';
  return filename.slice(dotIndex).toLowerCase();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const filename = String(body?.filename || 'video.mp4');
    const requestedContentType = String(body?.contentType || '').toLowerCase();
    const fileSize = Number(body?.fileSize || 0);

    const ext = getExtension(filename);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: 'Only video files (mp4, mov, webm) are allowed' },
        { status: 400 }
      );
    }

    const fallbackContentType = CONTENT_TYPE_BY_EXTENSION[ext];
    const contentType = ALLOWED_CONTENT_TYPES.has(requestedContentType)
      ? requestedContentType
      : fallbackContentType;

    if (!contentType) {
      return NextResponse.json(
        { error: 'Unsupported video content type' },
        { status: 400 }
      );
    }

    if (Number.isFinite(fileSize) && fileSize > MAX_VIDEO_BYTES) {
      return NextResponse.json(
        { error: 'Video is too large. Max supported size is 20 GB.' },
        { status: 400 }
      );
    }

    const objectPath = buildVideoObjectPath(filename);

    // Returns a presigned PUT URL for R2 (replaces GCS resumable session)
    const sessionUrl = await createVideoResumableUploadSession({
      objectPath,
      contentType,
    });

    return NextResponse.json({
      success: true,
      sessionUrl,
      objectPath,
      gcsUrl: getVideoPublicUrl(objectPath),
    });
  } catch (err) {
    console.error('Create upload session error:', err);
    return NextResponse.json(
      { error: 'Failed to create video upload session' },
      { status: 500 }
    );
  }
}
