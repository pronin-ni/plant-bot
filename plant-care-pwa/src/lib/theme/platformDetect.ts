export type PlatformKind = 'ios' | 'android' | 'web';

export interface PlatformInfo {
  isIOS: boolean;
  isAndroid: boolean;
  isPWA: boolean;
  platform: PlatformKind;
}

declare global {
  interface Window {
    MSStream?: unknown;
  }
}

export function detectPlatform(): PlatformInfo {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIPadDesktopMode = typeof navigator !== 'undefined'
    && navigator.platform === 'MacIntel'
    && navigator.maxTouchPoints > 1;
  // Базовые правила определения платформы из требований.
  const isIOS = (/iPad|iPhone|iPod/.test(ua) || isIPadDesktopMode) && !window.MSStream;
  const isAndroid = /Android/.test(ua);
  const isPWA = typeof window !== 'undefined'
    && window.matchMedia?.('(display-mode: standalone)').matches;

  return {
    isIOS,
    isAndroid,
    isPWA,
    platform: isIOS ? 'ios' : isAndroid ? 'android' : 'web'
  };
}

export function applyPlatformClasses(target: HTMLElement = document.documentElement): PlatformInfo {
  const info = detectPlatform();
  target.classList.remove('ios', 'android', 'web', 'pwa');
  target.classList.add(info.platform);
  if (info.isPWA) {
    target.classList.add('pwa');
  }
  return info;
}
