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
 * Resolve a CSS font-family to a system font file path.
 * Falls back to a known default if nothing matches.
 */
function resolveFontFile(fontFamily?: string): string | null {
  // Map CSS families to candidate file paths (macOS + Linux/Vercel)
  const fontMap: Record<string, string[]> = {
    'sans-serif': [
      '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      '/System/Library/Fonts/Helvetica.ttc',
    ],
    'Impact, sans-serif': [
      '/usr/share/fonts/truetype/msttcorefonts/Impact.ttf',
      '/System/Library/Fonts/Supplemental/Impact.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    ],
    'Georgia, serif': [
      '/usr/share/fonts/truetype/msttcorefonts/Georgia.ttf',
      '/System/Library/Fonts/Supplemental/Georgia.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
    ],
    'Courier New, monospace': [
      '/usr/share/fonts/truetype/msttcorefonts/cour.ttf',
      '/System/Library/Fonts/Supplemental/Courier New.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
    ],
    'Arial Black, sans-serif': [
      '/usr/share/fonts/truetype/msttcorefonts/Arial_Black.ttf',
      '/System/Library/Fonts/Supplemental/Arial Black.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    ],
    'Times New Roman, serif': [
      '/usr/share/fonts/truetype/msttcorefonts/Times_New_Roman.ttf',
      '/System/Library/Fonts/Supplemental/Times New Roman.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
    ],
    'Trebuchet MS, sans-serif': [
      '/usr/share/fonts/truetype/msttcorefonts/Trebuchet_MS.ttf',
      '/System/Library/Fonts/Supplemental/Trebuchet MS.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    ],
    'Verdana, sans-serif': [
      '/usr/share/fonts/truetype/msttcorefonts/Verdana.ttf',
      '/System/Library/Fonts/Supplemental/Verdana.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    ],
  };

  // Universal fallbacks
  const fallbacks = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
  ];

  const candidates = fontFamily ? (fontMap[fontFamily] || fallbacks) : fallbacks;
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  // Last resort: try fallbacks
  for (const p of fallbacks) {
    if (fs.existsSync(p)) return p;
  }
  return null;
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
 * Render styled text as a transparent PNG using sharp's SVG input.
 * Returns the path to the generated PNG.
 */
async function renderTextOverlayPng(
  videoWidth: number,
  videoHeight: number,
  config: TextOverlayConfig,
): Promise<string> {
  const {
    text, position, textAlign = 'center', fontSize = 48, fontColor = '#FFFFFF', bgColor,
    textStyle,
    paddingLeft = 0, paddingRight = 0,
    customX, customY,
    wordsPerLine,
  } = config;

  // ── Style preset overrides ──
  let shadowX = 0, shadowY = 0, strokeW = 0;
  let effectiveBgColor = bgColor;
  let effectiveFontColor = fontColor;
  let boxPad = 10;

  if (textStyle) {
    switch (textStyle) {
      case 'bold-shadow':  shadowX = 2; shadowY = 2; break;
      case 'creator': break;
      case 'text-box':
        effectiveBgColor = effectiveBgColor || '#FFFFFF'; effectiveFontColor = '#000000'; boxPad = 10; break;
      case 'bubble':
        effectiveBgColor = effectiveBgColor || '#ff3b30'; effectiveFontColor = '#FFFFFF'; boxPad = 14; break;
      case 'neon':
        effectiveFontColor = '#ff00ff'; strokeW = 2; break;
      case 'tag':
        effectiveBgColor = effectiveBgColor || '#ffcc00'; effectiveFontColor = '#000000'; boxPad = 10; break;
      case 'subscribe':
        effectiveBgColor = effectiveBgColor || '#ff0000'; effectiveFontColor = '#FFFFFF'; boxPad = 14; break;
      case 'retro':
        effectiveFontColor = '#ff6b35'; shadowX = 3; shadowY = 3; break;
      case 'classic': shadowX = 2; shadowY = 2; break;
      case 'caption':
        effectiveBgColor = effectiveBgColor || '#000000'; effectiveFontColor = '#FFFFFF'; boxPad = 12; break;
      case 'rounded':
        effectiveBgColor = effectiveBgColor || '#8b5cf6'; effectiveFontColor = '#FFFFFF'; boxPad = 16; break;
    }
  }

  // ── Word-wrap ──
  let wrappedText = text;
  const effectiveLeft = paddingLeft > 0 ? paddingLeft : 90;
  const effectiveRight = paddingRight > 0 ? paddingRight : 90;

  if (wordsPerLine && wordsPerLine > 0) {
    wrappedText = wrapByWordCount(wrappedText, wordsPerLine);
  } else {
    const availableWidth = videoWidth - effectiveLeft - effectiveRight;
    const charWidth = fontSize * 0.55;
    const maxCharsPerLine = Math.max(5, Math.floor(availableWidth / charWidth));
    wrappedText = wrapText(wrappedText, maxCharsPerLine);
  }

  // Apply uppercase for certain styles
  if (textStyle === 'creator' || textStyle === 'subscribe') {
    wrappedText = wrappedText.toUpperCase();
  }

  const lines = wrappedText.split('\n');
  const lineHeight = Math.round(fontSize * 1.3);
  const totalTextHeight = lines.length * lineHeight;

  // ── SVG font family ──
  const svgFontFamily = 'sans-serif';

  // ── SVG anchor from textAlign ──
  const anchor = textAlign === 'left' ? 'start' : textAlign === 'right' ? 'end' : 'middle';

  // ── Build SVG text lines ──
  const escSvg = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Calculate text block X position
  let textBlockX: number;
  if (position === 'custom' && customX !== undefined) {
    textBlockX = Math.round(videoWidth * customX / 100);
  } else {
    switch (textAlign) {
      case 'left':  textBlockX = effectiveLeft; break;
      case 'right': textBlockX = videoWidth - effectiveRight; break;
      default:      textBlockX = Math.round(videoWidth / 2 + (paddingLeft - paddingRight) / 2); break;
    }
  }

  // Calculate text block Y position (top of block)
  let textBlockY: number;
  if (position === 'custom' && customY !== undefined) {
    textBlockY = Math.round(videoHeight * customY / 100 - totalTextHeight / 2);
  } else {
    switch (position) {
      case 'top':    textBlockY = 50; break;
      case 'center': textBlockY = Math.round((videoHeight - totalTextHeight) / 2); break;
      case 'bottom': textBlockY = videoHeight - totalTextHeight - 50; break;
      default:       textBlockY = videoHeight - totalTextHeight - 50; break;
    }
  }

  // ── Build background rects (one per line, if bgColor is set) ──
  let bgRects = '';
  if (effectiveBgColor) {
    const bgC = parseColor(effectiveBgColor);
    const bgAlpha = Math.round((bgC.alpha / 255) * 0.7 * 100) / 100;
    const bgFill = `rgba(${bgC.r},${bgC.g},${bgC.b},${bgAlpha})`;
    const rx = textStyle === 'rounded' || textStyle === 'bubble' ? 12 : 4;

    // Approximate widths per line (rough estimate based on char count)
    for (let i = 0; i < lines.length; i++) {
      const approxLineW = lines[i].length * fontSize * 0.6;
      const rectW = approxLineW + boxPad * 2;
      const rectH = lineHeight + 4;
      const rectY = textBlockY + i * lineHeight - 2;
      let rectX: number;
      switch (textAlign) {
        case 'left':  rectX = textBlockX - boxPad; break;
        case 'right': rectX = textBlockX - approxLineW - boxPad; break;
        default:      rectX = textBlockX - approxLineW / 2 - boxPad; break;
      }
      bgRects += `<rect x="${rectX}" y="${rectY}" width="${rectW}" height="${rectH}" rx="${rx}" fill="${bgFill}" />`;
    }
  }

  // ── Build text elements ──
  let shadowEls = '';
  let textEls = '';
  const fontWeight = (textStyle === 'bold-shadow' || textStyle === 'creator' || textStyle === 'subscribe') ? 'bold' : 'normal';

  for (let i = 0; i < lines.length; i++) {
    const y = textBlockY + i * lineHeight + fontSize; // baseline
    const attrs = `x="${textBlockX}" y="${y}" font-family="${svgFontFamily}" font-size="${fontSize}" font-weight="${fontWeight}" text-anchor="${anchor}"`;

    if (shadowX || shadowY) {
      shadowEls += `<text ${attrs} fill="rgba(0,0,0,0.6)" dx="${shadowX}" dy="${shadowY}">${escSvg(lines[i])}</text>`;
    }

    if (strokeW > 0) {
      textEls += `<text ${attrs} fill="none" stroke="${effectiveFontColor}" stroke-width="${strokeW}" stroke-opacity="0.5">${escSvg(lines[i])}</text>`;
    }

    textEls += `<text ${attrs} fill="${effectiveFontColor}">${escSvg(lines[i])}</text>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${videoWidth}" height="${videoHeight}">
${bgRects}${shadowEls}${textEls}
</svg>`;

  const tmpDir = getTempDir();
  const pngPath = path.join(tmpDir, `overlay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.png`);
  await sharp(Buffer.from(svg)).png().toFile(pngPath);
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
