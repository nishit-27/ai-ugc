import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, updateCustomVariable, deleteCustomVariable, getCustomVariable } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDatabase();
    const { id } = await params;
    const variable = await getCustomVariable(id);
    if (!variable) {
      return NextResponse.json({ error: 'Variable not found' }, { status: 404 });
    }
    return NextResponse.json(variable);
  } catch (err) {
    console.error('Get variable error:', err);
    return NextResponse.json({ error: 'Failed to get variable' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDatabase();
    const { id } = await params;
    const body = await request.json();
    const { name, type, options, color } = body;

    const variable = await updateCustomVariable(id, { name, type, options, color });
    if (!variable) {
      return NextResponse.json({ error: 'Variable not found' }, { status: 404 });
    }
    return NextResponse.json(variable);
  } catch (err: unknown) {
    console.error('Update variable error:', err);
    if (err instanceof Error && err.message?.includes('unique')) {
      return NextResponse.json({ error: 'A variable with this name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to update variable' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initDatabase();
    const { id } = await params;
    await deleteCustomVariable(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete variable error:', err);
    return NextResponse.json({ error: 'Failed to delete variable' }, { status: 500 });
  }
}
