import { create } from 'zustand';
import type { AppTabKey } from '@/types/navigation';
import { isTestAuditMode } from '@/lib/runtime';

const AUTH_TOKEN_KEY = 'plant-pwa-jwt';
const GUEST_MODE_KEY = 'plant-pwa-guest';

function readInitialGuestMode(): boolean {
  const storedGuestMode = localStorage.getItem(GUEST_MODE_KEY) === '1';
  if (storedGuestMode && isTestAuditMode()) {
    localStorage.removeItem(GUEST_MODE_KEY);
    return false;
  }
  return storedGuestMode;
}

interface AuthState {
  isReady: boolean;
  isAuthorized: boolean;
  isGuest: boolean;
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
    isGuest?: boolean;
  }) => void;
  clearAuth: () => void;
  setReady: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isReady: false,
  isAuthorized: Boolean(localStorage.getItem(AUTH_TOKEN_KEY)),
  isGuest: readInitialGuestMode(),
  accessToken: localStorage.getItem(AUTH_TOKEN_KEY) ?? undefined,
  roles: [],
  telegramUserId: undefined,
  username: undefined,
  firstName: undefined,
  email: undefined,
  city: undefined,
  isAdmin: false,
  setAuth: ({ telegramUserId, username, firstName, email, city, isAdmin, roles, accessToken, isAuthorized, isGuest }) => {
    if (accessToken) {
      localStorage.setItem(AUTH_TOKEN_KEY, accessToken);
      localStorage.removeItem(GUEST_MODE_KEY);
    } else if (isGuest) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.setItem(GUEST_MODE_KEY, '1');
    } else {
      localStorage.removeItem(GUEST_MODE_KEY);
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
      isAuthorized,
      isGuest: Boolean(isGuest)
    });
  },
  clearAuth: () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(GUEST_MODE_KEY);
    set({
      isAuthorized: false,
      isGuest: false,
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
  setActiveTab: (tab) => set({ activeTab: tab, selectedPlantId: null }),
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
  textModel: '',
  photoModel: '',
  hasApiKey: false,
  isLoaded: false,
  source: 'default',
  updatedAt: undefined,
  setModels: ({ textModel, photoModel, hasApiKey, source, updatedAt }) =>
    set({
      textModel: textModel?.trim() || '',
      photoModel: photoModel?.trim() || '',
      hasApiKey: Boolean(hasApiKey),
      isLoaded: true,
      source,
      updatedAt
    }),
  resetToDefault: () =>
    set({
      textModel: '',
      photoModel: '',
      hasApiKey: false,
      isLoaded: true,
      source: 'default',
      updatedAt: undefined
    })
}));
