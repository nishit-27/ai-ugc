import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { getModel, getModelImages, createModelImage } from '@/lib/db';
import { uploadImage, getSignedUrlFromPublicUrl } from '@/lib/storage';

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/models/[id]/images - List all images for a model
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const model = await getModel(id);

    if (!model) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    const images = await getModelImages(id);

    // Return images immediately — signed URLs are resolved lazily on the client
    return NextResponse.json(images, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err) {
    console.error('Get model images error:', err);
    return NextResponse.json({ error: 'Failed to fetch images' }, { status: 500 });
  }
}

// POST /api/models/[id]/images - Upload image(s) to model
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const model = await getModel(id);

    if (!model) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const files: File[] = [];
    const fieldsToCheck = ['images', 'image', 'files', 'file'];

    const pushIfFile = (value: unknown) => {
      if (value instanceof File && value.size > 0) files.push(value);
    };

    for (const field of fieldsToCheck) {
      const values = formData.getAll(field);
      if (values.length > 0) {
        values.forEach(pushIfFile);
      }
      if (values.length === 0) {
        const single = formData.get(field);
        if (single) pushIfFile(single);
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: "No images uploaded. Use field name 'images' or 'image'." },
        { status: 400 }
      );
    }

    console.log(`Uploading ${files.length} files for model ${id}:`, files.map(f => f.name));

    const allowed = /\.(jpg|jpeg|png|webp)$/i;
    const uploadedImages = [];
    const existingImages = await getModelImages(id);
    const isFirstImage = existingImages.length === 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = path.extname(file.name) || '.png';

      if (!allowed.test(ext)) {
        continue; // Skip invalid files
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // Upload to GCS
      const { filename, url } = await uploadImage(buffer, file.name);

      // Create model image record
      // First image becomes primary if no images exist
      const isPrimary = isFirstImage && i === 0;
      const modelImage = await createModelImage({
        modelId: id,
        gcsUrl: url,
        filename,
        originalName: file.name,
        fileSize: buffer.length,
        isPrimary,
      });

      uploadedImages.push(modelImage);
    }

    if (uploadedImages.length === 0) {
      return NextResponse.json(
        { error: 'No valid images uploaded. Only jpg, jpeg, png, webp are allowed.' },
        { status: 400 }
      );
    }

    // Sign all URLs before returning for immediate frontend display
    const validImages = uploadedImages.filter((img): img is NonNullable<typeof img> => img !== null);
    const imagesWithSignedUrls = await Promise.all(
      validImages.map(async (img) => {
        try {
          const signedUrl = await getSignedUrlFromPublicUrl(img.gcsUrl);
          return { ...img, signedUrl };
        } catch {
          return { ...img, signedUrl: img.gcsUrl };
        }
      })
    );

    return NextResponse.json({
      success: true,
      images: imagesWithSignedUrls,
      count: imagesWithSignedUrls.length,
    });
  } catch (err) {
    console.error('Upload model images error:', err);
    const message = err instanceof Error ? err.message : 'Failed to upload images';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
