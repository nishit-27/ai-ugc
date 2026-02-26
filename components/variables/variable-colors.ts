export const COLOR_MAP: Record<string, string> = {
  '#2563eb': 'bg-blue-600',
  '#059669': 'bg-emerald-600',
  '#ea580c': 'bg-orange-600',
  '#dc2626': 'bg-red-600',
  '#d97706': 'bg-amber-600',
  '#db2777': 'bg-pink-600',
  '#0891b2': 'bg-cyan-600',
  '#0d9488': 'bg-teal-600',
};

export const COLOR_TEXT_MAP: Record<string, string> = {
  '#2563eb': 'text-blue-600',
  '#059669': 'text-emerald-600',
  '#ea580c': 'text-orange-600',
  '#dc2626': 'text-red-600',
  '#d97706': 'text-amber-600',
  '#db2777': 'text-pink-600',
  '#0891b2': 'text-cyan-600',
  '#0d9488': 'text-teal-600',
};

export const COLOR_LIGHT_MAP: Record<string, string> = {
  '#2563eb': 'bg-blue-100 dark:bg-blue-950/30',
  '#059669': 'bg-emerald-100 dark:bg-emerald-950/30',
  '#ea580c': 'bg-orange-100 dark:bg-orange-950/30',
  '#dc2626': 'bg-red-100 dark:bg-red-950/30',
  '#d97706': 'bg-amber-100 dark:bg-amber-950/30',
  '#db2777': 'bg-pink-100 dark:bg-pink-950/30',
  '#0891b2': 'bg-cyan-100 dark:bg-cyan-950/30',
  '#0d9488': 'bg-teal-100 dark:bg-teal-950/30',
};

export const COLORS = Object.keys(COLOR_MAP);

export function getColorClass(hex: string | null | undefined): string {
  return COLOR_MAP[hex || ''] || 'bg-gray-400';
}

export function getColorTextClass(hex: string | null | undefined): string {
  return COLOR_TEXT_MAP[hex || ''] || 'text-gray-500';
}

export function getColorLightClass(hex: string | null | undefined): string {
  return COLOR_LIGHT_MAP[hex || ''] || 'bg-gray-100 dark:bg-gray-900/30';
}
