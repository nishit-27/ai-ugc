import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { getProfileCountPerKey } from '@/lib/db-late-profile-keys';
import { getAccountLabel } from '@/lib/lateAccountPool';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Endpoints we KNOW exist — we don't care about the body, we want to see if
// any response headers carry profile/account/quota hints (e.g. X-Plan-Limit).
const KNOWN_ENDPOINTS = ['/profiles?limit=1', '/accounts?limit=1', '/posts?limit=1'];

type Probe = {
  endpoint: string;
  status: number | null;
  headers: Record<string, string>;
};

async function probe(apiKey: string, endpoint: string): Promise<Probe> {
  try {
    const res = await fetch(`${config.LATE_API_URL}${endpoint}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    // Drain the body so the connection can be reused.
    await res.text().catch(() => '');
    return { endpoint, status: res.status, headers };
  } catch (err) {
    return { endpoint, status: null, headers: { error: (err as Error).message } };
  }
}

export async function GET() {
  const keys = config.LATE_API_KEYS;
  if (!keys.length) {
    return NextResponse.json({ error: 'LATE_API_KEYS not configured' }, { status: 500 });
  }

  const counts = await getProfileCountPerKey();
  const out = {
    apiUrl: config.LATE_API_URL,
    keys: [] as { index: number; label: string; profileCount: number; probes: Probe[] }[],
  };

  for (let i = 0; i < keys.length; i++) {
    const apiKey = keys[i];
    const probes: Probe[] = [];
    for (const endpoint of KNOWN_ENDPOINTS) {
      probes.push(await probe(apiKey, endpoint));
    }
    out.keys.push({
      index: i,
      label: getAccountLabel(i),
      profileCount: counts.get(i) ?? 0,
      probes,
    });
  }

  return NextResponse.json(out);
}
