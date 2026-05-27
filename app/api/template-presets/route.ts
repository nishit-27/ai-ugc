import { NextRequest, NextResponse } from 'next/server';
import { getAllTemplatePresets, createTemplatePreset, initDatabase } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await initDatabase();
    const presets = await getAllTemplatePresets();
    return NextResponse.json(presets);
  } catch (err) {
    console.error('List presets error:', err);
    return NextResponse.json({ error: 'Failed to list presets' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    const { name, description, pipeline } = await request.json();

    if (!name || !pipeline || !Array.isArray(pipeline)) {
      return NextResponse.json({ error: 'Name and pipeline are required' }, { status: 400 });
    }

    const preset = await createTemplatePreset({ name, description, pipeline });
    return NextResponse.json(preset);
  } catch (err) {
    console.error('Create preset error:', err);
    return NextResponse.json({ error: 'Failed to create preset' }, { status: 500 });
  }
}
