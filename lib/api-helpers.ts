import { NextResponse } from 'next/server';
import { auth } from './auth';

export async function requireSession() {
  const session = await auth();
  if (!session?.user) {
    return {
      session: null as null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { session, error: null as null };
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '0.0.0.0' || h === '::1') return true;
  if (h.startsWith('127.')) return true;
  if (h.startsWith('10.')) return true;
  if (h.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h.startsWith('169.254.')) return true; // link-local / EC2 metadata
  if (h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true;
  if (h.endsWith('.internal') || h.endsWith('.local')) return true;
  return false;
}

// Reject URLs that could trigger SSRF (private network, loopback, file://).
// Use before passing a user-supplied URL into server-side fetch().
export function assertSafeRemoteUrl(input: unknown): URL {
  if (typeof input !== 'string' || !input) throw new Error('URL is required');
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error('Invalid URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only http(s) URLs are allowed');
  }
  if (isPrivateOrLocalHost(parsed.hostname)) {
    throw new Error('Hostname is not allowed');
  }
  return parsed;
}
