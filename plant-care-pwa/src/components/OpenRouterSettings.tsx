import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Brain, CheckCircle2, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SettingsTutorial } from '@/components/SettingsTutorial';
import {
  fetchAdminOpenRouterModels,
  fetchOpenRouterCatalog,
  runOpenRouterAvailabilityCheck,
  runOpenRouterTypedTest,
  updateAdminOpenRouterModels,
  validateOpenRouterApiKey
} from '@/lib/api/openrouter';
import { error as hapticError, impactLight, impactMedium, impactHeavy } from '@/lib/haptics';
import { useAuthStore, useOpenRouterModelsStore } from '@/lib/store';
import type { OpenRouterModelOption } from '@/types/api';

const CHECK_INTERVAL_OPTIONS = [
  { value: 0, label: 'Выключено' },
  { value: 5, label: '5 минут' },
  { value: 15, label: '15 минут' },
  { value: 30, label: '30 минут' },
  { value: 60, label: '60 минут' },
  { value: 180, label: '3 часа' },
  { value: 360, label: '6 часов' }
];

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

function statusTone(status?: string | null): string {
  switch ((status ?? '').toUpperCase()) {
    case 'AVAILABLE':
      return 'theme-badge-success';
    case 'UNAVAILABLE':
    case 'ERROR':
      return 'theme-badge-danger';
    case 'UNKNOWN':
    default:
      return 'theme-badge-warning';
  }
}

function statusLabel(status?: string | null): string {
  switch ((status ?? '').toUpperCase()) {
    case 'AVAILABLE':
      return 'Доступна';
    case 'UNAVAILABLE':
      return 'Недоступна';
    case 'ERROR':
      return 'Ошибка проверки';
    case 'UNKNOWN':
    default:
      return 'Не проверялась';
  }
}

function intervalLabel(minutes?: number | null): string {
  const found = CHECK_INTERVAL_OPTIONS.find((item) => item.value === (minutes ?? 15));
  return found?.label ?? `${minutes} мин`;
}

function statusDescription(status?: string | null, errorMessage?: string | null): string {
  const normalized = (status ?? '').toUpperCase();
  if (normalized === 'AVAILABLE') {
    return 'Модель отвечает корректно и может использоваться в рабочих сценариях.';
  }
  if (normalized === 'UNKNOWN') {
    return 'Проверка ещё не выполнялась или статус пока не обновлён.';
  }
  const error = (errorMessage ?? '').trim();
  if (!error) {
    return normalized === 'UNAVAILABLE'
      ? 'Модель сейчас недоступна. Проверьте настройки и при необходимости смените модель.'
      : 'Проверка завершилась ошибкой. Попробуйте ещё раз позже.';
  }
  const lower = error.toLowerCase();
  if (lower.includes('ключ') || lower.includes('401') || lower.includes('403')) {
    return 'Похоже, проблема в OpenRouter API key или доступе к модели.';
  }
  if (lower.includes('лимит') || lower.includes('429')) {
    return 'Похоже, достигнут лимит запросов OpenRouter. Это может быть временной ошибкой.';
  }
  if (lower.includes('сет') || lower.includes('network')) {
    return 'Похоже, это сетевой сбой между приложением и OpenRouter.';
  }
  if (lower.includes('модел') || lower.includes('route') || lower.includes('endpoint')) {
    return 'Похоже, выбранная модель больше недоступна у провайдера.';
  }
  return normalized === 'UNAVAILABLE'
    ? 'Модель недоступна. Проверьте настройки и при необходимости смените модель.'
    : 'Проверка завершилась ошибкой. Попробуйте повторить позже.';
}

