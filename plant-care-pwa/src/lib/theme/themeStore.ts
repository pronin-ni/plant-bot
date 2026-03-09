import { create } from 'zustand';

import {
  APP_THEMES,
  DEFAULT_THEME_ID,
  getDefaultTheme,
  getThemeCssVariables,
  getThemeById,
  resolveSystemThemeId,
  type AppTheme,
  type ThemeId
} from '@/lib/theme/themes';

const THEME_ID_STORAGE_KEY = 'plant-pwa-theme-id';
const THEME_USE_SYSTEM_STORAGE_KEY = 'plant-pwa-theme-use-system';

function isThemeId(value: string | null | undefined): value is ThemeId {
  if (!value) {
    return false;
  }
  return APP_THEMES.some((theme) => theme.id === value);
}

function readStoredThemeId(): ThemeId | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.localStorage.getItem(THEME_ID_STORAGE_KEY);
  return isThemeId(raw) ? raw : null;
}

function readStoredUseSystemTheme(): boolean | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.localStorage.getItem(THEME_USE_SYSTEM_STORAGE_KEY);
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  return null;
}

function persistThemeState(themeId: ThemeId, useSystemTheme: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(THEME_ID_STORAGE_KEY, themeId);
  window.localStorage.setItem(THEME_USE_SYSTEM_STORAGE_KEY, String(useSystemTheme));
}

function detectSystemThemeId(): ThemeId {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return DEFAULT_THEME_ID;
  }
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return resolveSystemThemeId(prefersDark);
}

function resolveInitialState(): {
  selectedThemeId: ThemeId;
  useSystemTheme: boolean;
  isInitialized: boolean;
} {
  const storedThemeId = readStoredThemeId();
  const storedUseSystemTheme = readStoredUseSystemTheme();

  // Если пользователь раньше явно выбрал систему — используем системную тему.
  if (storedUseSystemTheme === true) {
    return {
      selectedThemeId: detectSystemThemeId(),
      useSystemTheme: true,
      isInitialized: true
    };
  }

  // Если есть сохранённая ручная тема — приоритет у неё.
  if (storedThemeId) {
    return {
      selectedThemeId: storedThemeId,
      useSystemTheme: false,
      isInitialized: true
    };
  }

  // Первый запуск: fallback на системную тему.
  return {
    selectedThemeId: detectSystemThemeId(),
    useSystemTheme: true,
    isInitialized: true
  };
}

interface ThemeStoreState {
  selectedThemeId: ThemeId;
  useSystemTheme: boolean;
  isInitialized: boolean;
  setTheme: (themeId: ThemeId) => void;
  setSystemTheme: () => void;
  initializeTheme: () => void;
  getResolvedTheme: () => AppTheme;
}

const initialState = resolveInitialState();

export const useThemeStore = create<ThemeStoreState>((set, get) => ({
  selectedThemeId: initialState.selectedThemeId,
  useSystemTheme: initialState.useSystemTheme,
  isInitialized: initialState.isInitialized,

  setTheme: (themeId) => {
    persistThemeState(themeId, false);
    set({
      selectedThemeId: themeId,
      useSystemTheme: false,
      isInitialized: true
    });
  },

  setSystemTheme: () => {
    const systemThemeId = detectSystemThemeId();
    persistThemeState(systemThemeId, true);
    set({
      selectedThemeId: systemThemeId,
      useSystemTheme: true,
      isInitialized: true
    });
  },

  initializeTheme: () => {
    const storedThemeId = readStoredThemeId();
    const storedUseSystemTheme = readStoredUseSystemTheme();

    if (storedUseSystemTheme === true) {
      const systemThemeId = detectSystemThemeId();
      set({
        selectedThemeId: systemThemeId,
        useSystemTheme: true,
        isInitialized: true
      });
      return;
    }

    if (storedThemeId) {
      set({
        selectedThemeId: storedThemeId,
        useSystemTheme: false,
        isInitialized: true
      });
      return;
    }

    const systemThemeId = detectSystemThemeId();
    persistThemeState(systemThemeId, true);
    set({
      selectedThemeId: systemThemeId,
      useSystemTheme: true,
      isInitialized: true
    });
  },

  getResolvedTheme: () => {
    const state = get();
    if (state.useSystemTheme) {
      return getThemeById(detectSystemThemeId());
    }
    return getThemeById(state.selectedThemeId) ?? getDefaultTheme();
  }
}));

export const themeStorageKeys = {
  themeId: THEME_ID_STORAGE_KEY,
  useSystemTheme: THEME_USE_SYSTEM_STORAGE_KEY
};

// T4: централизованное применение CSS-переменных темы на уровне документа.
export function applyThemeToDocument(theme: AppTheme): void {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  const cssVars = getThemeCssVariables(theme);
  Object.entries(cssVars).forEach(([name, value]) => {
    root.style.setProperty(name, value);
  });

  root.dataset.theme = theme.id;
  root.dataset.themeMode = theme.mode;
  root.classList.toggle('dark', theme.mode === 'dark');
}
