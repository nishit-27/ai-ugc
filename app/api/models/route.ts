import { NextRequest, NextResponse } from 'next/server';
import { createModel, getAllModels, getModelImages } from '@/lib/db';

interface Model {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
}

// GET /api/models - List all models with image counts
export async function GET() {
  try {
    const models = await getAllModels();

    // Add image counts to each model (no server-side signing — client signs lazily)
    const modelsWithCounts = await Promise.all(
      models.map(async (model: Model) => {
        const images = await getModelImages(model.id);
        return {
          ...model,
          imageCount: images.length,
        };
      })
    );

    return NextResponse.json(modelsWithCounts);
  } catch (err) {
    console.error('Get models error:', err);
    return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 });
  }
}

// POST /api/models - Create a new model
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description } = body as { name?: string; description?: string };

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Model name is required' }, { status: 400 });
    }

    const model = await createModel({
      name: name.trim(),
      description: description?.trim() || null,
      avatarUrl: null,
    });

    return NextResponse.json(model, { status: 201 });
  } catch (err) {
    console.error('Create model error:', err);
    return NextResponse.json({ error: 'Failed to create model' }, { status: 500 });
  }
}
