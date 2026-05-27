import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

const BASE = process.cwd();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const pathSegments = (await params).path;
  if (!pathSegments || pathSegments.length < 2) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const [dir, ...rest] = pathSegments;
  if (dir !== 'uploads' && dir !== 'output') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const filename = rest.join(path.sep);
  if (filename.includes('..')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const filePath = path.join(BASE, dir, filename);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filename).toLowerCase();
  const mime: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
  };
  const contentType = mime[ext] || 'application/octet-stream';
  return new NextResponse(buffer, {
    headers: { 'Content-Type': contentType },
  });
}
