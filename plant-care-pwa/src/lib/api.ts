import { getTelegramInitData } from '@/lib/telegram';
import {
  cacheGet,
  cacheSet,
  deleteQueuedMutation,
  getQueuedMutations,
  mutationQueueCount,
  upsertQueuedMutation
} from '@/lib/indexeddb';
import { useAuthStore, useOfflineStore } from '@/lib/store';
import type {
  AuthValidationResponse,
  CalendarSyncDto,
  CalendarEventDto,
  PlantDto,
  PlantLearningDto,
  PlantStatsDto,
  OpenRouterIdentifyResult,
  OpenRouterDiagnoseResult,
  AchievementsDto,
  OpenRouterModelsDto,
  OpenRouterPreferencesDto,
  ChatAskResponse,
  PlantCareAdviceDto,
  AdminOverviewDto,
  AdminUsersDto,
  AdminPlantsDto,
  AdminPlantItemDto,
  AdminStatsDto,
  AssistantHistoryItemDto,
  PlantProfileSuggestionDto,
  AdminCacheClearDto,
  PwaAuthDto,
  PwaAuthProvidersDto,
  PwaTelegramWidgetPayloadDto,
  PwaUserDto,
  PwaPushPublicKeyDto,
  PwaPushStatusDto,
  PwaPushSubscribeDto
} from '@/types/api';
import type {
  HomeAssistantConfigRequest,
  HomeAssistantConfigResponse,
  HomeAssistantRoomsSensorsResponse,
  PlantConditionsHistoryResponse,
  PlantConditionsResponse,
  PlantRoomBindingRequest
} from '@/types/home-assistant';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const AUTH_TOKEN_KEY = 'plant-pwa-jwt';
const CACHE_PREFIX = 'api:cache:';

let syncInFlight: Promise<void> | null = null;
let syncInitialized = false;

interface ApiErrorPayload {
  message?: string;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function cacheKey(path: string): string {
  return `${CACHE_PREFIX}${path}`;
}

function isLikelyNetworkError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return false;
  }
  return error instanceof TypeError || (error instanceof Error && /network|failed|fetch|offline/i.test(error.message));
}

function isQueueableMutation(method: string, path: string): boolean {
  const upperMethod = method.toUpperCase();
  if (upperMethod === 'PUT' && /^\/api\/plants\/\d+\/water$/.test(path)) {
    return true;
  }
  if (upperMethod === 'POST' && path === '/api/users/city') {
    return true;
  }
  return false;
}

async function updatePendingMutationsCounter() {
  const count = await mutationQueueCount();
  useOfflineStore.getState().setPendingMutations(count);
}

