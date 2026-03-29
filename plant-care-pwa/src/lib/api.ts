import { getTelegramInitData } from '@/lib/telegram';
import {
  buildDemoAssistantReply,
  buildDemoCareAdvice,
  buildDemoDiagnosisResult,
  buildDemoIdentifyResult,
  buildDemoPlantConditions,
  buildDemoPlantConditionsHistory,
  buildDemoRecommendation,
  buildDemoSensorContext,
  buildDemoWeatherContextPreview,
  buildDemoWeatherCurrent,
  buildDemoWeatherForecast,
  createDemoCalendar,
  createDemoPlantFromPayload,
  getDemoOpenRouterSettings,
  getDemoPushPublicKey,
  getDemoPushStatus,
  getDemoPushSubscribe,
  getDemoPushTest,
  readDemoAssistantHistory,
  readDemoPlants,
  searchDemoPlants,
  searchDemoPresets,
  suggestDemoPlantProfile,
  writeDemoPlants
} from '@/lib/demoMode';
import {
  cacheGet,
  cacheSet,
  deleteQueuedMutation,
  getQueuedMutations,
  mutationQueueCount,
  upsertQueuedMutation
} from '@/lib/indexeddb';
import { getApiBaseUrl, isTestAuditMode } from '@/lib/runtime';
import { useAuthStore, useOfflineStore } from '@/lib/store';
import type {
  AuthValidationResponse,
  CalendarSyncDto,
  CalendarEventDto,
  RecommendationHistoryResponseDto,
  PlantDto,
  PlantLearningDto,
  PlantStatsDto,
  OpenRouterIdentifyResult,
  OpenRouterDiagnoseResult,
  AchievementsDto,
  OpenRouterModelsDto,
  AdminOpenRouterModelsDto,
  AdminOpenRouterAvailabilityCheckDto,
  OpenRouterRuntimeSettingsDto,
  OpenRouterTypedTestDto,
  ChatAskResponse,
  PlantCareAdviceDto,
  AdminOverviewDto,
  AdminUsersDto,
  AdminUserDetailsDto,
  AdminUserActionDto,
  AdminPlantsDto,
  AdminPlantActionDto,
  AdminBulkPlantWaterDto,
  AdminPlantItemDto,
  AdminStatsDto,
  AssistantHistoryItemDto,
  PlantProfileSuggestionDto,
  PlantAiSearchResponseDto,
  AdminCacheClearDto,
  AdminScopedCacheClearDto,
  AdminBackupItemDto,
  AdminBackupRestoreDto,
  AdminPushTestDto,
  AdminActivityLogItemDto,
  AdminMonitoringDto,
  PwaAuthDto,
  PwaAuthProvidersDto,
  PwaEmailMagicLinkRequestDto,
  PwaTelegramWidgetPayloadDto,
  PwaUserDto,
  PwaPushPublicKeyDto,
  PwaPushStatusDto,
  PwaPushSubscribeDto,
  PwaPushTestDto,
  PlantPresetSuggestionDto,
  PlantAiRecommendDto,
  ApplyWateringRecommendationDto,
  SeedCareActionResponseDto,
  SeedMigrationApplyDto,
  SeedMigrationPreviewDto,
  SeedRecommendationPreviewDto,
  SeedStageUpdateDto,
  WateringHaOptionsDto,
  WateringRecommendationPreviewDto,
  WateringSensorContextDto,
  WeatherProvidersResponse,
  WeatherCurrentDto,
  WeatherForecastDto
} from '@/types/api';
import type {
  HomeAssistantConfigRequest,
  HomeAssistantConfigResponse,
  HomeAssistantRoomsSensorsResponse,
  PlantConditionsHistoryResponse,
  PlantConditionsResponse,
  PlantRoomBindingRequest
} from '@/types/home-assistant';

const API_BASE_URL = getApiBaseUrl();
const AUTH_TOKEN_KEY = 'plant-pwa-jwt';
const CACHE_PREFIX = 'api:cache:';
const DEFAULT_GET_TIMEOUT_MS = 12_000;
const DEFAULT_MUTATION_TIMEOUT_MS = 15_000;
const DEFAULT_AI_TIMEOUT_MS = 25_000;

let syncInFlight: Promise<void> | null = null;
let syncInitialized = false;

interface ApiErrorPayload {
  message?: string;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function cacheKey(path: string): string {
  return `${CACHE_PREFIX}${path}`;
}

function isGuestMode(): boolean {
  return useAuthStore.getState().isGuest;
}

function ensureGuestModeAllowed() {
  if (isTestAuditMode() && isGuestMode()) {
    throw new ApiError(412, 'Demo mode disabled in test audit mode. Use real authentication.');
  }
}

function extractPathname(path: string): string {
  try {
    return new URL(path, 'https://plantbot.local').pathname;
  } catch {
    return path.split('?')[0] ?? path;
  }
}

function extractQuery(path: string): URLSearchParams {
  try {
    return new URL(path, 'https://plantbot.local').searchParams;
  } catch {
    const query = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
    return new URLSearchParams(query);
  }
}

function isLikelyNetworkError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return false;
  }
  return error instanceof TypeError || (error instanceof Error && /network|failed|fetch|offline/i.test(error.message));
}

function isQueueableMutation(method: string, path: string): boolean {
  const upperMethod = method.toUpperCase();
  if (upperMethod === 'PUT' && /^\/api\/plants\/\d+\/water$/.test(path)) {
    return true;
  }
  if (upperMethod === 'POST' && path === '/api/users/city') {
    return true;
  }
  if (upperMethod === 'POST' && path === '/api/weather/provider') {
    return true;
  }
  return false;
}

function resolveRequestTimeoutMs(method: string, path: string): number {
  const pathname = extractPathname(path);
  if (pathname.includes('/openrouter') || pathname.includes('/assistant') || pathname.includes('/plant/identify-openrouter')) {
    return DEFAULT_AI_TIMEOUT_MS;
  }
  if (pathname.includes('/watering/recommendation/preview') || pathname.includes('/seeds/recommendation/preview') || pathname.includes('/plants/ai-search')) {
    return DEFAULT_AI_TIMEOUT_MS;
  }
  return method === 'GET' ? DEFAULT_GET_TIMEOUT_MS : DEFAULT_MUTATION_TIMEOUT_MS;
}

function buildTimedRequestInit(path: string, requestInit: RequestInit): { requestInit: RequestInit; cleanup: () => void } {
  const controller = new AbortController();
  const timeoutMs = resolveRequestTimeoutMs((requestInit.method ?? 'GET').toUpperCase(), path);
  const existingSignal = requestInit.signal;
  let abortedByExternalSignal = false;

  const relayAbort = () => {
    abortedByExternalSignal = true;
    controller.abort();
  };

  if (existingSignal) {
    if (existingSignal.aborted) {
      relayAbort();
    } else {
      existingSignal.addEventListener('abort', relayAbort, { once: true });
    }
  }

  const timeoutId = window.setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort(new DOMException('Request timed out', 'TimeoutError'));
    }
  }, timeoutMs);

  return {
    requestInit: {
      ...requestInit,
      signal: controller.signal
    },
    cleanup: () => {
      window.clearTimeout(timeoutId);
      if (existingSignal) {
        existingSignal.removeEventListener('abort', relayAbort);
      }
      if (abortedByExternalSignal && !controller.signal.aborted) {
        controller.abort();
      }
    }
  };
}

function isAbortLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === 'AbortError' || error.name === 'TimeoutError' || /aborted|timed out|timeout/i.test(error.message);
}

function timeoutErrorMessage(path: string): string {
  const pathname = extractPathname(path);
  if (pathname.includes('/watering/recommendation/preview') || pathname.includes('/seeds/recommendation/preview')) {
    return 'Расчёт занял слишком много времени. Попробуйте ещё раз или используйте резервный режим.';
  }
  if (pathname.includes('/plants/ai-search') || pathname.includes('/assistant') || pathname.includes('/openrouter')) {
    return 'AI сейчас отвечает слишком долго. Попробуйте ещё раз чуть позже.';
  }
  if (pathname.includes('/weather')) {
    return 'Погодный сервис отвечает слишком долго. Попробуйте обновить чуть позже.';
  }
  return 'Сервер отвечает слишком долго. Попробуйте ещё раз.';
}

async function updatePendingMutationsCounter() {
  const count = await mutationQueueCount();
  useOfflineStore.getState().setPendingMutations(count);
}

async function buildOfflineFallback<T>(path: string, init: RequestInit): Promise<T | null> {
  const method = (init.method ?? 'GET').toUpperCase();
  if (method === 'PUT' && /^\/api\/plants\/\d+\/water$/.test(path)) {
    const plants = (await cacheGet<PlantDto[]>(cacheKey('/api/plants'))) ?? [];
    const match = path.match(/^\/api\/plants\/(\d+)\/water$/);
    const plantId = match ? Number(match[1]) : null;
    if (!plantId) {
      return null;
    }
    const plant = plants.find((item) => item.id === plantId);
    if (!plant) {
      return null;
    }
    const now = new Date();
    const interval = Math.max(1, plant.baseIntervalDays ?? 7);
    const next = new Date(now);
    next.setDate(next.getDate() + interval);
    const updated: PlantDto = {
      ...plant,
      lastWateredDate: now.toISOString(),
      nextWateringDate: next.toISOString()
    };
    const updatedPlants = plants.map((item) => (item.id === plantId ? updated : item));
    await cacheSet(cacheKey('/api/plants'), updatedPlants);
    return updated as T;
  }

  if (method === 'POST' && path === '/api/users/city') {
    const body = init.body ? (JSON.parse(String(init.body)) as { city?: string }) : {};
    const auth = useAuthStore.getState();
    const payload: AuthValidationResponse = {
      ok: true,
      userId: String(auth.telegramUserId ?? ''),
      username: auth.username,
      firstName: auth.firstName,
      city: body.city ?? auth.city,
      isAdmin: auth.isAdmin
    };
    return payload as T;
  }

  if (method === 'POST' && path === '/api/weather/provider') {
    const body = init.body ? (JSON.parse(String(init.body)) as { provider?: string }) : {};
    const response: WeatherProvidersResponse = {
      providers: [],
      selected: body.provider ?? null
    };
    return response as T;
  }

  return null;
}

