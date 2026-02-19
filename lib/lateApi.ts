import { config } from './config';

const LATE_API_TIMEOUT = 30000;
const MAX_RETRIES = 1;
const RETRY_DELAYS = [2000];

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
    apiKey?: string;
  } = {}
): Promise<T> {
  const url = `${config.LATE_API_URL}${endpoint}`;
  const {
    method = 'GET',
    body,
    headers: customHeaders = {},
    timeout = LATE_API_TIMEOUT,
    retries = MAX_RETRIES,
    apiKey,
  } = options;

  const effectiveApiKey = apiKey || config.LATE_API_KEYS[0];
  if (!effectiveApiKey) {
    throw new LateApiError('LATE_API_KEYS is not configured', 0);
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)];
      await new Promise((r) => setTimeout(r, delay));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const fetchOptions: RequestInit = {
        method,
        headers: {
          Authorization: `Bearer ${effectiveApiKey}`,
          'Content-Type': 'application/json',
          ...customHeaders,
        },
        signal: controller.signal,
        cache: 'no-store',
      };
      if (body && method !== 'GET') {
        fetchOptions.body = body;
      }

      const response = await fetch(url, fetchOptions);

      const retryAfter = response.headers.get('Retry-After');
      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');

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

        if ((response.status === 429 || response.status >= 500) && attempt < retries) {
          lastError = apiError;
          if (retryAfter) {
            const retryMs = parseInt(retryAfter, 10) * 1000;
            await new Promise((r) => setTimeout(r, retryMs));
          }
          continue;
        }

        throw apiError;
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (error instanceof LateApiError) throw error;

      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new LateApiError(`Late API request timed out after ${timeout}ms`, 0);
        if (attempt < retries) {
          continue;
        }
        throw lastError;
      }

      if (attempt < retries) {
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
