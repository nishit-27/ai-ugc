import { NextRequest, NextResponse } from 'next/server';
import { ensureDatabaseReady, getAllModels, getSetting, setSetting, sql } from '@/lib/db';

const MODEL_GROUPS_SETTING_KEY = 'model_groups';

type ModelRow = { groupName?: string | null };
type ModelGroupSummary = { name: string; count: number };

function normalizeGroupName(value?: string | null): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || null;
}

function uniqueGroupNames(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeGroupName(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result.sort((a, b) => a.localeCompare(b));
}

async function loadConfiguredGroupNames(): Promise<string[]> {
  const raw = await getSetting(MODEL_GROUPS_SETTING_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return uniqueGroupNames(parsed.map((entry) => (typeof entry === 'string' ? entry : null)));
  } catch {
    return [];
  }
}

async function saveConfiguredGroupNames(groupNames: string[]) {
  await setSetting(MODEL_GROUPS_SETTING_KEY, JSON.stringify(uniqueGroupNames(groupNames)));
}

function buildGroupSummary(models: ModelRow[], configuredGroupNames: string[]): ModelGroupSummary[] {
  const counts = new Map<string, number>();
  for (const model of models) {
    const groupName = normalizeGroupName(model.groupName);
    if (!groupName) continue;
    counts.set(groupName, (counts.get(groupName) || 0) + 1);
  }

  const allGroupNames = uniqueGroupNames([...configuredGroupNames, ...Array.from(counts.keys())]);
  return allGroupNames.map((groupName) => ({
    name: groupName,
    count: counts.get(groupName) || 0,
  }));
}

async function getGroupSummary(): Promise<ModelGroupSummary[]> {
  const [models, configuredGroupNames] = await Promise.all([
    getAllModels() as Promise<ModelRow[]>,
    loadConfiguredGroupNames(),
  ]);
  return buildGroupSummary(models, configuredGroupNames);
}

export async function GET() {
  try {
    await ensureDatabaseReady();
    const groups = await getGroupSummary();
    return NextResponse.json({ groups });
  } catch (err) {
    console.error('Get model groups error:', err);
    return NextResponse.json({ error: 'Failed to fetch model groups' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseReady();
    const body = await request.json();
    const groupName = normalizeGroupName((body as { name?: string }).name);

    if (!groupName) {
      return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
    }

    const current = await loadConfiguredGroupNames();
    const alreadyExists = current.some((name) => name.toLowerCase() === groupName.toLowerCase());
    if (alreadyExists) {
      return NextResponse.json({ error: 'Group already exists' }, { status: 409 });
    }

    await saveConfiguredGroupNames([...current, groupName]);

    const groups = await getGroupSummary();
    return NextResponse.json({ groups }, { status: 201 });
  } catch (err) {
    console.error('Create model group error:', err);
    return NextResponse.json({ error: 'Failed to create model group' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await ensureDatabaseReady();
    const body = await request.json();
    const { oldName, newName } = body as { oldName?: string; newName?: string };
    const fromName = normalizeGroupName(oldName);
    const toName = normalizeGroupName(newName);

    if (!fromName || !toName) {
      return NextResponse.json({ error: 'Both oldName and newName are required' }, { status: 400 });
    }

    const configured = await loadConfiguredGroupNames();
    const targetTaken = configured.some(
      (name) => name.toLowerCase() === toName.toLowerCase() && name.toLowerCase() !== fromName.toLowerCase(),
    );
    if (targetTaken) {
      return NextResponse.json({ error: 'Target group name already exists' }, { status: 409 });
    }

    await sql`
      UPDATE models
      SET group_name = ${toName}
      WHERE lower(btrim(group_name)) = lower(${fromName})
    `;

    const nextConfigured = uniqueGroupNames(
      (configured.length > 0 ? configured : [fromName]).map((name) => (
        name.toLowerCase() === fromName.toLowerCase() ? toName : name
      )),
    );
    await saveConfiguredGroupNames(nextConfigured);

    const groups = await getGroupSummary();
    return NextResponse.json({ groups });
  } catch (err) {
    console.error('Rename model group error:', err);
    return NextResponse.json({ error: 'Failed to rename model group' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await ensureDatabaseReady();
    const body = await request.json();
    const groupName = normalizeGroupName((body as { name?: string }).name);

    if (!groupName) {
      return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
    }

    await sql`
      UPDATE models
      SET group_name = NULL
      WHERE lower(btrim(group_name)) = lower(${groupName})
    `;

    const configured = await loadConfiguredGroupNames();
    const nextConfigured = configured.filter((name) => name.toLowerCase() !== groupName.toLowerCase());
    await saveConfiguredGroupNames(nextConfigured);

    const groups = await getGroupSummary();
    return NextResponse.json({ groups });
  } catch (err) {
    console.error('Delete model group error:', err);
    return NextResponse.json({ error: 'Failed to delete model group' }, { status: 500 });
  }
}
