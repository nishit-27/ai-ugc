function getAppUrl(): string | undefined {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return undefined;
}

export function getFalWebhookUrl(): string | undefined {
  const appUrl = getAppUrl();
  if (!appUrl) return undefined;
  return `${appUrl}/api/fal-webhook`;
}

export const config = {
  APP_URL: getAppUrl(),
  FAL_KEY: process.env.FAL_KEY,
  RAPIDAPI_KEY: process.env.RAPIDAPI_KEY,
  LATE_API_KEY: process.env.LATE_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  LATE_API_URL: 'https://getlate.dev/api/v1',
  TIKTOK_ACCOUNT_ID: process.env.TIKTOK_ACCOUNT_ID,
  DATABASE_URL: process.env.DATABASE_URL,
  GCS_BUCKET_NAME: process.env.GCS_BUCKET_NAME || 'runable-ai-ugc',
  defaultMaxSeconds: parseInt(process.env.MAX_VIDEO_SECONDS || '10', 10),
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
  prompt: `Replace the person in the input video with the person from the provided reference image, preserving the exact facial identity from the image.

The final video must retain the original video's motion, timing, camera movement, lighting behavior, and background realism. The subject should move naturally and remain perfectly aligned with the original body motion, pose, and gestures from the video.

Facial identity transfer only:
Use the reference image strictly for facial structure, skin texture, proportions, and identity. Do not stylize, beautify, or alter the face. No face reshaping, no AI smoothing, no plastic skin.

The replaced subject must appear fully integrated into the scene — correct scale, correct head position, realistic shadows, consistent lighting, and natural motion blur. Skin texture must remain realistic with visible pores and natural imperfections.

Maintain photorealism at all times. The result must look like a real person recorded on a smartphone, not an AI-generated video.

Preserve the original clothing from the video exactly, including fabric behavior, folds, and movement.

Preserve the original video background, environment, lighting, and depth exactly.`,

  veoPrompt: `Create a natural, lifelike video from the reference image at 30fps, adding subtle, context-appropriate motion that authentically continues or completes the implied action of the subject's current pose while obeying physics—include organic breathing rhythm, micro-expressions, natural eye movements and blinks, gentle weight shifts or gesture completions, realistic motion blur, slight handheld camera shake, and mobile phone camera grain/noise to achieve a raw, spontaneous, impromptu aesthetic that looks like a candid video clip captured on a smartphone, ensuring all movement feels unforced, spontaneous, and perfectly matched to the energy and context of the original pose with environmental interactions like gravity effects on hair and clothing. Audio: refreshing upbeat lo-fi beats.`,

  veoSettings: {
    aspectRatio: '9:16' as const,
    duration: '4s' as const,
    resolution: '720p' as const,
    generateAudio: true,
    negativePrompt: 'character talking, mouth moving, speaking',
  },
};

export type Job = {
  id: string;
  tiktokUrl: string;
  imageUrl: string;
  imageName?: string; // For backwards compatibility
  customPrompt?: string;
  maxSeconds: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  step: string;
  outputUrl?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
};
