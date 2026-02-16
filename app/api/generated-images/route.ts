import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, getGeneratedImagesPage, getGeneratedImagesByModelId, getGeneratedImagesCount } from '@/lib/db';
import { getCachedSignedUrl } from '@/lib/signedUrlCache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAX_SIGNED_IMAGES_PER_RESPONSE = 100;

type ImageLike = {
  gcsUrl?: string;
};

async function attachSignedUrls<T extends ImageLike>(images: T[]): Promise<Array<T & { signedUrl?: string }>> {
  const uniqueGcsUrls = [...new Set(
    images
      .map((image) => image.gcsUrl)
      .filter((url): url is string => !!url && url.includes('storage.googleapis.com'))
  )];

  if (uniqueGcsUrls.length === 0) return images;

  const signedMap = new Map<string, string>();
  await Promise.all(
    uniqueGcsUrls.map(async (url) => {
      try {
        const signed = await getCachedSignedUrl(url);
        signedMap.set(url, signed);
      } catch {
        signedMap.set(url, url);
      }
    })
  );

  return images.map((image) => ({
    ...image,
    signedUrl: image.gcsUrl ? (signedMap.get(image.gcsUrl) || image.gcsUrl) : undefined,
  }));
}

export async function GET(request: NextRequest) {
  try {
    await initDatabase();

    const { searchParams } = request.nextUrl;
    const modelId = searchParams.get('modelId');
    const includeSigned = searchParams.get('signed') === 'true';
    const fastMode = searchParams.get('fast') === 'true';
    const countOnly = searchParams.get('countOnly') === 'true';

    if (countOnly) {
      const total = await getGeneratedImagesCount();
      return NextResponse.json(
        { total },
        { headers: { 'Cache-Control': 'private, max-age=20, stale-while-revalidate=120' } }
      );
    }

    // If modelId is provided, return all generated images for that model (no pagination)
    if (modelId) {
      const images = await getGeneratedImagesByModelId(modelId);
      const withSigned = includeSigned && images.length <= MAX_SIGNED_IMAGES_PER_RESPONSE
        ? await attachSignedUrls(images)
        : images;
      return NextResponse.json(
        { images: withSigned, total: images.length },
        { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=300' } }
      );
    }

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '24', 10)));
    const offset = (page - 1) * limit;

    const { images, total } = await getGeneratedImagesPage(limit, offset, { includeTotal: !fastMode });
    const withSigned = includeSigned && images.length <= MAX_SIGNED_IMAGES_PER_RESPONSE
      ? await attachSignedUrls(images)
      : images;

    return NextResponse.json(
      { images: withSigned, total, page, limit },
      { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=300' } }
    );
  } catch (err) {
    console.error('Get generated images error:', err);
    return NextResponse.json({ error: 'Failed to fetch generated images' }, { status: 500 });
  }
}
