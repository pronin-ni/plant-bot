import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  clearAdminCacheScope,
  getAdminAiAnalytics,
  getAdminAiSettings,
  getOpenRouterModels,
  saveAdminAiSettings,
  testAdminOpenAiCompatibleConnection,
  testAdminOpenAiCompatibleJson,
  testAdminOpenAiCompatibleVision
} from '@/lib/api';
import { impactLight, impactMedium, success as hapticSuccess, error as hapticError } from '@/lib/haptics';
import { useAuthStore, useOpenRouterModelsStore } from '@/lib/store';
import type { AdminAiAnalyticsDto, AdminAiAnalyticsRowDto, AdminAiSettingsDto, AdminOpenAiCompatibleCapabilityTestDto, OpenRouterModelOption } from '@/types/api';

type ProviderId = 'OPENROUTER' | 'OPENAI_COMPATIBLE';
type PeriodId = 'HOUR' | 'DAY' | 'WEEK' | 'MONTH';
type OpenAiTestKind = 'connection' | 'json' | 'vision';

function normalizeModelId(value: string | null | undefined): string {
  if (!value) return '';
  const cleaned = value.trim();
  if (!cleaned) return '';
  return cleaned.split(',')[0]?.trim().split(/\s+/)[0]?.trim() ?? '';
}

function formatWhen(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU');
}

function providerLabel(value: ProviderId): string {
  return value === 'OPENAI_COMPATIBLE' ? 'OpenAI-compatible' : 'OpenRouter';
}

function statusLabel(status?: string | null): string {
  switch ((status ?? 'UNKNOWN').toUpperCase()) {
    case 'AVAILABLE':
      return 'Доступна';
    case 'DEGRADED':
      return 'Нестабильна';
    case 'UNAVAILABLE':
      return 'Недоступна';
    case 'ERROR':
      return 'Ошибка проверки';
    default:
      return 'Не проверялась';
  }
}

function periodLabel(period: PeriodId): string {
  switch (period) {
    case 'HOUR':
      return '1ч';
    case 'DAY':
      return '24ч';
    case 'WEEK':
      return '7д';
    case 'MONTH':
      return '30д';
  }
}

function healthTone(status?: string | null): string {
  switch ((status ?? 'UNKNOWN').toUpperCase()) {
    case 'AVAILABLE':
      return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    case 'DEGRADED':
      return 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    case 'UNAVAILABLE':
    case 'ERROR':
      return 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300';
    default:
      return 'border-ios-border/50 bg-white/60 text-ios-subtext dark:bg-zinc-900/60';
  }
}

