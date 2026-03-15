export type ThemeMode = 'light' | 'dark';

export type ThemeId =
  | 'light-forest'
  | 'dark-moss'
  | 'garden-dawn'
  | 'night-garden'
  | 'botanical-classic';

export interface ThemePalette {
  primary: string;
  accent: string;
  background: string;
  surface: string;
  card: string;
  text: string;
  muted: string;
  border: string;
}

export interface ThemeShadcnTokens {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  input: string;
  ring: string;
  destructive: string;
  destructiveForeground: string;
}

export interface AppTheme {
  id: ThemeId;
  name: string;
  mood: string;
  mode: ThemeMode;
  palette: ThemePalette;
  previewSwatches: string[];
}

function getDestructiveHex(mode: ThemeMode): string {
  return mode === 'dark' ? '#FF7A90' : '#D92D4C';
}

// Значения по умолчанию из задачи.
export const DEFAULT_THEME_ID: ThemeId = 'dark-moss';

const BASE_THEMES: Record<ThemeId, AppTheme> = {
  'light-forest': {
    id: 'light-forest',
    name: 'Light Forest',
    mood: 'Утренний лес, свежесть и чистота после дождя',
    mode: 'light',
    palette: {
      primary: '#4CAF50',
      accent: '#81C784',
      background: '#F7FAF6',
      surface: '#FFFFFF',
      card: '#E8F5E9',
      text: '#183A1D',
      muted: '#6B7D6D',
      border: '#DCE8DC'
    },
    previewSwatches: ['#4CAF50', '#81C784', '#F7FAF6', '#E8F5E9', '#183A1D']
  },
  'dark-moss': {
    id: 'dark-moss',
    name: 'Dark Moss',
    mood: 'Вечерняя оранжерея, влажный мох и тёплая темнота',
    mode: 'dark',
    palette: {
      primary: '#2E7D32',
      accent: '#66BB6A',
      background: '#0F1511',
      surface: '#18201A',
      card: '#1F2A22',
      text: '#E7F4E8',
      muted: '#A7B7AA',
      border: '#2B3A2E'
    },
    previewSwatches: ['#2E7D32', '#66BB6A', '#0F1511', '#1F2A22', '#E7F4E8']
  },
  'garden-dawn': {
    id: 'garden-dawn',
    name: 'Garden Dawn',
    mood: 'Тёплый рассвет, мягкое солнце и цветущий сад',
    mode: 'light',
    palette: {
      primary: '#66BB6A',
      accent: '#F6C453',
      background: '#FFF8EC',
      surface: '#FFFDF8',
      card: '#FBECCF',
      text: '#355E2B',
      muted: '#8D8A73',
      border: '#F0DFC0'
    },
    previewSwatches: ['#66BB6A', '#F6C453', '#FFF8EC', '#FBECCF', '#355E2B']
  },
  'night-garden': {
    id: 'night-garden',
    name: 'Night Garden',
    mood: 'Ночной сад, лунный свет и глубокие сине-зелёные тона',
    mode: 'dark',
    palette: {
      primary: '#3E8F52',
      accent: '#A9D8B3',
      background: '#0D1620',
      surface: '#162230',
      card: '#1A2B24',
      text: '#E3F0EC',
      muted: '#9DB2B0',
      border: '#243646'
    },
    previewSwatches: ['#3E8F52', '#A9D8B3', '#0D1620', '#1A2B24', '#E3F0EC']
  },
  'botanical-classic': {
    id: 'botanical-classic',
    name: 'Botanical Classic',
    mood: 'Ботаническая книга, бумага и травяные оттенки',
    mode: 'light',
    palette: {
      primary: '#4E7A46',
      accent: '#8AA05A',
      background: '#F6F4EE',
      surface: '#FFFEFA',
      card: '#ECE7DA',
      text: '#2F3A2A',
      muted: '#6F7468',
      border: '#DDD6C8'
    },
    previewSwatches: ['#4E7A46', '#8AA05A', '#F6F4EE', '#ECE7DA', '#2F3A2A']
  }
};

export const APP_THEMES: AppTheme[] = [
  BASE_THEMES['light-forest'],
  BASE_THEMES['dark-moss'],
  BASE_THEMES['garden-dawn'],
  BASE_THEMES['night-garden'],
  BASE_THEMES['botanical-classic']
];

export function getThemeById(themeId: ThemeId): AppTheme {
  return BASE_THEMES[themeId] ?? BASE_THEMES[DEFAULT_THEME_ID];
}

export function getDefaultTheme(): AppTheme {
  return getThemeById(DEFAULT_THEME_ID);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '').trim();
  if (normalized.length !== 6) {
    throw new Error(`Ожидается HEX в формате #RRGGBB, получено: ${hex}`);
  }

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return { r, g, b };
}

