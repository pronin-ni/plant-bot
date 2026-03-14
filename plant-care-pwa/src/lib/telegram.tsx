import { useEffect, useMemo, useState, type ReactNode } from 'react';

interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: {
    user?: {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
  };
  colorScheme?: 'light' | 'dark';
  themeParams?: Record<string, string>;
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (color: string) => void;
  onEvent?: (eventType: string, callback: () => void) => void;
  offEvent?: (eventType: string, callback: () => void) => void;
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    selectionChanged: () => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

export function getTelegramInitData(): string {
  return getTelegramWebApp()?.initData ?? '';
}

function canUseBrowserVibration(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false;
  }

  const userActivation = navigator.userActivation;
  if (userActivation && !userActivation.isActive) {
    return false;
  }

  return true;
}

export function applyTelegramThemeParams() {
  const webApp = getTelegramWebApp();
  const themeParams = webApp?.themeParams;
  if (!themeParams) {
    return;
  }

  const root = document.documentElement;
  if (themeParams.bg_color) {
    root.style.setProperty('--tg-theme-bg-color', themeParams.bg_color);
    root.style.setProperty('--ios-bg-color', themeParams.bg_color);
    const bgTriplet = hexToRgbTriplet(themeParams.bg_color);
    if (bgTriplet) {
      root.style.setProperty('--ios-bg', bgTriplet);
    }
  }
  if (themeParams.text_color) {
    root.style.setProperty('--tg-theme-text-color', themeParams.text_color);
    root.style.setProperty('--ios-text-color', themeParams.text_color);
    const textTriplet = hexToRgbTriplet(themeParams.text_color);
    if (textTriplet) {
      root.style.setProperty('--ios-text', textTriplet);
    }
  }
  if (themeParams.hint_color) {
    root.style.setProperty('--tg-theme-hint-color', themeParams.hint_color);
    root.style.setProperty('--ios-subtext-color', themeParams.hint_color);
    const hintTriplet = hexToRgbTriplet(themeParams.hint_color);
    if (hintTriplet) {
      root.style.setProperty('--ios-subtext', hintTriplet);
    }
  }
  if (themeParams.secondary_bg_color) {
    root.style.setProperty('--tg-theme-secondary-bg-color', themeParams.secondary_bg_color);
    root.style.setProperty('--ios-card-color', themeParams.secondary_bg_color);
    const cardTriplet = hexToRgbTriplet(themeParams.secondary_bg_color);
    if (cardTriplet) {
      root.style.setProperty('--ios-card', cardTriplet);
    }
  }
  if (themeParams.button_color) {
    root.style.setProperty('--ios-accent', themeParams.button_color);
  }

  if (webApp.colorScheme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function initTelegramWebApp() {
  const webApp = getTelegramWebApp();
  if (!webApp) {
    return;
  }
  webApp.ready();
  webApp.expand();
  webApp.setHeaderColor?.('secondary_bg_color');
  applyTelegramThemeParams();
}

export function useTelegramThemeSync() {
  useEffect(() => {
    const webApp = getTelegramWebApp();
    if (!webApp?.onEvent) {
      return;
    }

    const handler = () => applyTelegramThemeParams();
    webApp.onEvent('themeChanged', handler);

    return () => {
      webApp.offEvent?.('themeChanged', handler);
    };
  }, []);
}

function hexToRgbTriplet(hex: string): string | null {
  const normalized = hex.trim().replace('#', '');
  if (!/^[\da-fA-F]{3}([\da-fA-F]{3})?$/.test(normalized)) {
    return null;
  }
  const full = normalized.length === 3
    ? normalized.split('').map((ch) => ch + ch).join('')
    : normalized;
  const intValue = Number.parseInt(full, 16);
  const r = (intValue >> 16) & 255;
  const g = (intValue >> 8) & 255;
  const b = intValue & 255;
  return `${r} ${g} ${b}`;
}

export function hapticImpact(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light') {
  const webApp = getTelegramWebApp();
  if (webApp?.HapticFeedback && getTelegramInitData()) {
    webApp.HapticFeedback.impactOccurred(style);
    return;
  }
  // Fallback для PWA вне Telegram: Vibration API.
  if (canUseBrowserVibration()) {
    const isAndroid = document.documentElement.classList.contains('android');
    const patternByStyle: Record<typeof style, number | number[]> = isAndroid
      ? { light: 12, medium: 20, heavy: [24, 16, 30], rigid: 14, soft: 10 }
      : { light: 10, medium: 16, heavy: 24, rigid: 12, soft: 8 };
    navigator.vibrate(patternByStyle[style]);
  }
}

export function hapticSelectionChanged() {
  const webApp = getTelegramWebApp();
  if (webApp?.HapticFeedback && getTelegramInitData()) {
    webApp.HapticFeedback.selectionChanged();
    return;
  }
  if (canUseBrowserVibration()) {
    navigator.vibrate(8);
  }
}

export function hapticNotify(type: 'error' | 'success' | 'warning') {
  const webApp = getTelegramWebApp();
  if (webApp?.HapticFeedback && getTelegramInitData()) {
    webApp.HapticFeedback.notificationOccurred(type);
    return;
  }
  const pattern: Record<typeof type, number | number[]> = {
    success: [16, 10, 16],
    warning: [20, 16, 20],
    error: [30, 12, 30, 12, 30]
  };
  if (canUseBrowserVibration()) {
    navigator.vibrate(pattern[type]);
  }
}

// Обертка для @telegram-apps/sdk-react без жесткой привязки к конкретному API экспорта
// Это даёт стабильную компиляцию при обновлениях SDK.
export function TelegramSdkProviderBridge({ children }: { children: ReactNode }) {
  const [Provider, setProvider] = useState<((props: { children: ReactNode }) => ReactNode) | null>(null);

  useEffect(() => {
    let cancelled = false;

    void import('@telegram-apps/sdk-react')
      .then((mod: unknown) => {
        if (cancelled) {
          return;
        }

        const maybeProvider = (mod as { SDKProvider?: (props: { children: ReactNode }) => ReactNode }).SDKProvider;
        if (maybeProvider) {
          setProvider(() => maybeProvider);
          return;
        }

        setProvider(() => ({ children: inner }: { children: ReactNode }) => inner);
      })
      .catch(() => {
        if (!cancelled) {
          setProvider(() => ({ children: inner }: { children: ReactNode }) => inner);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const content = useMemo(() => {
    if (!Provider) {
      return children;
    }
    return <Provider>{children}</Provider>;
  }, [Provider, children]);

  return <>{content}</>;
}


export async function cloudStorageGet(key: string): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!getTelegramInitData()) {
    return window.localStorage.getItem(key);
  }

  const webApp = getTelegramWebApp();
  const cloudStorage = (webApp as unknown as { CloudStorage?: { getItem: (k: string, cb: (err: string | null, value: string | null) => void) => void } }).CloudStorage;
  if (!cloudStorage) {
    return window.localStorage.getItem(key);
  }
  return new Promise((resolve) => {
    try {
      cloudStorage.getItem(key, (err, value) => {
        if (err) {
          resolve(window.localStorage.getItem(key));
          return;
        }
        resolve(value ?? window.localStorage.getItem(key));
      });
    } catch {
      resolve(window.localStorage.getItem(key));
    }
  });
}

export async function cloudStorageSet(key: string, value: string): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  if (!getTelegramInitData()) {
    window.localStorage.setItem(key, value);
    return;
  }

  const webApp = getTelegramWebApp();
  const cloudStorage = (webApp as unknown as { CloudStorage?: { setItem: (k: string, v: string, cb: (err: string | null) => void) => void } }).CloudStorage;
  if (!cloudStorage) {
    window.localStorage.setItem(key, value);
    return;
  }
  await new Promise<void>((resolve) => {
    try {
      cloudStorage.setItem(key, value, (err) => {
        if (err) {
          window.localStorage.setItem(key, value);
        }
        resolve();
      });
    } catch {
      window.localStorage.setItem(key, value);
      resolve();
    }
  });
}

export function showMainButton(text: string, onClick: () => void) {
  const webApp = getTelegramWebApp();
  const button = (webApp as unknown as { MainButton?: { setParams: (params: Record<string, unknown>) => void; show: () => void; onClick: (cb: () => void) => void } }).MainButton;
  if (!button) {
    return;
  }
  button.setParams({ text, is_visible: true });
  button.show();
  button.onClick(onClick);
}

export function hideMainButton() {
  const webApp = getTelegramWebApp();
  const button = (webApp as unknown as { MainButton?: { hide: () => void } }).MainButton;
  button?.hide();
}
