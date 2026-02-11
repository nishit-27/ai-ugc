import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
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
 * Burn text onto a video using ffmpeg drawtext filters.
 * Each line is a separate drawtext filter to support left/center/right alignment.
 * Uses textfile= for each line to avoid escaping issues with complex text.
 */
export function addTextOverlay(
  inputPath: string,
  outputPath: string,
  config: TextOverlayConfig
): void {
  const {
    text, position, textAlign = 'center', fontSize = 48, fontColor = '#FFFFFF', bgColor,
    fontFamily, textStyle,
    paddingLeft = 0, paddingRight = 0,
    customX, customY,
    wordsPerLine,
    startTime, duration,
  } = config;

  // ── Word-wrap (mutually exclusive modes) ──
  let wrappedText = text;
  const effectiveLeft = paddingLeft > 0 ? paddingLeft : 90;
  const effectiveRight = paddingRight > 0 ? paddingRight : 90;

  if (wordsPerLine && wordsPerLine > 0) {
    wrappedText = wrapByWordCount(wrappedText, wordsPerLine);
  } else {
    const videoWidth = 720;
    const availableWidth = videoWidth - effectiveLeft - effectiveRight;
    const charWidth = fontSize * 0.55;
    const maxCharsPerLine = Math.max(5, Math.floor(availableWidth / charWidth));
    wrappedText = wrapText(wrappedText, maxCharsPerLine);
  }

  const lines = wrappedText.split('\n');
  const lineHeight = Math.round(fontSize * 1.3);
  const totalHeight = lines.length * lineHeight;

  // ── Resolve font file ──
  const fontFile = resolveFontFile(fontFamily);

  // ── Style preset → FFmpeg properties ──
  let shadowX = 0, shadowY = 0, borderW = 0;
  let effectiveBgColor = bgColor;
  let effectiveFontColor = fontColor;
  let boxBorderW = 10;
  let boxBorderRadius = 0; // FFmpeg doesn't support border-radius, but we adjust padding

  if (textStyle) {
    switch (textStyle) {
      case 'bold-shadow':
        shadowX = 2; shadowY = 2;
        break;
      case 'creator':
        // Uppercase is applied in text processing below
        break;
      case 'text-box':
        effectiveBgColor = effectiveBgColor || '#FFFFFF';
        effectiveFontColor = '#000000';
        boxBorderW = 10;
        break;
      case 'bubble':
        effectiveBgColor = effectiveBgColor || '#ff3b30';
        effectiveFontColor = '#FFFFFF';
        boxBorderW = 14;
        break;
      case 'neon':
        effectiveFontColor = '#ff00ff';
        borderW = 2;
        break;
      case 'tag':
        effectiveBgColor = effectiveBgColor || '#ffcc00';
        effectiveFontColor = '#000000';
        boxBorderW = 10;
        break;
      case 'subscribe':
        effectiveBgColor = effectiveBgColor || '#ff0000';
        effectiveFontColor = '#FFFFFF';
        boxBorderW = 14;
        break;
      case 'retro':
        effectiveFontColor = '#ff6b35';
        shadowX = 3; shadowY = 3;
        break;
      case 'classic':
        shadowX = 2; shadowY = 2;
        break;
      case 'caption':
        effectiveBgColor = effectiveBgColor || '#000000';
        effectiveFontColor = '#FFFFFF';
        boxBorderW = 12;
        break;
      case 'rounded':
        effectiveBgColor = effectiveBgColor || '#8b5cf6';
        effectiveFontColor = '#FFFFFF';
        boxBorderW = 16;
        break;
    }
  }

  // ── Apply uppercase for 'creator' and 'subscribe' styles ──
  if (textStyle === 'creator' || textStyle === 'subscribe') {
    lines.forEach((line, i) => { lines[i] = line.toUpperCase(); });
  }

  // ── X expression per alignment ──
  const hOffset = (paddingLeft - paddingRight) / 2;
  function getXExpr(): string {
    if (position === 'custom' && customX !== undefined) {
      switch (textAlign) {
        case 'left':  return `w*${customX}/100`;
        case 'right': return `w*${customX}/100-text_w`;
        default:      return `w*${customX}/100-text_w/2`;
      }
    }
    switch (textAlign) {
      case 'left':  return `${effectiveLeft}`;
      case 'right': return `w-text_w-${effectiveRight}`;
      default:      return hOffset === 0 ? '(w-text_w)/2' : `(w-text_w)/2+${hOffset}`;
    }
  }

  // ── Base Y expression (top of text block) ──
  function getBaseY(): string {
    if (position === 'custom' && customY !== undefined) {
      return `h*${customY}/100-${Math.round(totalHeight / 2)}`;
    }
    switch (position) {
      case 'top':    return '50';
      case 'center': return `(h-${totalHeight})/2`;
      case 'bottom': return `h-${totalHeight}-50`;
      default:       return `h-${totalHeight}-50`;
    }
  }

  const xExpr = getXExpr();
  const baseYExpr = getBaseY();

  // ── Enable expression for timing ──
  let enableExpr = '';
  if (startTime !== undefined || duration !== undefined) {
    const start = startTime || 0;
    if (duration !== undefined) {
      enableExpr = `:enable='between(t,${start},${start + duration})'`;
    } else {
      enableExpr = `:enable='gte(t,${start})'`;
    }
  }

  // ── Write each line to a temp text file (avoids all escaping headaches) ──
  const tempDir = getTempDir();
  const textFiles: string[] = [];

  const filters = lines.map((line, i) => {
    const textFile = path.join(tempDir, `drawtext-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}.txt`);
    fs.writeFileSync(textFile, line, 'utf-8');
    textFiles.push(textFile);

    const escapedPath = textFile.replace(/:/g, '\\:').replace(/'/g, "\\'");
    const yExpr = i === 0 ? baseYExpr : `${baseYExpr}+${i * lineHeight}`;

    let f = `drawtext=textfile='${escapedPath}'` +
      `:fontsize=${fontSize}` +
      `:fontcolor=${effectiveFontColor}` +
      `:x=${xExpr}` +
      `:y=${yExpr}`;

    // Font file
    if (fontFile) {
      const escapedFont = fontFile.replace(/:/g, '\\:').replace(/'/g, "\\'");
      f += `:fontfile='${escapedFont}'`;
    }

    // Shadow (drawtext uses shadowx/shadowy)
    if (shadowX || shadowY) {
      f += `:shadowcolor=black@0.6:shadowx=${shadowX}:shadowy=${shadowY}`;
    }

    // Border / outline (simulates glow or outline)
    if (borderW > 0) {
      f += `:borderw=${borderW}:bordercolor=${effectiveFontColor}@0.5`;
    }

    // Background box
    if (effectiveBgColor) {
      f += `:box=1:boxcolor=${effectiveBgColor}@0.7:boxborderw=${boxBorderW}`;
    }

    f += enableExpr;
    return f;
  });

  try {
    execFileSync(FFMPEG, [
      '-y',
      '-i', inputPath,
      '-vf', filters.join(','),
      '-c:a', 'copy',
      outputPath,
    ]);
  } finally {
    // Clean up temp text files
    for (const f of textFiles) {
      try { fs.unlinkSync(f); } catch {}
    }
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