async function buildGuestResponse<T>(path: string, init: RequestInit): Promise<T | null> {
  const method = (init.method ?? 'GET').toUpperCase();
  const pathname = extractPathname(path);
  const query = extractQuery(path);
  const plants = readDemoPlants();

  if (method === 'GET' && pathname === '/api/plants') {
    await cacheSet(cacheKey('/api/plants'), plants);
    return plants as T;
  }

  if (method === 'GET' && pathname.startsWith('/api/plants/') && pathname.endsWith('/care-advice')) {
    const plantId = Number(pathname.split('/')[3]);
    const plant = plants.find((item) => item.id === plantId);
    return (plant ? buildDemoCareAdvice(plant) : null) as T | null;
  }

  if (method === 'GET' && /^\/api\/plants\/\d+$/.test(pathname)) {
    const plantId = Number(pathname.split('/')[3]);
    return (plants.find((item) => item.id === plantId) ?? null) as T | null;
  }

  if (method === 'GET' && pathname === '/api/plants/search') {
    const q = query.get('q') ?? '';
    const category = query.get('category') as PlantDto['category'] | null;
    return searchDemoPlants(q, category ?? undefined) as T;
  }

  if (method === 'GET' && pathname === '/api/plants/presets') {
    const category = (query.get('category') as PlantPresetSuggestionDto['category']) ?? 'HOME';
    const q = query.get('q') ?? '';
    const limit = Number(query.get('limit') ?? 12);
    return searchDemoPresets(category, q, Number.isFinite(limit) ? limit : 12) as T;
  }

  if (method === 'GET' && pathname === '/api/plants/suggest-profile') {
    return suggestDemoPlantProfile(query.get('name') ?? '') as T;
  }

  if (method === 'POST' && pathname === '/api/plants/ai-search') {
    const body = init.body ? (JSON.parse(String(init.body)) as { query?: string; category?: PlantDto['category'] }) : {};
    const category = body.category ?? 'HOME';
    const q = body.query?.trim() ?? '';
    const suggestions = searchDemoPresets(category, q, 10).slice(0, 10).map((item) => ({
      name: item.name,
      category: item.category,
      type: 'DEFAULT',
      hint: item.popular ? 'Популярный вариант в этой категории' : 'Резервный вариант из каталога'
    }));
    return {
      ok: true,
      source: 'FALLBACK',
      suggestions
    } as T;
  }

  if (method === 'GET' && pathname === '/api/calendar') {
    const calendar = createDemoCalendar(plants);
    await cacheSet(cacheKey('/api/calendar'), calendar);
    return calendar as T;
  }

  if (method === 'GET' && pathname === '/api/settings/openrouter') {
    return getDemoOpenRouterSettings() as T;
  }

  if (method === 'GET' && pathname === '/api/assistant/history') {
    const limit = Number(query.get('limit') ?? 50);
    return readDemoAssistantHistory().slice(0, Number.isFinite(limit) ? limit : 50) as T;
  }

  if (method === 'GET' && pathname === '/api/weather/current') {
    return buildDemoWeatherCurrent(query.get('city') ?? '') as T;
  }

  if (method === 'GET' && pathname === '/api/weather/forecast') {
    return buildDemoWeatherForecast(query.get('city') ?? '') as T;
  }

  if (method === 'GET' && pathname === '/api/watering/recommendation/ha/options') {
    return {
      connected: false,
      rooms: [],
      sensors: [],
      message: 'В демо-режиме Home Assistant недоступен.'
    } as T;
  }

  if (method === 'GET' && /^\/api\/plants\/\d+\/conditions$/.test(pathname)) {
    const plantId = Number(pathname.split('/')[3]);
    return buildDemoPlantConditions(plantId) as T;
  }

  if (method === 'GET' && /^\/api\/plants\/\d+\/history-conditions$/.test(pathname)) {
    const plantId = Number(pathname.split('/')[3]);
    const days = Number(query.get('days') ?? 7);
    return buildDemoPlantConditionsHistory(plantId, Number.isFinite(days) ? days : 7) as T;
  }

  if (method === 'POST' && pathname === '/api/users/city') {
    const body = init.body ? (JSON.parse(String(init.body)) as { city?: string }) : {};
    const nextCity = body.city?.trim() || useAuthStore.getState().city || 'Санкт-Петербург';
    const auth = useAuthStore.getState();
    const payload: AuthValidationResponse = {
      ok: true,
      userId: String(auth.telegramUserId ?? 'guest-demo'),
      username: auth.username ?? 'guest_demo',
      firstName: auth.firstName ?? 'Гость',
      city: nextCity,
      isAdmin: auth.isAdmin
    };
    return payload as T;
  }

  if (method === 'POST' && pathname === '/api/auth/validate') {
    const auth = useAuthStore.getState();
    return {
      ok: true,
      userId: String(auth.telegramUserId ?? 'guest-demo'),
      username: auth.username ?? 'guest_demo',
      firstName: auth.firstName ?? 'Гость',
      city: auth.city ?? 'Санкт-Петербург',
      isAdmin: auth.isAdmin
    } as T;
  }

  if (method === 'PUT' && /^\/api\/plants\/\d+\/water$/.test(pathname)) {
    const match = pathname.match(/^\/api\/plants\/(\d+)\/water$/);
    const plantId = match ? Number(match[1]) : null;
    if (!plantId) {
      return null;
    }
    const plant = plants.find((item) => item.id === plantId);
    if (!plant) {
      return null;
    }
    const now = new Date();
    const interval = Math.max(1, plant.recommendedIntervalDays ?? plant.baseIntervalDays ?? 7);
    const next = new Date(now);
    next.setDate(next.getDate() + interval);
    const updatedPlant: PlantDto = {
      ...plant,
      lastWateredDate: now.toISOString(),
      nextWateringDate: next.toISOString()
    };
    const updatedPlants = plants.map((item) => (item.id === plantId ? updatedPlant : item));
    writeDemoPlants(updatedPlants);
    await cacheSet(cacheKey('/api/plants'), updatedPlants);
    await cacheSet(cacheKey('/api/calendar'), createDemoCalendar(updatedPlants));
    return updatedPlant as T;
  }

  if (method === 'POST' && pathname === '/api/assistant/chat') {
    const body = init.body ? (JSON.parse(String(init.body)) as { question?: string }) : {};
    return buildDemoAssistantReply(body.question ?? '') as T;
  }

  if (method === 'DELETE' && pathname === '/api/assistant/history') {
    window.localStorage.removeItem('plant-pwa-demo-assistant-history');
    return { ok: true } as T;
  }

  if (method === 'POST' && pathname === '/api/watering/recommendation/preview') {
    const body = init.body ? (JSON.parse(String(init.body)) as { plantName?: string; environmentType?: string; baseIntervalDays?: number; recommendedWaterMl?: number; city?: string }) : {};
    const previewPlant: PlantDto = {
      id: 999999,
      name: body.plantName?.trim() || 'Новое растение',
      placement: body.environmentType === 'INDOOR' ? 'INDOOR' : 'OUTDOOR',
      category: body.environmentType === 'OUTDOOR_GARDEN' ? 'OUTDOOR_GARDEN' : body.environmentType === 'OUTDOOR_ORNAMENTAL' ? 'OUTDOOR_DECORATIVE' : 'HOME',
      wateringProfile: body.environmentType === 'OUTDOOR_GARDEN' ? 'OUTDOOR_GARDEN' : body.environmentType === 'OUTDOOR_ORNAMENTAL' ? 'OUTDOOR_ORNAMENTAL' : 'INDOOR',
      region: body.city ?? 'Санкт-Петербург',
      lastWateredDate: new Date().toISOString(),
      nextWateringDate: new Date().toISOString(),
      baseIntervalDays: Math.max(1, Number(body.baseIntervalDays ?? 4)),
      preferredWaterMl: Math.max(100, Number(body.recommendedWaterMl ?? 220))
    };
    return buildDemoRecommendation(previewPlant) as T;
  }

  if (method === 'POST' && pathname === '/api/seeds/recommendation/preview') {
    const body = init.body ? (JSON.parse(String(init.body)) as {
      plantName?: string;
      seedStage?: PlantDto['seedStage'];
      targetEnvironmentType?: PlantDto['targetEnvironmentType'];
      underCover?: boolean;
      growLight?: boolean;
    }) : {};
    return {
      source: 'FALLBACK',
      seedStage: body.seedStage ?? 'SOWN',
      targetEnvironmentType: body.targetEnvironmentType ?? 'INDOOR',
      careMode: body.underCover
        ? 'Поддерживайте стабильную влажность под укрытием и ежедневно проветривайте.'
        : 'Проверяйте верхний слой и мягко увлажняйте без переувлажнения.',
      recommendedCheckIntervalHours: body.growLight ? 8 : 12,
      recommendedWateringMode: body.underCover ? 'KEEP_COVERED' : 'LIGHT_SURFACE_WATER',
      expectedGerminationDaysMin: 4,
      expectedGerminationDaysMax: 12,
      summary: `Рекомендации для проращивания подготовлены для «${body.plantName?.trim() || 'посева'}».`,
      reasoning: [
        'Учитываем стадию проращивания и целевую категорию.',
        body.underCover ? 'Укрытие помогает удерживать стабильную влажность.' : 'Без укрытия важно чаще контролировать поверхность.',
        body.growLight ? 'Досветка ускоряет переход к стадии сеянца.' : 'Без досветки следите за вытягиванием.'
      ],
      warnings: ['В демо-режиме AI для семян работает в резервном режиме.']
    } as T;
  }

  if (method === 'POST' && pathname === '/api/watering/recommendation/weather/preview') {
    const body = init.body ? (JSON.parse(String(init.body)) as { city?: string | null; region?: string | null }) : {};
    return buildDemoWeatherContextPreview(body.city ?? body.region ?? null) as T;
  }

  if (method === 'POST' && pathname === '/api/watering/recommendation/ha/context-preview') {
    return buildDemoSensorContext() as T;
  }

  if (method === 'POST' && /^\/api\/watering\/recommendation\/\d+\/refresh$/.test(pathname)) {
    const plantId = Number(pathname.split('/')[4]);
    const plant = plants.find((item) => item.id === plantId);
    return (plant ? buildDemoRecommendation(plant) : null) as T | null;
  }

  if (method === 'POST' && /^\/api\/watering\/recommendation\/\d+\/apply$/.test(pathname)) {
    const plantId = Number(pathname.split('/')[4]);
    const plant = plants.find((item) => item.id === plantId);
    if (!plant) {
      return null;
    }
    const body = init.body ? (JSON.parse(String(init.body)) as { source?: PlantDto['recommendationSource']; recommendedIntervalDays?: number; recommendedWaterMl?: number; summary?: string }) : {};
    const updatedPlant: PlantDto = {
      ...plant,
      baseIntervalDays: Math.max(1, Number(body.recommendedIntervalDays ?? plant.baseIntervalDays ?? 4)),
      preferredWaterMl: Math.max(80, Number(body.recommendedWaterMl ?? plant.preferredWaterMl ?? 200)),
      recommendedIntervalDays: Math.max(1, Number(body.recommendedIntervalDays ?? plant.recommendedIntervalDays ?? plant.baseIntervalDays ?? 4)),
      recommendedWaterMl: Math.max(80, Number(body.recommendedWaterMl ?? plant.recommendedWaterMl ?? plant.preferredWaterMl ?? 200)),
      recommendationSource: body.source ?? plant.recommendationSource ?? 'MANUAL',
      recommendationSummary: body.summary ?? plant.recommendationSummary ?? 'Рекомендация обновлена в демо-режиме.',
      recommendationGeneratedAt: new Date().toISOString()
    };
    const updatedPlants = plants.map((item) => (item.id === plantId ? updatedPlant : item));
    writeDemoPlants(updatedPlants);
    await cacheSet(cacheKey('/api/plants'), updatedPlants);
    return {
      ok: true,
      plantId,
      source: updatedPlant.recommendationSource ?? 'MANUAL',
      baseIntervalDays: updatedPlant.baseIntervalDays ?? 4,
      preferredWaterMl: updatedPlant.preferredWaterMl ?? 200,
      recommendationUpdatedAt: updatedPlant.recommendationGeneratedAt ?? new Date().toISOString()
    } as T;
  }

  if (method === 'POST' && pathname === '/api/plants') {
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const created = createDemoPlantFromPayload(body);
    const updatedPlants = readDemoPlants();
    await cacheSet(cacheKey('/api/plants'), updatedPlants);
    await cacheSet(cacheKey('/api/calendar'), createDemoCalendar(updatedPlants));
    return created as T;
  }

  if (method === 'POST' && /^\/api\/seeds\/\d+\/stage$/.test(pathname)) {
    const plantId = Number(pathname.split('/')[3]);
    const body = init.body ? (JSON.parse(String(init.body)) as { seedStage?: PlantDto['seedStage'] }) : {};
    const updatedPlants = plants.map((item) => item.id === plantId ? { ...item, seedStage: body.seedStage ?? item.seedStage } : item);
    writeDemoPlants(updatedPlants);
    await cacheSet(cacheKey('/api/plants'), updatedPlants);
    return { ok: true, plantId, seedStage: body.seedStage ?? 'SOWN' } as T;
  }

  if (method === 'POST' && /^\/api\/seeds\/\d+\/actions$/.test(pathname)) {
    const plantId = Number(pathname.split('/')[3]);
    const body = init.body ? (JSON.parse(String(init.body)) as { action?: string }) : {};
    const label = body.action ?? 'MOISTEN';
    const actionMap: Record<string, string> = {
      MOISTEN: 'Увлажнить',
      VENT: 'Проветрить',
      REMOVE_COVER: 'Снять крышку',
      MOVE_TO_LIGHT: 'Перенести под свет',
      PRICK_OUT: 'Пикировать'
    };
    const timestamp = new Date().toISOString();
    let actions: string[] = [];
    const updatedPlants = plants.map((item) => {
      if (item.id !== plantId) return item;
      actions = [`${timestamp} | ${actionMap[label] ?? label}`, ...(item.seedActions ?? [])].slice(0, 20);
      return { ...item, seedActions: actions };
    });
    writeDemoPlants(updatedPlants);
    await cacheSet(cacheKey('/api/plants'), updatedPlants);
    return { ok: true, plantId, actions } as T;
  }

  if (method === 'POST' && /^\/api\/seeds\/\d+\/migration\/preview$/.test(pathname)) {
    const plantId = Number(pathname.split('/')[3]);
    const plant = plants.find((item) => item.id === plantId);
    const stage = plant?.seedStage ?? 'SOWN';
    const allowed = stage === 'SPROUTED' || stage === 'SEEDLING' || stage === 'READY_TO_TRANSPLANT';
    const target = plant?.targetEnvironmentType ?? 'INDOOR';
    const targetLabel =
      target === 'OUTDOOR_ORNAMENTAL' ? 'Уличное декоративное' :
      target === 'OUTDOOR_GARDEN' ? 'Уличное садовое' :
      'Домашнее растение';
    return {
      allowed,
      plantId,
      seedStage: stage,
      targetEnvironmentType: target,
      targetLabel,
      plantName: plant?.name ?? 'Посев',
      message: allowed ? 'Можно перевести в обычное растение.' : 'Сначала доведите посев до подходящей стадии.'
    } as T;
  }

  if (method === 'POST' && /^\/api\/seeds\/\d+\/migrate$/.test(pathname)) {
    const plantId = Number(pathname.split('/')[3]);
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const target = (body.targetEnvironmentType as PlantDto['targetEnvironmentType']) ?? 'INDOOR';
    const updatedPlants: PlantDto[] = plants.map((item) => {
      if (item.id !== plantId) return item;
      return {
        ...item,
        name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : item.name,
        category: target === 'OUTDOOR_ORNAMENTAL' ? 'OUTDOOR_DECORATIVE' : target === 'OUTDOOR_GARDEN' ? 'OUTDOOR_GARDEN' : 'HOME',
        wateringProfile: target === 'OUTDOOR_ORNAMENTAL' ? 'OUTDOOR_ORNAMENTAL' : target === 'OUTDOOR_GARDEN' ? 'OUTDOOR_GARDEN' : 'INDOOR',
        placement: target === 'INDOOR' ? 'INDOOR' : 'OUTDOOR',
        baseIntervalDays: typeof body.baseIntervalDays === 'number' ? body.baseIntervalDays : item.baseIntervalDays ?? 4,
        preferredWaterMl: typeof body.preferredWaterMl === 'number' ? body.preferredWaterMl : item.preferredWaterMl ?? 200,
        recommendationSource: 'MANUAL',
        recommendationSummary: 'Растение переведено из режима проращивания.',
        recommendationGeneratedAt: new Date().toISOString()
      } as PlantDto;
    });
    writeDemoPlants(updatedPlants);
    await cacheSet(cacheKey('/api/plants'), updatedPlants);
    return {
      ok: true,
      plantId,
      category: target === 'OUTDOOR_ORNAMENTAL' ? 'OUTDOOR_DECORATIVE' : target === 'OUTDOOR_GARDEN' ? 'OUTDOOR_GARDEN' : 'HOME',
      environmentType: target === 'OUTDOOR_ORNAMENTAL' ? 'OUTDOOR_ORNAMENTAL' : target === 'OUTDOOR_GARDEN' ? 'OUTDOOR_GARDEN' : 'INDOOR'
    } as T;
  }

  if (method === 'DELETE' && /^\/api\/plants\/\d+$/.test(pathname)) {
    const plantId = Number(pathname.split('/')[3]);
    const updatedPlants = plants.filter((item) => item.id !== plantId);
    writeDemoPlants(updatedPlants);
    await cacheSet(cacheKey('/api/plants'), updatedPlants);
    await cacheSet(cacheKey('/api/calendar'), createDemoCalendar(updatedPlants));
    return undefined as T;
  }

  if (method === 'POST' && pathname === '/api/plant/identify-openrouter') {
    return buildDemoIdentifyResult() as T;
  }

  if (method === 'POST' && pathname === '/api/plant/diagnose-openrouter') {
    const body = init.body ? (JSON.parse(String(init.body)) as { plantName?: string }) : {};
    return buildDemoDiagnosisResult(body.plantName ?? 'растение') as T;
  }

  if (method === 'GET' && pathname === '/api/pwa/push/public-key') {
    return getDemoPushPublicKey() as T;
  }

  if (method === 'GET' && pathname === '/api/pwa/push/status') {
    return getDemoPushStatus() as T;
  }

  if (method === 'POST' && pathname === '/api/pwa/push/subscribe') {
    return getDemoPushSubscribe() as T;
  }

  if (method === 'POST' && pathname === '/api/pwa/push/test') {
    return getDemoPushTest() as T;
  }

  return null;
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    if (payload?.message) {
      return payload.message;
    }
  } catch {
    // Игнорируем ошибки парсинга тела и используем fallback.
  }
  return `Ошибка запроса (${response.status})`;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const initData = getTelegramInitData();
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers ?? {});
  const accessToken = localStorage.getItem(AUTH_TOKEN_KEY);
  ensureGuestModeAllowed();

  headers.set('Content-Type', 'application/json');
  if (initData) {
    headers.set('X-Telegram-Init-Data', initData);
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const requestInit: RequestInit = {
    ...init,
    method,
    headers
  };

  if (isGuestMode()) {
    const guestPayload = await buildGuestResponse<T>(path, requestInit);
    if (guestPayload !== null) {
      useOfflineStore.getState().setOffline(false);
      return guestPayload;
    }
  }

  if (method === 'GET') {
    const timed = buildTimedRequestInit(path, requestInit);
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, timed.requestInit);
      if (!response.ok) {
        throw new ApiError(response.status, await parseErrorMessage(response));
      }
      if (response.status === 204) {
        return undefined as T;
      }
      const payload = (await response.json()) as T;
      await cacheSet(cacheKey(path), payload);
      useOfflineStore.getState().setOffline(false);
      return payload;
    } catch (error) {
      const cached = await cacheGet<T>(cacheKey(path));
      if (cached !== null && isLikelyNetworkError(error)) {
        useOfflineStore.getState().setOffline(true);
        return cached;
      }
      if (error instanceof ApiError) {
        throw error;
      }
      if (isAbortLikeError(error)) {
        throw new ApiError(0, timeoutErrorMessage(path));
      }
      throw new ApiError(0, 'Нет сети и нет кеша для этого запроса');
    } finally {
      timed.cleanup();
    }
  }

  const shouldQueue = isQueueableMutation(method, path);
  if (!navigator.onLine && shouldQueue) {
    await upsertQueuedMutation({
      method,
      path,
      body: requestInit.body ? String(requestInit.body) : undefined,
      createdAt: Date.now(),
      dedupeKey: `${method}:${path}`,
      attempts: 0
    });
    await updatePendingMutationsCounter();
    const fallback = await buildOfflineFallback<T>(path, requestInit);
    if (fallback !== null) {
      return fallback;
    }
    throw new ApiError(0, 'Операция сохранена и будет отправлена при восстановлении сети');
  }

  const timed = buildTimedRequestInit(path, requestInit);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, timed.requestInit);
    if (!response.ok) {
      throw new ApiError(response.status, await parseErrorMessage(response));
    }
    useOfflineStore.getState().setOffline(false);
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  } catch (error) {
    if (shouldQueue && isLikelyNetworkError(error)) {
      await upsertQueuedMutation({
        method,
        path,
        body: requestInit.body ? String(requestInit.body) : undefined,
        createdAt: Date.now(),
        dedupeKey: `${method}:${path}`,
        attempts: 0
      });
      await updatePendingMutationsCounter();
      useOfflineStore.getState().setOffline(true);
      const fallback = await buildOfflineFallback<T>(path, requestInit);
      if (fallback !== null) {
        return fallback;
      }
      throw new ApiError(0, 'Операция сохранена и будет отправлена при восстановлении сети');
    }
    if (error instanceof ApiError) {
      throw error;
    }
    if (isAbortLikeError(error)) {
      throw new ApiError(0, timeoutErrorMessage(path));
    }
    throw new ApiError(0, 'Ошибка сети');
  } finally {
    timed.cleanup();
  }
}

