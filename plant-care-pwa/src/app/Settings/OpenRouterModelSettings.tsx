import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, Cpu, Eye, EyeOff, KeyRound, LoaderCircle, Sparkles } from 'lucide-react';

import { clearOpenRouterApiKey, getOpenRouterModels, getOpenRouterPreferences, saveOpenRouterPreferences } from '@/lib/api';
import { hapticImpact, hapticNotify } from '@/lib/telegram';
import { Button } from '@/components/ui/button';
import { SettingsToggle } from '@/components/SettingsToggle';

function maskApiKey(value: string | null | undefined): string {
  if (!value) {
    return 'Ключ не задан';
  }
  if (value.length <= 12) {
    return `${value.slice(0, 2)}••••••${value.slice(-2)}`;
  }
  return `${value.slice(0, 6)}••••••••••••${value.slice(-6)}`;
}

function generateOpenRouterKeyDraft(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomPart = '';
  for (let i = 0; i < 48; i += 1) {
    randomPart += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `sk-or-v1-${randomPart}`;
}

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
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [savePulseKey, setSavePulseKey] = useState(0);
  const reduceMotion = useReducedMotion();

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
    onMutate: () => {
      hapticImpact('light');
      setSaveSuccess(null);
    },
    onSuccess: () => {
      hapticImpact('medium');
      hapticNotify('success');
      navigator.vibrate?.(100);
      setApiKey('');
      setSaveSuccess('Ваши растения скажут спасибо 🌿');
      setSavePulseKey(Date.now());
      setTimeout(() => setSaveSuccess(null), 2200);
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
      setShowKeyInput(false);
      void preferencesQuery.refetch();
    },
    onError: () => hapticNotify('error')
  });

  const modelOptions = modelsQuery.data?.models ?? [];
  const visibleOptions = useMemo(
    () => modelOptions.filter((model) => showPaidModels || model.free),
    [modelOptions, showPaidModels]
  );
  const photoOptions = useMemo(
    () => visibleOptions.filter((model) => model.supportsImageToText),
    [visibleOptions]
  );

  const selectedPreview = useMemo(() => {
    const map = new Map(modelOptions.map((model) => [model.id, model]));
    return [
      { label: 'Уход и подбор', value: plantModel || 'Авто (по умолчанию)' },
      { label: 'AI-чат', value: chatModel || 'Авто (по умолчанию)' },
      {
        label: 'Фото распознавание',
        value: photoIdentifyModel || 'Авто (по умолчанию)'
      },
      {
        label: 'Фото диагностика',
        value: photoDiagnoseModel || 'Авто (по умолчанию)'
      }
    ].map((item) => {
      if (!item.value || item.value === 'Авто (по умолчанию)') {
        return item;
      }
      const meta = map.get(item.value);
      return {
        ...item,
        value: `${item.value}${meta?.free ? ' [free]' : ' [paid]'}`
      };
    });
  }, [chatModel, modelOptions, photoDiagnoseModel, photoIdentifyModel, plantModel]);

  return (
    <div className="space-y-3">
      <div className="rounded-ios-button border border-ios-border/60 bg-white/60 p-3 dark:border-emerald-500/20 dark:bg-zinc-900/45">
        <div className="mb-2 flex items-center gap-2">
          <Cpu className="h-4 w-4 text-ios-accent" />
          <p className="text-sm font-medium text-ios-text">OpenRouter: модели и ключ</p>
        </div>

        <p className="text-ios-caption text-ios-subtext">
          Отдельные модели для AI-чата, подбора ухода и фото-анализа.
        </p>

        <div className="mt-3 rounded-2xl border border-ios-border/60 bg-white/60 p-3 dark:border-emerald-500/20 dark:bg-zinc-950/55">
          <p className="mb-1 text-xs text-ios-subtext">Текущий персональный API-ключ</p>
          <p className="font-mono text-xs text-ios-text">
            {preferencesQuery.data?.hasApiKey
              ? maskApiKey(preferencesQuery.data.apiKey ?? 'sk-or-v1-******')
              : 'Ключ не задан'}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            variant="secondary"
            onClick={() => {
              hapticImpact('light');
              setApiKey(generateOpenRouterKeyDraft());
              setShowKeyInput(true);
            }}
          >
            <Sparkles className="mr-1.5 h-4 w-4" />
            Сгенерировать новый ключ
          </Button>

          <Button
            variant="secondary"
            onClick={() => {
              hapticImpact('light');
              setShowKeyInput((prev) => !prev);
            }}
          >
            {showKeyInput ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}
            {showKeyInput ? 'Скрыть поле ключа' : 'Показать поле ключа'}
          </Button>
        </div>

        {showKeyInput ? (
          <label className="mt-3 block">
            <span className="mb-1 block text-ios-caption text-ios-subtext">OpenRouter API Key</span>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ios-subtext" />
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="sk-or-v1-..."
                className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/70 pl-10 pr-3 text-ios-body outline-none backdrop-blur-ios dark:border-emerald-500/20 dark:bg-zinc-900/60"
              />
            </div>
          </label>
        ) : null}
      </div>

      <SettingsToggle
        label="Показывать платные модели"
        description="По умолчанию отображаются только бесплатные"
        checked={showPaidModels}
        onChange={(next) => {
          hapticImpact('light');
          setShowPaidModels(next);
        }}
      />

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

      <div className="rounded-ios-button border border-ios-border/60 bg-white/60 p-3 dark:border-emerald-500/20 dark:bg-zinc-900/45">
        <p className="mb-2 text-xs font-medium text-ios-text">Превью выбранных моделей</p>
        <div className="space-y-1 text-xs text-ios-subtext">
          {selectedPreview.map((item) => (
            <p key={item.label}>
              {item.label}: <span className="text-ios-text">{item.value}</span>
            </p>
          ))}
        </div>
      </div>

      <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? 'Сохраняем...' : 'Сохранить модели'}
      </Button>

      <AnimatePresence initial={false}>
        {saveSuccess ? (
          <motion.div
            key="openrouter-save-success"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300"
          >
            {!reduceMotion ? (
              <motion.span
                key={savePulseKey}
                aria-hidden
                className="pointer-events-none absolute inset-0"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: [0, 0.38, 0], scale: [0.85, 1, 1.15] }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                style={{
                  background:
                    'radial-gradient(120% 90% at 20% 18%, rgba(52,199,89,0.34) 0%, rgba(52,199,89,0.16) 36%, rgba(52,199,89,0) 76%)'
                }}
              />
            ) : null}
            <span className="relative inline-flex items-center gap-2">
              <span className="relative inline-flex h-5 w-5 items-center justify-center">
                <motion.svg
                  viewBox="0 0 24 24"
                  className="absolute inset-0 h-5 w-5 -rotate-90"
                  initial={false}
                >
                  <motion.circle
                    cx="12"
                    cy="12"
                    r="9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0.3 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: reduceMotion ? 0.2 : 1, ease: 'easeOut' }}
                  />
                </motion.svg>
                <motion.span
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 330, damping: 23 }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </motion.span>
              </span>
              <span>Сохранено! {saveSuccess}</span>
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>

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
        className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/70 px-3 text-ios-body outline-none backdrop-blur-ios dark:border-emerald-500/20 dark:bg-zinc-900/60"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Авто (по умолчанию)</option>
        {options.map((model) => (
          <option key={model.id} value={model.id}>
            {model.id}{model.free ? ' [free]' : ' [paid]'}
          </option>
        ))}
      </select>
    </label>
  );
}
