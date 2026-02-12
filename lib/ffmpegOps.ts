import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from '@ffprobe-installer/ffprobe';

const FFPROBE_PATH = typeof ffprobePath === 'string' ? ffprobePath : (ffprobePath as { path: string }).path;
import type { TextOverlayConfig, BgMusicConfig } from '@/types';

const FFMPEG = ffmpegPath || 'ffmpeg';
const FFPROBE = FFPROBE_PATH || 'ffprobe';

// ── Font management ──
// Map CSS font-family strings → bundled TTF filenames
// Open-source alternatives that visually match the browser fonts
const FONT_FILE_MAP: Record<string, string> = {
  'sans-serif':                'Inter-Bold.ttf',
  'Impact, sans-serif':        'Anton-Regular.ttf',
  'Georgia, serif':            'Lora-Bold.ttf',
  'Courier New, monospace':    'CourierPrime-Bold.ttf',
  'Arial Black, sans-serif':   'ArchivoBlack-Regular.ttf',
  'Times New Roman, serif':    'Tinos-Bold.ttf',
  'Trebuchet MS, sans-serif':  'FiraSans-Bold.ttf',
  'Verdana, sans-serif':       'OpenSans-Bold.ttf',
};

// Italic variants (for styles like "Classic" that need italic)
const FONT_ITALIC_MAP: Record<string, string> = {
  'sans-serif':     'Inter-BoldItalic.ttf',
  'Georgia, serif': 'Lora-BoldItalic.ttf',
};

// Directories where bundled fonts may live
const FONT_DIRS = [
  path.join(process.cwd(), 'lib', 'fonts'),
  path.join(__dirname, 'fonts'),
  path.join(__dirname, '..', 'lib', 'fonts'),
];

// Cache resolved paths so we don't hit the filesystem repeatedly
const _fontCache = new Map<string, string>();

/**
 * Resolve a CSS font-family to a bundled TTF file path.
 * Falls back to Inter-Bold.ttf (the default sans) if the requested family is not found.
 */
function getBundledFont(fontFamily?: string, italic = false): string {
  const cacheKey = `${fontFamily || 'sans-serif'}:${italic ? 'i' : 'n'}`;
  const cached = _fontCache.get(cacheKey);
  if (cached && fs.existsSync(cached)) return cached;

  // Pick the right filename
  const map = italic ? FONT_ITALIC_MAP : FONT_FILE_MAP;
  const filename = (fontFamily && map[fontFamily]) || map['sans-serif'];

  for (const dir of FONT_DIRS) {
    const fullPath = path.join(dir, filename);
    if (fs.existsSync(fullPath)) {
      _fontCache.set(cacheKey, fullPath);
      return fullPath;
    }
  }

  // If italic requested but no italic file exists, fall back to the regular bold
  if (italic) return getBundledFont(fontFamily, false);

  // Last resort — first candidate (sharp may use built-in fallback)
  const fallback = path.join(FONT_DIRS[0], FONT_FILE_MAP['sans-serif']);
  console.warn(`Font not found for "${fontFamily}", falling back to ${fallback}`);
  _fontCache.set(cacheKey, fallback);
  return fallback;
}

function getTempDir(): string {
  const dir = path.join(os.tmpdir(), 'ai-ugc-temp');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Word-wrap text to fit within a max character width per line.
 */
function wrapText(text: string, maxChars: number): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    if (line.length === 0) {
      line = word;
    } else if (line.length + 1 + word.length <= maxChars) {
      line += ' ' + word;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

/**
 * Wrap text so each line has at most `wordsPerLine` words.
 * Respects existing newlines in the input.
 */
function wrapByWordCount(text: string, wordsPerLine: number): string {
  return text.split('\n').map((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length <= wordsPerLine) return paragraph;
    const lines: string[] = [];
    for (let i = 0; i < words.length; i += wordsPerLine) {
      lines.push(words.slice(i, i + wordsPerLine).join(' '));
    }
    return lines.join('\n');
  }).join('\n');
}

/**
 * Probe video dimensions.
 */
function probeVideoSize(filePath: string): { width: number; height: number } {
  try {
    const probe = execFileSync(FFPROBE, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=p=0:s=x',
      filePath,
    ], { encoding: 'utf-8' }).trim();
    const [w, h] = probe.split('x').map(Number);
    if (w > 0 && h > 0) return { width: w, height: h };
  } catch {}
  return { width: 720, height: 1280 };
}

