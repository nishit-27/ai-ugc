import { execFileSync } from 'child_process'
import fs from 'fs'
import https from 'https'
import http from 'http'
import os from 'os'
import path from 'path'
import ffmpegPath from 'ffmpeg-static'
import ffprobePath from '@ffprobe-installer/ffprobe'

const FFMPEG = ffmpegPath || 'ffmpeg'
const FFPROBE = (typeof ffprobePath === 'string' ? ffprobePath : (ffprobePath as { path: string }).path) || 'ffprobe'

/** Get MIME content type from a URL by inspecting its extension */
export function getContentType(url: string): string {
  return getContentTypeFromExtension(getExtensionFromUrl(url))
}

/** Map a file extension (e.g. ".png") to a MIME type */
export function getContentTypeFromExtension(ext: string): string {
  const map: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  }
  return map[ext.toLowerCase()] || 'application/octet-stream'
}

/** Extract a file extension from a URL (defaults to ".mp4") */
export function getExtensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const ext = path.extname(pathname).toLowerCase()
    return ext || '.mp4'
  } catch {
    return '.mp4'
  }
}

/** Get video duration in seconds using ffprobe */
export function getVideoDuration(filePath: string): number {
  const output = execFileSync(FFPROBE, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ], { encoding: 'utf-8' })
  return parseFloat(output.trim()) || 0
}

/** Trim a video to maxSeconds using ffmpeg */
export function trimVideo(inputPath: string, outputPath: string, maxSeconds: number): void {
  execFileSync(FFMPEG, [
    '-y',
    '-i', inputPath,
    '-t', String(maxSeconds),
    '-c', 'copy',
    outputPath,
  ])
}

/** Extract random frames from a video file */
export function extractRandomFrames(videoPath: string, count = 10): Array<{ timestamp: number; buffer: Buffer }> {
  const duration = getVideoDuration(videoPath)
  if (duration <= 0) throw new Error('Could not determine video duration')

  const margin = 0.5
  const minTs = Math.min(margin, duration * 0.1)
  const maxTs = Math.max(duration - margin, duration * 0.9)

  const timestamps: number[] = []
  for (let i = 0; i < count; i++) {
    timestamps.push(minTs + Math.random() * (maxTs - minTs))
  }
  timestamps.sort((a, b) => a - b)

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-'))
  const frames: Array<{ timestamp: number; buffer: Buffer }> = []

  try {
    for (const ts of timestamps) {
      const outPath = path.join(tmpDir, `frame-${ts.toFixed(3)}.jpg`)
      execFileSync(FFMPEG, [
        '-ss', String(ts),
        '-i', videoPath,
        '-vframes', '1',
        '-q:v', '2',
        '-y',
        outPath,
      ])
      if (fs.existsSync(outPath)) {
        frames.push({ timestamp: ts, buffer: fs.readFileSync(outPath) })
        fs.unlinkSync(outPath)
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }

  return frames
}

/** Download a file from a URL to a local path */
export function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(destPath)
    client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        fs.unlinkSync(destPath)
        return downloadFile(res.headers.location, destPath).then(resolve, reject)
      }
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        file.close()
        reject(new Error(`Download failed with status ${res.statusCode}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
      file.on('error', (err) => { fs.unlinkSync(destPath); reject(err) })
    }).on('error', (err) => {
      fs.unlinkSync(destPath)
      reject(err)
    })
  })
}
