import type { CSSProperties } from 'react';

export type TextStyleDef = {
  id: string;
  name: string;
  css: CSSProperties;
};

export const TEXT_STYLES: TextStyleDef[] = [
  { id: 'plain', name: 'Plain', css: { fontWeight: 'bold' } },
  { id: 'bold-shadow', name: 'Bold', css: { fontWeight: '900', textShadow: '2px 2px 0 rgba(0,0,0,0.6)' } },
  { id: 'creator', name: 'CREATOR', css: { fontWeight: '900', letterSpacing: '0.12em', textTransform: 'uppercase' as const } },
  { id: 'text-box', name: 'Text Box', css: { fontWeight: 'bold', backgroundColor: '#fff', color: '#000', padding: '3px 10px', borderRadius: '4px' } },
  { id: 'bubble', name: 'Bubble', css: { fontWeight: 'bold', backgroundColor: '#ff3b30', color: '#fff', padding: '4px 14px', borderRadius: '20px' } },
  { id: 'neon', name: 'Neon', css: { fontWeight: 'bold', color: '#ff00ff', textShadow: '0 0 7px #ff00ff, 0 0 14px #ff00ff' } },
  { id: 'tag', name: 'Tag', css: { fontWeight: 'bold', backgroundColor: '#ffcc00', color: '#000', padding: '3px 10px' } },
  { id: 'subscribe', name: 'SUBSCRIBE', css: { fontWeight: 'bold', backgroundColor: '#ff0000', color: '#fff', padding: '5px 14px', borderRadius: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' } },
  { id: 'retro', name: 'Retro', css: { fontWeight: 'bold', color: '#ff6b35', textShadow: '3px 3px 0 #004e89', fontFamily: 'Impact, sans-serif' } },
  { id: 'classic', name: 'Classic', css: { fontWeight: 'bold', fontStyle: 'italic', textShadow: '2px 2px 4px rgba(0,0,0,0.5)', fontFamily: 'Georgia, serif' } },
  { id: 'caption', name: 'Caption', css: { fontWeight: 'bold', backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff', padding: '4px 12px', borderRadius: '6px' } },
  { id: 'rounded', name: 'Rounded', css: { fontWeight: 'bold', backgroundColor: '#8b5cf6', color: '#fff', padding: '5px 16px', borderRadius: '24px' } },
];

export const FONTS = [
  { name: 'Sans', family: 'sans-serif' },
  { name: 'Impact', family: 'Impact, sans-serif' },
  { name: 'Georgia', family: 'Georgia, serif' },
  { name: 'Courier', family: 'Courier New, monospace' },
  { name: 'Arial Black', family: 'Arial Black, sans-serif' },
  { name: 'Times', family: 'Times New Roman, serif' },
  { name: 'Trebuchet', family: 'Trebuchet MS, sans-serif' },
  { name: 'Verdana', family: 'Verdana, sans-serif' },
  { name: 'Montserrat', family: 'Montserrat, sans-serif' },
  { name: 'Poppins', family: 'Poppins, sans-serif' },
  { name: 'Bebas Neue', family: 'Bebas Neue, sans-serif' },
  { name: 'Oswald', family: 'Oswald, sans-serif' },
  { name: 'Playfair', family: 'Playfair Display, serif' },
  { name: 'Roboto', family: 'Roboto, sans-serif' },
  { name: 'Raleway', family: 'Raleway, sans-serif' },
];
