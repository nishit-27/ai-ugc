import { config } from './config';

const LATE_API_TIMEOUT = 30000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 8000]; // Exponential backoff

export class LateApiError extends Error {
  status: number;
  retryAfter: number | null;
  rateLimitRemaining: number | null;
  body: unknown;

  constructor(
    message: string,
    status: number,
    body: unknown = null,
    retryAfter: number | null = null,
    rateLimitRemaining: number | null = null
  ) {
    super(message);
    this.name = 'LateApiError';
    this.status = status;
    this.body = body;
    this.retryAfter = retryAfter;
    this.rateLimitRemaining = rateLimitRemaining;
  }
}

export async function lateApiRequest<T = unknown>(
  endpoint: string,
  options: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
    timeout?: number;
    retries?: number;
  } = {}
): Promise<T> {
  const url = `${config.LATE_API_URL}${endpoint}`;
  const {
    method = 'GET',
    body,
    headers: customHeaders = {},
    timeout = LATE_API_TIMEOUT,
    retries = MAX_RETRIES,
  } = options;

  if (!config.LATE_API_KEY) {
    throw new LateApiError('LATE_API_KEY is not configured', 0);
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)];
      console.log(`[Late API] Retry ${attempt}/${retries} after ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const fetchOptions: RequestInit = {
        method,
        headers: {
          Authorization: `Bearer ${config.LATE_API_KEY}`,
          'Content-Type': 'application/json',
          ...customHeaders,
        },
        signal: controller.signal,
        cache: 'no-store',
      };
      if (body && method !== 'GET') {
        fetchOptions.body = body;
      }

      const startTime = Date.now();
      console.log(`[Late API] ${method} ${endpoint}${attempt > 0 ? ` (attempt ${attempt + 1})` : ''}`);
      const response = await fetch(url, fetchOptions);
      const elapsed = Date.now() - startTime;

      // Parse rate limit headers
      const retryAfter = response.headers.get('Retry-After');
      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');

      if (rateLimitRemaining) {
        console.log(`[Late API] Rate limit remaining: ${rateLimitRemaining}`);
      }

      if (!response.ok) {
        let errorBody: unknown;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = await response.text();
        }

        const apiError = new LateApiError(
          `Late API ${response.status}: ${typeof errorBody === 'string' ? errorBody : JSON.stringify(errorBody)}`,
          response.status,
          errorBody,
          retryAfter ? parseInt(retryAfter, 10) : null,
          rateLimitRemaining ? parseInt(rateLimitRemaining, 10) : null
        );

        // Retry on 429 (rate limit) or 5xx (server errors)
        if ((response.status === 429 || response.status >= 500) && attempt < retries) {
          console.warn(`[Late API] ${response.status} on ${method} ${endpoint} (${elapsed}ms) - will retry`);
          lastError = apiError;

          // If we got a Retry-After header, use that delay
          if (retryAfter) {
            const retryMs = parseInt(retryAfter, 10) * 1000;
            console.log(`[Late API] Waiting ${retryMs}ms (Retry-After header)`);
            await new Promise((r) => setTimeout(r, retryMs));
          }
          continue;
        }

        console.error(`[Late API] Error ${response.status} on ${method} ${endpoint} (${elapsed}ms):`, errorBody);
        throw apiError;
      }

      console.log(`[Late API] ${response.status} on ${method} ${endpoint} (${elapsed}ms)`);
      return response.json() as Promise<T>;
    } catch (error) {
      if (error instanceof LateApiError) throw error;

      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new LateApiError(`Late API request timed out after ${timeout}ms`, 0);
        if (attempt < retries) {
          console.warn(`[Late API] Timeout on ${method} ${endpoint} - will retry`);
          continue;
        }
        throw lastError;
      }

      // Network errors - retry
      if (attempt < retries) {
        console.warn(`[Late API] Network error on ${method} ${endpoint}:`, (error as Error).message, '- will retry');
        lastError = error as Error;
        continue;
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error('Late API request failed after all retries');
}
