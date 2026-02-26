import { NextRequest, NextResponse } from 'next/server';
import { getModel, updateModel, deleteModel, getModelImages, setModelGroups, ensureDatabaseReady } from '@/lib/db';

type RouteParams = { params: Promise<{ id: string }> };

function normalizeGroupName(groupName?: string | null): string | null {
  const trimmed = typeof groupName === 'string' ? groupName.trim() : '';
  return trimmed || null;
}

// GET /api/models/[id] - Get model with images
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    await ensureDatabaseReady();
    const { id } = await params;
    const model = await getModel(id);

    if (!model) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    const images = await getModelImages(id);

    return NextResponse.json({
      ...model,
      images,
      imageCount: images.length,
    });
  } catch (err) {
    console.error('Get model error:', err);
    return NextResponse.json({ error: 'Failed to fetch model' }, { status: 500 });
  }
}

// PATCH /api/models/[id] - Update model
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    await ensureDatabaseReady();
    const { id } = await params;
    const body = await request.json();
    const payload = body as { name?: string; description?: string | null; groupName?: string | null; groupNames?: string[] };

    const existing = await getModel(id);
    if (!existing) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    const updates: { name?: string; description?: string | null; avatarUrl?: string | null } = {
      avatarUrl: undefined,
    };

    if ('name' in payload) {
      const nextName = payload.name?.trim();
      if (!nextName) {
        return NextResponse.json({ error: 'Model name is required' }, { status: 400 });
      }
      updates.name = nextName;
    }

    if ('description' in payload) {
      const nextDescription = typeof payload.description === 'string' ? payload.description.trim() : '';
      updates.description = nextDescription || null;
    }

    // Handle multi-group assignment
    if ('groupNames' in payload && Array.isArray(payload.groupNames)) {
      const normalized = payload.groupNames
        .map((g: string) => (typeof g === 'string' ? g.trim() : ''))
        .filter(Boolean);
      await setModelGroups(id, normalized);
    } else if ('groupName' in payload) {
      // Legacy single-group support: convert to array
      const normalized = normalizeGroupName(payload.groupName);
      await setModelGroups(id, normalized ? [normalized] : []);
    }

    const updated = await updateModel(id, updates);

    return NextResponse.json(updated);
  } catch (err) {
    console.error('Update model error:', err);
    return NextResponse.json({ error: 'Failed to update model' }, { status: 500 });
  }
}

// DELETE /api/models/[id] - Delete model and all images
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    await ensureDatabaseReady();
    const { id } = await params;
    const existing = await getModel(id);

    if (!existing) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    // Note: Images are deleted by CASCADE in the database
    await deleteModel(id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete model error:', err);
    return NextResponse.json({ error: 'Failed to delete model' }, { status: 500 });
  }
}
