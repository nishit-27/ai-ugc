// Pure types and helpers shared by CarouselStepConfig and any future
// sub-components. Keep this file free of React imports so it can be
// imported from anywhere without dragging the runtime along.

export type ImageSource = 'model' | 'upload' | 'generate';
export type SceneAction = 'generate' | 'use-as-is' | 'skip';
export type SceneImage = { url: string; filename: string; action: SceneAction };
export type GenResult = { id?: string; url: string; gcsUrl: string };

export const PLATFORM_LIMITS: Record<string, number> = {
  instagram: 10,
  tiktok: 35,
  both: 10,
};

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