function statusWarningTitle(status?: string | null): string | null {
  const normalized = (status ?? '').toUpperCase();
  if (normalized === 'UNAVAILABLE') {
    return 'Модель недоступна';
  }
  if (normalized === 'ERROR') {
    return 'Ошибка проверки';
  }
  return null;
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
  const [checkingAvailability, setCheckingAvailability] = useState<'text' | 'photo' | null>(null);

  const [allModels, setAllModels] = useState<OpenRouterModelOption[]>([]);
  const [textModel, setTextModel] = useState('');
  const [photoModel, setPhotoModel] = useState('');
  const [textCheckIntervalMinutes, setTextCheckIntervalMinutes] = useState(15);
  const [photoCheckIntervalMinutes, setPhotoCheckIntervalMinutes] = useState(15);
  const [savedTextModel, setSavedTextModel] = useState('');
  const [savedPhotoModel, setSavedPhotoModel] = useState('');
  const [savedTextCheckIntervalMinutes, setSavedTextCheckIntervalMinutes] = useState(15);
  const [savedPhotoCheckIntervalMinutes, setSavedPhotoCheckIntervalMinutes] = useState(15);
  const [textAvailabilityStatus, setTextAvailabilityStatus] = useState<string>('UNKNOWN');
  const [textLastCheckedAt, setTextLastCheckedAt] = useState<string | null>(null);
  const [textLastSuccessfulAt, setTextLastSuccessfulAt] = useState<string | null>(null);
  const [textLastErrorMessage, setTextLastErrorMessage] = useState<string | null>(null);
  const [photoAvailabilityStatus, setPhotoAvailabilityStatus] = useState<string>('UNKNOWN');
  const [photoLastCheckedAt, setPhotoLastCheckedAt] = useState<string | null>(null);
  const [photoLastSuccessfulAt, setPhotoLastSuccessfulAt] = useState<string | null>(null);
  const [photoLastErrorMessage, setPhotoLastErrorMessage] = useState<string | null>(null);

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
      setTextCheckIntervalMinutes(globalModels.textModelCheckIntervalMinutes ?? 15);
      setPhotoCheckIntervalMinutes(globalModels.photoModelCheckIntervalMinutes ?? 15);
      setSavedTextModel(nextText);
      setSavedPhotoModel(nextPhoto);
      setSavedTextCheckIntervalMinutes(globalModels.textModelCheckIntervalMinutes ?? 15);
      setSavedPhotoCheckIntervalMinutes(globalModels.photoModelCheckIntervalMinutes ?? 15);
      setTextAvailabilityStatus(globalModels.textModelAvailabilityStatus ?? 'UNKNOWN');
      setTextLastCheckedAt(globalModels.textModelLastCheckedAt ?? null);
      setTextLastSuccessfulAt(globalModels.textModelLastSuccessfulAt ?? null);
      setTextLastErrorMessage(globalModels.textModelLastErrorMessage ?? null);
      setPhotoAvailabilityStatus(globalModels.photoModelAvailabilityStatus ?? 'UNKNOWN');
      setPhotoLastCheckedAt(globalModels.photoModelLastCheckedAt ?? null);
      setPhotoLastSuccessfulAt(globalModels.photoModelLastSuccessfulAt ?? null);
      setPhotoLastErrorMessage(globalModels.photoModelLastErrorMessage ?? null);

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
        photoModel: nextRequestedPhoto,
        textModelCheckIntervalMinutes: textCheckIntervalMinutes,
        photoModelCheckIntervalMinutes: photoCheckIntervalMinutes
      });

      const nextText = normalizeModelId(result.textModel) || recommendedTextModel;
      const nextPhoto = normalizeModelId(result.photoModel) || recommendedPhotoModel;
      setTextModel(nextText);
      setPhotoModel(nextPhoto);
      setTextCheckIntervalMinutes(result.textModelCheckIntervalMinutes ?? 15);
      setPhotoCheckIntervalMinutes(result.photoModelCheckIntervalMinutes ?? 15);
      setSavedTextModel(nextText);
      setSavedPhotoModel(nextPhoto);
      setSavedTextCheckIntervalMinutes(result.textModelCheckIntervalMinutes ?? 15);
      setSavedPhotoCheckIntervalMinutes(result.photoModelCheckIntervalMinutes ?? 15);
      setTextAvailabilityStatus(result.textModelAvailabilityStatus ?? 'UNKNOWN');
      setTextLastCheckedAt(result.textModelLastCheckedAt ?? null);
      setTextLastSuccessfulAt(result.textModelLastSuccessfulAt ?? null);
      setTextLastErrorMessage(result.textModelLastErrorMessage ?? null);
      setPhotoAvailabilityStatus(result.photoModelAvailabilityStatus ?? 'UNKNOWN');
      setPhotoLastCheckedAt(result.photoModelLastCheckedAt ?? null);
      setPhotoLastSuccessfulAt(result.photoModelLastSuccessfulAt ?? null);
      setPhotoLastErrorMessage(result.photoModelLastErrorMessage ?? null);

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

  const handleAvailabilityCheck = async (type: 'text' | 'photo') => {
    setCheckingAvailability(type);
    setStatus(type === 'text' ? 'Проверяем доступность text-модели...' : 'Проверяем доступность vision-модели...');
    try {
      const result = await runOpenRouterAvailabilityCheck(type);
      await load();
      setStatus(`${type === 'text' ? 'Text' : 'Vision'} check: ${result.message}`);
      if (result.status === 'AVAILABLE') {
        impactMedium();
      } else {
        hapticError();
      }
    } catch (error) {
      console.error(error);
      setStatus(`Не удалось выполнить проверку ${type === 'text' ? 'text' : 'vision'}-модели`);
      hapticError();
    } finally {
      setCheckingAvailability(null);
    }
  };

  const hasUnsavedChanges =
    normalizeModelId(textModel) !== normalizeModelId(savedTextModel) ||
    normalizeModelId(photoModel) !== normalizeModelId(savedPhotoModel) ||
    textCheckIntervalMinutes !== savedTextCheckIntervalMinutes ||
    photoCheckIntervalMinutes !== savedPhotoCheckIntervalMinutes;

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

      <div className="theme-surface-1 rounded-2xl border p-3">
        <p className="text-sm font-semibold text-ios-text">Мониторинг доступности моделей</p>
        <p className="mt-1 text-[12px] text-ios-subtext">
          Можно задать отдельный интервал проверки для text и vision моделей и вручную проверить их прямо сейчас.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="theme-surface-subtle rounded-2xl border p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-ios-text">Text model</p>
                <p className="text-[12px] text-ios-subtext">{textModel || 'Не выбрана'}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone(textAvailabilityStatus)}`}>
                {statusLabel(textAvailabilityStatus)}
              </span>
            </div>
            <p className="mt-2 text-[12px] leading-5 text-ios-subtext">
              {statusDescription(textAvailabilityStatus, textLastErrorMessage)}
            </p>
            <div className="mt-3 space-y-2 text-[12px] text-ios-subtext">
              <p>Интервал: {intervalLabel(textCheckIntervalMinutes)}</p>
              <p>Последняя проверка: {formatSyncTime(textLastCheckedAt)}</p>
              <p>Последний успех: {formatSyncTime(textLastSuccessfulAt)}</p>
              {textLastErrorMessage ? <p className="theme-text-danger">Ошибка: {textLastErrorMessage}</p> : null}
            </div>
            {statusWarningTitle(textAvailabilityStatus) ? (
              <div className="theme-surface-warning mt-3 rounded-2xl border p-3">
                <p className="theme-text-warning text-xs font-semibold uppercase tracking-[0.14em]">
                  {statusWarningTitle(textAvailabilityStatus)}
                </p>
                <p className="mt-1 text-sm text-ios-text">
                  Проверьте ключ, доступность модели и при необходимости выберите другую text-модель в настройках ниже.
                </p>
              </div>
            ) : null}
            <div className="mt-3 flex gap-2">
              <select
                value={textCheckIntervalMinutes}
                onChange={(event) => setTextCheckIntervalMinutes(Number(event.target.value))}
                className="theme-field h-11 flex-1 rounded-ios-button border px-3 text-sm outline-none"
              >
                {CHECK_INTERVAL_OPTIONS.map((option) => (
                  <option key={`text-int-${option.value}`} value={option.value}>{option.label}</option>
                ))}
              </select>
              <Button
                variant="secondary"
                className="h-11 rounded-2xl"
                disabled={checkingAvailability !== null}
                onClick={() => handleAvailabilityCheck('text')}
              >
                {checkingAvailability === 'text' ? 'Проверяем...' : 'Проверить сейчас'}
              </Button>
            </div>
          </div>

          <div className="theme-surface-subtle rounded-2xl border p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-ios-text">Vision model</p>
                <p className="text-[12px] text-ios-subtext">{photoModel || 'Не выбрана'}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone(photoAvailabilityStatus)}`}>
                {statusLabel(photoAvailabilityStatus)}
              </span>
            </div>
            <p className="mt-2 text-[12px] leading-5 text-ios-subtext">
              {statusDescription(photoAvailabilityStatus, photoLastErrorMessage)}
            </p>
            <div className="mt-3 space-y-2 text-[12px] text-ios-subtext">
              <p>Интервал: {intervalLabel(photoCheckIntervalMinutes)}</p>
              <p>Последняя проверка: {formatSyncTime(photoLastCheckedAt)}</p>
              <p>Последний успех: {formatSyncTime(photoLastSuccessfulAt)}</p>
              {photoLastErrorMessage ? <p className="theme-text-danger">Ошибка: {photoLastErrorMessage}</p> : null}
            </div>
            {statusWarningTitle(photoAvailabilityStatus) ? (
              <div className="theme-surface-warning mt-3 rounded-2xl border p-3">
                <p className="theme-text-warning text-xs font-semibold uppercase tracking-[0.14em]">
                  {statusWarningTitle(photoAvailabilityStatus)}
                </p>
                <p className="mt-1 text-sm text-ios-text">
                  Проверьте ключ, поддержку vision и при необходимости выберите другую photo/vision-модель в настройках ниже.
                </p>
              </div>
            ) : null}
            <div className="mt-3 flex gap-2">
              <select
                value={photoCheckIntervalMinutes}
                onChange={(event) => setPhotoCheckIntervalMinutes(Number(event.target.value))}
                className="theme-field h-11 flex-1 rounded-ios-button border px-3 text-sm outline-none"
              >
                {CHECK_INTERVAL_OPTIONS.map((option) => (
                  <option key={`photo-int-${option.value}`} value={option.value}>{option.label}</option>
                ))}
              </select>
              <Button
                variant="secondary"
                className="h-11 rounded-2xl"
                disabled={checkingAvailability !== null}
                onClick={() => handleAvailabilityCheck('photo')}
              >
                {checkingAvailability === 'photo' ? 'Проверяем...' : 'Проверить сейчас'}
              </Button>
            </div>
          </div>
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
