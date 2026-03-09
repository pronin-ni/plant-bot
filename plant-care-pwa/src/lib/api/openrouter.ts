import type {
  AdminOpenRouterModelsDto,
  OpenRouterModelsDto,
  OpenRouterRuntimeSettingsDto,
  OpenRouterTypedTestDto
} from '@/types/api';
import {
  getAdminOpenRouterModels,
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
}): Promise<AdminOpenRouterModelsDto> {
  return saveAdminOpenRouterModels(payload);
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
