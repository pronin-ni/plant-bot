import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getAiRuntimeSettings } from '@/lib/api';
import { useAuthStore, useOpenRouterModelsStore } from '@/lib/store';

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
    queryKey: ['ai-runtime-settings'],
    queryFn: getAiRuntimeSettings,
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
      activeTextProvider: modelsQuery.data.activeTextProvider,
      activeVisionProvider: modelsQuery.data.activeVisionProvider,
      textModel: normalizeModelId(modelsQuery.data.textModel),
      photoModel: normalizeModelId(modelsQuery.data.visionModel),
      hasApiKey: modelsQuery.data.openrouterHasApiKey || modelsQuery.data.openaiHasApiKey,
      openrouterHasApiKey: modelsQuery.data.openrouterHasApiKey,
      openaiHasApiKey: modelsQuery.data.openaiHasApiKey,
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
