import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, getGeneratedImagesPage } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    await initDatabase();

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '24', 10)));
    const offset = (page - 1) * limit;

    const { images, total } = await getGeneratedImagesPage(limit, offset);

    return NextResponse.json({ images, total, page, limit });
  } catch (err) {
    console.error('Get generated images error:', err);
    return NextResponse.json({ error: 'Failed to fetch generated images' }, { status: 500 });
  }
}
