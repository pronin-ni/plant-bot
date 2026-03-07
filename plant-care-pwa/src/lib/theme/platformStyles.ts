import type { PlatformKind } from '@/lib/theme/platformDetect';

export interface PlatformThemeTokens {
  accent: string;
  radiusCard: string;
  radiusButton: string;
  blur: string;
}

export const iosTheme: PlatformThemeTokens = {
  accent: '#34C759',
  radiusCard: '24px',
  radiusButton: '20px',
  blur: '24px'
};

export const androidTheme: PlatformThemeTokens = {
  accent: '#4CAF50',
  radiusCard: '20px',
  radiusButton: '18px',
  blur: '8px'
};

export function getPlatformTheme(platform: PlatformKind): PlatformThemeTokens {
  if (platform === 'android') {
    return androidTheme;
  }
  return iosTheme;
}

