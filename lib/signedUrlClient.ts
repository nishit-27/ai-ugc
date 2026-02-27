export function getSignedUrl(url: string): string {
  return url;
}

/** Returns a Map of url → url (all URLs are public, no signing needed). */
export async function signUrls(urls: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const url of urls) {
    if (url) result.set(url, url);
  }
  return result;
}

/** No-op — no cache to clear. */
export function clearSignedUrlCache(): void {}
