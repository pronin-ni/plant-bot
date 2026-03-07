import { getTelegramInitData } from '@/lib/telegram';
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
  PlantPresetSuggestionDto,
  PlantAiRecommendDto
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
  const headers = new Headers(init.headers ?? {});

  headers.set('Content-Type', 'application/json');
  headers.set('X-Telegram-Init-Data', initData);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function validateTelegramAuth(): Promise<AuthValidationResponse> {
  return apiFetch<AuthValidationResponse>('/api/auth/validate', {
    method: 'POST'
  });
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
  return apiFetch<PlantPresetSuggestionDto[]>(`/api/plants/presets?${params.toString()}`, { method: 'GET' });
}

export async function aiRecommendPlant(payload: {
  name: string;
  category: 'HOME' | 'OUTDOOR_DECORATIVE' | 'OUTDOOR_GARDEN';
  potVolumeLiters?: number;
  heightCm?: number;
  diameterCm?: number;
}): Promise<PlantAiRecommendDto> {
  return apiFetch<PlantAiRecommendDto>('/api/plants/ai-recommend', {
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
