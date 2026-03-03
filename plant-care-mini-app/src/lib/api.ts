import { getTelegramInitData } from '@/lib/telegram';
import type {
  AuthValidationResponse,
  CalendarSyncDto,
  CalendarEventDto,
  PlantDto,
  PlantLearningDto,
  PlantStatsDto
} from '@/types/api';

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
