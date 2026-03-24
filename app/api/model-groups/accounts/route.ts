import { NextResponse } from 'next/server';
import { ensureDatabaseReady, getAllModelGroupMemberships } from '@/lib/db';
import { db } from '@/lib/drizzle';
import { modelAccountMappings } from '@/lib/schema';
import { inArray } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await ensureDatabaseReady();

    const memberships = await getAllModelGroupMemberships() as { modelId: string; groupName: string }[];

    // Build group → modelIds map
    const groupModels = new Map<string, Set<string>>();
    for (const row of memberships) {
      if (!row.groupName) continue;
      if (!groupModels.has(row.groupName)) groupModels.set(row.groupName, new Set());
      groupModels.get(row.groupName)!.add(row.modelId);
    }

    // Get all unique model IDs
    const allModelIds = [...new Set(memberships.map((m) => m.modelId))];
    if (allModelIds.length === 0) {
      const groups = Array.from(groupModels.keys()).map((name) => ({ name, accountIds: [] as string[] }));
      return NextResponse.json({ groups });
    }

    // Fetch account mappings for all models
    const mappings = await db
      .select({ modelId: modelAccountMappings.modelId, lateAccountId: modelAccountMappings.lateAccountId })
      .from(modelAccountMappings)
      .where(inArray(modelAccountMappings.modelId, allModelIds));

    // Build modelId → lateAccountIds map
    const modelAccounts = new Map<string, Set<string>>();
    for (const row of mappings) {
      if (!modelAccounts.has(row.modelId)) modelAccounts.set(row.modelId, new Set());
      modelAccounts.get(row.modelId)!.add(row.lateAccountId);
    }

    // Build final response: group → accountIds
    const groups = Array.from(groupModels.entries()).map(([name, modelIds]) => {
      const accountIds = new Set<string>();
      for (const modelId of modelIds) {
        const accounts = modelAccounts.get(modelId);
        if (accounts) {
          for (const id of accounts) accountIds.add(id);
        }
      }
      return { name, accountIds: Array.from(accountIds) };
    });

    return NextResponse.json({ groups });
  } catch (err) {
    console.error('Get model group accounts error:', err);
    return NextResponse.json({ error: 'Failed to fetch model group accounts' }, { status: 500 });
  }
}
