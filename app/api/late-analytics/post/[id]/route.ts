import { NextResponse } from 'next/server';
import { tryAllKeys } from '@/lib/lateAccountPool';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const endpoint = `/analytics?postId=${encodeURIComponent(id)}`;
    const { data } = await tryAllKeys<any>(endpoint);

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
