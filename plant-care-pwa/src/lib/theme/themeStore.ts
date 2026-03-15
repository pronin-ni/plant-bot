import { create } from 'zustand';

import {
  APP_THEMES,
  getDefaultTheme,
  getThemeCssVariables,
  getThemeById,
  type AppTheme,
  type ThemeId
} from '@/lib/theme/themes';

const THEME_ID_STORAGE_KEY = 'plant-pwa-theme-id';

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

function persistThemeState(themeId: ThemeId): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(THEME_ID_STORAGE_KEY, themeId);
}

function resolveInitialState(): {
  selectedThemeId: ThemeId;
  isInitialized: boolean;
} {
  const storedThemeId = readStoredThemeId();

  if (storedThemeId) {
    return {
      selectedThemeId: storedThemeId,
      isInitialized: true
    };
  }

  return {
    selectedThemeId: getDefaultTheme().id,
    isInitialized: true
  };
}

interface ThemeStoreState {
  selectedThemeId: ThemeId;
  isInitialized: boolean;
  setTheme: (themeId: ThemeId) => void;
  initializeTheme: () => void;
  getResolvedTheme: () => AppTheme;
}

const initialState = resolveInitialState();

export const useThemeStore = create<ThemeStoreState>((set, get) => ({
  selectedThemeId: initialState.selectedThemeId,
  isInitialized: initialState.isInitialized,

  setTheme: (themeId) => {
    persistThemeState(themeId);
    set({
      selectedThemeId: themeId,
      isInitialized: true
    });
  },

  initializeTheme: () => {
    const storedThemeId = readStoredThemeId();

    if (storedThemeId) {
      set({
        selectedThemeId: storedThemeId,
        isInitialized: true
      });
      return;
    }

    const defaultThemeId = getDefaultTheme().id;
    persistThemeState(defaultThemeId);
    set({
      selectedThemeId: defaultThemeId,
      isInitialized: true
    });
  },

  getResolvedTheme: () => getThemeById(get().selectedThemeId) ?? getDefaultTheme()
}));

export const themeStorageKeys = {
  themeId: THEME_ID_STORAGE_KEY
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