export function OpenRouterSettings() {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const runtime = useOpenRouterModelsStore((s) => s);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [models, setModels] = useState<OpenRouterModelOption[]>([]);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<PeriodId>('DAY');
  const [analytics, setAnalytics] = useState<AdminAiAnalyticsDto | null>(null);
  const [settings, setSettings] = useState<AdminAiSettingsDto | null>(null);

  const [activeTextProvider, setActiveTextProvider] = useState<ProviderId>('OPENROUTER');
  const [activeVisionProvider, setActiveVisionProvider] = useState<ProviderId>('OPENROUTER');
  const [openrouterTextModel, setOpenrouterTextModel] = useState('');
  const [openrouterVisionModel, setOpenrouterVisionModel] = useState('');
  const [openaiTextModel, setOpenaiTextModel] = useState('gpt-4o-mini');
  const [openaiVisionModel, setOpenaiVisionModel] = useState('gpt-4o-mini');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState('https://api.openai.com/v1/chat/completions');
  const [openaiRequestTimeoutMs, setOpenaiRequestTimeoutMs] = useState(15000);
  const [openaiMaxTokens, setOpenaiMaxTokens] = useState(256);
  const [openAiConnectionResult, setOpenAiConnectionResult] = useState<AdminOpenAiCompatibleCapabilityTestDto | null>(null);
  const [openAiJsonResult, setOpenAiJsonResult] = useState<AdminOpenAiCompatibleCapabilityTestDto | null>(null);
  const [openAiVisionResult, setOpenAiVisionResult] = useState<AdminOpenAiCompatibleCapabilityTestDto | null>(null);
  const [openAiTestLoading, setOpenAiTestLoading] = useState<OpenAiTestKind | null>(null);
  const [healthChecksEnabled, setHealthChecksEnabled] = useState(true);
  const [retryCount, setRetryCount] = useState(2);
  const [requestTimeoutMs, setRequestTimeoutMs] = useState(15000);
  const [aiTextCacheEnabled, setAiTextCacheEnabled] = useState(true);
  const [aiTextCacheTtlDays, setAiTextCacheTtlDays] = useState(7);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void load();
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadAnalytics(analyticsPeriod);
  }, [analyticsPeriod, isAdmin]);

  const textModels = useMemo(
    () => models.filter((item) => !item.supportsImageToText),
    [models]
  );
  const visionModels = useMemo(
    () => models.filter((item) => item.supportsImageToText),
    [models]
  );

  const analyticsRows = analytics?.rows ?? [];
  const openAiTests: Array<{
    kind: OpenAiTestKind;
    title: string;
    description: string;
    result: AdminOpenAiCompatibleCapabilityTestDto | null;
  }> = [
    {
      kind: 'connection',
      title: 'Test connection',
      description: 'Проверяет доступность endpoint и авторизацию.',
      result: openAiConnectionResult
    },
    {
      kind: 'json',
      title: 'Test JSON',
      description: 'Проверяет корректность JSON-ответа и модель text.',
      result: openAiJsonResult
    },
    {
      kind: 'vision',
      title: 'Test vision',
      description: 'Проверяет vision-capability и текущую vision-модель.',
      result: openAiVisionResult
    }
  ];

  if (!isAdmin) {
    return null;
  }

  async function load() {
    setLoading(true);
    try {
      const [nextSettings, catalog] = await Promise.all([
        getAdminAiSettings(),
        getOpenRouterModels()
      ]);
      setSettings(nextSettings);
      setModels(catalog.models ?? []);
      hydrate(nextSettings);
      setStatus(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось загрузить AI настройки');
      hapticError();
    } finally {
      setLoading(false);
    }
  }

  async function loadAnalytics(period: PeriodId) {
    setAnalyticsLoading(true);
    try {
      setAnalytics(await getAdminAiAnalytics(period));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось загрузить AI аналитику');
    } finally {
      setAnalyticsLoading(false);
    }
  }

  function hydrate(next: AdminAiSettingsDto) {
    setActiveTextProvider(next.activeTextProvider);
    setActiveVisionProvider(next.activeVisionProvider);
    setOpenrouterTextModel(normalizeModelId(next.openrouterTextModel));
    setOpenrouterVisionModel(normalizeModelId(next.openrouterVisionModel));
    setOpenaiBaseUrl(next.openaiCompatibleBaseUrl?.trim() || 'https://api.openai.com/v1/chat/completions');
    setOpenaiTextModel(normalizeModelId(next.openaiCompatibleTextModel) || 'gpt-4o-mini');
    setOpenaiVisionModel(normalizeModelId(next.openaiCompatibleVisionModel) || 'gpt-4o-mini');
    setOpenaiApiKey('');
    setOpenaiRequestTimeoutMs(next.openaiCompatibleRequestTimeoutMs ?? 15000);
    setOpenaiMaxTokens(next.openaiCompatibleMaxTokens ?? 256);
    setHealthChecksEnabled(next.healthChecksEnabled ?? true);
    setRetryCount(next.retryCount ?? 2);
    setRequestTimeoutMs(next.requestTimeoutMs ?? 15000);
    setAiTextCacheEnabled(next.aiTextCacheEnabled ?? true);
    setAiTextCacheTtlDays(next.aiTextCacheTtlDays ?? 7);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const next = await saveAdminAiSettings({
        activeTextProvider,
        activeVisionProvider,
        openrouterTextModel: openrouterTextModel || null,
        openrouterVisionModel: openrouterVisionModel || null,
        openaiCompatibleBaseUrl: openaiBaseUrl || null,
        openaiCompatibleTextModel: openaiTextModel || null,
        openaiCompatibleVisionModel: openaiVisionModel || null,
        openaiCompatibleApiKey: openaiApiKey.trim() || null,
        openaiCompatibleRequestTimeoutMs: openaiRequestTimeoutMs,
        openaiCompatibleMaxTokens: openaiMaxTokens,
        healthChecksEnabled,
        retryCount,
        requestTimeoutMs,
        aiTextCacheEnabled,
        aiTextCacheTtlDays
      });
      setSettings(next);
      hydrate(next);
      runtime.setModels({
        activeTextProvider: next.activeTextProvider,
        activeVisionProvider: next.activeVisionProvider,
        textModel: next.effectiveTextModel ?? '',
        photoModel: next.effectiveVisionModel ?? '',
        hasApiKey: next.openrouterHasApiKey || next.openaiCompatibleHasApiKey,
        openrouterHasApiKey: next.openrouterHasApiKey,
        openaiCompatibleHasApiKey: next.openaiCompatibleHasApiKey,
        source: 'server'
      });
      setStatus('AI настройки сохранены');
      hapticSuccess();
      await loadAnalytics(analyticsPeriod);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось сохранить AI настройки');
      hapticError();
    } finally {
      setSaving(false);
    }
  }

  async function clearAiCache(mode: 'ai-text' | 'ai-text-expired') {
    try {
      impactMedium();
      await clearAdminCacheScope(mode);
      await load();
      setStatus(mode === 'ai-text' ? 'AI кэш очищен полностью' : 'Просроченный AI кэш очищен');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось очистить AI кэш');
      hapticError();
    }
  }

  function openAiTestPayload() {
    return {
      baseUrl: openaiBaseUrl || null,
      apiKey: openaiApiKey.trim() || null,
      textModel: openaiTextModel || null,
      visionModel: openaiVisionModel || null,
      requestTimeoutMs: openaiRequestTimeoutMs,
      maxTokens: openaiMaxTokens
    };
  }

  async function runOpenAiCompatibleTest(kind: OpenAiTestKind) {
    setOpenAiTestLoading(kind);
    if (kind === 'connection') setOpenAiConnectionResult(null);
    if (kind === 'json') setOpenAiJsonResult(null);
    if (kind === 'vision') setOpenAiVisionResult(null);
    try {
      const result = kind === 'connection'
        ? await testAdminOpenAiCompatibleConnection(openAiTestPayload())
        : kind === 'json'
          ? await testAdminOpenAiCompatibleJson(openAiTestPayload())
          : await testAdminOpenAiCompatibleVision(openAiTestPayload());
      if (kind === 'connection') setOpenAiConnectionResult(result);
      if (kind === 'json') setOpenAiJsonResult(result);
      if (kind === 'vision') setOpenAiVisionResult(result);
      setStatus(result.ok ? `OpenAI-compatible ${kind} test completed` : result.message);
      if (result.ok) {
        hapticSuccess();
      } else {
        hapticError();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : `Не удалось выполнить OpenAI-compatible ${kind} test`;
      setStatus(message);
      const failed = {
        ok: false,
        capability: kind,
        message,
        model: null,
        latencyMs: null,
        baseUrl: openaiBaseUrl,
        jsonValid: null,
        visionSupported: null,
        rawPreview: null
      };
      if (kind === 'connection') setOpenAiConnectionResult(failed);
      if (kind === 'json') setOpenAiJsonResult(failed);
      if (kind === 'vision') setOpenAiVisionResult(failed);
      hapticError();
    } finally {
      setOpenAiTestLoading(null);
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl min-w-0 space-y-5 pb-1">
      <header className="space-y-2 rounded-[28px] border border-ios-border/60 bg-white/80 px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)] dark:bg-zinc-950/70">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ios-subtext">AI Providers</p>
        <div className="space-y-1">
          <h3 className="text-xl font-semibold text-ios-text">AI runtime, providers, tests and analytics</h3>
          <p className="max-w-2xl text-sm leading-6 text-ios-subtext">
            Экран собран как стабильная админ-настройка: сначала runtime-сводка и провайдеры, затем тесты, runtime/cache и аналитика.
          </p>
        </div>
      </header>

      {status ? (
        <StatusBanner>{status}</StatusBanner>
      ) : null}

      <SectionCard
        eyebrow="Runtime"
        title="Активный runtime"
        description="Короткая сводка показывает, какой провайдер сейчас обслуживает text и vision, и какие модели реально используются после сохранённых настроек."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Text provider" value={providerLabel(activeTextProvider)} />
          <MetricCard label="Vision provider" value={providerLabel(activeVisionProvider)} />
          <MetricCard label="Runtime text model" value={runtime.textModel || settings?.effectiveTextModel || '—'} compact />
          <MetricCard label="Runtime vision model" value={runtime.photoModel || settings?.effectiveVisionModel || '—'} compact />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <InsetPanel title="Routing">
            <div className="grid gap-3 md:grid-cols-2">
              <SelectField
                label="Активный text provider"
                value={activeTextProvider}
                disabled={loading || saving}
                onChange={(value) => setActiveTextProvider(value as ProviderId)}
              >
                <option value="OPENROUTER">OpenRouter</option>
                <option value="OPENAI_COMPATIBLE">OpenAI-compatible</option>
              </SelectField>
              <SelectField
                label="Активный vision provider"
                value={activeVisionProvider}
                disabled={loading || saving}
                onChange={(value) => setActiveVisionProvider(value as ProviderId)}
              >
                <option value="OPENROUTER">OpenRouter</option>
                <option value="OPENAI_COMPATIBLE">OpenAI-compatible</option>
              </SelectField>
            </div>
          </InsetPanel>

          <InsetPanel title="Stored secrets and cache">
            <div className="grid gap-2">
              <DetailRow label="OpenRouter key" value={settings?.openrouterHasApiKey ? settings?.openrouterApiKeyMasked || 'Настроен' : 'Не настроен'} />
              <DetailRow label="OpenAI-compatible key" value={settings?.openaiCompatibleHasApiKey ? settings?.openaiCompatibleApiKeyMasked || 'Настроен' : 'Не настроен'} />
              <DetailRow label="AI text cache" value={aiTextCacheEnabled ? `Вкл., TTL ${aiTextCacheTtlDays} дн.` : 'Выключен'} />
              <DetailRow label="Записей в кэше" value={String(settings?.aiTextCacheEntryCount ?? 0)} />
            </div>
          </InsetPanel>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Providers"
        title="Provider configuration"
        description="Провайдеры разделены по смыслу: отдельная зона для OpenRouter runtime и отдельная зона для OpenAI-compatible endpoint."
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <InsetPanel title="OpenRouter">
            <div className="grid gap-3 md:grid-cols-2">
              <SelectField
                label="OpenRouter text model"
                value={openrouterTextModel}
                disabled={loading || saving}
                onChange={setOpenrouterTextModel}
              >
                <option value="">Не выбрана</option>
                {textModels.map((model) => (
                  <option key={model.id} value={model.id}>{model.id}</option>
                ))}
              </SelectField>
              <SelectField
                label="OpenRouter vision model"
                value={openrouterVisionModel}
                disabled={loading || saving}
                onChange={setOpenrouterVisionModel}
              >
                <option value="">Не выбрана</option>
                {visionModels.map((model) => (
                  <option key={model.id} value={model.id}>{model.id}</option>
                ))}
              </SelectField>
            </div>

            <div className="mt-4 grid gap-3">
              <HealthCard
                title="Text runtime"
                status={settings?.textModelAvailabilityStatus}
                lastSuccessAt={settings?.textModelLastSuccessfulAt}
                lastCheckedAt={settings?.textModelLastCheckedAt}
                errorMessage={settings?.textModelLastErrorMessage}
              />
              <HealthCard
                title="Vision runtime"
                status={settings?.photoModelAvailabilityStatus}
                lastSuccessAt={settings?.photoModelLastSuccessfulAt}
                lastCheckedAt={settings?.photoModelLastCheckedAt}
                errorMessage={settings?.photoModelLastErrorMessage}
              />
            </div>
          </InsetPanel>

          <InsetPanel title="OpenAI-compatible">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <InputField
                  label="Base URL"
                  value={openaiBaseUrl}
                  onChange={setOpenaiBaseUrl}
                  disabled={loading || saving}
                  placeholder="https://api.openai.com/v1/chat/completions"
                  mono
                  multiline
                />
              </div>
              <InputField
                label="Text model"
                value={openaiTextModel}
                onChange={setOpenaiTextModel}
                disabled={loading || saving}
                placeholder="gpt-4o-mini"
                mono
              />
              <InputField
                label="Vision model"
                value={openaiVisionModel}
                onChange={setOpenaiVisionModel}
                disabled={loading || saving}
                placeholder="gpt-4o-mini"
                mono
              />
              <InputField
                label="Timeout, ms"
                value={String(openaiRequestTimeoutMs)}
                onChange={(value) => setOpenaiRequestTimeoutMs(Number(value) || 15000)}
                disabled={loading || saving}
                type="number"
              />
              <InputField
                label="Max tokens"
                value={String(openaiMaxTokens)}
                onChange={(value) => setOpenaiMaxTokens(Number(value) || 256)}
                disabled={loading || saving}
                type="number"
              />
              <div className="md:col-span-2">
                <InputField
                  label="API key"
                  value={openaiApiKey}
                  onChange={setOpenaiApiKey}
                  disabled={loading || saving}
                  placeholder="sk-..."
                  mono
                />
                <p className="mt-1 text-xs leading-5 text-ios-subtext">Оставьте поле пустым, если нужно сохранить уже записанный ключ без изменений.</p>
              </div>
            </div>
          </InsetPanel>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Tests"
        title="OpenAI-compatible test tools"
        description="Все три проверки собраны в один инструмент. Каждая карточка показывает своё состояние и свой результат."
      >
        <div className="grid gap-3 xl:grid-cols-3">
          {openAiTests.map((test) => (
            <TestCapabilityCard
              key={test.kind}
              title={test.title}
              description={test.description}
              result={test.result}
              loading={openAiTestLoading === test.kind}
              disabled={loading || saving || openAiTestLoading !== null}
              onRun={() => void runOpenAiCompatibleTest(test.kind)}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Runtime"
        title="Retry, timeout and cache"
        description="Эта зона вторична: здесь собраны runtime safety-controls и ручная очистка cache."
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <InsetPanel title="Behavior">
            <div className="grid gap-3 md:grid-cols-2">
              <ToggleRow
                label="OpenRouter health checks"
                checked={healthChecksEnabled}
                disabled={loading || saving}
                onChange={setHealthChecksEnabled}
              />
              <ToggleRow
                label="AI text cache"
                checked={aiTextCacheEnabled}
                disabled={loading || saving}
                onChange={setAiTextCacheEnabled}
              />
              <InputField
                label="Retry count"
                value={String(retryCount)}
                onChange={(value) => setRetryCount(Number(value) || 0)}
                disabled={loading || saving}
                type="number"
              />
              <InputField
                label="Request timeout, ms"
                value={String(requestTimeoutMs)}
                onChange={(value) => setRequestTimeoutMs(Number(value) || 0)}
                disabled={loading || saving}
                type="number"
              />
              <InputField
                label="AI cache TTL, days"
                value={String(aiTextCacheTtlDays)}
                onChange={(value) => setAiTextCacheTtlDays(Number(value) || 1)}
                disabled={loading || saving}
                type="number"
              />
            </div>
          </InsetPanel>

          <InsetPanel title="Cache maintenance">
            <div className="grid gap-2">
              <DetailRow label="Entries" value={String(settings?.aiTextCacheEntryCount ?? 0)} />
              <DetailRow label="Last cleanup" value={formatWhen(settings?.aiTextCacheLastCleanupAt)} />
              <DetailRow label="Settings updated" value={formatWhen(settings?.updatedAt)} />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button variant="secondary" className="min-w-0 rounded-2xl" disabled={loading || saving} onClick={() => void clearAiCache('ai-text-expired')}>
                Очистить expired
              </Button>
              <Button variant="secondary" className="min-w-0 rounded-2xl" disabled={loading || saving} onClick={() => void clearAiCache('ai-text')}>
                Очистить весь AI cache
              </Button>
            </div>
          </InsetPanel>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Analytics"
        title="AI request analytics"
        description="Фильтр по периоду сохранён. На мобильных экранах breakdown переходит в карточки вместо плотной таблицы."
      >
        <div className="flex flex-wrap gap-2">
          {(['HOUR', 'DAY', 'WEEK', 'MONTH'] as PeriodId[]).map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => {
                impactLight();
                setAnalyticsPeriod(period);
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${analyticsPeriod === period ? 'bg-ios-accent text-white shadow-[0_8px_18px_rgba(52,199,89,0.28)]' : 'border border-ios-border/60 bg-white/65 text-ios-text dark:bg-zinc-900/60'}`}
            >
              {periodLabel(period)}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <MetricCard label="Total" value={String(analytics?.total ?? 0)} />
          <MetricCard label="Success" value={String(analytics?.success ?? 0)} />
          <MetricCard label="Failed" value={String(analytics?.failed ?? 0)} />
        </div>

        <div className="mt-4 space-y-3 lg:hidden">
          {analyticsLoading ? <AnalyticsPlaceholder /> : null}
          {!analyticsLoading && analyticsRows.length === 0 ? <EmptyAnalyticsState /> : null}
          {!analyticsLoading ? analyticsRows.map((row) => <AnalyticsRowCard key={`${row.requestKind}-${row.provider}-${row.model ?? 'default'}`} row={row} />) : null}
        </div>

        <div className="mt-4 hidden overflow-x-auto lg:block">
          <table className="min-w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-ios-border/60 text-left text-ios-subtext">
                <th className="w-[14%] pb-2 pr-4">Feature</th>
                <th className="w-[14%] pb-2 pr-4">Provider</th>
                <th className="w-[22%] pb-2 pr-4">Model</th>
                <th className="w-[8%] pb-2 pr-4">Total</th>
                <th className="w-[10%] pb-2 pr-4">Success</th>
                <th className="w-[10%] pb-2 pr-4">Failed</th>
                <th className="w-[11%] pb-2 pr-4">Last success</th>
                <th className="w-[11%] pb-2">Last failure</th>
              </tr>
            </thead>
            <tbody>
              {analyticsLoading ? (
                <tr>
                  <td colSpan={8} className="py-4 text-center text-ios-subtext">Загружаем аналитику...</td>
                </tr>
              ) : null}
              {!analyticsLoading ? analyticsRows.map((row) => (
                <tr key={`${row.requestKind}-${row.provider}-${row.model ?? 'default'}`} className="border-b border-ios-border/40 align-top">
                  <td className="py-3 pr-4 font-medium text-ios-text">{row.requestKind}</td>
                  <td className="py-3 pr-4 text-ios-text">{row.provider}</td>
                  <td className="break-words py-3 pr-4 text-ios-subtext">{row.model || '—'}</td>
                  <td className="py-3 pr-4 text-ios-text">{row.total}</td>
                  <td className="py-3 pr-4 text-emerald-600 dark:text-emerald-300">{row.success}</td>
                  <td className="py-3 pr-4 text-red-600 dark:text-red-300">{row.failed}</td>
                  <td className="py-3 pr-4 text-ios-subtext">{formatWhen(row.lastSuccessAt)}</td>
                  <td className="py-3 text-ios-subtext">{formatWhen(row.lastFailureAt)}</td>
                </tr>
              )) : null}
              {!analyticsLoading && analyticsRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-4 text-center text-ios-subtext">Запросов за выбранный период пока нет.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="sticky bottom-0 z-20 rounded-t-[28px] border-t border-ios-border/60 bg-[linear-gradient(180deg,rgba(245,246,248,0.72),rgba(245,246,248,0.96))] px-4 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-3 backdrop-blur-[18px] dark:bg-[linear-gradient(180deg,rgba(9,9,11,0.7),rgba(9,9,11,0.96))]">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ios-text">Save AI settings</p>
            <p className="text-xs leading-5 text-ios-subtext">Изменения применятся к runtime и обновят аналитическую сводку после сохранения.</p>
          </div>
          <Button className="min-w-0 rounded-2xl whitespace-normal text-center leading-5 sm:min-w-[190px]" disabled={loading || saving} onClick={() => void handleSave()}>
            {saving ? 'Сохраняем...' : 'Сохранить AI настройки'}
          </Button>
        </div>
      </div>
    </section>
  );
}

function SectionCard({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-[28px] border border-ios-border/60 bg-white/78 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)] dark:bg-zinc-950/70">
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ios-subtext">{eyebrow}</p>
        <div className="space-y-1">
          <h4 className="text-base font-semibold text-ios-text">{title}</h4>
          <p className="max-w-2xl text-sm leading-6 text-ios-subtext">{description}</p>
        </div>
      </div>
      <div className="mt-4 min-w-0">{children}</div>
    </section>
  );
}

function InsetPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-3xl border border-ios-border/50 bg-[rgba(255,255,255,0.6)] p-4 dark:bg-[rgba(24,24,27,0.58)]">
      <h5 className="mb-3 text-sm font-semibold text-ios-text">{title}</h5>
      {children}
    </section>
  );
}

function StatusBanner({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-ios-border/60 bg-white/72 px-4 py-3 text-sm text-ios-text shadow-[0_8px_20px_rgba(15,23,42,0.05)] dark:bg-zinc-950/65">
      {children}
    </div>
  );
}

function MetricCard({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="min-w-0 rounded-3xl border border-ios-border/50 bg-[rgba(255,255,255,0.58)] px-4 py-3 dark:bg-[rgba(24,24,27,0.54)]">
      <p className="text-xs uppercase tracking-wide text-ios-subtext">{label}</p>
      <p className={`mt-2 min-w-0 break-words text-ios-text ${compact ? 'text-sm font-medium leading-6' : 'text-lg font-semibold leading-6'}`}>{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-ios-border/40 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <span className="text-sm text-ios-subtext">{label}</span>
      <span className="min-w-0 break-words text-sm text-ios-text sm:max-w-[62%] sm:text-right">{value}</span>
    </div>
  );
}

function HealthCard({
  title,
  status,
  lastSuccessAt,
  lastCheckedAt,
  errorMessage
}: {
  title: string;
  status?: string | null;
  lastSuccessAt?: string | null;
  lastCheckedAt?: string | null;
  errorMessage?: string | null;
}) {
  return (
    <div className="rounded-3xl border border-ios-border/40 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ios-text">{title}</p>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${healthTone(status)}`}>
          {statusLabel(status)}
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        <DetailRow label="Last success" value={formatWhen(lastSuccessAt)} />
        <DetailRow label="Last check" value={formatWhen(lastCheckedAt)} />
        {errorMessage ? <DetailRow label="Last error" value={errorMessage} /> : null}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
  disabled = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="block min-w-0 text-sm text-ios-text">
      <span className="mb-1.5 block text-ios-subtext">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full min-w-0 rounded-2xl border border-ios-border/60 bg-white/75 px-3 outline-none transition disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-900/70"
      >
        {children}
      </select>
    </label>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
  mono = false,
  multiline = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  mono?: boolean;
  multiline?: boolean;
}) {
  return (
    <label className="block min-w-0 text-sm text-ios-text">
      <span className="mb-1.5 block text-ios-subtext">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={2}
          className={`min-h-[72px] w-full min-w-0 resize-y rounded-2xl border border-ios-border/60 bg-white/75 px-3 py-2.5 outline-none transition disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-900/70 ${mono ? 'font-mono text-[13px] leading-5 break-all' : ''}`}
        />
      ) : (
        <input
          type={type}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={`h-11 w-full min-w-0 rounded-2xl border border-ios-border/60 bg-white/75 px-3 outline-none transition disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-900/70 ${mono ? 'font-mono text-[13px]' : ''}`}
        />
      )}
    </label>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  disabled = false
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-ios-border/40 px-3 py-3 text-ios-text">
      <span className="min-w-0 text-sm">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          impactLight();
          onChange(event.target.checked);
        }}
      />
    </label>
  );
}

function TestCapabilityCard({
  title,
  description,
  result,
  loading,
  disabled,
  onRun
}: {
  title: string;
  description: string;
  result: AdminOpenAiCompatibleCapabilityTestDto | null;
  loading: boolean;
  disabled: boolean;
  onRun: () => void;
}) {
  const state = loading ? 'loading' : !result ? 'idle' : result.ok ? 'success' : 'failed';
  const badgeTone = state === 'success'
    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    : state === 'failed'
      ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
      : state === 'loading'
        ? 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300'
        : 'border-ios-border/60 bg-white/65 text-ios-subtext dark:bg-zinc-900/60';

  return (
    <div className="flex min-w-0 flex-col rounded-3xl border border-ios-border/50 bg-[rgba(255,255,255,0.56)] p-4 dark:bg-[rgba(24,24,27,0.5)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h5 className="text-sm font-semibold text-ios-text">{title}</h5>
          <p className="mt-1 text-xs leading-5 text-ios-subtext">{description}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${badgeTone}`}>
          {state === 'idle' ? 'Не запускался' : state === 'loading' ? 'Проверяем' : state === 'success' ? 'Успех' : 'Ошибка'}
        </span>
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <DetailRow label="Message" value={loading ? 'Выполняем проверку...' : result?.message || 'Проверка ещё не запускалась.'} />
        <DetailRow label="Model" value={result?.model || '—'} />
        <DetailRow label="Latency" value={result?.latencyMs != null ? `${result.latencyMs} ms` : '—'} />
        {result?.jsonValid != null ? <DetailRow label="JSON valid" value={result.jsonValid ? 'yes' : 'no'} /> : null}
        {result?.visionSupported != null ? <DetailRow label="Vision supported" value={result.visionSupported ? 'yes' : 'no'} /> : null}
        {result?.rawPreview ? <DetailRow label="Preview" value={result.rawPreview} /> : null}
      </div>

      <div className="mt-4">
        <Button variant="secondary" className="w-full rounded-2xl" disabled={disabled} onClick={onRun}>
          {loading ? 'Проверяем...' : title}
        </Button>
      </div>
    </div>
  );
}

function AnalyticsRowCard({ row }: { row: AdminAiAnalyticsRowDto }) {
  return (
    <div className="rounded-3xl border border-ios-border/50 bg-[rgba(255,255,255,0.56)] p-4 dark:bg-[rgba(24,24,27,0.5)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-ios-border/60 bg-white/70 px-2.5 py-1 text-xs font-medium text-ios-text dark:bg-zinc-900/60">{row.requestKind}</span>
        <span className="rounded-full border border-ios-border/60 px-2.5 py-1 text-xs text-ios-subtext">{row.provider}</span>
      </div>
      <p className="mt-3 break-words text-sm text-ios-subtext">{row.model || 'Модель по умолчанию'}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <MetricCard label="Total" value={String(row.total)} compact />
        <MetricCard label="Success" value={String(row.success)} compact />
        <MetricCard label="Failed" value={String(row.failed)} compact />
      </div>
      <div className="mt-4 grid gap-2">
        <DetailRow label="Last success" value={formatWhen(row.lastSuccessAt)} />
        <DetailRow label="Last failure" value={formatWhen(row.lastFailureAt)} />
      </div>
    </div>
  );
}

function AnalyticsPlaceholder() {
  return (
    <div className="rounded-3xl border border-ios-border/50 bg-[rgba(255,255,255,0.56)] px-4 py-6 text-center text-sm text-ios-subtext dark:bg-[rgba(24,24,27,0.5)]">
      Загружаем аналитику...
    </div>
  );
}

function EmptyAnalyticsState() {
  return (
    <div className="rounded-3xl border border-ios-border/50 bg-[rgba(255,255,255,0.56)] px-4 py-6 text-center text-sm text-ios-subtext dark:bg-[rgba(24,24,27,0.5)]">
      Запросов за выбранный период пока нет.
    </div>
  );
}
