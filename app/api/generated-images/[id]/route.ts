import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, getGeneratedImage, deleteGeneratedImage } from '@/lib/db';
import { deleteFile } from '@/lib/storage';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await initDatabase();
    const image = await getGeneratedImage(id);
    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // Delete from GCS
    if (image.gcsUrl) {
      await deleteFile(image.gcsUrl);
    }

    // Delete from database
    await deleteGeneratedImage(id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete generated image error:', err);
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 });
  }
}