async function pwaAuthFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  const accessToken = localStorage.getItem(AUTH_TOKEN_KEY);
  const method = (init.method ?? 'GET').toUpperCase();
  ensureGuestModeAllowed();
  headers.set('Content-Type', 'application/json');
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const requestInit: RequestInit = {
    ...init,
    method,
    headers
  };

  if (isGuestMode()) {
    const guestPayload = await buildGuestResponse<T>(path, requestInit);
    if (guestPayload !== null) {
      return guestPayload;
    }
  }

  const timed = buildTimedRequestInit(path, requestInit);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, timed.requestInit);
    if (!response.ok) {
      throw new ApiError(response.status, await parseErrorMessage(response));
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (isAbortLikeError(error)) {
      throw new ApiError(0, timeoutErrorMessage(path));
    }
    throw new ApiError(0, 'Ошибка сети');
  } finally {
    timed.cleanup();
  }
}

export async function validateTelegramAuth(): Promise<AuthValidationResponse> {
  return apiFetch<AuthValidationResponse>('/api/auth/validate', {
    method: 'POST'
  });
}

export async function getPwaAuthProviders(): Promise<PwaAuthProvidersDto> {
  return pwaAuthFetch<PwaAuthProvidersDto>('/api/pwa/auth/providers', { method: 'GET' });
}

