import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { TextOverlayConfig, BgMusicConfig } from '@/types';

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
 * Burn text onto a video using ffmpeg drawtext filter.
 */
export function addTextOverlay(
  inputPath: string,
  outputPath: string,
  config: TextOverlayConfig
): void {
  const {
    text, position, fontSize = 48, fontColor = '#FFFFFF', bgColor,
    paddingLeft = 0, paddingRight = 0,
    wordsPerLine,
    startTime, duration,
  } = config;

  // Word-wrap text. ffmpeg drawtext has no auto-wrap, so we insert newlines manually.
  let wrappedText = text;

  // First: wrap by word count if set
  if (wordsPerLine && wordsPerLine > 0) {
    wrappedText = wrapByWordCount(wrappedText, wordsPerLine);
  }

  // Then: further wrap by character width based on margins
  // Default ~90px each side (matches 75% maxWidth in preview for 720px video)
  const effectiveLeft = paddingLeft > 0 ? paddingLeft : 90;
  const effectiveRight = paddingRight > 0 ? paddingRight : 90;
  {
    const videoWidth = 720;
    const availableWidth = videoWidth - effectiveLeft - effectiveRight;
    const charWidth = fontSize * 0.55;
    const maxCharsPerLine = Math.max(5, Math.floor(availableWidth / charWidth));
    wrappedText = wrapText(wrappedText, maxCharsPerLine);
  }

  // Horizontal offset if left/right margins differ
  const hOffset = (paddingLeft - paddingRight) / 2;
  const xExpr = hOffset === 0
    ? '(w-text_w)/2'
    : `(w-text_w)/2+${hOffset}`;

  // Vertical position
  let yExpr: string;
  switch (position) {
    case 'top':
      yExpr = '50';
      break;
    case 'center':
      yExpr = '(h-text_h)/2';
      break;
    case 'bottom':
    default:
      yExpr = 'h-text_h-50';
      break;
  }

  // Escape text for ffmpeg drawtext (escape single quotes and backslashes)
  const escapedText = wrappedText.replace(/\\/g, '\\\\').replace(/'/g, "'\\''").replace(/:/g, '\\:');

  let filter = `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${fontColor}:x=${xExpr}:y=${yExpr}`;

  if (bgColor) {
    filter += `:box=1:boxcolor=${bgColor}@0.7:boxborderw=10`;
  }

  // Time-based enable
  if (startTime !== undefined || duration !== undefined) {
    const start = startTime || 0;
    if (duration !== undefined) {
      filter += `:enable='between(t,${start},${start + duration})'`;
    } else {
      filter += `:enable='gte(t,${start})'`;
    }
  }

  execFileSync('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-vf', filter,
    '-c:a', 'copy',
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
    const output = execFileSync('ffprobe', [
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
    const probeOut = execFileSync('ffprobe', [
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
    execFileSync('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-i', audioPath,
      '-filter_complex', `${audioFilter};[0:a][a1]amix=inputs=2:duration=first`,
      '-c:v', 'copy',
      outputPath,
    ]);
  } else {
    // No existing audio — just use the music track
    execFileSync('ffmpeg', [
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
    const probe = execFileSync('ffprobe', [
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
      const audioProbe = execFileSync('ffprobe', [
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
      filters.push(`anullsrc=r=44100:cl=stereo[a${i}]`);
    }

    concatInputs.push(`[v${i}][a${i}]`);
  }

  filters.push(`${concatInputs.join('')}concat=n=${n}:v=1:a=1[vout][aout]`);

  execFileSync('ffmpeg', [
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
