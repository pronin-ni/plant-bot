import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Brain, CheckCircle2, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SettingsTutorial } from '@/components/SettingsTutorial';
import {
  fetchAdminOpenRouterModels,
  fetchOpenRouterCatalog,
  runOpenRouterTypedTest,
  updateAdminOpenRouterModels
} from '@/lib/api/openrouter';
import { hapticImpact } from '@/lib/telegram';
import { useAuthStore, useOpenRouterModelsStore } from '@/lib/store';
import type { OpenRouterModelOption } from '@/types/api';

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

function ensureOption(options: OpenRouterModelOption[], value: string, supportsImageToText: boolean): OpenRouterModelOption[] {
  if (!value) {
    return options;
  }
  const exists = options.some((item) => item.id === value);
  if (exists) {
    return options;
  }
  return [
    {
      id: value,
      name: value,
      free: value.endsWith(':free'),
      supportsImageToText,
      contextLength: null,
      inputPrice: null,
      outputPrice: null
    },
    ...options
  ];
}

// ORB5: упрощённая секция OpenRouter — только 2 глобальные модели (text/photo) + тесты.
export function OpenRouterSettings() {
  const queryClient = useQueryClient();
  const runtimeModels = useOpenRouterModelsStore((s) => s);
  const roles = useAuthStore((s) => s.roles);
  const isAdmin = roles.includes('ROLE_ADMIN');
  const prefersReducedMotion = useReducedMotion();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingType, setTestingType] = useState<'text' | 'photo' | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showPaid, setShowPaid] = useState(false);
  const [successPulse, setSuccessPulse] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const [allModels, setAllModels] = useState<OpenRouterModelOption[]>([]);
  const [textModel, setTextModel] = useState(DEFAULT_TEXT_MODEL);
  const [photoModel, setPhotoModel] = useState(DEFAULT_PHOTO_MODEL);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void load();
  }, [isAdmin]);

  if (!isAdmin) {
    return null;
  }

  const load = async () => {
    setLoading(true);
    try {
      const [catalog, globalModels] = await Promise.all([
        fetchOpenRouterCatalog(),
        fetchAdminOpenRouterModels()
      ]);
      const normalized = (catalog.models ?? [])
        .map((item) => ({ ...item, id: normalizeModelId(item.id) }))
        .filter((item) => item.id);

      setAllModels(normalized);
      const nextText = normalizeModelId(globalModels.textModel) || runtimeModels.textModel || DEFAULT_TEXT_MODEL;
      const nextPhoto = normalizeModelId(globalModels.photoModel) || runtimeModels.photoModel || DEFAULT_PHOTO_MODEL;
      setTextModel(nextText);
      setPhotoModel(nextPhoto);

      runtimeModels.setModels({
        textModel: nextText,
        photoModel: nextPhoto,
        hasApiKey: globalModels.hasApiKey,
        source: 'server',
        updatedAt: globalModels.updatedAt ?? undefined
      });
      setLastSavedAt(globalModels.updatedAt ?? null);

      setStatus(
        globalModels.hasApiKey
          ? 'Глобальные модели загружены'
          : 'Ключ не задан: будут работать fallback-модели'
      );
    } catch (error) {
      console.error(error);
      setStatus('Не удалось загрузить OpenRouter конфигурацию');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    return allModels.filter((item) => (showPaid ? true : item.free));
  }, [allModels, showPaid]);

  const textOptions = useMemo(
    () => ensureOption(filtered.filter((item) => !item.supportsImageToText), textModel, false),
    [filtered, textModel]
  );
  const photoOptions = useMemo(
    () => ensureOption(filtered.filter((item) => item.supportsImageToText), photoModel, true),
    [filtered, photoModel]
  );

  const handleSave = async () => {
    setSaving(true);
    setStatus('Сохраняем глобальные модели...');
    try {
      const result = await updateAdminOpenRouterModels({
        textModel: normalizeModelId(textModel) || DEFAULT_TEXT_MODEL,
        photoModel: normalizeModelId(photoModel) || DEFAULT_PHOTO_MODEL
      });

      const nextText = normalizeModelId(result.textModel) || DEFAULT_TEXT_MODEL;
      const nextPhoto = normalizeModelId(result.photoModel) || DEFAULT_PHOTO_MODEL;
      setTextModel(nextText);
      setPhotoModel(nextPhoto);

      runtimeModels.setModels({
        textModel: nextText,
        photoModel: nextPhoto,
        hasApiKey: result.hasApiKey,
        source: 'server',
        updatedAt: result.updatedAt ?? undefined
      });
      setLastSavedAt(result.updatedAt ?? null);

      await queryClient.invalidateQueries({ queryKey: ['openrouter-global-models'] });
      setSuccessPulse(true);
      setTimeout(() => setSuccessPulse(false), prefersReducedMotion ? 300 : 1000);
      setStatus('Сохранено глобально для всех пользователей');
      hapticImpact('heavy');
    } catch (error) {
      console.error(error);
      setStatus('Ошибка сохранения моделей');
      hapticImpact('light');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (type: 'text' | 'photo') => {
    setTestingType(type);
    setStatus(type === 'text' ? 'Тестируем text-модель...' : 'Тестируем photo-модель...');
    try {
      const res = await runOpenRouterTypedTest(type);
      if (res.ok) {
        setStatus(
          res.answer
            ? `Тест ${type} успешен (${res.model ?? 'model'}): ${res.answer.slice(0, 88)}...`
            : `Тест ${type} успешен (${res.model ?? 'model'})`
        );
        hapticImpact('medium');
      } else {
        setStatus(res.message || `Тест ${type} не прошёл`);
        hapticImpact('light');
      }
    } catch (error) {
      console.error(error);
      setStatus(`Ошибка теста ${type}`);
      hapticImpact('light');
    } finally {
      setTestingType(null);
    }
  };

  const hasUnsavedChanges =
    normalizeModelId(textModel) !== normalizeModelId(runtimeModels.textModel) ||
    normalizeModelId(photoModel) !== normalizeModelId(runtimeModels.photoModel);

  const formatSyncTime = (value: string | null | undefined) => {
    if (!value) {
      return '—';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    return date.toLocaleString('ru-RU');
  };

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="rounded-2xl border border-ios-border/60 bg-white/65 p-3 text-[12px] text-ios-subtext dark:border-emerald-500/20 dark:bg-gradient-to-br dark:from-zinc-950/70 dark:to-emerald-950/20">
          Загружаем глобальные настройки…
        </div>
      ) : null}

      <div className="rounded-2xl border border-ios-border/60 bg-white/65 p-3 dark:border-emerald-500/20 dark:bg-gradient-to-br dark:from-zinc-950/70 dark:to-emerald-950/20">
        <p className="text-[12px] uppercase tracking-wide text-ios-subtext">Глобальные настройки OpenRouter</p>
        <p className="mt-1 text-sm text-ios-text">
          Модель для текста используется для вопросов без фото (чаты, полив, рекомендации).
          Модель для фото — для распознавания, диагностики и чатов с изображением.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ios-subtext">
          <span className="rounded-full border border-ios-border/60 bg-white/70 px-2 py-1 dark:bg-zinc-900/60">
            Runtime text: {runtimeModels.textModel || DEFAULT_TEXT_MODEL}
          </span>
          <span className="rounded-full border border-ios-border/60 bg-white/70 px-2 py-1 dark:bg-zinc-900/60">
            Runtime photo: {runtimeModels.photoModel || DEFAULT_PHOTO_MODEL}
          </span>
          <span className="rounded-full border border-ios-border/60 bg-white/70 px-2 py-1 dark:bg-zinc-900/60">
            Синхр.: {formatSyncTime(lastSavedAt ?? runtimeModels.updatedAt)}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-ios-border/60 bg-white/65 p-3 dark:border-emerald-500/20 dark:bg-gradient-to-br dark:from-zinc-950/70 dark:to-emerald-950/20">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ios-text">Выбор моделей</p>
          {!loading ? (
            <span className="rounded-full border border-ios-border/60 bg-white/70 px-2 py-1 text-[11px] text-ios-subtext dark:bg-zinc-900/60">
              Text: {textOptions.length} · Photo: {photoOptions.length}
            </span>
          ) : null}
          <label className="flex items-center gap-2 text-[12px] text-ios-subtext">
            <input
              type="checkbox"
              checked={showPaid}
              onChange={(e) => {
                setShowPaid(e.target.checked);
                hapticImpact('light');
              }}
              disabled={loading}
              className="h-4 w-4 rounded border-ios-border/60 text-ios-accent"
            />
            Показывать платные модели
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[12px] text-ios-subtext">Модель для текста</span>
            <select
              value={textModel}
              onChange={(e) => {
                setTextModel(normalizeModelId(e.target.value) || DEFAULT_TEXT_MODEL);
                hapticImpact('light');
              }}
              disabled={loading}
              className="h-11 w-full rounded-ios-button border border-ios-border/60 bg-white/70 px-3 text-sm outline-none dark:bg-zinc-900/60"
            >
              {textOptions.map((model) => (
                <option key={`text-${model.id}`} value={model.id}>
                  {model.name} {model.free ? '· free' : '· paid'}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[12px] text-ios-subtext">Модель для фото</span>
            <select
              value={photoModel}
              onChange={(e) => {
                setPhotoModel(normalizeModelId(e.target.value) || DEFAULT_PHOTO_MODEL);
                hapticImpact('light');
              }}
              disabled={loading}
              className="h-11 w-full rounded-ios-button border border-ios-border/60 bg-white/70 px-3 text-sm outline-none dark:bg-zinc-900/60"
            >
              {photoOptions.map((model) => (
                <option key={`photo-${model.id}`} value={model.id}>
                  {model.name} {model.free ? '· free' : '· paid'}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button className="h-11 rounded-2xl" onClick={handleSave} disabled={saving || loading || !hasUnsavedChanges}>
          {saving ? 'Сохраняем...' : 'Сохранить глобально'}
        </Button>
        <Button
          variant="secondary"
          className="h-11 rounded-2xl"
          onClick={() => handleTest('text')}
          disabled={loading || testingType !== null}
        >
          {testingType === 'text' ? 'Тестируем text...' : 'Тест модели для текста'}
        </Button>
        <Button
          variant="secondary"
          className="h-11 rounded-2xl"
          onClick={() => handleTest('photo')}
          disabled={loading || testingType !== null}
        >
          {testingType === 'photo' ? 'Тестируем photo...' : 'Тест модели для фото'}
        </Button>
      </div>

      {hasUnsavedChanges ? (
        <p className="text-[12px] text-amber-700 dark:text-amber-300">
          Есть несохранённые изменения моделей.
        </p>
      ) : null}

      <AnimatePresence>
        {successPulse ? (
          <motion.div
            key="openrouter-save-ok"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 6 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -4 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            className="relative inline-flex items-center gap-2 overflow-hidden rounded-2xl border border-emerald-400/45 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300"
          >
            {prefersReducedMotion ? null : (
              <motion.span
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.22),transparent_70%)]"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1.35, opacity: [0, 1, 0] }}
                transition={{ duration: 0.85 }}
              />
            )}
            <CheckCircle2 className="h-4 w-4" />
            Сохранено
            <motion.span
              className="inline-flex"
              animate={prefersReducedMotion ? { opacity: 1 } : { scale: [1, 1.24, 1] }}
              transition={prefersReducedMotion ? { duration: 0.2 } : { duration: 0.55 }}
            >
              <Sparkles className="h-3.5 w-3.5" />
            </motion.span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {status ? <p className="text-[12px] text-ios-subtext">{status}</p> : null}

      <SettingsTutorial
        steps={[
          { title: '1. Выберите text', description: 'Чаты и рекомендации без фото', icon: Brain },
          { title: '2. Выберите photo', description: 'Распознавание и диагностика по фото', icon: Brain },
          { title: '3. Сохраните и протестируйте', description: 'Проверьте оба типа кнопками теста', icon: Sparkles }
        ]}
        tone="emerald"
      />
    </div>
  );
}
