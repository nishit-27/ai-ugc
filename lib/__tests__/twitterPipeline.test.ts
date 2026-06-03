import { describe, expect, it } from 'vitest';
import { parseTweetIdFromUrl } from '@/lib/twitter-api';

// The Twitter execute route resolves a reply/quote/engage target tweet id from
// the pasted URL when the user hasn't clicked "Fetch". These cases guard that
// resolution so reply/quote steps can't silently post to nothing.
describe('parseTweetIdFromUrl', () => {
  it('extracts the id from an x.com status URL', () => {
    expect(parseTweetIdFromUrl('https://x.com/jack/status/20')).toBe('20');
  });

  it('extracts the id from a twitter.com status URL', () => {
    expect(parseTweetIdFromUrl('https://twitter.com/elonmusk/status/1234567890123456789')).toBe(
      '1234567890123456789'
    );
  });

  it('ignores query strings and trailing segments', () => {
    expect(
      parseTweetIdFromUrl('https://x.com/user/status/98765?s=20&t=abc')
    ).toBe('98765');
  });

  it('returns null for a non-status URL', () => {
    expect(parseTweetIdFromUrl('https://x.com/user')).toBeNull();
  });

  it('returns null for an unrelated URL', () => {
    expect(parseTweetIdFromUrl('https://example.com/foo/status/123')).toBeNull();
  });
});