export async function pwaLoginTelegram(initData: string): Promise<PwaAuthDto> {
  return pwaAuthFetch<PwaAuthDto>('/api/pwa/auth/telegram', {
    method: 'POST',
    body: JSON.stringify({ initData })
  });
}

export async function pwaLoginLocalDev(): Promise<PwaAuthDto> {
  return pwaAuthFetch<PwaAuthDto>('/api/pwa/auth/dev-local', {
    method: 'POST'
  });
}

export async function pwaLoginTelegramWidget(payload: PwaTelegramWidgetPayloadDto): Promise<PwaAuthDto> {
  return pwaAuthFetch<PwaAuthDto>('/api/pwa/auth/telegram-widget', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function pwaLoginOAuth(
  provider: 'yandex' | 'vk' | 'google' | 'apple',
  payload: { code?: string; idToken?: string; accessToken?: string; redirectUri?: string; emailHint?: string }
): Promise<PwaAuthDto> {
  return pwaAuthFetch<PwaAuthDto>(`/api/pwa/auth/oauth/${provider}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function pwaRequestEmailMagicLink(email: string): Promise<PwaEmailMagicLinkRequestDto> {
  return pwaAuthFetch<PwaEmailMagicLinkRequestDto>('/api/auth/email/request', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

export async function pwaVerifyEmailMagicLink(token: string): Promise<PwaAuthDto> {
  return pwaAuthFetch<PwaAuthDto>(`/api/auth/email/verify?token=${encodeURIComponent(token)}`, {
    method: 'GET'
  });
}

export async function pwaMe(): Promise<PwaUserDto> {
  return pwaAuthFetch<PwaUserDto>('/api/pwa/auth/me', { method: 'GET' });
}

export async function getPwaPushPublicKey(): Promise<PwaPushPublicKeyDto> {
  return pwaAuthFetch<PwaPushPublicKeyDto>('/api/pwa/push/public-key', { method: 'GET' });
}

export async function getPwaPushStatus(endpoint?: string | null): Promise<PwaPushStatusDto> {
  const query = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : '';
  return pwaAuthFetch<PwaPushStatusDto>(`/api/pwa/push/status${query}`, { method: 'GET' });
}

export async function subscribePwaPush(subscription: PushSubscriptionJSON): Promise<PwaPushSubscribeDto> {
  return pwaAuthFetch<PwaPushSubscribeDto>('/api/pwa/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys?.p256dh ?? '',
        auth: subscription.keys?.auth ?? ''
      },
      userAgent: navigator.userAgent
    })
  });
}

export async function unsubscribePwaPush(endpoint: string): Promise<PwaPushSubscribeDto> {
  return pwaAuthFetch<PwaPushSubscribeDto>(`/api/pwa/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, {
    method: 'DELETE'
  });
}

export async function sendPwaPushTest(payload: {
  endpoint?: string | null;
  title?: string;
  body?: string;
  tag?: string;
}): Promise<PwaPushTestDto> {
  return pwaAuthFetch<PwaPushTestDto>('/api/pwa/push/test', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function syncOfflineQueue(): Promise<void> {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = (async () => {
    if (!navigator.onLine) {
      useOfflineStore.getState().setOffline(true);
      return;
    }

    const initData = getTelegramInitData();
    const accessToken = localStorage.getItem(AUTH_TOKEN_KEY);
    const queue = await getQueuedMutations();

    for (const item of queue) {
      if (!item.id) {
        continue;
      }
      const headers = new Headers();
      headers.set('Content-Type', 'application/json');
      if (initData) {
        headers.set('X-Telegram-Init-Data', initData);
      }
      if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`);
      }

      try {
        const response = await fetch(`${API_BASE_URL}${item.path}`, {
          method: item.method,
          headers,
          body: item.body
        });
        if (response.ok || (response.status >= 400 && response.status < 500)) {
          await deleteQueuedMutation(item.id);
          continue;
        }
        break;
      } catch {
        useOfflineStore.getState().setOffline(true);
        break;
      }
    }

    await updatePendingMutationsCounter();
    useOfflineStore.getState().setOffline(!navigator.onLine);
  })().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}

export async function initOfflineSync(): Promise<void> {
  if (syncInitialized) {
    return;
  }
  syncInitialized = true;

  window.addEventListener('online', () => {
    useOfflineStore.getState().setOffline(false);
    void syncOfflineQueue();
  });

  window.addEventListener('offline', () => {
    useOfflineStore.getState().setOffline(true);
  });

  await updatePendingMutationsCounter();
  useOfflineStore.getState().setOffline(!navigator.onLine);
  void syncOfflineQueue();

  window.setInterval(() => {
    void syncOfflineQueue();
  }, 20_000);
}

export async function getPlants(): Promise<PlantDto[]> {
  return apiFetch<PlantDto[]>('/api/plants', { method: 'GET' });
}

export async function getPlantById(id: number): Promise<PlantDto> {
  return apiFetch<PlantDto>(`/api/plants/${id}`, { method: 'GET' });
}

export async function searchPlants(q: string, category?: "HOME" | "OUTDOOR_DECORATIVE" | "OUTDOOR_GARDEN" | "SEED_START"): Promise<PlantDto[]> {
  const params = new URLSearchParams({ q });
  if (category) {
    params.set('category', category);
  }
  return apiFetch<PlantDto[]>(`/api/plants/search?${params.toString()}`, { method: 'GET' });
}

export async function searchPlantPresets(
  category: "HOME" | "OUTDOOR_DECORATIVE" | "OUTDOOR_GARDEN" | "SEED_START",
  q = '',
  limit = 12
): Promise<PlantPresetSuggestionDto[]> {
  const params = new URLSearchParams();
  params.set('category', category);
  if (q.trim()) {
    params.set('q', q.trim());
  }
  params.set('limit', String(limit));

  const path = `/api/plants/presets?${params.toString()}`;
  const latestCategoryCacheKey = cacheKey(`/api/plants/presets/latest?category=${category}`);

  try {
    const items = await apiFetch<PlantPresetSuggestionDto[]>(path, { method: 'GET' });
    await cacheSet(latestCategoryCacheKey, items);
    return items;
  } catch (error) {
    const latest = await cacheGet<PlantPresetSuggestionDto[]>(latestCategoryCacheKey);
    if (latest && latest.length > 0) {
      return latest.slice(0, Math.max(1, Math.min(limit, latest.length)));
    }
    throw error;
  }
}

export async function aiRecommendPlant(payload: {
  name: string;
  environmentType: 'INDOOR' | 'OUTDOOR_ORNAMENTAL' | 'OUTDOOR_GARDEN';
  category: 'HOME' | 'OUTDOOR_DECORATIVE' | 'OUTDOOR_GARDEN';
  plantType?: 'DEFAULT' | 'TROPICAL' | 'FERN' | 'SUCCULENT' | 'CONIFER';
  baseIntervalDays?: number;
  potVolumeLiters?: number;
  heightCm?: number;
  diameterCm?: number;
  containerType?: string;
  growthStage?: string;
  greenhouse?: boolean;
  soilType?: string;
  sunExposure?: string;
  region?: string;
  mulched?: boolean;
  dripIrrigation?: boolean;
}): Promise<PlantAiRecommendDto> {
  return apiFetch<PlantAiRecommendDto>('/api/plants/ai-recommend', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function previewWateringRecommendation(payload: {
  plantName: string;
  environmentType: 'INDOOR' | 'OUTDOOR_ORNAMENTAL' | 'OUTDOOR_GARDEN';
  potVolumeLiters?: number;
  baseIntervalDays?: number;
  containerType?: 'POT' | 'CONTAINER' | 'FLOWERBED' | 'OPEN_GROUND';
  containerVolume?: number;
  sunExposure?: string;
  soilType?: string;
  cropType?: string;
  growthStage?: string;
  greenhouse?: boolean;
  mulched?: boolean;
  dripIrrigation?: boolean;
  outdoorAreaM2?: number;
  haRoomId?: string;
  haRoomName?: string;
  temperatureSensorEntityId?: string;
  humiditySensorEntityId?: string;
  soilMoistureSensorEntityId?: string;
  illuminanceSensorEntityId?: string;
  city?: string;
}): Promise<WateringRecommendationPreviewDto> {
  return apiFetch<WateringRecommendationPreviewDto>('/api/watering/recommendation/preview', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function getWateringHaOptions(): Promise<WateringHaOptionsDto> {
  return apiFetch<WateringHaOptionsDto>('/api/watering/recommendation/ha/options', {
    method: 'GET'
  });
}

export async function previewWateringHaContext(payload: {
  plantName: string;
  environmentType: 'INDOOR' | 'OUTDOOR_ORNAMENTAL' | 'OUTDOOR_GARDEN';
  haRoomId?: string;
  haRoomName?: string;
  temperatureSensorEntityId?: string;
  humiditySensorEntityId?: string;
  soilMoistureSensorEntityId?: string;
  illuminanceSensorEntityId?: string;
}): Promise<WateringSensorContextDto> {
  return apiFetch<WateringSensorContextDto>('/api/watering/recommendation/ha/context-preview', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function applyWateringRecommendation(plantId: number, payload: {
  source: 'AI' | 'HEURISTIC' | 'HYBRID' | 'FALLBACK' | 'MANUAL';
  recommendedIntervalDays: number;
  recommendedWaterMl: number;
  summary?: string;
}): Promise<ApplyWateringRecommendationDto> {
  return apiFetch<ApplyWateringRecommendationDto>(`/api/watering/recommendation/${plantId}/apply`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function createPlant(payload: Record<string, unknown>): Promise<PlantDto> {
  return apiFetch<PlantDto>('/api/plants', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function previewSeedRecommendation(payload: {
  plantName: string;
  seedStage: 'SOWN' | 'GERMINATING' | 'SPROUTED' | 'SEEDLING' | 'READY_TO_TRANSPLANT';
  targetEnvironmentType: 'INDOOR' | 'OUTDOOR_ORNAMENTAL' | 'OUTDOOR_GARDEN';
  seedContainerType?: 'CELL_TRAY' | 'SEED_TRAY' | 'PEAT_POT' | 'SMALL_POT' | 'PAPER_TOWEL' | 'WATER_PROPAGATION';
  seedSubstrateType?: 'SEED_START_MIX' | 'COCO_COIR' | 'PEAT_MIX' | 'MINERAL_WOOL' | 'PAPER_TOWEL' | 'WATER';
  sowingDate?: string;
  germinationTemperatureC?: number;
  underCover?: boolean;
  growLight?: boolean;
  region?: string;
}): Promise<SeedRecommendationPreviewDto> {
  return apiFetch<SeedRecommendationPreviewDto>('/api/seeds/recommendation/preview', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateSeedStage(plantId: number, seedStage: 'SOWN' | 'GERMINATING' | 'SPROUTED' | 'SEEDLING' | 'READY_TO_TRANSPLANT'): Promise<SeedStageUpdateDto> {
  return apiFetch<SeedStageUpdateDto>(`/api/seeds/${plantId}/stage`, {
    method: 'POST',
    body: JSON.stringify({ seedStage })
  });
}

export async function recordSeedCareAction(
  plantId: number,
  action: 'MOISTEN' | 'VENT' | 'REMOVE_COVER' | 'MOVE_TO_LIGHT' | 'PRICK_OUT'
): Promise<SeedCareActionResponseDto> {
  return apiFetch<SeedCareActionResponseDto>(`/api/seeds/${plantId}/actions`, {
    method: 'POST',
    body: JSON.stringify({ action })
  });
}

export async function previewSeedMigration(plantId: number): Promise<SeedMigrationPreviewDto> {
  return apiFetch<SeedMigrationPreviewDto>(`/api/seeds/${plantId}/migration/preview`, {
    method: 'POST'
  });
}

export async function migrateSeedPlant(plantId: number, payload: Record<string, unknown>): Promise<SeedMigrationApplyDto> {
  return apiFetch<SeedMigrationApplyDto>(`/api/seeds/${plantId}/migrate`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function waterPlant(id: number, payload?: Record<string, unknown>): Promise<PlantDto> {
  return apiFetch<PlantDto>(`/api/plants/${id}/water`, {
    method: 'PUT',
    body: JSON.stringify(payload ?? {})
  });
}

export async function uploadPlantPhoto(id: number, photoBase64: string): Promise<{ ok: boolean; photoUrl?: string }> {
  return apiFetch<{ ok: boolean; photoUrl?: string }>(`/api/plants/${id}/photo`, {
    method: 'POST',
    body: JSON.stringify({ photoBase64 })
  });
}

export async function getCalendar(): Promise<Array<{ date: string; plantId: number; plantName: string }>> {
  return apiFetch<CalendarEventDto[]>('/api/calendar', {
    method: 'GET'
  });
}

export async function getRecommendationHistory(
  plantId: number,
  options?: { view?: 'compact' | 'full'; limit?: number }
): Promise<RecommendationHistoryResponseDto> {
  const params = new URLSearchParams();
  params.set('view', options?.view ?? 'compact');
  params.set('limit', String(options?.limit ?? 5));
  return apiFetch<RecommendationHistoryResponseDto>(`/api/plants/${plantId}/recommendation-history?${params.toString()}`, {
    method: 'GET'
  });
}

export async function deletePlant(id: number): Promise<void> {
  return apiFetch<void>(`/api/plants/${id}`, { method: 'DELETE' });
}

export async function getWeatherProviders(): Promise<WeatherProvidersResponse> {
  return apiFetch<WeatherProvidersResponse>('/api/weather/providers', { method: 'GET' });
}

export async function setWeatherProvider(provider: string): Promise<WeatherProvidersResponse> {
  return apiFetch<WeatherProvidersResponse>('/api/weather/provider', {
    method: 'POST',
    body: JSON.stringify({ provider })
  });
}

export async function getWeatherCurrent(city: string): Promise<WeatherCurrentDto> {
  return apiFetch<WeatherCurrentDto>(`/api/weather/current?city=${encodeURIComponent(city)}`, {
    method: 'GET'
  });
}

export async function getWeatherForecast(city: string): Promise<WeatherForecastDto> {
  return apiFetch<WeatherForecastDto>(`/api/weather/forecast?city=${encodeURIComponent(city)}`, {
    method: 'GET'
  });
}

export async function getStats(): Promise<PlantStatsDto[]> {
  return apiFetch<PlantStatsDto[]>('/api/stats', { method: 'GET' });
}

export async function getLearning(): Promise<PlantLearningDto[]> {
  return apiFetch<PlantLearningDto[]>('/api/learning', { method: 'GET' });
}

export async function getCalendarSync(): Promise<CalendarSyncDto> {
  return apiFetch<CalendarSyncDto>('/api/calendar/sync', { method: 'GET' });
}

export async function updateCalendarSync(enabled: boolean): Promise<CalendarSyncDto> {
  return apiFetch<CalendarSyncDto>('/api/calendar/sync', {
    method: 'POST',
    body: JSON.stringify({ enabled })
  });
}

export async function updateCity(city: string): Promise<AuthValidationResponse> {
  return apiFetch<AuthValidationResponse>('/api/users/city', {
    method: 'POST',
    body: JSON.stringify({ city })
  });
}


export async function saveHomeAssistantConfig(payload: HomeAssistantConfigRequest): Promise<HomeAssistantConfigResponse> {
  return apiFetch<HomeAssistantConfigResponse>('/api/home-assistant/config', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}


export async function getHomeAssistantRoomsAndSensors(): Promise<HomeAssistantRoomsSensorsResponse> {
  return apiFetch<HomeAssistantRoomsSensorsResponse>('/api/home-assistant/rooms-and-sensors', {
    method: 'GET'
  });
}

export async function bindPlantRoom(plantId: number, payload: PlantRoomBindingRequest): Promise<PlantConditionsResponse> {
  return apiFetch<PlantConditionsResponse>(`/api/plants/${plantId}/room`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function getPlantConditions(plantId: number): Promise<PlantConditionsResponse> {
  return apiFetch<PlantConditionsResponse>(`/api/plants/${plantId}/conditions`, { method: 'GET' });
}

export async function getPlantConditionsHistory(plantId: number, days = 7): Promise<PlantConditionsHistoryResponse> {
  return apiFetch<PlantConditionsHistoryResponse>(`/api/plants/${plantId}/history-conditions?days=${days}`, {
    method: 'GET'
  });
}


export async function identifyPlantOpenRouter(imageBase64: string): Promise<OpenRouterIdentifyResult> {
  return apiFetch<OpenRouterIdentifyResult>('/api/plant/identify-openrouter', {
    method: 'POST',
    body: JSON.stringify({ imageBase64 })
  });
}

export async function diagnosePlantOpenRouter(
  imageBase64: string,
  plantName: string,
  plantContext?: string
): Promise<OpenRouterDiagnoseResult> {
  return apiFetch<OpenRouterDiagnoseResult>('/api/plant/diagnose-openrouter', {
    method: 'POST',
    body: JSON.stringify({ imageBase64, plantName, plantContext })
  });
}

export async function getAchievements(): Promise<AchievementsDto> {
  return apiFetch<AchievementsDto>('/api/user/achievements', { method: 'GET' });
}

export async function checkAchievements(): Promise<AchievementsDto> {
  return apiFetch<AchievementsDto>('/api/user/achievements/check', { method: 'POST' });
}

export async function getOpenRouterModels(): Promise<OpenRouterModelsDto> {
  return apiFetch<OpenRouterModelsDto>('/api/openrouter/models', { method: 'GET' });
}

export async function validateOpenRouterKey(apiKey: string): Promise<{ ok: boolean; message?: string }> {
  return apiFetch<{ ok: boolean; message?: string }>('/api/openrouter/validate-key', {
    method: 'POST',
    body: JSON.stringify({ apiKey })
  });
}

export async function getOpenRouterRuntimeSettings(): Promise<OpenRouterRuntimeSettingsDto> {
  return apiFetch<OpenRouterRuntimeSettingsDto>('/api/settings/openrouter', { method: 'GET' });
}

export async function getAdminOpenRouterModels(): Promise<AdminOpenRouterModelsDto> {
  return apiFetch<AdminOpenRouterModelsDto>('/api/admin/openrouter/models', { method: 'GET' });
}

export async function saveAdminOpenRouterModels(payload: {
  textModel?: string | null;
  photoModel?: string | null;
  textModelCheckIntervalMinutes?: number | null;
  photoModelCheckIntervalMinutes?: number | null;
  aiTextCacheEnabled?: boolean | null;
  aiTextCacheTtlDays?: number | null;
}): Promise<AdminOpenRouterModelsDto> {
  return apiFetch<AdminOpenRouterModelsDto>('/api/admin/openrouter/models', {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function checkAdminOpenRouterAvailability(type: 'text' | 'photo'): Promise<AdminOpenRouterAvailabilityCheckDto> {
  return apiFetch<AdminOpenRouterAvailabilityCheckDto>(`/api/admin/openrouter/check?type=${encodeURIComponent(type)}`, {
    method: 'POST'
  });
}

export async function testOpenRouterModel(type: 'text' | 'photo'): Promise<OpenRouterTypedTestDto> {
  return apiFetch<OpenRouterTypedTestDto>(`/api/openrouter/test?type=${encodeURIComponent(type)}`, {
    method: 'POST'
  });
}

export async function askAssistant(question: string): Promise<ChatAskResponse> {
  return apiFetch<ChatAskResponse>('/api/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({ question })
  });
}

export async function getAssistantHistory(limit = 50): Promise<AssistantHistoryItemDto[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  return apiFetch<AssistantHistoryItemDto[]>(`/api/assistant/history?${params.toString()}`, { method: 'GET' });
}

export async function clearAssistantHistory(): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/api/assistant/history', { method: 'DELETE' });
}


export async function getPlantCareAdvice(id: number, forceRefresh = false): Promise<PlantCareAdviceDto> {
  const query = forceRefresh ? '?refresh=true' : '';
  return apiFetch<PlantCareAdviceDto>(`/api/plants/${id}/care-advice${query}`, { method: 'GET' });
}


export async function getAdminOverview(): Promise<AdminOverviewDto> {
  return apiFetch<AdminOverviewDto>('/api/admin/overview', { method: 'GET' });
}

export async function getAdminUsers(page = 0, size = 20, q = ''): Promise<AdminUsersDto> {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (q.trim()) {
    params.set('q', q.trim());
  }
  return apiFetch<AdminUsersDto>(`/api/admin/users?${params.toString()}`, { method: 'GET' });
}

export async function getAdminPlants(page = 0, size = 20, q = ''): Promise<AdminPlantsDto> {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (q.trim()) {
    params.set('q', q.trim());
  }
  return apiFetch<AdminPlantsDto>(`/api/admin/plants?${params.toString()}`, { method: 'GET' });
}

export async function waterAdminPlant(plantId: number): Promise<AdminPlantActionDto> {
  return apiFetch<AdminPlantActionDto>(`/api/admin/plants/${plantId}/water`, { method: 'POST' });
}

export async function waterAdminOverduePlants(plantIds?: number[]): Promise<AdminBulkPlantWaterDto> {
  return apiFetch<AdminBulkPlantWaterDto>('/api/admin/plants/water-overdue', {
    method: 'POST',
    body: JSON.stringify({ plantIds: plantIds?.length ? plantIds : undefined })
  });
}

export async function deleteAdminPlant(plantId: number): Promise<AdminPlantActionDto> {
  return apiFetch<AdminPlantActionDto>(`/api/admin/plants/${plantId}`, { method: 'DELETE' });
}

export async function updateAdminPlant(
  plantId: number,
  payload: { name?: string; baseIntervalDays?: number; category?: 'HOME' | 'OUTDOOR_DECORATIVE' | 'OUTDOOR_GARDEN' }
): Promise<AdminPlantItemDto> {
  return apiFetch<AdminPlantItemDto>(`/api/admin/plants/${plantId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function getAdminUserPlants(userId: number): Promise<AdminPlantItemDto[]> {
  return apiFetch<AdminPlantItemDto[]>(`/api/admin/users/${userId}/plants`, { method: 'GET' });
}

export async function getAdminUserDetails(userId: number): Promise<AdminUserDetailsDto> {
  return apiFetch<AdminUserDetailsDto>(`/api/admin/users/${userId}/details`, { method: 'GET' });
}

export async function setAdminUserBlocked(userId: number, blocked?: boolean): Promise<AdminUserActionDto> {
  return apiFetch<AdminUserActionDto>(`/api/admin/users/${userId}/block`, {
    method: 'POST',
    body: JSON.stringify({ blocked })
  });
}

export async function deleteAdminUser(userId: number): Promise<AdminUserActionDto> {
  return apiFetch<AdminUserActionDto>(`/api/admin/users/${userId}`, { method: 'DELETE' });
}

export async function getAdminStats(): Promise<AdminStatsDto> {
  return apiFetch<AdminStatsDto>('/api/admin/stats', { method: 'GET' });
}

export async function clearAdminCache(): Promise<AdminCacheClearDto> {
  return apiFetch<AdminCacheClearDto>('/api/admin/clear-cache', { method: 'POST' });
}

export async function clearAdminCacheScope(scope: 'weather' | 'openrouter' | 'users' | 'ai-text' | 'ai-text-expired'): Promise<AdminScopedCacheClearDto> {
  return apiFetch<AdminScopedCacheClearDto>(`/api/admin/clear-cache/${scope}`, { method: 'POST' });
}

export async function getAdminBackups(): Promise<AdminBackupItemDto[]> {
  return apiFetch<AdminBackupItemDto[]>('/api/admin/backups', { method: 'GET' });
}

export async function createAdminBackup(): Promise<AdminBackupItemDto> {
  return apiFetch<AdminBackupItemDto>('/api/admin/backup/create', { method: 'POST' });
}

export async function restoreAdminBackup(fileName: string): Promise<AdminBackupRestoreDto> {
  return apiFetch<AdminBackupRestoreDto>(`/api/admin/backups/${encodeURIComponent(fileName)}/restore`, { method: 'POST' });
}

export async function sendAdminPushTest(payload: { userId: number; title?: string; body?: string }): Promise<AdminPushTestDto> {
  return apiFetch<AdminPushTestDto>('/api/admin/push/test', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function getAdminMonitoring(): Promise<AdminMonitoringDto> {
  return apiFetch<AdminMonitoringDto>('/api/admin/monitoring', { method: 'GET' });
}

export async function getAdminActivityLogs(limit = 50): Promise<AdminActivityLogItemDto[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  return apiFetch<AdminActivityLogItemDto[]>(`/api/admin/activity/logs?${params.toString()}`, { method: 'GET' });
}

export async function suggestPlantProfile(name: string): Promise<PlantProfileSuggestionDto> {
  const params = new URLSearchParams({ name });
  return apiFetch<PlantProfileSuggestionDto>(`/api/plants/suggest-profile?${params.toString()}`, { method: 'GET' });
}

export async function aiSearchPlants(payload: {
  query: string;
  category?: 'HOME' | 'OUTDOOR_DECORATIVE' | 'OUTDOOR_GARDEN' | 'SEED_START';
}): Promise<PlantAiSearchResponseDto> {
  return apiFetch<PlantAiSearchResponseDto>('/api/plants/ai-search', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
