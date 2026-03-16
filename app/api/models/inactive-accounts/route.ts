import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { fetchFromAllKeys, getAccountLabel } from '@/lib/lateAccountPool';
import { ensureDatabaseReady, getAllModelAccountMappingsWithModelNames } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type AccountHealth = {
  accountId: string;
  _id?: string;
  platform: string;
  username?: string;
  displayName?: string;
  status: 'healthy' | 'warning' | 'error';
  tokenValid: boolean;
  needsReconnect: boolean;
  issues: string[];
};

type HealthResponse = {
  accounts?: AccountHealth[];
};

type LateAccount = {
  _id: string;
  platform?: string;
  username?: string;
  displayName?: string;
  [key: string]: unknown;
};

type AccountsResponse = {
  accounts?: LateAccount[];
};

export async function GET() {
  if (!config.LATE_API_KEYS.length) {
    return NextResponse.json({ error: 'LATE_API_KEYS not configured' }, { status: 500 });
  }
  try {
    // Fetch health data, all accounts, and model-account mappings in parallel
    await ensureDatabaseReady();
    const [healthResults, accountsResults, mappingsWithModels] = await Promise.all([
      fetchFromAllKeys<HealthResponse>('/accounts/health'),
      fetchFromAllKeys<AccountsResponse>('/accounts?limit=10000'),
      getAllModelAccountMappingsWithModelNames(),
    ]);

    // Build a map of _id -> account info from the accounts endpoint
    const accountInfoMap = new Map<string, LateAccount & { apiKeyIndex: number }>();
    for (const { apiKeyIndex, data } of accountsResults) {
      for (const account of data.accounts || []) {
        accountInfoMap.set(account._id, { ...account, apiKeyIndex });
      }
    }

    // Build health map keyed by BOTH accountId AND _id (they may differ)
    const healthMap = new Map<string, AccountHealth & { apiKeyIndex: number }>();
    for (const { apiKeyIndex, data } of healthResults) {
      for (const account of data.accounts || []) {
        healthMap.set(account.accountId, { ...account, apiKeyIndex });
        // Also key by _id if present and different
        if (account._id && account._id !== account.accountId) {
          healthMap.set(account._id, { ...account, apiKeyIndex });
        }
      }
    }

    // Cross-reference: find model-account pairs where the account is unhealthy
    const inactiveAccounts: {
      modelId: string;
      modelName: string;
      lateAccountId: string;
      platform: string;
      username?: string;
      displayName?: string;
      status: string;
      issues: string[];
      needsReconnect: boolean;
      apiKeyIndex: number;
      accountLabel: string;
    }[] = [];

    for (const mapping of mappingsWithModels) {
      const health = healthMap.get(mapping.late_account_id);
      const accountInfo = accountInfoMap.get(mapping.late_account_id);

      if (health && (health.needsReconnect || !health.tokenValid || health.status === 'error')) {
        // Account found in health and is unhealthy
        inactiveAccounts.push({
          modelId: mapping.model_id,
          modelName: mapping.model_name,
          lateAccountId: mapping.late_account_id,
          platform: health.platform || mapping.platform,
          username: health.username || accountInfo?.username,
          displayName: health.displayName || accountInfo?.displayName,
          status: health.status,
          issues: health.issues || [],
          needsReconnect: health.needsReconnect,
          apiKeyIndex: mapping.api_key_index ?? 0,
          accountLabel: getAccountLabel(mapping.api_key_index ?? 0),
        });
      } else if (!health && accountInfo) {
        // Account exists in Late but NOT in health response — treat as potentially broken
        inactiveAccounts.push({
          modelId: mapping.model_id,
          modelName: mapping.model_name,
          lateAccountId: mapping.late_account_id,
          platform: accountInfo.platform || mapping.platform,
          username: accountInfo.username,
          displayName: accountInfo.displayName,
          status: 'error',
          issues: ['Account not reported by health check — token may be invalid'],
          needsReconnect: true,
          apiKeyIndex: mapping.api_key_index ?? 0,
          accountLabel: getAccountLabel(mapping.api_key_index ?? 0),
        });
      }
    }

    return NextResponse.json({
      inactiveAccounts,
      totalMappings: mappingsWithModels.length,
      totalInactive: inactiveAccounts.length,
      totalHealthAccounts: healthMap.size,
      totalLateAccounts: accountInfoMap.size,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
