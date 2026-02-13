import { NextRequest, NextResponse } from 'next/server';
import { getModel, updateModel, deleteModel, getModelImages } from '@/lib/db';

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/models/[id] - Get model with images
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
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
    const { id } = await params;
    const body = await request.json();
    const { name, description } = body as { name?: string; description?: string };

    const existing = await getModel(id);
    if (!existing) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    const updated = await updateModel(id, {
      name: name?.trim(),
      description: description?.trim(),
      avatarUrl: undefined,
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('Update model error:', err);
    return NextResponse.json({ error: 'Failed to update model' }, { status: 500 });
  }
}

// DELETE /api/models/[id] - Delete model and all images
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
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
