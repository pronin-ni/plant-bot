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
  updateAdminOpenRouterModels,
  validateOpenRouterApiKey
} from '@/lib/api/openrouter';
import { error as hapticError, impactLight, impactMedium, impactHeavy } from '@/lib/haptics';
import { useAuthStore, useOpenRouterModelsStore } from '@/lib/store';
import type { OpenRouterModelOption } from '@/types/api';


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

function pickRecommendedModel(models: OpenRouterModelOption[], supportsImageToText: boolean): string {
  const free = models.find((item) => item.supportsImageToText === supportsImageToText && item.free);
  if (free) {
    return free.id;
  }
  const fallback = models.find((item) => item.supportsImageToText === supportsImageToText);
  return fallback?.id ?? '';
}

// ORB5: упрощённая секция OpenRouter — только 2 глобальные модели (text/photo) + тесты.
export function OpenRouterSettings() {
  const queryClient = useQueryClient();
  const runtimeModels = useOpenRouterModelsStore((s) => s);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const prefersReducedMotion = useReducedMotion();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingType, setTestingType] = useState<'text' | 'photo' | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showPaid, setShowPaid] = useState(false);
  const [keyToValidate, setKeyToValidate] = useState('');
  const [validatingKey, setValidatingKey] = useState(false);
  const [successPulse, setSuccessPulse] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const [allModels, setAllModels] = useState<OpenRouterModelOption[]>([]);
  const [textModel, setTextModel] = useState('');
  const [photoModel, setPhotoModel] = useState('');

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
      const recommendedText = pickRecommendedModel(normalized, false);
      const recommendedPhoto = pickRecommendedModel(normalized, true);
      const nextText = normalizeModelId(globalModels.textModel) || runtimeModels.textModel || recommendedText;
      const nextPhoto = normalizeModelId(globalModels.photoModel) || runtimeModels.photoModel || recommendedPhoto;
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
          : (recommendedText || recommendedPhoto)
            ? 'Ключ не задан: используем актуальные fallback-модели из каталога OpenRouter'
            : 'Ключ не задан и каталог OpenRouter не вернул доступные fallback-модели'
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

  const recommendedTextModel = useMemo(() => pickRecommendedModel(allModels, false), [allModels]);
  const recommendedPhotoModel = useMemo(() => pickRecommendedModel(allModels, true), [allModels]);

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
      const nextRequestedText = normalizeModelId(textModel) || recommendedTextModel;
      const nextRequestedPhoto = normalizeModelId(photoModel) || recommendedPhotoModel;
      if (!nextRequestedText || !nextRequestedPhoto) {
        setStatus('OpenRouter не вернул подходящие fallback-модели. Обновите каталог или задайте модели вручную.');
        impactLight();
        return;
      }

      const result = await updateAdminOpenRouterModels({
        textModel: nextRequestedText,
        photoModel: nextRequestedPhoto
      });

      const nextText = normalizeModelId(result.textModel) || recommendedTextModel;
      const nextPhoto = normalizeModelId(result.photoModel) || recommendedPhotoModel;
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
      impactHeavy();
    } catch (error) {
      console.error(error);
      setStatus('Ошибка сохранения моделей');
      hapticError();
    } finally {
      setSaving(false);
    }
  };

  const handleValidateKey = async () => {
    const normalized = keyToValidate.trim();
    if (!normalized) {
      setStatus('Введите API ключ для проверки.');
      return;
    }
    setValidatingKey(true);
    setStatus('Проверяем API ключ через OpenRouter...');
    try {
      const res = await validateOpenRouterApiKey(normalized);
      if (res.ok) {
        setStatus(res.message || 'Ключ валиден');
        impactMedium();
      } else {
        setStatus(res.message || 'Ключ не прошёл проверку');
        hapticError();
      }
    } catch (error) {
      console.error(error);
      setStatus('Не удалось проверить ключ');
    } finally {
      setValidatingKey(false);
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
        impactMedium();
      } else {
        setStatus(res.message || `Тест ${type} не прошёл`);
        hapticError();
      }
    } catch (error) {
      console.error(error);
      setStatus(`Ошибка теста ${type}`);
      hapticError();
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
        <div className="theme-surface-1 rounded-2xl border p-3 text-[12px] text-ios-subtext">
          Загружаем глобальные настройки…
        </div>
      ) : null}

      <div className="theme-surface-1 rounded-2xl border p-3">
        <p className="text-[12px] uppercase tracking-wide text-ios-subtext">Глобальные настройки OpenRouter</p>
        <p className="mt-1 text-sm text-ios-text">
          Модель для текста используется для вопросов без фото (чаты, полив, рекомендации).
          Модель для фото — для распознавания, диагностики и чатов с изображением.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ios-subtext">
          <span className="theme-surface-subtle rounded-full border px-2 py-1">
            Runtime text: {runtimeModels.textModel || recommendedTextModel || 'автовыбор недоступен'}
          </span>
          <span className="theme-surface-subtle rounded-full border px-2 py-1">
            Runtime photo: {runtimeModels.photoModel || recommendedPhotoModel || 'автовыбор недоступен'}
          </span>
          <span className="theme-surface-subtle rounded-full border px-2 py-1">
            Синхр.: {formatSyncTime(lastSavedAt ?? runtimeModels.updatedAt)}
          </span>
        </div>
      </div>

      <div className="theme-surface-1 rounded-2xl border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ios-text">Проверка API ключа</p>
          <span className="text-[11px] text-ios-subtext">Не сохраняется, только проверка</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            type="password"
            value={keyToValidate}
            onChange={(event) => setKeyToValidate(event.target.value)}
            placeholder="sk-or-v1-..."
            className="theme-field h-11 min-w-[220px] flex-1 rounded-ios-button border px-3 text-sm outline-none backdrop-blur-ios"
          />
          <Button variant="secondary" onClick={handleValidateKey} disabled={validatingKey || !keyToValidate.trim()}>
            {validatingKey ? 'Проверяем...' : 'Проверить ключ'}
          </Button>
        </div>
      </div>

      <div className="theme-surface-1 rounded-2xl border p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ios-text">Выбор моделей</p>
          {!loading ? (
            <span className="theme-surface-subtle rounded-full border px-2 py-1 text-[11px] text-ios-subtext">
              Text: {textOptions.length} · Photo: {photoOptions.length}
            </span>
          ) : null}
          <label className="flex items-center gap-2 text-[12px] text-ios-subtext">
            <input
              type="checkbox"
              checked={showPaid}
              onChange={(e) => {
                setShowPaid(e.target.checked);
                impactLight();
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
                setTextModel(normalizeModelId(e.target.value));
                impactLight();
              }}
              disabled={loading || textOptions.length === 0}
              className="theme-field h-11 w-full rounded-ios-button border px-3 text-sm outline-none"
            >
              {textOptions.length === 0 ? <option value="">Нет доступных text-моделей</option> : null}
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
                setPhotoModel(normalizeModelId(e.target.value));
                impactLight();
              }}
              disabled={loading || photoOptions.length === 0}
              className="theme-field h-11 w-full rounded-ios-button border px-3 text-sm outline-none"
            >
              {photoOptions.length === 0 ? <option value="">Нет доступных vision-моделей</option> : null}
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
        <Button className="h-11 rounded-2xl" onClick={handleSave} disabled={saving || loading || !hasUnsavedChanges || !textModel || !photoModel}>
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
        <p className="theme-text-warning text-[12px]">
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
            className="theme-surface-success relative inline-flex items-center gap-2 overflow-hidden rounded-2xl border px-3 py-2 text-sm"
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
