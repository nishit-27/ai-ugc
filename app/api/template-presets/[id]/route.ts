import { NextRequest, NextResponse } from 'next/server';
import { deleteTemplatePreset, updateTemplatePreset, initDatabase } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initDatabase();
    const { id } = await params;
    const body = await request.json();
    const preset = await updateTemplatePreset(id, body);
    if (!preset) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }
    return NextResponse.json(preset);
  } catch (err) {
    console.error('Update preset error:', err);
    return NextResponse.json({ error: 'Failed to update preset' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initDatabase();
    const { id } = await params;
    await deleteTemplatePreset(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete preset error:', err);
    return NextResponse.json({ error: 'Failed to delete preset' }, { status: 500 });
  }
}
