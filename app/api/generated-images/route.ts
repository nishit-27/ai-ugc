import { NextRequest, NextResponse } from 'next/server';
import {
  ensureDatabaseReady,
  getGeneratedImagesPage,
  getGeneratedImagesByModelId,
  getGeneratedImagesCount,
} from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RESPONSE_CACHE_TTL_MS = 4_000;
const MAX_CACHE_ENTRIES = 80;
const DAY_MS = 24 * 60 * 60 * 1000;

type ImageLike = { gcsUrl?: string };
type GeneratedImagesPayload = {
  images?: Array<ImageLike & { signedUrl?: string }>;
  total?: number | null;
  page?: number;
  limit?: number;
};

const responseCache = new Map<string, { ts: number; payload: GeneratedImagesPayload }>();
const inflightByKey = new Map<string, Promise<GeneratedImagesPayload>>();

function getCacheKey(searchParams: URLSearchParams): string {
  const entries = [...searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}=${v}`).join('&') || 'default';
}

function getCachedPayload(cacheKey: string): GeneratedImagesPayload | null {
  const cached = responseCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.ts > RESPONSE_CACHE_TTL_MS) {
    responseCache.delete(cacheKey);
    return null;
  }
  return cached.payload;
}

function setCachedPayload(cacheKey: string, payload: GeneratedImagesPayload) {
  responseCache.set(cacheKey, { ts: Date.now(), payload });
  if (responseCache.size <= MAX_CACHE_ENTRIES) return;
  const oldest = responseCache.keys().next().value;
  if (oldest) responseCache.delete(oldest);
}

/** All URLs are now R2 public — set signedUrl = gcsUrl directly. */
function resolveUrls<T extends ImageLike>(images: T[]): Array<T & { signedUrl?: string }> {
  return images.map((image) => ({
    ...image,
    signedUrl: image.gcsUrl || undefined,
  }));
}

function parseDateRange(dateRange: string | null): string | null {
  if (!dateRange || dateRange === 'all') return null;
  if (dateRange === '24h') return new Date(Date.now() - DAY_MS).toISOString();
  if (dateRange === '7d') return new Date(Date.now() - (7 * DAY_MS)).toISOString();
  if (dateRange === '30d') return new Date(Date.now() - (30 * DAY_MS)).toISOString();
  return null;
}

function parseSort(sort: string | null): 'asc' | 'desc' {
  return sort === 'asc' ? 'asc' : 'desc';
}

export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseReady();

    const { searchParams } = request.nextUrl;
    const cacheKey = getCacheKey(searchParams);

    const cached = getCachedPayload(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'private, max-age=20, stale-while-revalidate=120' },
      });
    }

    const shared = inflightByKey.get(cacheKey);
    if (shared) {
      const payload = await shared;
      return NextResponse.json(payload, {
        headers: { 'Cache-Control': 'private, max-age=20, stale-while-revalidate=120' },
      });
    }

    const loadPromise = (async (): Promise<GeneratedImagesPayload> => {
      const modelId = searchParams.get('modelId');
      const hasPagination = searchParams.has('page') || searchParams.has('limit');
      const fastMode = searchParams.get('fast') === 'true';
      const countOnly = searchParams.get('countOnly') === 'true';
      const dateRange = searchParams.get('dateRange');
      const createdAfter = parseDateRange(dateRange);
      const sort = parseSort(searchParams.get('sort'));

      if (countOnly) {
        const total = await getGeneratedImagesCount({
          modelId: modelId || null,
          createdAfter,
        });
        return { total };
      }

      if (modelId && !hasPagination && !dateRange && !searchParams.has('sort')) {
        const images = await getGeneratedImagesByModelId(modelId);
        return { images: resolveUrls(images), total: images.length };
      }

      const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '24', 10)));
      const offset = (page - 1) * limit;

      const { images, total } = await getGeneratedImagesPage(limit, offset, {
        includeTotal: !fastMode,
        modelId: modelId || null,
        createdAfter,
        sort,
      });

      return { images: resolveUrls(images), total, page, limit };
    })();

    inflightByKey.set(cacheKey, loadPromise);

    let payload: GeneratedImagesPayload;
    try {
      payload = await loadPromise;
    } finally {
      inflightByKey.delete(cacheKey);
    }

    setCachedPayload(cacheKey, payload);

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=300' },
    });
  } catch (err) {
    console.error('Get generated images error:', err);
    return NextResponse.json({ error: 'Failed to fetch generated images' }, { status: 500 });
  }
}