async function buildOfflineFallback<T>(path: string, init: RequestInit): Promise<T | null> {
  const method = (init.method ?? 'GET').toUpperCase();
  if (method === 'PUT' && /^\/api\/plants\/\d+\/water$/.test(path)) {
    const plants = (await cacheGet<PlantDto[]>(cacheKey('/api/plants'))) ?? [];
    const match = path.match(/^\/api\/plants\/(\d+)\/water$/);
    const plantId = match ? Number(match[1]) : null;
    if (!plantId) {
      return null;
    }
    const plant = plants.find((item) => item.id === plantId);
    if (!plant) {
      return null;
    }
    const now = new Date();
    const interval = Math.max(1, plant.baseIntervalDays ?? 7);
    const next = new Date(now);
    next.setDate(next.getDate() + interval);
    const updated: PlantDto = {
      ...plant,
      lastWateredDate: now.toISOString(),
      nextWateringDate: next.toISOString()
    };
    const updatedPlants = plants.map((item) => (item.id === plantId ? updated : item));
    await cacheSet(cacheKey('/api/plants'), updatedPlants);
    return updated as T;
  }

  if (method === 'POST' && path === '/api/users/city') {
    const body = init.body ? (JSON.parse(String(init.body)) as { city?: string }) : {};
    const auth = useAuthStore.getState();
    const payload: AuthValidationResponse = {
      ok: true,
      userId: String(auth.telegramUserId ?? ''),
      username: auth.username,
      firstName: auth.firstName,
      city: body.city ?? auth.city,
      isAdmin: auth.isAdmin
    };
    return payload as T;
  }

  return null;
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    if (payload?.message) {
      return payload.message;
    }
  } catch {
    // Игнорируем ошибки парсинга тела и используем fallback.
  }
  return `Ошибка запроса (${response.status})`;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const initData = getTelegramInitData();
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers ?? {});
  const accessToken = localStorage.getItem(AUTH_TOKEN_KEY);

  headers.set('Content-Type', 'application/json');
  if (initData) {
    headers.set('X-Telegram-Init-Data', initData);
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const requestInit: RequestInit = {
    ...init,
    method,
    headers
  };

  if (method === 'GET') {
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, requestInit);
      if (!response.ok) {
        throw new ApiError(response.status, await parseErrorMessage(response));
      }
      if (response.status === 204) {
        return undefined as T;
      }
      const payload = (await response.json()) as T;
      await cacheSet(cacheKey(path), payload);
      useOfflineStore.getState().setOffline(false);
      return payload;
    } catch (error) {
      const cached = await cacheGet<T>(cacheKey(path));
      if (cached !== null) {
        useOfflineStore.getState().setOffline(true);
        return cached;
      }
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(0, 'Нет сети и нет кеша для этого запроса');
    }
  }

  const shouldQueue = isQueueableMutation(method, path);
  if (!navigator.onLine && shouldQueue) {
    await upsertQueuedMutation({
      method,
      path,
      body: requestInit.body ? String(requestInit.body) : undefined,
      createdAt: Date.now(),
      dedupeKey: `${method}:${path}`,
      attempts: 0
    });
    await updatePendingMutationsCounter();
    const fallback = await buildOfflineFallback<T>(path, requestInit);
    if (fallback !== null) {
      return fallback;
    }
    throw new ApiError(0, 'Операция сохранена и будет отправлена при восстановлении сети');
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, requestInit);
    if (!response.ok) {
      throw new ApiError(response.status, await parseErrorMessage(response));
    }
    useOfflineStore.getState().setOffline(false);
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  } catch (error) {
    if (shouldQueue && isLikelyNetworkError(error)) {
      await upsertQueuedMutation({
        method,
        path,
        body: requestInit.body ? String(requestInit.body) : undefined,
        createdAt: Date.now(),
        dedupeKey: `${method}:${path}`,
        attempts: 0
      });
      await updatePendingMutationsCounter();
      useOfflineStore.getState().setOffline(true);
      const fallback = await buildOfflineFallback<T>(path, requestInit);
      if (fallback !== null) {
        return fallback;
      }
      throw new ApiError(0, 'Операция сохранена и будет отправлена при восстановлении сети');
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(0, 'Ошибка сети');
  }
}

async function pwaAuthFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  const accessToken = localStorage.getItem(AUTH_TOKEN_KEY);
  headers.set('Content-Type', 'application/json');
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }
  return (await response.json()) as T;
}

export async function validateTelegramAuth(): Promise<AuthValidationResponse> {
  return apiFetch<AuthValidationResponse>('/api/auth/validate', {
    method: 'POST'
  });
}

export async function getPwaAuthProviders(): Promise<PwaAuthProvidersDto> {
  return pwaAuthFetch<PwaAuthProvidersDto>('/api/pwa/auth/providers', { method: 'GET' });
}

export async function pwaLoginTelegram(initData: string): Promise<PwaAuthDto> {
  return pwaAuthFetch<PwaAuthDto>('/api/pwa/auth/telegram', {
    method: 'POST',
    body: JSON.stringify({ initData })
  });
}