/**
 * Parse a CSS hex color (3/4/6/8 digit) into { r, g, b, alpha } (0-255).
 */
function parseColor(hex: string): { r: number; g: number; b: number; alpha: number } {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  if (h.length === 4) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]+h[3]+h[3];
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  const alpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255;
  return { r, g, b, alpha };
}

/**
 * Escape a string for Pango markup.
 */
function escPango(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Ensure a raw RGBA buffer + position fits inside a canvas.
 * Crops the buffer if it overflows the canvas bounds.
 * Returns null if the layer is entirely off-canvas.
 */
async function safeRawComposite(
  data: Buffer,
  w: number, h: number, channels: number,
  left: number, top: number,
  canvasW: number, canvasH: number,
): Promise<sharp.OverlayOptions | null> {
  let l = Math.max(0, left);
  let t = Math.max(0, top);
  const availW = canvasW - l;
  const availH = canvasH - t;
  if (availW <= 0 || availH <= 0) return null;

  if (w <= availW && h <= availH) {
    return { input: data, raw: { width: w, height: h, channels: channels as 1|2|3|4 }, left: l, top: t };
  }

  // Crop to fit within canvas
  const cropW = Math.min(w, availW);
  const cropH = Math.min(h, availH);
  const cropped = await sharp(data, { raw: { width: w, height: h, channels: channels as 1|2|3|4 } })
    .extract({ left: 0, top: 0, width: cropW, height: cropH })
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    input: cropped.data,
    raw: { width: cropped.info.width, height: cropped.info.height, channels: cropped.info.channels as 1|2|3|4 },
    left: l, top: t,
  };
}

/**
 * Ensure a PNG buffer + position fits inside a canvas.
 * Crops if it overflows.
 */
async function safePngComposite(
  pngBuf: Buffer,
  left: number, top: number,
  canvasW: number, canvasH: number,
): Promise<sharp.OverlayOptions | null> {
  let l = Math.max(0, left);
  let t = Math.max(0, top);
  const meta = await sharp(pngBuf).metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  const availW = canvasW - l;
  const availH = canvasH - t;
  if (availW <= 0 || availH <= 0 || w === 0 || h === 0) return null;

  if (w <= availW && h <= availH) {
    return { input: pngBuf, left: l, top: t };
  }

  const cropW = Math.min(w, availW);
  const cropH = Math.min(h, availH);
  const cropped = await sharp(pngBuf)
    .extract({ left: 0, top: 0, width: cropW, height: cropH })
    .png()
    .toBuffer();

  return { input: cropped, left: l, top: t };
}

// ── Shadow definition for text style presets ──
type ShadowDef = { ox: number; oy: number; blur: number; r: number; g: number; b: number; a: number };

function getShadowsForStyle(style?: string): ShadowDef[] {
  switch (style) {
    case 'bold-shadow': return [{ ox: 2, oy: 2, blur: 0, r: 0, g: 0, b: 0, a: 153 }];
    case 'neon':        return [
      { ox: 0, oy: 0, blur: 14, r: 255, g: 0, b: 255, a: 255 },
      { ox: 0, oy: 0, blur: 7, r: 255, g: 0, b: 255, a: 255 },
    ];
    case 'retro':       return [{ ox: 3, oy: 3, blur: 0, r: 0, g: 78, b: 137, a: 255 }];
    case 'classic':     return [{ ox: 2, oy: 2, blur: 4, r: 0, g: 0, b: 0, a: 128 }];
    default:            return [];
  }
}

/**
 * Resolve effective font family — some styles override the user's font choice.
 * Mirrors the preview logic in TextOverlayPreview.tsx getTextStyle().
 */
function getEffectiveFontFamily(configFamily?: string, textStyle?: string): string {
  // Style-level font overrides (from textStyles.ts)
  if (textStyle === 'retro') return 'Impact, sans-serif';
  if (textStyle === 'classic') return configFamily || 'Georgia, serif';
  return configFamily || 'sans-serif';
}

/**
 * Render Pango text to a raw RGBA buffer via sharp.
 * When width is omitted, Pango renders at natural width (NO auto-wrapping).
 * This matches the preview which uses CSS white-space:pre.
 */
