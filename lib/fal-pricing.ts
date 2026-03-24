import { config } from '@/lib/config';

type FalPrice = {
  endpoint_id: string;
  unit_price: number;
  unit: string;
  currency: string;
};

// Cache pricing for 1 hour to avoid hammering the API
let cache: { prices: Map<string, FalPrice>; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchPricing(endpointIds: string[]): Promise<Map<string, FalPrice>> {
  const falKey = config.FAL_KEY;
  if (!falKey) {
    console.warn('[FalPricing] No FAL_KEY configured, cannot fetch pricing');
    return new Map();
  }

  const params = endpointIds.map((id) => `endpoint_id=${encodeURIComponent(id)}`).join('&');
  const res = await fetch(`https://api.fal.ai/v1/models/pricing?${params}`, {
    headers: { Authorization: `Key ${falKey}` },
  });

  if (!res.ok) {
    console.error(`[FalPricing] API returned ${res.status}: ${await res.text()}`);
    return new Map();
  }

  const data = await res.json();
  const map = new Map<string, FalPrice>();
  for (const price of data.prices || []) {
    map.set(price.endpoint_id, price);
  }
  return map;
}

const TRACKED_ENDPOINTS = [
  'fal-ai/nano-banana-2/edit',
  'fal-ai/kling-video/v2.6/standard/motion-control',
  'fal-ai/veo3.1/image-to-video',
  'fal-ai/veo3.1',
  'fal-ai/bytedance/seedance/v1.5/pro/image-to-video',
  'fal-ai/kling-video/v2.6/pro/image-to-video',
];

async function getCachedPricing(): Promise<Map<string, FalPrice>> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.prices;
  }

  try {
    const prices = await fetchPricing(TRACKED_ENDPOINTS);
    if (prices.size > 0) {
      cache = { prices, fetchedAt: Date.now() };
    }
    return prices;
  } catch (err) {
    console.error('[FalPricing] Failed to fetch pricing:', err);
    return cache?.prices || new Map();
  }
}

// Fallback prices if the API is unavailable
const FALLBACK_PRICES: Record<string, { unitPrice: number; unit: string }> = {
  'fal-ai/nano-banana-2/edit': { unitPrice: 0.08, unit: 'image' },
  'fal-ai/kling-video/v2.6/standard/motion-control': { unitPrice: 0.07, unit: 'second' },
  'fal-ai/veo3.1/image-to-video': { unitPrice: 0.10, unit: 'second' },
};

export async function getEndpointCost(
  endpointId: string,
  quantity: number = 1,
): Promise<number> {
  const prices = await getCachedPricing();
  const price = prices.get(endpointId);

  if (price) {
    return price.unit_price * quantity;
  }

  // Fallback
  const fallback = FALLBACK_PRICES[endpointId];
  if (fallback) {
    console.warn(`[FalPricing] Using fallback price for ${endpointId}`);
    return fallback.unitPrice * quantity;
  }

  console.warn(`[FalPricing] No pricing found for ${endpointId}, returning 0`);
  return 0;
}
