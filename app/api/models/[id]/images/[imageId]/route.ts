import { NextRequest, NextResponse } from 'next/server';
import { getModel, getModelImage, deleteModelImage, setModelImagePrimary } from '@/lib/db';
import { requireSession } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string; imageId: string }> };

// DELETE /api/models/[id]/images/[imageId] - Delete specific image
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { error: authError } = await requireSession();
    if (authError) return authError;

    const { id, imageId } = await params;

    const model = await getModel(id);
    if (!model) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    const image = await getModelImage(imageId);
    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    if (image.modelId !== id) {
      return NextResponse.json({ error: 'Image does not belong to this model' }, { status: 400 });
    }

    await deleteModelImage(imageId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete model image error:', err);
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 });
  }
}

// PATCH /api/models/[id]/images/[imageId] - Set image as primary
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { error: authError } = await requireSession();
    if (authError) return authError;

    const { id, imageId } = await params;
    const body = await request.json();
    const { isPrimary } = body as { isPrimary?: boolean };

    const model = await getModel(id);
    if (!model) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    const image = await getModelImage(imageId);
    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    if (image.modelId !== id) {
      return NextResponse.json({ error: 'Image does not belong to this model' }, { status: 400 });
    }

    if (isPrimary) {
      const updated = await setModelImagePrimary(id, imageId);
      return NextResponse.json(updated);
    }

    return NextResponse.json(image);
  } catch (err) {
    console.error('Update model image error:', err);
    return NextResponse.json({ error: 'Failed to update image' }, { status: 500 });
  }
}