export async function pwaLoginTelegramWidget(payload: PwaTelegramWidgetPayloadDto): Promise<PwaAuthDto> {
  return pwaAuthFetch<PwaAuthDto>('/api/pwa/auth/telegram-widget', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function pwaLoginOAuth(
  provider: 'yandex' | 'vk' | 'google' | 'apple',
  payload: { code?: string; idToken?: string; accessToken?: string; redirectUri?: string; emailHint?: string }
): Promise<PwaAuthDto> {
  return pwaAuthFetch<PwaAuthDto>(`/api/pwa/auth/oauth/${provider}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function pwaMe(): Promise<PwaUserDto> {
  return pwaAuthFetch<PwaUserDto>('/api/pwa/auth/me', { method: 'GET' });
}

export async function getPwaPushPublicKey(): Promise<PwaPushPublicKeyDto> {
  return pwaAuthFetch<PwaPushPublicKeyDto>('/api/pwa/push/public-key', { method: 'GET' });
}

export async function getPwaPushStatus(): Promise<PwaPushStatusDto> {
  return pwaAuthFetch<PwaPushStatusDto>('/api/pwa/push/status', { method: 'GET' });
}

export async function subscribePwaPush(subscription: PushSubscriptionJSON): Promise<PwaPushSubscribeDto> {
  return pwaAuthFetch<PwaPushSubscribeDto>('/api/pwa/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys?.p256dh ?? '',
        auth: subscription.keys?.auth ?? ''
      },
      userAgent: navigator.userAgent
    })
  });
}

export async function unsubscribePwaPush(endpoint: string): Promise<PwaPushSubscribeDto> {
  return pwaAuthFetch<PwaPushSubscribeDto>(`/api/pwa/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, {
    method: 'DELETE'
  });
}

export async function syncOfflineQueue(): Promise<void> {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = (async () => {
    if (!navigator.onLine) {
      useOfflineStore.getState().setOffline(true);
      return;
    }

    const initData = getTelegramInitData();
    const accessToken = localStorage.getItem(AUTH_TOKEN_KEY);
    const queue = await getQueuedMutations();

    for (const item of queue) {
      if (!item.id) {
        continue;
      }
      const headers = new Headers();
      headers.set('Content-Type', 'application/json');
      if (initData) {
        headers.set('X-Telegram-Init-Data', initData);
      }
      if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`);
      }

      try {
        const response = await fetch(`${API_BASE_URL}${item.path}`, {
          method: item.method,
          headers,
          body: item.body
        });
        if (response.ok || (response.status >= 400 && response.status < 500)) {
          await deleteQueuedMutation(item.id);
          continue;
        }
        break;
      } catch {
        useOfflineStore.getState().setOffline(true);
        break;
      }
    }

    await updatePendingMutationsCounter();
    useOfflineStore.getState().setOffline(!navigator.onLine);
  })().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}

export async function initOfflineSync(): Promise<void> {
  if (syncInitialized) {
    return;
  }
  syncInitialized = true;

  window.addEventListener('online', () => {
    useOfflineStore.getState().setOffline(false);
    void syncOfflineQueue();
  });

  window.addEventListener('offline', () => {
    useOfflineStore.getState().setOffline(true);
  });

  await updatePendingMutationsCounter();
  useOfflineStore.getState().setOffline(!navigator.onLine);
  void syncOfflineQueue();

  window.setInterval(() => {
    void syncOfflineQueue();
  }, 20_000);
}

export async function getPlants(): Promise<PlantDto[]> {
  return apiFetch<PlantDto[]>('/api/plants', { method: 'GET' });
}

export async function getPlantById(id: number): Promise<PlantDto> {
  return apiFetch<PlantDto>(`/api/plants/${id}`, { method: 'GET' });
}

export async function searchPlants(q: string): Promise<PlantDto[]> {
  const params = new URLSearchParams({ q });
  return apiFetch<PlantDto[]>(`/api/plants/search?${params.toString()}`, { method: 'GET' });
}

export async function createPlant(payload: Record<string, unknown>): Promise<PlantDto> {
  return apiFetch<PlantDto>('/api/plants', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function waterPlant(id: number, payload?: Record<string, unknown>): Promise<PlantDto> {
  return apiFetch<PlantDto>(`/api/plants/${id}/water`, {
    method: 'PUT',
    body: JSON.stringify(payload ?? {})
  });
}

export async function uploadPlantPhoto(id: number, photoBase64: string): Promise<{ ok: boolean; photoUrl?: string }> {
  return apiFetch<{ ok: boolean; photoUrl?: string }>(`/api/plants/${id}/photo`, {
    method: 'POST',
    body: JSON.stringify({ photoBase64 })
  });
}

export async function getCalendar(): Promise<Array<{ date: string; plantId: number; plantName: string }>> {
  return apiFetch<CalendarEventDto[]>('/api/calendar', {
    method: 'GET'
  });
}

export async function deletePlant(id: number): Promise<void> {
  return apiFetch<void>(`/api/plants/${id}`, { method: 'DELETE' });
}

export async function getStats(): Promise<PlantStatsDto[]> {
  return apiFetch<PlantStatsDto[]>('/api/stats', { method: 'GET' });
}

export async function getLearning(): Promise<PlantLearningDto[]> {
  return apiFetch<PlantLearningDto[]>('/api/learning', { method: 'GET' });
}

export async function getCalendarSync(): Promise<CalendarSyncDto> {
  return apiFetch<CalendarSyncDto>('/api/calendar/sync', { method: 'GET' });
}

export async function updateCalendarSync(enabled: boolean): Promise<CalendarSyncDto> {
  return apiFetch<CalendarSyncDto>('/api/calendar/sync', {
    method: 'POST',
    body: JSON.stringify({ enabled })
  });
}

export async function updateCity(city: string): Promise<AuthValidationResponse> {
  return apiFetch<AuthValidationResponse>('/api/users/city', {
    method: 'POST',
    body: JSON.stringify({ city })
  });
}


export async function saveHomeAssistantConfig(payload: HomeAssistantConfigRequest): Promise<HomeAssistantConfigResponse> {
  return apiFetch<HomeAssistantConfigResponse>('/api/home-assistant/config', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}


export async function getHomeAssistantRoomsAndSensors(): Promise<HomeAssistantRoomsSensorsResponse> {
  return apiFetch<HomeAssistantRoomsSensorsResponse>('/api/home-assistant/rooms-and-sensors', {
    method: 'GET'
  });
}

export async function bindPlantRoom(plantId: number, payload: PlantRoomBindingRequest): Promise<PlantConditionsResponse> {
  return apiFetch<PlantConditionsResponse>(`/api/plants/${plantId}/room`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function getPlantConditions(plantId: number): Promise<PlantConditionsResponse> {
  return apiFetch<PlantConditionsResponse>(`/api/plants/${plantId}/conditions`, { method: 'GET' });
}

export async function getPlantConditionsHistory(plantId: number, days = 7): Promise<PlantConditionsHistoryResponse> {
  return apiFetch<PlantConditionsHistoryResponse>(`/api/plants/${plantId}/history-conditions?days=${days}`, {
    method: 'GET'
  });
}


export async function identifyPlantOpenRouter(imageBase64: string): Promise<OpenRouterIdentifyResult> {
  return apiFetch<OpenRouterIdentifyResult>('/api/plant/identify-openrouter', {
    method: 'POST',
    body: JSON.stringify({ imageBase64 })
  });
}

export async function diagnosePlantOpenRouter(
  imageBase64: string,
  plantName: string,
  plantContext?: string
): Promise<OpenRouterDiagnoseResult> {
  return apiFetch<OpenRouterDiagnoseResult>('/api/plant/diagnose-openrouter', {
    method: 'POST',
    body: JSON.stringify({ imageBase64, plantName, plantContext })
  });
}

export async function getAchievements(): Promise<AchievementsDto> {
  return apiFetch<AchievementsDto>('/api/user/achievements', { method: 'GET' });
}

export async function checkAchievements(): Promise<AchievementsDto> {
  return apiFetch<AchievementsDto>('/api/user/achievements/check', { method: 'POST' });
}

export async function getOpenRouterModels(): Promise<OpenRouterModelsDto> {
  return apiFetch<OpenRouterModelsDto>('/api/openrouter/models', { method: 'GET' });
}

export async function getOpenRouterPreferences(): Promise<OpenRouterPreferencesDto> {
  return apiFetch<OpenRouterPreferencesDto>('/api/openrouter/preferences', { method: 'GET' });
}

export async function saveOpenRouterPreferences(payload: OpenRouterPreferencesDto): Promise<OpenRouterPreferencesDto> {
  return apiFetch<OpenRouterPreferencesDto>('/api/openrouter/preferences', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function clearOpenRouterApiKey(): Promise<OpenRouterPreferencesDto> {
  return apiFetch<OpenRouterPreferencesDto>('/api/openrouter/preferences/api-key', {
    method: 'DELETE'
  });
}


export async function askAssistant(question: string): Promise<ChatAskResponse> {
  return apiFetch<ChatAskResponse>('/api/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({ question })
  });
}

export async function getAssistantHistory(): Promise<AssistantHistoryItemDto[]> {
  return apiFetch<AssistantHistoryItemDto[]>('/api/assistant/history', { method: 'GET' });
}


export async function getPlantCareAdvice(id: number): Promise<PlantCareAdviceDto> {
  return apiFetch<PlantCareAdviceDto>(`/api/plants/${id}/care-advice`, { method: 'GET' });
}


export async function getAdminOverview(): Promise<AdminOverviewDto> {
  return apiFetch<AdminOverviewDto>('/api/admin/overview', { method: 'GET' });
}

export async function getAdminUsers(page = 0, size = 20, q = ''): Promise<AdminUsersDto> {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (q.trim()) {
    params.set('q', q.trim());
  }
  return apiFetch<AdminUsersDto>(`/api/admin/users?${params.toString()}`, { method: 'GET' });
}

export async function getAdminPlants(page = 0, size = 20, q = ''): Promise<AdminPlantsDto> {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (q.trim()) {
    params.set('q', q.trim());
  }
  return apiFetch<AdminPlantsDto>(`/api/admin/plants?${params.toString()}`, { method: 'GET' });
}

export async function getAdminUserPlants(userId: number): Promise<AdminPlantItemDto[]> {
  return apiFetch<AdminPlantItemDto[]>(`/api/admin/users/${userId}/plants`, { method: 'GET' });
}

export async function getAdminStats(): Promise<AdminStatsDto> {
  return apiFetch<AdminStatsDto>('/api/admin/stats', { method: 'GET' });
}

export async function clearAdminCache(): Promise<AdminCacheClearDto> {
  return apiFetch<AdminCacheClearDto>('/api/admin/clear-cache', { method: 'POST' });
}

export async function suggestPlantProfile(name: string): Promise<PlantProfileSuggestionDto> {
  const params = new URLSearchParams({ name });
  return apiFetch<PlantProfileSuggestionDto>(`/api/plants/suggest-profile?${params.toString()}`, { method: 'GET' });
}
