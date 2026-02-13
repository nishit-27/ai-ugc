import { NextResponse } from 'next/server';
import { initDatabase, getAllGeneratedImages } from '@/lib/db';
import { getSignedUrlFromPublicUrl } from '@/lib/storage';

export async function GET() {
  try {
    await initDatabase();
    const images = await getAllGeneratedImages();

    const signed = await Promise.all(
      images.map(async (img: { gcsUrl?: string; [key: string]: unknown }) => {
        let signedUrl = img.gcsUrl;
        if (img.gcsUrl?.includes('storage.googleapis.com')) {
          try {
            signedUrl = await getSignedUrlFromPublicUrl(img.gcsUrl);
          } catch {
            // Keep original URL if signing fails
          }
        }
        return { ...img, signedUrl };
      }),
    );

    return NextResponse.json(signed);
  } catch (err) {
    console.error('Get generated images error:', err);
    return NextResponse.json({ error: 'Failed to fetch generated images' }, { status: 500 });
  }
}
