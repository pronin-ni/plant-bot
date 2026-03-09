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
  AdminOpenRouterModelsDto,
  OpenRouterRuntimeSettingsDto,
  OpenRouterTypedTestDto,
  ChatAskResponse,
  PlantCareAdviceDto,
  AdminOverviewDto,
  AdminUsersDto,
  AdminUserDetailsDto,
  AdminUserActionDto,
  AdminPlantsDto,
  AdminPlantActionDto,
  AdminBulkPlantWaterDto,
  AdminPlantItemDto,
  AdminStatsDto,
  AssistantHistoryItemDto,
  PlantProfileSuggestionDto,
  AdminCacheClearDto,
  AdminScopedCacheClearDto,
  AdminBackupItemDto,
  AdminBackupRestoreDto,
  AdminPushTestDto,
  AdminActivityLogItemDto,
  AdminMonitoringDto,
  PwaAuthDto,
  PwaAuthProvidersDto,
  PwaEmailMagicLinkRequestDto,
  PwaTelegramWidgetPayloadDto,
  PwaUserDto,
  PwaPushPublicKeyDto,
  PwaPushStatusDto,
  PwaPushSubscribeDto,
  PlantPresetSuggestionDto,
  PlantAiRecommendDto,
  ApplyWateringRecommendationDto,
  WateringHaOptionsDto,
  WateringRecommendationPreviewDto,
  WateringSensorContextDto,
  WeatherProvidersResponse,
  WeatherCurrentDto,
  WeatherForecastDto
} from '@/types/api';
import type {
  HomeAssistantConfigRequest,
  HomeAssistantConfigResponse,
  HomeAssistantRoomsSensorsResponse,
  PlantConditionsHistoryResponse,
  PlantConditionsResponse,
  PlantRoomBindingRequest
} from '@/types/home-assistant';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? '';
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
  if (upperMethod === 'POST' && path === '/api/weather/provider') {
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

  if (method === 'POST' && path === '/api/weather/provider') {
    const body = init.body ? (JSON.parse(String(init.body)) as { provider?: string }) : {};
    const response: WeatherProvidersResponse = {
      providers: [],
      selected: body.provider ?? null
    };
    return response as T;
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

export async function pwaRequestEmailMagicLink(email: string): Promise<PwaEmailMagicLinkRequestDto> {
  return pwaAuthFetch<PwaEmailMagicLinkRequestDto>('/api/auth/email/request', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

export async function pwaVerifyEmailMagicLink(token: string): Promise<PwaAuthDto> {
  return pwaAuthFetch<PwaAuthDto>(`/api/auth/email/verify?token=${encodeURIComponent(token)}`, {
    method: 'GET'
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

export async function searchPlants(q: string, category?: "HOME" | "OUTDOOR_DECORATIVE" | "OUTDOOR_GARDEN"): Promise<PlantDto[]> {
  const params = new URLSearchParams({ q });
  if (category) {
    params.set('category', category);
  }
  return apiFetch<PlantDto[]>(`/api/plants/search?${params.toString()}`, { method: 'GET' });
}

export async function searchPlantPresets(
  category: "HOME" | "OUTDOOR_DECORATIVE" | "OUTDOOR_GARDEN",
  q = '',
  limit = 12
): Promise<PlantPresetSuggestionDto[]> {
  const params = new URLSearchParams();
  params.set('category', category);
  if (q.trim()) {
    params.set('q', q.trim());
  }
  params.set('limit', String(limit));

  const path = `/api/plants/presets?${params.toString()}`;
  const latestCategoryCacheKey = cacheKey(`/api/plants/presets/latest?category=${category}`);

  try {
    const items = await apiFetch<PlantPresetSuggestionDto[]>(path, { method: 'GET' });
    await cacheSet(latestCategoryCacheKey, items);
    return items;
  } catch (error) {
    const latest = await cacheGet<PlantPresetSuggestionDto[]>(latestCategoryCacheKey);
    if (latest && latest.length > 0) {
      return latest.slice(0, Math.max(1, Math.min(limit, latest.length)));
    }
    throw error;
  }
}

export async function aiRecommendPlant(payload: {
  name: string;
  environmentType: 'INDOOR' | 'OUTDOOR_ORNAMENTAL' | 'OUTDOOR_GARDEN';
  category: 'HOME' | 'OUTDOOR_DECORATIVE' | 'OUTDOOR_GARDEN';
  plantType?: 'DEFAULT' | 'TROPICAL' | 'FERN' | 'SUCCULENT' | 'CONIFER';
  baseIntervalDays?: number;
  potVolumeLiters?: number;
  heightCm?: number;
  diameterCm?: number;
  containerType?: string;
  growthStage?: string;
  greenhouse?: boolean;
  soilType?: string;
  sunExposure?: string;
  region?: string;
  mulched?: boolean;
  dripIrrigation?: boolean;
}): Promise<PlantAiRecommendDto> {
  return apiFetch<PlantAiRecommendDto>('/api/plants/ai-recommend', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function previewWateringRecommendation(payload: {
  plantName: string;
  environmentType: 'INDOOR' | 'OUTDOOR_ORNAMENTAL' | 'OUTDOOR_GARDEN';
  potVolumeLiters?: number;
  baseIntervalDays?: number;
  containerType?: 'POT' | 'CONTAINER' | 'FLOWERBED' | 'OPEN_GROUND';
  containerVolume?: number;
  sunExposure?: string;
  soilType?: string;
  cropType?: string;
  growthStage?: string;
  greenhouse?: boolean;
  haRoomId?: string;
  haRoomName?: string;
  temperatureSensorEntityId?: string;
  humiditySensorEntityId?: string;
  soilMoistureSensorEntityId?: string;
  illuminanceSensorEntityId?: string;
  city?: string;
}): Promise<WateringRecommendationPreviewDto> {
  return apiFetch<WateringRecommendationPreviewDto>('/api/watering/recommendation/preview', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function getWateringHaOptions(): Promise<WateringHaOptionsDto> {
  return apiFetch<WateringHaOptionsDto>('/api/watering/recommendation/ha/options', {
    method: 'GET'
  });
}

export async function previewWateringHaContext(payload: {
  plantName: string;
  environmentType: 'INDOOR' | 'OUTDOOR_ORNAMENTAL' | 'OUTDOOR_GARDEN';
  haRoomId?: string;
  haRoomName?: string;
  temperatureSensorEntityId?: string;
  humiditySensorEntityId?: string;
  soilMoistureSensorEntityId?: string;
  illuminanceSensorEntityId?: string;
}): Promise<WateringSensorContextDto> {
  return apiFetch<WateringSensorContextDto>('/api/watering/recommendation/ha/context-preview', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function applyWateringRecommendation(plantId: number, payload: {
  source: 'AI' | 'HEURISTIC' | 'HYBRID' | 'FALLBACK' | 'MANUAL';
  recommendedIntervalDays: number;
  recommendedWaterMl: number;
  summary?: string;
}): Promise<ApplyWateringRecommendationDto> {
  return apiFetch<ApplyWateringRecommendationDto>(`/api/watering/recommendation/${plantId}/apply`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
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

export async function getWeatherProviders(): Promise<WeatherProvidersResponse> {
  return apiFetch<WeatherProvidersResponse>('/api/weather/providers', { method: 'GET' });
}

export async function setWeatherProvider(provider: string): Promise<WeatherProvidersResponse> {
  return apiFetch<WeatherProvidersResponse>('/api/weather/provider', {
    method: 'POST',
    body: JSON.stringify({ provider })
  });
}

export async function getWeatherCurrent(city: string): Promise<WeatherCurrentDto> {
  return apiFetch<WeatherCurrentDto>(`/api/weather/current?city=${encodeURIComponent(city)}`, {
    method: 'GET'
  });
}

export async function getWeatherForecast(city: string): Promise<WeatherForecastDto> {
  return apiFetch<WeatherForecastDto>(`/api/weather/forecast?city=${encodeURIComponent(city)}`, {
    method: 'GET'
  });
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

export async function validateOpenRouterKey(apiKey: string): Promise<{ ok: boolean; message?: string }> {
  return apiFetch<{ ok: boolean; message?: string }>('/api/openrouter/validate-key', {
    method: 'POST',
    body: JSON.stringify({ apiKey })
  });
}

export async function getOpenRouterRuntimeSettings(): Promise<OpenRouterRuntimeSettingsDto> {
  return apiFetch<OpenRouterRuntimeSettingsDto>('/api/settings/openrouter', { method: 'GET' });
}

export async function getAdminOpenRouterModels(): Promise<AdminOpenRouterModelsDto> {
  return apiFetch<AdminOpenRouterModelsDto>('/api/admin/openrouter/models', { method: 'GET' });
}

export async function saveAdminOpenRouterModels(payload: {
  textModel?: string | null;
  photoModel?: string | null;
}): Promise<AdminOpenRouterModelsDto> {
  return apiFetch<AdminOpenRouterModelsDto>('/api/admin/openrouter/models', {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function testOpenRouterModel(type: 'text' | 'photo'): Promise<OpenRouterTypedTestDto> {
  return apiFetch<OpenRouterTypedTestDto>(`/api/openrouter/test?type=${encodeURIComponent(type)}`, {
    method: 'POST'
  });
}

export async function askAssistant(question: string): Promise<ChatAskResponse> {
  return apiFetch<ChatAskResponse>('/api/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({ question })
  });
}

export async function getAssistantHistory(limit = 50): Promise<AssistantHistoryItemDto[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  return apiFetch<AssistantHistoryItemDto[]>(`/api/assistant/history?${params.toString()}`, { method: 'GET' });
}

export async function clearAssistantHistory(): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/api/assistant/history', { method: 'DELETE' });
}


export async function getPlantCareAdvice(id: number, forceRefresh = false): Promise<PlantCareAdviceDto> {
  const query = forceRefresh ? '?refresh=true' : '';
  return apiFetch<PlantCareAdviceDto>(`/api/plants/${id}/care-advice${query}`, { method: 'GET' });
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

export async function waterAdminPlant(plantId: number): Promise<AdminPlantActionDto> {
  return apiFetch<AdminPlantActionDto>(`/api/admin/plants/${plantId}/water`, { method: 'POST' });
}

export async function waterAdminOverduePlants(plantIds?: number[]): Promise<AdminBulkPlantWaterDto> {
  return apiFetch<AdminBulkPlantWaterDto>('/api/admin/plants/water-overdue', {
    method: 'POST',
    body: JSON.stringify({ plantIds: plantIds?.length ? plantIds : undefined })
  });
}

export async function deleteAdminPlant(plantId: number): Promise<AdminPlantActionDto> {
  return apiFetch<AdminPlantActionDto>(`/api/admin/plants/${plantId}`, { method: 'DELETE' });
}

export async function updateAdminPlant(
  plantId: number,
  payload: { name?: string; baseIntervalDays?: number; category?: 'HOME' | 'OUTDOOR_DECORATIVE' | 'OUTDOOR_GARDEN' }
): Promise<AdminPlantItemDto> {
  return apiFetch<AdminPlantItemDto>(`/api/admin/plants/${plantId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function getAdminUserPlants(userId: number): Promise<AdminPlantItemDto[]> {
  return apiFetch<AdminPlantItemDto[]>(`/api/admin/users/${userId}/plants`, { method: 'GET' });
}

export async function getAdminUserDetails(userId: number): Promise<AdminUserDetailsDto> {
  return apiFetch<AdminUserDetailsDto>(`/api/admin/users/${userId}/details`, { method: 'GET' });
}

export async function setAdminUserBlocked(userId: number, blocked?: boolean): Promise<AdminUserActionDto> {
  return apiFetch<AdminUserActionDto>(`/api/admin/users/${userId}/block`, {
    method: 'POST',
    body: JSON.stringify({ blocked })
  });
}

export async function deleteAdminUser(userId: number): Promise<AdminUserActionDto> {
  return apiFetch<AdminUserActionDto>(`/api/admin/users/${userId}`, { method: 'DELETE' });
}

export async function getAdminStats(): Promise<AdminStatsDto> {
  return apiFetch<AdminStatsDto>('/api/admin/stats', { method: 'GET' });
}

export async function clearAdminCache(): Promise<AdminCacheClearDto> {
  return apiFetch<AdminCacheClearDto>('/api/admin/clear-cache', { method: 'POST' });
}

export async function clearAdminCacheScope(scope: 'weather' | 'openrouter' | 'users'): Promise<AdminScopedCacheClearDto> {
  return apiFetch<AdminScopedCacheClearDto>(`/api/admin/clear-cache/${scope}`, { method: 'POST' });
}

export async function getAdminBackups(): Promise<AdminBackupItemDto[]> {
  return apiFetch<AdminBackupItemDto[]>('/api/admin/backups', { method: 'GET' });
}

export async function createAdminBackup(): Promise<AdminBackupItemDto> {
  return apiFetch<AdminBackupItemDto>('/api/admin/backup/create', { method: 'POST' });
}

export async function restoreAdminBackup(fileName: string): Promise<AdminBackupRestoreDto> {
  return apiFetch<AdminBackupRestoreDto>(`/api/admin/backups/${encodeURIComponent(fileName)}/restore`, { method: 'POST' });
}

export async function sendAdminPushTest(payload: { userId: number; title?: string; body?: string }): Promise<AdminPushTestDto> {
  return apiFetch<AdminPushTestDto>('/api/admin/push/test', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function getAdminMonitoring(): Promise<AdminMonitoringDto> {
  return apiFetch<AdminMonitoringDto>('/api/admin/monitoring', { method: 'GET' });
}

export async function getAdminActivityLogs(limit = 50): Promise<AdminActivityLogItemDto[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  return apiFetch<AdminActivityLogItemDto[]>(`/api/admin/activity/logs?${params.toString()}`, { method: 'GET' });
}

export async function suggestPlantProfile(name: string): Promise<PlantProfileSuggestionDto> {
  const params = new URLSearchParams({ name });
  return apiFetch<PlantProfileSuggestionDto>(`/api/plants/suggest-profile?${params.toString()}`, { method: 'GET' });
}
