import { GoogleGenAI } from '@google/genai';
import { config } from './config';

const GEMINI_MODELS = {
  'gemini-2.5-flash': 'gemini-2.5-flash-preview-image-generation',
  'gemini-2.0-flash': 'gemini-2.0-flash-exp-image-generation',
  'gemini-2.5-flash-image': 'gemini-2.5-flash-image',
  'gemini-3-pro': 'gemini-3-pro-image-preview',
} as const;

export type GeminiImageModel = keyof typeof GEMINI_MODELS;

const DEFAULT_MODEL: GeminiImageModel = 'gemini-2.5-flash-image';

function getClient() {
  const apiKey = config.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  return new GoogleGenAI({ apiKey });
}

/**
 * Generate an image from text prompt using Gemini.
 * Returns base64 PNG buffer.
 */
export async function generateImageFromPrompt(opts: {
  prompt: string;
  aspectRatio?: string;
  model?: GeminiImageModel;
}): Promise<Buffer> {
  const ai = getClient();
  const modelId = GEMINI_MODELS[opts.model || DEFAULT_MODEL];

  const response = await ai.models.generateContent({
    model: modelId,
    contents: opts.prompt,
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
      ],
    } as Parameters<typeof ai.models.generateContent>[0]['config'],
  });

  const imagePart = response.candidates?.[0]?.content?.parts?.find(
    (p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData?.data,
  );
  if (!imagePart?.inlineData?.data) {
    throw new Error('Gemini returned no image data');
  }

  return Buffer.from(imagePart.inlineData.data, 'base64');
}

/**
 * Generate image using Gemini with reference images (face swap / edit).
 * Takes model face image + scene image and generates a composite.
 */
export async function generateImageWithReferences(opts: {
  prompt: string;
  referenceImages: { data: Buffer; mimeType: string }[];
  aspectRatio?: string;
  model?: GeminiImageModel;
}): Promise<Buffer> {
  const ai = getClient();
  const modelId = GEMINI_MODELS[opts.model || DEFAULT_MODEL];

  const contents: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

  // Add reference images first
  for (const img of opts.referenceImages) {
    contents.push({
      inlineData: {
        data: img.data.toString('base64'),
        mimeType: img.mimeType,
      },
    });
  }

  // Add the prompt
  contents.push({ text: opts.prompt });

  const response = await ai.models.generateContent({
    model: modelId,
    contents,
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
      ],
    } as Parameters<typeof ai.models.generateContent>[0]['config'],
  });

  const imagePart = response.candidates?.[0]?.content?.parts?.find(
    (p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData?.data,
  );
  if (!imagePart?.inlineData?.data) {
    throw new Error('Gemini returned no image data');
  }

  return Buffer.from(imagePart.inlineData.data, 'base64');
}
