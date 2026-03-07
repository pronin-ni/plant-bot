import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Cpu, LoaderCircle } from 'lucide-react';

import { clearOpenRouterApiKey, getOpenRouterModels, getOpenRouterPreferences, saveOpenRouterPreferences } from '@/lib/api';
import { hapticImpact, hapticNotify } from '@/lib/telegram';
import { Button } from '@/components/ui/button';

export function OpenRouterModelSettings() {
  const modelsQuery = useQuery({
    queryKey: ['openrouter-models'],
    queryFn: getOpenRouterModels
  });

  const preferencesQuery = useQuery({
    queryKey: ['openrouter-preferences'],
    queryFn: getOpenRouterPreferences
  });

  const [plantModel, setPlantModel] = useState('');
  const [chatModel, setChatModel] = useState('');
  const [photoIdentifyModel, setPhotoIdentifyModel] = useState('');
  const [photoDiagnoseModel, setPhotoDiagnoseModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showPaidModels, setShowPaidModels] = useState(false);

  useEffect(() => {
    const p = preferencesQuery.data;
    if (!p) {
      return;
    }
    setPlantModel(p.plantModel ?? '');
    setChatModel(p.chatModel ?? '');
    setPhotoIdentifyModel(p.photoIdentifyModel ?? '');
    setPhotoDiagnoseModel(p.photoDiagnoseModel ?? '');
  }, [preferencesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => saveOpenRouterPreferences({
      plantModel: plantModel || null,
      chatModel: chatModel || null,
      photoIdentifyModel: photoIdentifyModel || null,
      photoDiagnoseModel: photoDiagnoseModel || null,
      apiKey: apiKey.trim().length > 0 ? apiKey.trim() : undefined
    }),
    onMutate: () => hapticImpact('light'),
    onSuccess: () => {
      hapticNotify('success');
      setApiKey('');
      void preferencesQuery.refetch();
    },
    onError: () => hapticNotify('error')
  });

  const clearApiKeyMutation = useMutation({
    mutationFn: clearOpenRouterApiKey,
    onMutate: () => hapticImpact('medium'),
    onSuccess: () => {
      hapticNotify('success');
      setApiKey('');
      void preferencesQuery.refetch();
    },
    onError: () => hapticNotify('error')
  });

  const modelOptions = modelsQuery.data?.models ?? [];
  const visibleOptions = modelOptions.filter((model) => showPaidModels || model.free);
  const photoOptions = visibleOptions.filter((model) => model.supportsImageToText);

  return (
    <div className="ios-blur-card space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Cpu className="h-4 w-4 text-ios-accent" />
        <p className="text-ios-body font-medium">OpenRouter: выбор моделей</p>
      </div>

      <p className="text-ios-caption text-ios-subtext">
        Можно выбрать отдельные модели для: автоподбора растения, AI-чата, распознавания фото и диагностики фото.
      </p>
      <label className="inline-flex items-center gap-2 text-ios-caption text-ios-subtext">
        <input
          type="checkbox"
          checked={showPaidModels}
          onChange={(event) => setShowPaidModels(event.target.checked)}
        />
        Показывать платные модели
      </label>
      <p className="text-ios-caption text-ios-subtext">
        Текущий персональный API-ключ: {preferencesQuery.data?.hasApiKey ? 'задан' : 'не задан'}.
      </p>

      <label className="block">
        <span className="mb-1 block text-ios-caption text-ios-subtext">OpenRouter API Key (опционально, персональный)</span>
        <input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="sk-or-v1-..."
          className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/70 px-3 text-ios-body outline-none backdrop-blur-ios dark:bg-zinc-900/60"
        />
      </label>

      {modelsQuery.isLoading || preferencesQuery.isLoading ? (
        <p className="flex items-center gap-2 text-ios-caption text-ios-subtext">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Загружаем список моделей...
        </p>
      ) : null}

      <ModelSelect
        label="Модель для подбора растения/ухода"
        value={plantModel}
        onChange={setPlantModel}
        options={visibleOptions}
      />
      <ModelSelect
        label="Модель для AI-чата"
        value={chatModel}
        onChange={setChatModel}
        options={visibleOptions}
      />
      <ModelSelect
        label="Модель для фото: распознавание"
        value={photoIdentifyModel}
        onChange={setPhotoIdentifyModel}
        options={photoOptions}
      />
      <ModelSelect
        label="Модель для фото: диагностика"
        value={photoDiagnoseModel}
        onChange={setPhotoDiagnoseModel}
        options={photoOptions}
      />

      <Button
        className="w-full"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
      >
        {saveMutation.isPending ? 'Сохраняем...' : 'Сохранить модели'}
      </Button>

      {preferencesQuery.data?.hasApiKey ? (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => {
            if (!window.confirm('Удалить персональный API-ключ OpenRouter?')) {
              return;
            }
            clearApiKeyMutation.mutate();
          }}
          disabled={clearApiKeyMutation.isPending}
        >
          {clearApiKeyMutation.isPending ? 'Очищаем ключ...' : 'Очистить персональный API-ключ'}
        </Button>
      ) : null}
    </div>
  );
}

function ModelSelect({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: Array<{ id: string; name: string; free: boolean; supportsImageToText: boolean }>;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-ios-caption text-ios-subtext">{label}</span>
      <select
        className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/70 px-3 text-ios-body outline-none backdrop-blur-ios dark:bg-zinc-900/60"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Авто (по умолчанию)</option>
        {options.map((model) => (
          <option key={model.id} value={model.id}>
            {model.id}{model.free ? ' [free]' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
