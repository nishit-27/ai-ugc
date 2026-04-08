import { describe, expect, it } from 'vitest';
import {
  TEXT_OVERLAY_CJK_FONT_FAMILY,
  containsCjkGlyphs,
  wrapTextForOverlay,
} from '../textOverlayLayout';

describe('containsCjkGlyphs', () => {
  it('detects Japanese kana and kanji text', () => {
    expect(containsCjkGlyphs('こんにちは')).toBe(true);
    expect(containsCjkGlyphs('世界')).toBe(true);
  });

  it('ignores plain latin text', () => {
    expect(containsCjkGlyphs('hello world')).toBe(false);
  });
});

describe('wrapTextForOverlay', () => {
  it('wraps whitespace-separated text by width', () => {
    expect(wrapTextForOverlay('hello world from runable', 0, 90, 90, 48)).toBe('hello world from\nrunable');
  });

  it('wraps Japanese text even when it has no spaces', () => {
    const wrapped = wrapTextForOverlay('こんにちは世界こんにちは世界こんにちは世界', 0, 90, 90, 48);
    expect(wrapped).toContain('\n');
  });

  it('preserves explicit word-count wrapping when set', () => {
    expect(wrapTextForOverlay('one two three four', 2, 90, 90, 48)).toBe('one two\nthree four');
  });

  it('exports a stable Japanese font family token', () => {
    expect(TEXT_OVERLAY_CJK_FONT_FAMILY).toContain('Noto Sans JP');
  });
});
