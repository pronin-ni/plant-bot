import { create } from 'zustand';
import type { AppTabKey } from '@/types/navigation';

const AUTH_TOKEN_KEY = 'plant-pwa-jwt';

interface AuthState {
  isReady: boolean;
  isAuthorized: boolean;
  accessToken?: string;
  roles: string[];
  telegramUserId?: number;
  username?: string;
  firstName?: string;
  email?: string;
  city?: string;
  isAdmin: boolean;
  setAuth: (payload: {
    telegramUserId?: number;
    username?: string;
    firstName?: string;
    email?: string;
    city?: string;
    isAdmin?: boolean;
    roles?: string[];
    accessToken?: string;
    isAuthorized: boolean;
  }) => void;
  clearAuth: () => void;
  setReady: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isReady: false,
  isAuthorized: Boolean(localStorage.getItem(AUTH_TOKEN_KEY)),
  accessToken: localStorage.getItem(AUTH_TOKEN_KEY) ?? undefined,
  roles: [],
  telegramUserId: undefined,
  username: undefined,
  firstName: undefined,
  email: undefined,
  city: undefined,
  isAdmin: false,
  setAuth: ({ telegramUserId, username, firstName, email, city, isAdmin, roles, accessToken, isAuthorized }) => {
    if (accessToken) {
      localStorage.setItem(AUTH_TOKEN_KEY, accessToken);
    }
    set({
      telegramUserId,
      username,
      firstName,
      email,
      city,
      roles: roles ?? [],
      accessToken: accessToken ?? localStorage.getItem(AUTH_TOKEN_KEY) ?? undefined,
      isAdmin: Boolean(isAdmin) || Boolean(roles?.includes('ROLE_ADMIN')),
      isAuthorized
    });
  },
  clearAuth: () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    set({
      isAuthorized: false,
      accessToken: undefined,
      roles: [],
      telegramUserId: undefined,
      username: undefined,
      firstName: undefined,
      email: undefined,
      city: undefined,
      isAdmin: false
    });
  },
  setReady: (value) => set({ isReady: value })
}));

interface UiState {
  activeTab: AppTabKey;
  selectedPlantId: number | null;
  setActiveTab: (tab: AppTabKey) => void;
  openPlantDetail: (plantId: number) => void;
  closePlantDetail: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: 'home',
  selectedPlantId: null,
  setActiveTab: (tab) => set({ activeTab: tab }),
  openPlantDetail: (plantId) => set({ selectedPlantId: plantId }),
  closePlantDetail: () => set({ selectedPlantId: null })
}));

interface OfflineState {
  isOffline: boolean;
  pendingMutations: number;
  setOffline: (value: boolean) => void;
  setPendingMutations: (value: number) => void;
}

export const useOfflineStore = create<OfflineState>((set) => ({
  isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  pendingMutations: 0,
  setOffline: (value) => set({ isOffline: value }),
  setPendingMutations: (value) => set({ pendingMutations: Math.max(0, value) })
}));

const DEFAULT_OPENROUTER_TEXT_MODEL = 'qwen/qwen2-7b-instruct';
const DEFAULT_OPENROUTER_PHOTO_MODEL = 'qwen/qwen2-vl-7b-instruct';

interface OpenRouterModelsState {
  textModel: string;
  photoModel: string;
  hasApiKey: boolean;
  isLoaded: boolean;
  source: 'default' | 'server';
  updatedAt?: string;
  setModels: (payload: {
    textModel?: string;
    photoModel?: string;
    hasApiKey?: boolean;
    source: 'default' | 'server';
    updatedAt?: string;
  }) => void;
  resetToDefault: () => void;
}

export const useOpenRouterModelsStore = create<OpenRouterModelsState>((set) => ({
  textModel: DEFAULT_OPENROUTER_TEXT_MODEL,
  photoModel: DEFAULT_OPENROUTER_PHOTO_MODEL,
  hasApiKey: false,
  isLoaded: false,
  source: 'default',
  updatedAt: undefined,
  setModels: ({ textModel, photoModel, hasApiKey, source, updatedAt }) =>
    set({
      textModel: textModel?.trim() || DEFAULT_OPENROUTER_TEXT_MODEL,
      photoModel: photoModel?.trim() || DEFAULT_OPENROUTER_PHOTO_MODEL,
      hasApiKey: Boolean(hasApiKey),
      isLoaded: true,
      source,
      updatedAt
    }),
  resetToDefault: () =>
    set({
      textModel: DEFAULT_OPENROUTER_TEXT_MODEL,
      photoModel: DEFAULT_OPENROUTER_PHOTO_MODEL,
      hasApiKey: false,
      isLoaded: true,
      source: 'default',
      updatedAt: undefined
    })
}));
