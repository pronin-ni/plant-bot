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
import type { AdminAiAnalyticsDto, AdminAiSettingsDto, AdminOpenAiCompatibleCapabilityTestDto, OpenRouterModelOption } from '@/types/api';

type ProviderId = 'OPENROUTER' | 'OPENAI_COMPATIBLE';
type PeriodId = 'HOUR' | 'DAY' | 'WEEK' | 'MONTH';

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
  const [openAiTestLoading, setOpenAiTestLoading] = useState<'connection' | 'json' | 'vision' | null>(null);
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

  async function runOpenAiCompatibleTest(kind: 'connection' | 'json' | 'vision') {
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
      const failed = { ok: false, capability: kind, message, model: null, latencyMs: null, baseUrl: openaiBaseUrl, jsonValid: null, visionSupported: null, rawPreview: null };
      if (kind === 'connection') setOpenAiConnectionResult(failed);
      if (kind === 'json') setOpenAiJsonResult(failed);
      if (kind === 'vision') setOpenAiVisionResult(failed);
      hapticError();
    } finally {
      setOpenAiTestLoading(null);
    }
  }

  return (
    <section className="space-y-4">
      <header className="space-y-1 rounded-3xl border border-ios-border/60 bg-white/70 p-4 dark:bg-zinc-950/60">
        <p className="text-xs uppercase tracking-wide text-ios-subtext">AI Providers</p>
        <h3 className="text-xl font-semibold text-ios-text">AI настройки и использование</h3>
        <p className="text-sm text-ios-subtext">
          Админ выбирает активного провайдера для текста и фото, настраивает модели и видит фактическую нагрузку по провайдерам.
        </p>
      </header>

      {status ? (
        <div className="rounded-2xl border border-ios-border/60 bg-white/70 px-4 py-3 text-sm text-ios-text dark:bg-zinc-950/60">
          {status}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2">
        <Card title="Активный runtime">
          <InfoRow label="Text provider" value={providerLabel(activeTextProvider)} />
          <InfoRow label="Vision provider" value={providerLabel(activeVisionProvider)} />
          <InfoRow label="Runtime text" value={runtime.textModel || settings?.effectiveTextModel || '—'} />
          <InfoRow label="Runtime vision" value={runtime.photoModel || settings?.effectiveVisionModel || '—'} />
        </Card>
        <Card title="Ключи и кэш">
          <InfoRow label="OpenRouter key" value={settings?.openrouterHasApiKey ? settings?.openrouterApiKeyMasked || 'Настроен' : 'Не настроен'} />
          <InfoRow label="OpenAI-compatible key" value={settings?.openaiCompatibleHasApiKey ? settings?.openaiCompatibleApiKeyMasked || 'Настроен' : 'Не настроен'} />
          <InfoRow label="AI cache" value={aiTextCacheEnabled ? `Вкл., TTL ${aiTextCacheTtlDays} дн.` : 'Выключен'} />
          <InfoRow label="Записей в кэше" value={String(settings?.aiTextCacheEntryCount ?? 0)} />
        </Card>
      </section>

      <Card title="Провайдеры по capability">
        <div className="grid gap-3 md:grid-cols-2">
          <SelectField label="Активный text provider" value={activeTextProvider} onChange={(value) => setActiveTextProvider(value as ProviderId)}>
            <option value="OPENROUTER">OpenRouter</option>
            <option value="OPENAI_COMPATIBLE">OpenAI-compatible</option>
          </SelectField>
          <SelectField label="Активный vision provider" value={activeVisionProvider} onChange={(value) => setActiveVisionProvider(value as ProviderId)}>
            <option value="OPENROUTER">OpenRouter</option>
            <option value="OPENAI_COMPATIBLE">OpenAI-compatible</option>
          </SelectField>
        </div>
      </Card>

      <Card title="OpenRouter модели">
        <div className="grid gap-3 md:grid-cols-2">
          <SelectField label="OpenRouter text model" value={openrouterTextModel} onChange={setOpenrouterTextModel}>
            <option value="">Не выбрана</option>
            {textModels.map((model) => (
              <option key={model.id} value={model.id}>{model.id}</option>
            ))}
          </SelectField>
          <SelectField label="OpenRouter vision model" value={openrouterVisionModel} onChange={setOpenrouterVisionModel}>
            <option value="">Не выбрана</option>
            {visionModels.map((model) => (
              <option key={model.id} value={model.id}>{model.id}</option>
            ))}
          </SelectField>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <InfoRow label="Text health" value={statusLabel(settings?.textModelAvailabilityStatus)} />
          <InfoRow label="Vision health" value={statusLabel(settings?.photoModelAvailabilityStatus)} />
          <InfoRow label="Последний успех text" value={formatWhen(settings?.textModelLastSuccessfulAt)} />
          <InfoRow label="Последний успех vision" value={formatWhen(settings?.photoModelLastSuccessfulAt)} />
        </div>
      </Card>

      <Card title="OpenAI-compatible">
        <div className="grid gap-3 md:grid-cols-2">
          <InputField label="Base URL" value={openaiBaseUrl} onChange={setOpenaiBaseUrl} placeholder="https://api.openai.com/v1/chat/completions" />
          <InputField label="Text model" value={openaiTextModel} onChange={setOpenaiTextModel} placeholder="gpt-4o-mini" />
          <InputField label="Vision model" value={openaiVisionModel} onChange={setOpenaiVisionModel} placeholder="gpt-4o-mini" />
          <InputField label="Timeout, ms" value={String(openaiRequestTimeoutMs)} onChange={(value) => setOpenaiRequestTimeoutMs(Number(value) || 15000)} type="number" />
          <InputField label="Max tokens" value={String(openaiMaxTokens)} onChange={(value) => setOpenaiMaxTokens(Number(value) || 256)} type="number" />
          <div className="md:col-span-2">
            <InputField label="API Key" value={openaiApiKey} onChange={setOpenaiApiKey} placeholder="sk-..." />
            <p className="mt-1 text-xs text-ios-subtext">Оставьте пустым, чтобы не менять сохранённый ключ.</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="secondary" className="rounded-2xl" disabled={openAiTestLoading !== null} onClick={() => void runOpenAiCompatibleTest('connection')}>
            {openAiTestLoading === 'connection' ? 'Проверяем...' : 'Test connection'}
          </Button>
          <Button variant="secondary" className="rounded-2xl" disabled={openAiTestLoading !== null} onClick={() => void runOpenAiCompatibleTest('json')}>
            {openAiTestLoading === 'json' ? 'Проверяем...' : 'Test JSON'}
          </Button>
          <Button variant="secondary" className="rounded-2xl" disabled={openAiTestLoading !== null} onClick={() => void runOpenAiCompatibleTest('vision')}>
            {openAiTestLoading === 'vision' ? 'Проверяем...' : 'Test vision'}
          </Button>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <TestResultCard title="Connection" result={openAiConnectionResult} />
          <TestResultCard title="JSON" result={openAiJsonResult} />
          <TestResultCard title="Vision" result={openAiVisionResult} />
        </div>
      </Card>

      <Card title="Поведение runtime">
        <div className="grid gap-3 md:grid-cols-2">
          <ToggleRow label="OpenRouter health checks" checked={healthChecksEnabled} onChange={setHealthChecksEnabled} />
          <ToggleRow label="AI text cache" checked={aiTextCacheEnabled} onChange={setAiTextCacheEnabled} />
          <InputField label="Retry count" value={String(retryCount)} onChange={(value) => setRetryCount(Number(value) || 0)} type="number" />
          <InputField label="Request timeout, ms" value={String(requestTimeoutMs)} onChange={(value) => setRequestTimeoutMs(Number(value) || 0)} type="number" />
          <InputField label="AI cache TTL, days" value={String(aiTextCacheTtlDays)} onChange={(value) => setAiTextCacheTtlDays(Number(value) || 1)} type="number" />
          <div className="flex items-end gap-2">
            <Button variant="secondary" className="rounded-2xl" onClick={() => void clearAiCache('ai-text-expired')}>Очистить expired</Button>
            <Button variant="secondary" className="rounded-2xl" onClick={() => void clearAiCache('ai-text')}>Очистить весь AI cache</Button>
          </div>
        </div>
      </Card>

      <Card title="AI request analytics">
        <div className="mb-3 flex flex-wrap gap-2">
          {(['HOUR', 'DAY', 'WEEK', 'MONTH'] as PeriodId[]).map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => {
                impactLight();
                setAnalyticsPeriod(period);
              }}
              className={`rounded-full px-3 py-1.5 text-sm ${analyticsPeriod === period ? 'bg-ios-accent text-white' : 'border border-ios-border/60 text-ios-text'}`}
            >
              {period}
            </button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <InfoRow label="Total" value={String(analytics?.total ?? 0)} />
          <InfoRow label="Success" value={String(analytics?.success ?? 0)} />
          <InfoRow label="Failed" value={String(analytics?.failed ?? 0)} />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-ios-border/60 text-left text-ios-subtext">
                <th className="pb-2 pr-4">Feature</th>
                <th className="pb-2 pr-4">Provider</th>
                <th className="pb-2 pr-4">Model</th>
                <th className="pb-2 pr-4">Total</th>
                <th className="pb-2 pr-4">Success</th>
                <th className="pb-2 pr-4">Failed</th>
                <th className="pb-2 pr-4">Last success</th>
                <th className="pb-2">Last failure</th>
              </tr>
            </thead>
            <tbody>
              {(analytics?.rows ?? []).map((row) => (
                <tr key={`${row.requestKind}-${row.provider}-${row.model ?? 'default'}`} className="border-b border-ios-border/40 align-top">
                  <td className="py-2 pr-4 font-medium text-ios-text">{row.requestKind}</td>
                  <td className="py-2 pr-4 text-ios-text">{row.provider}</td>
                  <td className="py-2 pr-4 text-ios-subtext">{row.model || '—'}</td>
                  <td className="py-2 pr-4 text-ios-text">{row.total}</td>
                  <td className="py-2 pr-4 text-emerald-600 dark:text-emerald-300">{row.success}</td>
                  <td className="py-2 pr-4 text-red-600 dark:text-red-300">{row.failed}</td>
                  <td className="py-2 pr-4 text-ios-subtext">{formatWhen(row.lastSuccessAt)}</td>
                  <td className="py-2 text-ios-subtext">{formatWhen(row.lastFailureAt)}</td>
                </tr>
              ))}
              {!analyticsLoading && (analytics?.rows?.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={8} className="py-4 text-center text-ios-subtext">Запросов за выбранный период пока нет.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button className="rounded-2xl" disabled={loading || saving} onClick={() => void handleSave()}>
          {saving ? 'Сохраняем...' : 'Сохранить AI настройки'}
        </Button>
      </div>
    </section>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-ios-border/60 bg-white/70 p-4 dark:bg-zinc-950/60">
      <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ios-subtext">{title}</h4>
      {children}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-ios-border/40 px-3 py-2">
      <span className="text-ios-subtext">{label}</span>
      <span className="text-right text-ios-text">{value}</span>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm text-ios-text">
      <span className="mb-1 block text-ios-subtext">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-2xl border border-ios-border/60 bg-white/70 px-3 outline-none dark:bg-zinc-900/60"
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
  type = 'text'
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block text-sm text-ios-text">
      <span className="mb-1 block text-ios-subtext">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-2xl border border-ios-border/60 bg-white/70 px-3 outline-none dark:bg-zinc-900/60"
      />
    </label>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl border border-ios-border/40 px-3 py-3 text-ios-text">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          impactLight();
          onChange(event.target.checked);
        }}
      />
    </label>
  );
}

function TestResultCard({ title, result }: { title: string; result: AdminOpenAiCompatibleCapabilityTestDto | null }) {
  return (
    <div className="rounded-2xl border border-ios-border/40 px-3 py-3 text-sm">
      <p className="font-medium text-ios-text">{title}</p>
      <p className="mt-1 text-ios-subtext">
        {!result ? 'Не запускался' : result.ok ? `OK · ${result.latencyMs ?? '—'} ms` : result.message}
      </p>
      {result?.jsonValid != null ? <p className="mt-1 text-ios-subtext">JSON valid: {result.jsonValid ? 'yes' : 'no'}</p> : null}
      {result?.visionSupported != null ? <p className="mt-1 text-ios-subtext">Vision supported: {result.visionSupported ? 'yes' : 'no'}</p> : null}
      {result?.rawPreview ? <p className="mt-1 line-clamp-3 text-xs text-ios-subtext">{result.rawPreview}</p> : null}
    </div>
  );
}
