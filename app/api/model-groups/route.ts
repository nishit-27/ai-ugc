import { NextRequest, NextResponse } from 'next/server';
import { ensureDatabaseReady, getAllModelGroupMemberships, getSetting, setSetting, removeAllMembershipsForGroup, renameGroupMemberships, updateModelsGroupName, clearModelsGroupName } from '@/lib/db';

const MODEL_GROUPS_SETTING_KEY = 'model_groups';

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

async function getGroupSummary(): Promise<ModelGroupSummary[]> {
  const [memberships, configuredGroupNames] = await Promise.all([
    getAllModelGroupMemberships() as Promise<{ modelId: string; groupName: string }[]>,
    loadConfiguredGroupNames(),
  ]);

  // Count memberships per group
  const counts = new Map<string, number>();
  for (const row of memberships) {
    const groupName = normalizeGroupName(row.groupName);
    if (!groupName) continue;
    counts.set(groupName, (counts.get(groupName) || 0) + 1);
  }

  const allGroupNames = uniqueGroupNames([...configuredGroupNames, ...Array.from(counts.keys())]);
  return allGroupNames.map((groupName) => ({
    name: groupName,
    count: counts.get(groupName) || 0,
  }));
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

    // Rename in junction table
    await renameGroupMemberships(fromName, toName);
    // Also update legacy column
    await updateModelsGroupName(fromName, toName);

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

    // Remove from junction table
    await removeAllMembershipsForGroup(groupName);
    // Also clear legacy column
    await clearModelsGroupName(groupName);

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