async function renderPangoText(
  markup: string,
  fontPath: string,
  align: 'left' | 'centre' | 'right',
): Promise<{ data: Buffer; width: number; height: number; channels: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (sharp as any)({
    text: { text: markup, fontfile: fontPath, rgba: true, align, dpi: 72 },
  }).toBuffer({ resolveWithObject: true });
  return { data: result.data, width: result.info.width, height: result.info.height, channels: result.info.channels };
}

/**
 * Render styled text as a transparent PNG using sharp's Pango text input.
 * Supports all fonts, styles, shadows, backgrounds, positions from the preview.
 *
 * IMPORTANT: The preview designs at a fixed 720px reference width.
 * All config values (fontSize, padding, etc.) are in that 720px coordinate space.
 * We scale everything proportionally to the actual video resolution so
 * the output matches the preview exactly.
 */
async function renderTextOverlayPng(
  videoWidth: number,
  videoHeight: number,
  config: TextOverlayConfig,
): Promise<string> {
  const {
    text, position, textAlign = 'center', fontSize = 48, fontColor = '#FFFFFF', bgColor,
    textStyle, fontFamily,
    paddingLeft = 0, paddingRight = 0,
    customX, customY,
    wordsPerLine,
  } = config;

  // ── Scale factor: map 720px design space → actual video resolution ──
  const DESIGN_WIDTH = 720;
  const scale = videoWidth / DESIGN_WIDTH;
  const scaledFontSize = Math.round(fontSize * scale);
  const scaledPadL = Math.round((paddingLeft > 0 ? paddingLeft : 90) * scale);
  const scaledPadR = Math.round((paddingRight > 0 ? paddingRight : 90) * scale);

  // ── Style preset overrides (mirrors textStyles.ts) ──
  let effectiveBgColor = bgColor;
  let effectiveFontColor = fontColor;
  let boxPad = Math.round(10 * scale);
  let useBold = true;
  let useItalic = false;
  let letterSpacingEm = 0;

  if (textStyle) {
    switch (textStyle) {
      case 'plain':        useBold = true; break;
      case 'bold-shadow':  useBold = true; break;
      case 'creator':      useBold = true; letterSpacingEm = 0.12; break;
      case 'text-box':
        effectiveBgColor = effectiveBgColor || '#FFFFFF'; effectiveFontColor = '#000000'; boxPad = Math.round(10 * scale); break;
      case 'bubble':
        effectiveBgColor = effectiveBgColor || '#ff3b30'; effectiveFontColor = '#FFFFFF'; boxPad = Math.round(14 * scale); break;
      case 'neon':
        effectiveFontColor = '#ff00ff'; break;
      case 'tag':
        effectiveBgColor = effectiveBgColor || '#ffcc00'; effectiveFontColor = '#000000'; boxPad = Math.round(10 * scale); break;
      case 'subscribe':
        effectiveBgColor = effectiveBgColor || '#ff0000'; effectiveFontColor = '#FFFFFF'; boxPad = Math.round(14 * scale); letterSpacingEm = 0.05; break;
      case 'retro':
        effectiveFontColor = '#ff6b35'; break;
      case 'classic':
        useItalic = true; break;
      case 'caption':
        effectiveBgColor = effectiveBgColor || 'rgba(0,0,0,0.7)'; effectiveFontColor = '#FFFFFF'; boxPad = Math.round(12 * scale); break;
      case 'rounded':
        effectiveBgColor = effectiveBgColor || '#8b5cf6'; effectiveFontColor = '#FFFFFF'; boxPad = Math.round(16 * scale); break;
    }
  }

  // ── Resolve font ──
  const effectiveFamily = getEffectiveFontFamily(fontFamily, textStyle);
  const fontPath = getBundledFont(effectiveFamily, useItalic);

  // ── Word-wrap (at DESIGN_WIDTH=720, same as the preview) ──
  let wrappedText = text;
  const designLeft = paddingLeft > 0 ? paddingLeft : 90;
  const designRight = paddingRight > 0 ? paddingRight : 90;

  if (wordsPerLine && wordsPerLine > 0) {
    wrappedText = wrapByWordCount(wrappedText, wordsPerLine);
  } else {
    const availableWidth = DESIGN_WIDTH - designLeft - designRight;
    const charWidth = fontSize * 0.55; // unscaled, same as preview
    const maxCharsPerLine = Math.max(5, Math.floor(availableWidth / charWidth));
    wrappedText = wrapText(wrappedText, maxCharsPerLine);
  }

  if (textStyle === 'creator' || textStyle === 'subscribe') {
    wrappedText = wrappedText.toUpperCase();
  }

  const pangoAlign = (textAlign === 'left' ? 'left' : textAlign === 'right' ? 'right' : 'centre') as 'left' | 'centre' | 'right';

  // ── Pango attributes (use SCALED font size for actual rendering) ──
  const pangoSize = Math.round(scaledFontSize * 1024);
  const weightAttr = useBold ? ' weight="bold"' : '';
  const styleAttr = useItalic ? ' style="italic"' : '';
  const spacingAttr = letterSpacingEm > 0 ? ` letter_spacing="${Math.round(letterSpacingEm * scaledFontSize * 1024)}"` : '';

  function buildMarkup(hexColor: string, alpha = 255): string {
    const alphaAttr = alpha < 255 ? ` alpha="${Math.round((alpha / 255) * 65535)}"` : '';
    const lines = wrappedText.split('\n');
    const inner = lines.map((line) =>
      `<span foreground="${hexColor}"${alphaAttr} size="${pangoSize}"${weightAttr}${styleAttr}${spacingAttr}>${escPango(line)}</span>`
    ).join('\n');
    return `<span>${inner}</span>`;
  }

  // ── Render main text ──
  const mainMarkup = buildMarkup(effectiveFontColor);
  const mainBuf = await renderPangoText(mainMarkup, fontPath, pangoAlign);

  const textW = mainBuf.width;
  const textH = mainBuf.height;

  // ── Calculate position (using percentages to match the preview's CSS positioning) ──
  let overlayX: number;
  if (position === 'custom' && customX !== undefined) {
    overlayX = Math.round(videoWidth * customX / 100 - textW / 2);
  } else {
    switch (textAlign) {
      case 'left':  overlayX = scaledPadL; break;
      case 'right': overlayX = videoWidth - scaledPadR - textW; break;
      default:      overlayX = Math.round((videoWidth - textW) / 2 + (scaledPadL - scaledPadR) / 2); break;
    }
  }

  let overlayY: number;
  if (position === 'custom' && customY !== undefined) {
    overlayY = Math.round(videoHeight * customY / 100 - textH / 2);
  } else {
    // Preview uses 12% from edge for top/bottom (CSS top:12%, bottom:12%)
    switch (position) {
      case 'top':    overlayY = Math.round(videoHeight * 0.12); break;
      case 'center': overlayY = Math.round((videoHeight - textH) / 2); break;
      case 'bottom': overlayY = Math.round(videoHeight * 0.88 - textH); break;
      default:       overlayY = Math.round(videoHeight * 0.88 - textH); break;
    }
  }

  overlayX = Math.max(0, overlayX);
  overlayY = Math.max(0, overlayY);

  // ── Build composites ──
  const composites: sharp.OverlayOptions[] = [];

  // Background box
  if (effectiveBgColor) {
    let bgR: number, bgG: number, bgB: number, bgA: number;
    if (effectiveBgColor.startsWith('rgba(')) {
      const m = effectiveBgColor.match(/rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/);
      if (m) { bgR = +m[1]; bgG = +m[2]; bgB = +m[3]; bgA = Math.round(+m[4] * 255); }
      else { bgR = 0; bgG = 0; bgB = 0; bgA = 180; }
    } else {
      const c = parseColor(effectiveBgColor);
      bgR = c.r; bgG = c.g; bgB = c.b; bgA = Math.round(c.alpha * 0.7);
    }

    const rx = Math.round((textStyle === 'rounded' || textStyle === 'bubble' ? 12 : 4) * scale);
    const bgW = Math.min(textW + boxPad * 2, videoWidth);
    const bgH = Math.min(textH + boxPad * 2, videoHeight);
    const bgSvg = `<svg width="${bgW}" height="${bgH}"><rect x="0" y="0" width="${bgW}" height="${bgH}" rx="${rx}" ry="${rx}" fill="rgba(${bgR},${bgG},${bgB},${bgA / 255})"/></svg>`;
    const bgBuf = await sharp(Buffer.from(bgSvg)).png().toBuffer();
    const bgComp = await safePngComposite(bgBuf, Math.max(0, overlayX - boxPad), Math.max(0, overlayY - boxPad), videoWidth, videoHeight);
    if (bgComp) composites.push(bgComp);
  }

  // Text shadows (offsets scaled proportionally)
  const shadows = getShadowsForStyle(textStyle);
  if (!effectiveBgColor && shadows.length === 0) {
    shadows.push({ ox: 1, oy: 1, blur: 3, r: 0, g: 0, b: 0, a: 230 });
  }

  for (const shadow of shadows) {
    const shadowHex = `#${shadow.r.toString(16).padStart(2, '0')}${shadow.g.toString(16).padStart(2, '0')}${shadow.b.toString(16).padStart(2, '0')}`;
    const shadowMarkup = buildMarkup(shadowHex, shadow.a);
    const shadowBuf = await renderPangoText(shadowMarkup, fontPath, pangoAlign);

    let shadowInput: Buffer = shadowBuf.data;
    let shadowW = shadowBuf.width;
    let shadowH = shadowBuf.height;
    let shadowChannels = shadowBuf.channels;

    if (shadow.blur > 0) {
      const sigma = Math.max(0.3, shadow.blur * 0.5 * scale);
      const blurred = await sharp(shadowInput, { raw: { width: shadowW, height: shadowH, channels: shadowChannels as 1 | 2 | 3 | 4 } })
        .blur(sigma)
        .toBuffer({ resolveWithObject: true });
      shadowInput = blurred.data;
      shadowW = blurred.info.width;
      shadowH = blurred.info.height;
      shadowChannels = blurred.info.channels;
    }

    const sox = Math.round(shadow.ox * scale);
    const soy = Math.round(shadow.oy * scale);
    const sc = await safeRawComposite(shadowInput, shadowW, shadowH, shadowChannels, overlayX + sox, overlayY + soy, videoWidth, videoHeight);
    if (sc) composites.push(sc);
  }

  // Main text layer on top
  const mainComp = await safeRawComposite(mainBuf.data, textW, textH, mainBuf.channels, overlayX, overlayY, videoWidth, videoHeight);
  if (mainComp) composites.push(mainComp);

  // ── Create transparent canvas and composite everything ──
  const tmpDir = getTempDir();
  const pngPath = path.join(tmpDir, `overlay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.png`);

  await sharp({
    create: { width: videoWidth, height: videoHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .png()
    .toFile(pngPath);

  return pngPath;
}

/**
 * Burn text onto a video using a sharp-rendered PNG overlay.
 * Uses ffmpeg overlay filter (universally available) instead of drawtext.
 */
export async function addTextOverlay(
  inputPath: string,
  outputPath: string,
  config: TextOverlayConfig
): Promise<void> {
  const { startTime, duration, entireVideo } = config;
  const { width, height } = probeVideoSize(inputPath);

  const overlayPng = await renderTextOverlayPng(width, height, config);

  try {
    // Build overlay filter with optional enable expression for timing
    let enableExpr = '';
    if (!entireVideo && (startTime !== undefined || duration !== undefined)) {
      const start = startTime || 0;
      if (duration !== undefined) {
        enableExpr = `:enable='between(t,${start},${start + duration})'`;
      } else {
        enableExpr = `:enable='gte(t,${start})'`;
      }
    }

    execFileSync(FFMPEG, [
      '-y',
      '-i', inputPath,
      '-i', overlayPng,
      '-filter_complex', `[0:v][1:v]overlay=0:0${enableExpr}[vout]`,
      '-map', '[vout]',
      '-map', '0:a?',
      '-c:a', 'copy',
      outputPath,
    ]);
  } finally {
    try { fs.unlinkSync(overlayPng); } catch {}
  }
}

/**
 * Strip all audio streams from a video, producing a silent video.
 */
export function stripAudio(inputPath: string, outputPath: string): void {
  execFileSync(FFMPEG, [
    '-y',
    '-i', inputPath,
    '-c:v', 'copy',
    '-an',
    outputPath,
  ]);
}

/**
 * Mix a background music track into a video using ffmpeg amix filter.
 */
export function mixAudio(
  inputPath: string,
  audioPath: string,
  outputPath: string,
  config: BgMusicConfig
): void {
  const { volume = 30, fadeIn, fadeOut } = config;
  const vol = volume / 100;

  // Get video duration for fade-out calculation
  let videoDuration = 0;
  try {
    const output = execFileSync(FFPROBE, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPath,
    ], { encoding: 'utf-8' });
    videoDuration = parseFloat(output.trim()) || 0;
  } catch {
    // If we can't get duration, proceed without fade-out
  }

  // Build audio filter chain for the music track
  let audioFilter = `[1:a]volume=${vol}`;
  if (fadeIn) {
    audioFilter += `,afade=t=in:d=${fadeIn}`;
  }
  if (fadeOut && videoDuration > 0) {
    const fadeOutStart = Math.max(0, videoDuration - fadeOut);
    audioFilter += `,afade=t=out:st=${fadeOutStart}:d=${fadeOut}`;
  }
  audioFilter += '[a1]';

  // Check if input video has audio
  let hasAudio = true;
  try {
    const probeOut = execFileSync(FFPROBE, [
      '-v', 'error',
      '-select_streams', 'a',
      '-show_entries', 'stream=index',
      '-of', 'csv=p=0',
      inputPath,
    ], { encoding: 'utf-8' });
    hasAudio = probeOut.trim().length > 0;
  } catch {
    hasAudio = false;
  }

  if (hasAudio) {
    execFileSync(FFMPEG, [
      '-y',
      '-i', inputPath,
      '-i', audioPath,
      '-filter_complex', `${audioFilter};[0:a][a1]amix=inputs=2:duration=first`,
      '-c:v', 'copy',
      outputPath,
    ]);
  } else {
    // No existing audio — just use the music track
    execFileSync(FFMPEG, [
      '-y',
      '-i', inputPath,
      '-i', audioPath,
      '-filter_complex', `${audioFilter}`,
      '-map', '0:v',
      '-map', '[a1]',
      '-c:v', 'copy',
      '-shortest',
      outputPath,
    ]);
  }
}

/**
 * Concatenate multiple videos using ffmpeg concat filter.
 * Normalizes resolution, framerate, and pixel format so mixed-source videos work.
 */
export function concatVideos(videoPaths: string[], outputPath: string): void {
  // Probe the first video to get target resolution
  let targetW = 720;
  let targetH = 1280;
  try {
    const probe = execFileSync(FFPROBE, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=p=0:s=x',
      videoPaths[0],
    ], { encoding: 'utf-8' }).trim();
    const [w, h] = probe.split('x').map(Number);
    if (w > 0 && h > 0) { targetW = w; targetH = h; }
  } catch {}

  const n = videoPaths.length;
  const inputs: string[] = [];
  videoPaths.forEach((p) => { inputs.push('-i', p); });

  // Build filter: scale + pad each input to target size, add silent audio if missing, then concat
  const filters: string[] = [];
  const concatInputs: string[] = [];

  for (let i = 0; i < n; i++) {
    // Check if this input has audio
    let hasAudio = false;
    try {
      const audioProbe = execFileSync(FFPROBE, [
        '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0',
        videoPaths[i],
      ], { encoding: 'utf-8' });
      hasAudio = audioProbe.trim().length > 0;
    } catch {}

    filters.push(
      `[${i}:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,` +
      `pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2,` +
      `setsar=1,fps=30,format=yuv420p[v${i}]`
    );

    if (hasAudio) {
      filters.push(`[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`);
    } else {
      // Probe duration to limit silent audio (anullsrc is infinite by default)
      let dur = 10;
      try {
        const dOut = execFileSync(FFPROBE, [
          '-v', 'error', '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1', videoPaths[i],
        ], { encoding: 'utf-8' });
        dur = parseFloat(dOut.trim()) || 10;
      } catch {}
      filters.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${dur}[a${i}]`);
    }

    concatInputs.push(`[v${i}][a${i}]`);
  }

  filters.push(`${concatInputs.join('')}concat=n=${n}:v=1:a=1[vout][aout]`);

  execFileSync(FFMPEG, [
    '-y',
    ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', '[vout]',
    '-map', '[aout]',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-c:a', 'aac',
    '-shortest',
    outputPath,
  ]);
}
