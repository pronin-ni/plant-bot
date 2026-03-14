import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { fetchOpenRouterRuntimeSettings } from '@/lib/api/openrouter';
import { useAuthStore, useOpenRouterModelsStore } from '@/lib/store';

const DEFAULT_TEXT_MODEL = 'qwen/qwen2-7b-instruct';
const DEFAULT_PHOTO_MODEL = 'qwen/qwen2-vl-7b-instruct';

function normalizeModelId(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  let cleaned = value.trim();
  if (!cleaned) {
    return '';
  }
  const commaParts = cleaned.split(',');
  if (commaParts.length > 0) {
    cleaned = commaParts[0].trim();
  }
  const tokenized = cleaned.split(/\s+/);
  if (tokenized.length > 0) {
    cleaned = tokenized[0].trim();
  }
  return cleaned;
}

// ORB4: загружаем глобальные модели на старте и сохраняем в клиентском сторе.
export function useOpenRouterModels() {
  const isAuthorized = useAuthStore((s) => s.isAuthorized);
  const isGuest = useAuthStore((s) => s.isGuest);
  const setModels = useOpenRouterModelsStore((s) => s.setModels);
  const resetToDefault = useOpenRouterModelsStore((s) => s.resetToDefault);

  const modelsQuery = useQuery({
    queryKey: ['openrouter-global-models', 'runtime'],
    queryFn: fetchOpenRouterRuntimeSettings,
    enabled: isAuthorized && !isGuest,
    staleTime: 60_000,
    retry: 1
  });

  useEffect(() => {
    if (!isAuthorized || isGuest) {
      resetToDefault();
    }
  }, [isAuthorized, isGuest, resetToDefault]);

  useEffect(() => {
    if (!modelsQuery.data) {
      return;
    }

    setModels({
      textModel: normalizeModelId(modelsQuery.data.textModel) || DEFAULT_TEXT_MODEL,
      photoModel: normalizeModelId(modelsQuery.data.photoModel) || DEFAULT_PHOTO_MODEL,
      hasApiKey: modelsQuery.data.hasApiKey,
      source: 'server',
      updatedAt: undefined
    });
  }, [modelsQuery.data, setModels]);

  useEffect(() => {
    if (!modelsQuery.isError) {
      return;
    }
    resetToDefault();
  }, [modelsQuery.isError, resetToDefault]);

  return modelsQuery;
}
