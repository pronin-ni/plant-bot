import { create } from 'zustand';
import type { AppTabKey } from '@/types/navigation';

interface AuthState {
  isReady: boolean;
  isAuthorized: boolean;
  telegramUserId?: number;
  username?: string;
  setAuth: (payload: { telegramUserId?: number; username?: string; isAuthorized: boolean }) => void;
  setReady: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isReady: false,
  isAuthorized: false,
  telegramUserId: undefined,
  username: undefined,
  setAuth: ({ telegramUserId, username, isAuthorized }) =>
    set({ telegramUserId, username, isAuthorized }),
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
