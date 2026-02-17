import { NextRequest, NextResponse } from 'next/server';
import { getAllMusicTracks, createMusicTrack, initDatabase } from '@/lib/db';
import { uploadVideo } from '@/lib/storage';

export async function GET() {
  try {
    await initDatabase();
    const tracks = await getAllMusicTracks();
    return NextResponse.json(tracks, {
      headers: { 'Cache-Control': 'private, max-age=30' },
    });
  } catch (err) {
    console.error('List music tracks error:', err);
    return NextResponse.json({ error: 'Failed to list music tracks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    const contentType = request.headers.get('content-type') || '';

    // JSON body — create library track from existing GCS URL (e.g. from trending)
    if (contentType.includes('application/json')) {
      const { name, gcsUrl, duration } = await request.json();
      if (!gcsUrl) {
        return NextResponse.json({ error: 'gcsUrl is required' }, { status: 400 });
      }
      const track = await createMusicTrack({
        name: name || 'Imported Track',
        gcsUrl,
        duration: duration ?? null,
        isDefault: false,
      });
      return NextResponse.json(track);
    }

    // FormData — file upload
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const name = (formData.get('name') as string) || 'Custom Track';

    if (!file) {
      return NextResponse.json({ error: 'Audio file is required' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await uploadVideo(buffer, file.name);

    const track = await createMusicTrack({
      name,
      gcsUrl: url,
      duration: null,
      isDefault: false,
    });

    return NextResponse.json(track);
  } catch (err) {
    console.error('Upload music track error:', err);
    return NextResponse.json({ error: 'Failed to upload music track' }, { status: 500 });
  }
}
