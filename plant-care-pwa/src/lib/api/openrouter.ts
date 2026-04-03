import type {
  AdminOpenRouterAvailabilityCheckDto,
  AdminOpenRouterModelsDto,
  OpenRouterModelsDto,
  OpenRouterRuntimeSettingsDto,
  OpenRouterTypedTestDto
} from '@/types/api';
import {
  clearAdminCacheScope,
  getAdminOpenRouterModels,
  checkAdminOpenRouterAvailability,
  getOpenRouterModels,
  getOpenRouterRuntimeSettings,
  saveAdminOpenRouterModels,
  testOpenRouterModel,
  validateOpenRouterKey
} from '@/lib/api';

// ORB6: единая точка входа для OpenRouter API на фронте.
export async function fetchOpenRouterCatalog(): Promise<OpenRouterModelsDto> {
  return getOpenRouterModels();
}

export async function fetchAdminOpenRouterModels(): Promise<AdminOpenRouterModelsDto> {
  return getAdminOpenRouterModels();
}

export async function updateAdminOpenRouterModels(payload: {
  textModel?: string | null;
  photoModel?: string | null;
  textModelCheckIntervalMinutes?: number | null;
  photoModelCheckIntervalMinutes?: number | null;
  healthChecksEnabled?: boolean | null;
  retryCount?: number | null;
  retryBaseDelayMs?: number | null;
  retryMaxDelayMs?: number | null;
  requestTimeoutMs?: number | null;
  degradedFailureThreshold?: number | null;
  unavailableFailureThreshold?: number | null;
  unavailableCooldownMinutes?: number | null;
  recoveryRecheckIntervalMinutes?: number | null;
  aiTextCacheEnabled?: boolean | null;
  aiTextCacheTtlDays?: number | null;
}): Promise<AdminOpenRouterModelsDto> {
  return saveAdminOpenRouterModels(payload);
}

export async function clearAdminOpenRouterCacheScope(scope: 'ai-text' | 'ai-text-expired') {
  return clearAdminCacheScope(scope);
}

export async function runOpenRouterAvailabilityCheck(type: 'text' | 'photo'): Promise<AdminOpenRouterAvailabilityCheckDto> {
  return checkAdminOpenRouterAvailability(type);
}

export async function runOpenRouterTypedTest(type: 'text' | 'photo'): Promise<OpenRouterTypedTestDto> {
  return testOpenRouterModel(type);
}

export async function fetchOpenRouterRuntimeSettings(): Promise<OpenRouterRuntimeSettingsDto> {
  return getOpenRouterRuntimeSettings();
}

export async function validateOpenRouterApiKey(apiKey: string): Promise<{ ok: boolean; message?: string }> {
  return validateOpenRouterKey(apiKey);
}
