import { NextRequest, NextResponse } from 'next/server';
import { createModel, getAllModels, getModelImageCountsForModels, getModelAccountMappingsForModels } from '@/lib/db';
import { getCachedSignedUrl } from '@/lib/signedUrlCache';

interface Model {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
}

// GET /api/models - List all models with image counts and linked platforms
export async function GET() {
  try {
    const models = await getAllModels();
    const modelIds = models.map((m: Model) => m.id);

    // Fetch image counts + account mappings in two batched queries (no N+1).
    const [imageCounts, accountMappings] = await Promise.all([
      modelIds.length > 0 ? getModelImageCountsForModels(modelIds) : [],
      modelIds.length > 0 ? getModelAccountMappingsForModels(modelIds) : [],
    ]);

    // Build lookup maps
    const imageCountMap = new Map(imageCounts.map((ic: { modelId: string; count: number }) => [ic.modelId, ic.count]));
    const platformsMap = new Map<string, string[]>();
    const accountCountMap = new Map<string, number>();
    for (const mapping of accountMappings as { modelId: string; platform: string }[]) {
      const existing = platformsMap.get(mapping.modelId) || [];
      if (!existing.includes(mapping.platform)) existing.push(mapping.platform);
      platformsMap.set(mapping.modelId, existing);
      accountCountMap.set(mapping.modelId, (accountCountMap.get(mapping.modelId) || 0) + 1);
    }

    const modelsWithCounts = await Promise.all(models.map(async (model: Model) => {
      const avatarGcsUrl = model.avatarUrl;
      let avatarUrl = avatarGcsUrl;
      if (avatarGcsUrl && avatarGcsUrl.includes('storage.googleapis.com')) {
        try {
          avatarUrl = await getCachedSignedUrl(avatarGcsUrl);
        } catch {
          // Keep original URL on signing failure.
        }
      }
      return {
        ...model,
        avatarGcsUrl,
        avatarUrl,
        imageCount: imageCountMap.get(model.id) || 0,
        linkedPlatforms: platformsMap.get(model.id) || [],
        accountCount: accountCountMap.get(model.id) || 0,
      };
    }));

    return NextResponse.json(modelsWithCounts, {
      headers: { 'Cache-Control': 'private, max-age=20, stale-while-revalidate=120' },
    });
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
