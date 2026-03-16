import { NextRequest, NextResponse } from 'next/server';
import { createModel, setModelGroups, ensureDatabaseReady, getAllModels, getModelImageCountsForModels, getModelAccountMappingsForModels } from '@/lib/db';

interface Model {
  id: string;
  name: string;
  description?: string | null;
  groupName?: string | null;
  groupNames?: string[];
  avatarUrl?: string | null;
  createdAt?: Date | null;
}

function normalizeGroupName(groupName?: string | null): string | null {
  const trimmed = typeof groupName === 'string' ? groupName.trim() : '';
  return trimmed || null;
}

// GET /api/models - List all models with image counts and linked platforms
export async function GET() {
  try {
    await ensureDatabaseReady();
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

    const modelsWithCounts = models.map((model: Model) => ({
      ...model,
      avatarGcsUrl: model.avatarUrl,
      imageCount: imageCountMap.get(model.id) || 0,
      linkedPlatforms: platformsMap.get(model.id) || [],
      accountCount: accountCountMap.get(model.id) || 0,
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
    await ensureDatabaseReady();
    const body = await request.json();
    const { name, description, groupName, groupNames } = body as { name?: string; description?: string; groupName?: string | null; groupNames?: string[] };

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Model name is required' }, { status: 400 });
    }

    // Determine groups: prefer groupNames array, fall back to single groupName
    let resolvedGroups: string[] = [];
    if (Array.isArray(groupNames)) {
      resolvedGroups = groupNames.map((g: string) => (typeof g === 'string' ? g.trim() : '')).filter(Boolean);
    } else if (groupName) {
      const normalized = normalizeGroupName(groupName);
      if (normalized) resolvedGroups = [normalized];
    }

    const model = await createModel({
      name: name.trim(),
      description: description?.trim() || null,
      groupName: resolvedGroups[0] || null,
      avatarUrl: null,
    });

    // If multiple groups, set them all via junction table
    if (resolvedGroups.length > 1) {
      await setModelGroups(model.id, resolvedGroups);
      model.groupNames = resolvedGroups;
    }

    return NextResponse.json(model, { status: 201 });
  } catch (err) {
    console.error('Create model error:', err);
    return NextResponse.json({ error: 'Failed to create model' }, { status: 500 });
  }
}
