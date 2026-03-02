import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import ffprobePath from '@ffprobe-installer/ffprobe';

export const dynamic = 'force-dynamic';

const FFPROBE = (typeof ffprobePath === 'string' ? ffprobePath : (ffprobePath as { path: string }).path) || 'ffprobe';

export async function POST(request: NextRequest) {
  try {
    const { url } = (await request.json()) as { url?: string };
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const output = execFileSync(FFPROBE, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      url,
    ], { encoding: 'utf-8', timeout: 15000 });

    const duration = parseFloat(output.trim()) || 0;
    return NextResponse.json({ duration });
  } catch {
    return NextResponse.json({ duration: 0 }, { status: 200 });
  }
}
