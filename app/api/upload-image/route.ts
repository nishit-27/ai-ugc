import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { uploadImage } from '@/lib/storage';
import { createMediaFile } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No image uploaded' }, { status: 400 });
    }
    const ext = path.extname(file.name) || '.png';
    const allowed = /\.(jpg|jpeg|png|webp)$/i;
    if (!allowed.test(ext)) {
      return NextResponse.json(
        { error: 'Only image files (jpg, jpeg, png, webp) are allowed' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to R2 (with compression)
    const { filename, url, contentType } = await uploadImage(buffer, file.name);

    // Store in database
    await createMediaFile({
      filename,
      originalName: file.name,
      fileType: 'image',
      gcsUrl: url,
      fileSize: buffer.length,
      mimeType: contentType,
      jobId: null,
    });

    // R2 URLs are public — no signing needed
    return NextResponse.json({
      success: true,
      filename,
      url,
      gcsUrl: url,
      path: url,
    });
  } catch (err) {
    console.error('Upload image error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
