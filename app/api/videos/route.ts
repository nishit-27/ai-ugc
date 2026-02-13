import { NextResponse } from 'next/server';
import { getAllMediaFiles } from '@/lib/db';

type MediaFile = {
  filename: string;
  gcsUrl: string;
  fileSize: number | null;
  createdAt: string | null;
  jobId: string | null;
};

export async function GET() {
  try {
    const videos = await getAllMediaFiles('video') as (MediaFile | null)[];

    const formattedVideos = videos
      .filter((v): v is MediaFile => v !== null)
      .map((v) => ({
        name: v.filename,
        path: v.gcsUrl,
        url: v.gcsUrl,
        size: v.fileSize,
        created: v.createdAt,
        jobId: v.jobId,
      }));

    return NextResponse.json({ videos: formattedVideos });
  } catch (err) {
    console.error('Get videos error:', err);
    return NextResponse.json({ videos: [] });
  }
}
