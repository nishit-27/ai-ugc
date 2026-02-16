import { NextResponse } from 'next/server';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import { config } from '@/lib/config';
import { downloadFile, extractRandomFrames } from '@/lib/serverUtils';
import { uploadImage, getSignedUrlFromPublicUrl } from '@/lib/storage.js';

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

export async function POST(req: Request) {
  let tmpVideoPath: string | null = null;

  try {
    const { videoUrl } = await req.json();
    if (!videoUrl) {
      return NextResponse.json({ error: 'videoUrl is required' }, { status: 400 });
    }

    // Download video to temp
    const tmpDir = os.tmpdir();
    tmpVideoPath = path.join(tmpDir, `extract-${uuidv4()}.mp4`);
    await downloadFile(videoUrl, tmpVideoPath);

    // Extract 10 random frames
    const rawFrames = extractRandomFrames(tmpVideoPath, 10);
    if (rawFrames.length === 0) {
      return NextResponse.json({ error: 'No frames could be extracted' }, { status: 500 });
    }

    // Upload each frame to GCS + get signed URLs
    const uploaded = await Promise.all(
      rawFrames.map(async (frame, i) => {
        const filename = `extracted-frame-${uuidv4()}.jpg`;
        const { url: gcsUrl } = await uploadImage(frame.buffer, filename);
        const signedUrl = await getSignedUrlFromPublicUrl(gcsUrl);
        return { gcsUrl, signedUrl, timestamp: frame.timestamp, buffer: frame.buffer, index: i };
      })
    );

    // Score each frame with OpenAI vision (parallel)
    const scored = await Promise.all(
      uploaded.map(async (frame) => {
        const base64 = frame.buffer.toString('base64');
        let score = 0;
        let hasFace = false;

        try {
          const response = await openai.responses.create({
            model: 'gpt-4o-mini',
            input: [
              {
                role: 'user' as const,
                content: [
                  {
                    type: 'input_image' as const,
                    image_url: `data:image/jpeg;base64,${base64}`,
                    detail: 'low' as const,
                  },
                  {
                    type: 'input_text' as const,
                    text: 'Analyze this image for face quality. Rate the clarity and visibility of any human face on a scale of 0-10, where 0 means no face visible and 10 means a perfectly clear, unobstructed face. Respond with ONLY valid JSON in this exact format: {"score": <number>, "hasFace": <boolean>}',
                  },
                ],
              },
            ],
          });

          const text = response.output_text || '';
          const jsonMatch = text.match(/\{[^}]+\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            score = typeof parsed.score === 'number' ? parsed.score : 0;
            hasFace = !!parsed.hasFace;
          }
        } catch (e) {
          console.error('OpenAI scoring failed for frame', frame.index, e);
        }

        return {
          url: frame.signedUrl,
          gcsUrl: frame.gcsUrl,
          score,
          hasFace,
          timestamp: frame.timestamp,
        };
      })
    );

    // Keep frame at timestamp 0 in the first slot, sort the rest by score descending
    const firstFrame = scored.find(f => f.timestamp === 0);
    const rest = scored.filter(f => f.timestamp !== 0).sort((a, b) => b.score - a.score);
    const sorted = firstFrame ? [firstFrame, ...rest] : scored.sort((a, b) => b.score - a.score);

    return NextResponse.json({ frames: sorted });
  } catch (error: unknown) {
    console.error('Extract frames error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (tmpVideoPath && fs.existsSync(tmpVideoPath)) {
      fs.unlinkSync(tmpVideoPath);
    }
  }
}