function rgbToHslChannels(r: number, g: number, b: number): string {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rNorm) h = ((gNorm - bNorm) / delta) % 6;
    else if (max === gNorm) h = (bNorm - rNorm) / delta + 2;
    else h = (rNorm - gNorm) / delta + 4;
  }
  h = Math.round((h * 60 + 360) % 360);

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return `${h} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function hexToHslChannels(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHslChannels(r, g, b);
}

function hexToRgbChannels(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

function pickContrastForegroundHex(backgroundHex: string): string {
  const { r, g, b } = hexToRgb(backgroundHex);
  const srgb = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];

  // Нейтральные foreground-цвета для высокой читабельности.
  return luminance > 0.45 ? '#102114' : '#F4FBF5';
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const [rLin, gLin, bLin] = [r, g, b].map((value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

function contrastRatio(foregroundHex: string, backgroundHex: string): number {
  const l1 = relativeLuminance(foregroundHex);
  const l2 = relativeLuminance(backgroundHex);
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

function blendHex(baseHex: string, targetHex: string, weight: number): string {
  const safeWeight = Math.max(0, Math.min(1, weight));
  const base = hexToRgb(baseHex);
  const target = hexToRgb(targetHex);
  const mixChannel = (baseChannel: number, targetChannel: number) =>
    Math.round(baseChannel * (1 - safeWeight) + targetChannel * safeWeight);

  const r = mixChannel(base.r, target.r);
  const g = mixChannel(base.g, target.g);
  const b = mixChannel(base.b, target.b);

  return `#${[r, g, b]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

function ensureMinContrastHex(
  foregroundHex: string,
  backgroundHex: string,
  anchorHex: string,
  minRatio: number
): string {
  if (contrastRatio(foregroundHex, backgroundHex) >= minRatio) {
    return foregroundHex;
  }

  // Плавно тянем muted-цвет к основному text-цвету до достижения минимального контраста.
  for (let step = 1; step <= 10; step += 1) {
    const candidate = blendHex(foregroundHex, anchorHex, step / 10);
    if (contrastRatio(candidate, backgroundHex) >= minRatio) {
      return candidate;
    }
  }

  // Последний fallback на текстовый цвет.
  return anchorHex;
}

export function getShadcnTokens(theme: AppTheme): ThemeShadcnTokens {
  const { palette } = theme;
  const primaryForeground = pickContrastForegroundHex(palette.primary);
  const accentForeground = pickContrastForegroundHex(palette.accent);
  const secondaryForeground = pickContrastForegroundHex(palette.surface);
  const mutedForeground = ensureMinContrastHex(palette.muted, palette.surface, palette.text, 5.2);
  const destructive = getDestructiveHex(theme.mode);
  const destructiveForeground = pickContrastForegroundHex(destructive);

  return {
    background: hexToHslChannels(palette.background),
    foreground: hexToHslChannels(palette.text),
    card: hexToHslChannels(palette.card),
    cardForeground: hexToHslChannels(palette.text),
    primary: hexToHslChannels(palette.primary),
    primaryForeground: hexToHslChannels(primaryForeground),
    secondary: hexToHslChannels(palette.surface),
    secondaryForeground: hexToHslChannels(secondaryForeground),
    muted: hexToHslChannels(palette.surface),
    mutedForeground: hexToHslChannels(mutedForeground),
    accent: hexToHslChannels(palette.accent),
    accentForeground: hexToHslChannels(accentForeground),
    border: hexToHslChannels(palette.border),
    input: hexToHslChannels(palette.border),
    ring: hexToHslChannels(palette.primary),
    destructive: hexToHslChannels(destructive),
    destructiveForeground: hexToHslChannels(destructiveForeground)
  };
}

// Набор CSS custom properties, который понадобится на T4 при глобальном применении темы.
export function getThemeCssVariables(theme: AppTheme): Record<string, string> {
  const shadcn = getShadcnTokens(theme);
  const { palette } = theme;
  const accessibleMuted = ensureMinContrastHex(palette.muted, palette.surface, palette.text, 5.2);

  return {
    '--background': shadcn.background,
    '--foreground': shadcn.foreground,
    '--card': shadcn.card,
    '--card-foreground': shadcn.cardForeground,
    '--primary': shadcn.primary,
    '--primary-foreground': shadcn.primaryForeground,
    '--secondary': shadcn.secondary,
    '--secondary-foreground': shadcn.secondaryForeground,
    '--muted': shadcn.muted,
    '--muted-foreground': shadcn.mutedForeground,
    '--accent': shadcn.accent,
    '--accent-foreground': shadcn.accentForeground,
    '--border': shadcn.border,
    '--input': shadcn.input,
    '--ring': shadcn.ring,
    '--destructive': shadcn.destructive,
    '--destructive-foreground': shadcn.destructiveForeground,

    // Совместимость с текущими ios-* токенами в проекте.
    '--ios-bg': hexToRgbChannels(palette.background),
    '--ios-card': hexToRgbChannels(palette.surface),
    '--ios-text': hexToRgbChannels(palette.text),
    '--ios-subtext': hexToRgbChannels(accessibleMuted),
    '--ios-border': hexToRgbChannels(palette.border),
    '--ios-accent': palette.primary,
    '--ios-bg-color': palette.background,
    '--ios-card-color': palette.surface,
    '--ios-text-color': palette.text,
    '--ios-subtext-color': accessibleMuted
  };
}
