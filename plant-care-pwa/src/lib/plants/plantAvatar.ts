import type { PlantDto } from '@/types/api';

type AvatarMotif = 'leaf' | 'sprout' | 'flower' | 'cactus' | 'herb';

interface AvatarPalette {
  base: string;
  glow: string;
  accent: string;
  ink: string;
  veil: string;
}

export interface PlantAvatarDescriptor {
  seed: number;
  motif: AvatarMotif;
  palette: AvatarPalette;
  initial: string;
  rotation: number;
  stripeOffset: number;
  dotOffset: number;
}

const PALETTES: AvatarPalette[] = [
  {
    base: '#DDEFD9',
    glow: '#F5FBF3',
    accent: '#4E8E63',
    ink: '#214A31',
    veil: '#F2F8EE'
  },
  {
    base: '#E6F1E0',
    glow: '#FCF8EC',
    accent: '#5E8B4A',
    ink: '#284232',
    veil: '#F5FAF0'
  },
  {
    base: '#E1EEE7',
    glow: '#F6FBF8',
    accent: '#3E8C7B',
    ink: '#22463E',
    veil: '#EFF7F2'
  },
  {
    base: '#EAE7D7',
    glow: '#FBF8EE',
    accent: '#7A8C48',
    ink: '#3F4525',
    veil: '#F6F2E3'
  },
  {
    base: '#E5E4D6',
    glow: '#F7F5EE',
    accent: '#6A7C59',
    ink: '#38412E',
    veil: '#F1F0E6'
  }
];

function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function sanitizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ');
}

function pickInitial(name: string): string {
  const match = sanitizeName(name).match(/[\p{L}\p{N}]/u);
  return (match?.[0] ?? '?').toUpperCase();
}

function pickMotif(seed: number, plant?: Pick<PlantDto, 'category' | 'placement'>): AvatarMotif {
  if (plant?.category === 'OUTDOOR_GARDEN') return 'herb';
  if (plant?.category === 'OUTDOOR_DECORATIVE') return seed % 2 === 0 ? 'flower' : 'leaf';
  if (plant?.placement === 'OUTDOOR') return 'cactus';
  return (['leaf', 'sprout', 'flower', 'cactus', 'herb'] as const)[seed % 5];
}

export function getPlantAvatarDescriptor(
  name: string,
  plant?: Pick<PlantDto, 'category' | 'placement'>
): PlantAvatarDescriptor {
  const normalized = sanitizeName(name);
  const seed = hashString(`${normalized}::${plant?.category ?? ''}::${plant?.placement ?? ''}`);
  const palette = PALETTES[seed % PALETTES.length];

  return {
    seed,
    motif: pickMotif(seed, plant),
    palette,
    initial: pickInitial(normalized),
    rotation: (seed % 18) - 9,
    stripeOffset: 18 + (seed % 12),
    dotOffset: 24 + (seed % 18)
  };
}
