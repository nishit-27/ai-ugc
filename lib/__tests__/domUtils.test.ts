import { describe, it, expect } from 'vitest';

// domUtils uses browser APIs (document, navigator, window) so we test the module loads
// and the functions have the correct signatures without calling them
describe('domUtils module', () => {
  it('exports downloadVideo and copyToClipboard', async () => {
    const mod = await import('../domUtils');
    expect(typeof mod.downloadVideo).toBe('function');
    expect(typeof mod.copyToClipboard).toBe('function');
  });
});
