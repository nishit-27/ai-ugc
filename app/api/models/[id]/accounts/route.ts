import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, getModelAccountMappings, replaceModelAccountMappings } from '@/lib/db';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/models/[id]/accounts - List account mappings for a model
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    await initDatabase();
    const mappings = await getModelAccountMappings(id);
    return NextResponse.json(mappings);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch account mappings' }, { status: 500 });
  }
}

// PUT /api/models/[id]/accounts - Replace all account mappings for a model
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { accounts } = body as { accounts: { lateAccountId: string; platform: string; apiKeyIndex?: number }[] };

    await initDatabase();
    const mappings = await replaceModelAccountMappings(id, accounts);
    return NextResponse.json(mappings);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to replace account mappings' }, { status: 500 });
  }
}
