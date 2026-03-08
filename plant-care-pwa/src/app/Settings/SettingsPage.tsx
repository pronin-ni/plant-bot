import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Bell,
  BellRing,
  Brain,
  CalendarSync,
  CloudDrizzle,
  CloudUpload,
  Copy,
  Download,
  Droplet,
  Home,
  Leaf,
  MapPin,
  Plus,
  QrCode,
  ServerCog,
  Settings2,
  ShieldCheck,
  Smartphone,
  SmartphoneNfc,
  Sparkles,
  Trash2,
  Waves,
  Wifi
} from 'lucide-react';

import { PlatformPullToRefresh } from '@/components/adaptive/PlatformPullToRefresh';
import { SettingsAccordion } from '@/components/SettingsAccordion';
import { SettingsTutorial } from '@/components/SettingsTutorial';
import { WeatherProviderSelector } from '@/components/WeatherProviderSelector';
import { hapticImpact } from '@/lib/telegram';
import { getConfiguredPwaUrl, openPwaMigrationFlow } from '@/lib/pwa-migration';
import { trackMigrationEvent } from '@/lib/analytics';
import {
  getWeatherProviders,
  getWeatherCurrent,
  getWeatherForecast,
  setWeatherProvider,
  saveHomeAssistantConfig,
  getHomeAssistantRoomsAndSensors,
  getOpenRouterModels,
  getOpenRouterPreferences,
  saveOpenRouterPreferences,
  clearOpenRouterApiKey,
  validateOpenRouterKey,
  sendOpenRouterTest,
  exportPdf,
  importFromCloud,
  backupToTelegram,
  getAchievements,
  checkAchievements,
  getStats,
  getLearning,
  getCalendarSync,
  updateCalendarSync,
  getPwaPushPublicKey,
  getPwaPushStatus,
  subscribePwaPush,
  unsubscribePwaPush
} from '@/lib/api';
import type {
  WeatherCurrentDto,
  WeatherForecastDto,
  WeatherProvidersResponse,
  OpenRouterModelsDto,
  OpenRouterPreferencesDto,
  AchievementsDto,
  PlantStatsDto,
  PlantLearningDto,
  CalendarSyncDto
} from '@/types/api';
import type { HomeAssistantRoomsSensorsResponse } from '@/types/home-assistant';
import { Button } from '@/components/ui/button';
import { ModelSelector } from '@/components/ModelSelector';
import { ExportImportSection } from '@/components/ExportImportSection';
import { AchievementCard } from '@/components/AchievementCard';

type SectionId =
  | 'pwa'
  | 'weather'
  | 'home-assistant'
  | 'openrouter'
  | 'backup'
  | 'achievements'
  | 'stats'
  | 'learning'
  | 'calendar'
  | 'notifications'
  | 'haptic'
  | 'admin';

const SECTION_META: Record<
  SectionId,
  { title: string; description: string; icon: any; tone?: 'emerald' | 'amber' | 'blue' | 'red' | 'default'; keywords: string[] }
> = {
  pwa: {
    title: 'PWA-режим и QR',
    description: 'Установите на домашний экран и перенесите данные',
    icon: SmartphoneNfc,
    tone: 'blue',
    keywords: ['pwa', 'установка', 'qr', 'offline']
  },
  weather: {
    title: 'Погода и город',
    description: 'Выбор бесплатного провайдера + автодополнение городов',
    icon: CloudDrizzle,
    tone: 'emerald',
    keywords: ['weather', 'погода', 'город', 'open-meteo']
  },
  'home-assistant': {
    title: 'Home Assistant',
    description: 'Несколько инстансов, устройства, риски',
    icon: Home,
    tone: 'amber',
    keywords: ['ha', 'iot', 'sensors', 'rooms']
  },
  openrouter: {
    title: 'OpenRouter AI',
    description: 'Ключ, авто-выбор vision/text, тест',
    icon: Brain,
    tone: 'emerald',
    keywords: ['openrouter', 'ai', 'vision', 'text', 'models']
  },
  backup: {
    title: 'Экспорт / Импорт',
    description: 'PDF, Drive/Dropbox, авто-бэкап',
    icon: Download,
    tone: 'blue',
    keywords: ['export', 'import', 'backup', 'drive', 'dropbox', 'pdf']
  },
  achievements: {
    title: 'Достижения',
    description: 'Награды, анимации, поделиться',
    icon: Sparkles,
    tone: 'emerald',
    keywords: ['achievements', 'награды', 'master', 'ai ботаник']
  },
  stats: {
    title: 'Статистика поливов',
    description: 'Графики, сравнение периодов, CSV, AI-анализ',
    icon: Activity,
    tone: 'blue',
    keywords: ['stats', 'csv', 'ai анализ', 'просроки']
  },
  learning: {
    title: 'Адаптивное обучение',
    description: 'Слайдеры интервалов + AI оптимальность',
    icon: Waves,
    tone: 'emerald',
    keywords: ['learning', 'intervals', 'ai', 'slider']
  },
  calendar: {
    title: 'Синхронизация календаря',
    description: 'QR, Outlook/Yandex, тест события',
    icon: CalendarSync,
    tone: 'blue',
    keywords: ['calendar', 'outlook', 'yandex', 'ics', 'qr']
  },
  notifications: {
    title: 'Уведомления',
    description: 'Время, звук, вибрация, тест пуша',
    icon: BellRing,
    tone: 'amber',
    keywords: ['notifications', 'push', 'telegram', 'sound', 'vibration']
  },
  haptic: {
    title: 'Тактильный отклик',
    description: 'Интенсивность, паттерны, энергосбережение',
    icon: Smartphone,
    tone: 'default',
    keywords: ['haptic', 'vibration', 'energy']
  },
  admin: {
    title: 'Администрирование',
    description: 'Только для админов',
    icon: ShieldCheck,
    tone: 'red',
    keywords: ['admin']
  }
};

const SECTION_ORDER: SectionId[] = [
  'pwa',
  'weather',
  'home-assistant',
  'openrouter',
  'backup',
  'achievements',
  'stats',
  'learning',
  'calendar',
  'notifications',
  'haptic',
  'admin'
];

export function SettingsPage() {
  const [search, setSearch] = useState('');
  const [openSections, setOpenSections] = useState<SectionId[]>(['pwa', 'weather']);
  const [isAdmin] = useState<boolean>(() => {
    const flag = localStorage.getItem('app:isAdmin');
    return flag === '1';
  });
  const pwaUrl = useMemo(() => getConfiguredPwaUrl(), []);
  const [pwaInstalled, setPwaInstalled] = useState(false);
  const [pwaChecking, setPwaChecking] = useState(false);
  const [pwaStatus, setPwaStatus] = useState<string | null>(null);
  const [weatherProvider, setWeatherProviderState] = useState<string | null>(null);
  const [weatherProviders, setWeatherProviders] = useState<WeatherProvidersResponse | null>(null);
  const [weatherCurrent, setWeatherCurrent] = useState<WeatherCurrentDto | null>(null);
  const [weatherForecast, setWeatherForecast] = useState<WeatherForecastDto | null>(null);
  const [weatherCity, setWeatherCity] = useState<string>(() => localStorage.getItem('settings:weather-city') ?? '');
  const [weatherSaving, setWeatherSaving] = useState(false);
  const [weatherPreviewLoading, setWeatherPreviewLoading] = useState(false);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [weatherHint, setWeatherHint] = useState<string | null>(null);

  const visibleSections = useMemo(() => {
    const query = search.trim().toLowerCase();
    const base = isAdmin ? SECTION_ORDER : SECTION_ORDER.filter((id) => id !== 'admin');
    if (!query) {
      return base;
    }
    return base.filter((id) => {
      const meta = SECTION_META[id];
      const haystack = [meta.title, meta.description, ...meta.keywords].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [isAdmin, search]);

  const toggleSection = (id: SectionId) => {
    hapticImpact('light');
    setOpenSections((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  useEffect(() => {
    const installed = detectPwaInstalled();
    setPwaInstalled(installed);
    setPwaStatus(installed ? 'Установлено как PWA' : 'Откройте через QR и добавьте на экран');
  }, []);

  useEffect(() => {
    void loadProviders();
  }, []);

  useEffect(() => {
    if (!weatherCity.trim()) {
      setCitySuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchOpenMeteoCities(weatherCity, controller.signal).then((cities) => {
        setCitySuggestions(cities);
      });
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [weatherCity]);

  const loadProviders = async () => {
    try {
      const res = await getWeatherProviders();
      setWeatherProviders(res);
      setWeatherProviderState(res.selected ?? res.providers?.[0]?.id ?? null);
      if (res.selected && weatherCity.trim()) {
        void handleWeatherPreview();
      }
    } catch (error) {
      console.error('weather providers', error);
    }
  };

  const handleSaveProvider = async () => {
    if (!weatherProvider) {
      setWeatherHint('Выберите провайдера');
      return;
    }
    setWeatherSaving(true);
    setWeatherHint(null);
    try {
      const res = await setWeatherProvider(weatherProvider);
      setWeatherProviders(res);
      setWeatherProviderState(res.selected ?? weatherProvider);
      setWeatherHint('Провайдер сохранён');
    } catch (error) {
      setWeatherHint('Не удалось сохранить провайдера');
      console.error(error);
    } finally {
      setWeatherSaving(false);
    }
  };

  const handleWeatherPreview = async () => {
    if (!weatherProvider || !weatherCity.trim()) {
      setWeatherHint('Укажите город и провайдера');
      return;
    }
    setWeatherPreviewLoading(true);
    setWeatherHint(null);
    try {
      const [current, forecast] = await Promise.all([
        getWeatherCurrent(weatherCity.trim()),
        getWeatherForecast(weatherCity.trim())
      ]);
      setWeatherCurrent(current);
      setWeatherForecast(forecast);
      setWeatherHint('Предпросмотр обновлён');
    } catch (error) {
      setWeatherHint('Не удалось получить погоду');
      console.error(error);
    } finally {
      setWeatherPreviewLoading(false);
    }
  };

  useEffect(() => {
    const stored = localStorage.getItem('settings:open');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as SectionId[];
        setOpenSections(parsed);
      } catch {
        /* noop */
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('settings:open', JSON.stringify(openSections));
  }, [openSections]);

  return (
    <PlatformPullToRefresh onRefresh={() => window.location.reload()}>
      <section className="settings-premium-shell space-y-4 pb-28">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-ios-caption uppercase tracking-wide text-ios-subtext">Настройки</p>
            <h2 className="platform-top-title mt-1">Всё под вашим контролем</h2>
            <p className="platform-top-subtitle mt-1 text-sm">Установки, интеграции, резервные копии, уведомления.</p>
          </div>
          <div className="ios-blur-card flex items-center gap-2 rounded-2xl border border-ios-border/60 bg-white/70 px-3 py-2 text-xs text-ios-subtext dark:bg-zinc-950/70">
            <Settings2 className="h-4 w-4" />
            Быстрый поиск
          </div>
        </div>

        <div className="ios-blur-card flex items-center gap-2 rounded-2xl border border-ios-border/60 bg-white/70 px-3 py-2 dark:bg-zinc-950/70">
          <Leaf className="h-4 w-4 text-ios-accent" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Найти: погода, PWA, уведомления..."
            className="w-full bg-transparent text-sm text-ios-text outline-none placeholder:text-ios-subtext"
          />
        </div>

        {visibleSections.map((id) => {
          const meta = SECTION_META[id];
          const open = openSections.includes(id);
          const status =
            id === 'pwa'
              ? pwaInstalled
                ? 'Установлено'
                : 'Нужно установить'
              : id === 'weather'
                ? weatherProviders?.selected ?? 'Выберите'
                : null;
          return (
            <SettingsAccordion
              key={id}
              id={id}
              title={meta.title}
              description={meta.description}
              icon={meta.icon}
              open={open}
              onToggle={(sectionId) => toggleSection(sectionId as SectionId)}
              tone={meta.tone}
              statusBadge={status}
            >
              {id === 'pwa' ? (
                <PwaPreview
                  pwaUrl={pwaUrl}
                  pwaInstalled={pwaInstalled}
                  pwaStatus={pwaStatus}
                  checking={pwaChecking}
                  onCheckStatus={() => {
                    hapticImpact('light');
                    setPwaChecking(true);
                    setTimeout(() => {
                      const installed = detectPwaInstalled();
                      setPwaInstalled(installed);
                      setPwaStatus(installed ? 'Установлено как PWA' : 'Не установлено. Добавьте на экран Домой.');
                      setPwaChecking(false);
                    }, 200);
                  }}
                  onOpenPwa={async () => {
                    try {
                      hapticImpact('medium');
                      await openPwaMigrationFlow();
                      trackMigrationEvent({ type: 'migration_started' });
                      setPwaStatus('Открываем PWA...');
                    } catch (error) {
                      console.error(error);
                      setPwaStatus('Не удалось открыть PWA');
                    }
                  }}
                />
              ) : null}
              {id === 'weather' ? (
                <WeatherPreview
                  providers={weatherProviders?.providers ?? []}
                  selected={weatherProvider}
                  city={weatherCity}
                  suggestions={citySuggestions}
                  onSelectCity={(city) => {
                    setWeatherCity(city);
                    localStorage.setItem('settings:weather-city', city);
                  }}
                  onSelectProvider={(id) => {
                    setWeatherProviderState(id);
                    hapticImpact('light');
                  }}
                  onSaveProvider={handleSaveProvider}
                  saving={weatherSaving}
                  onPreview={handleWeatherPreview}
                  current={weatherCurrent}
                  forecast={weatherForecast}
                  loadingPreview={weatherPreviewLoading}
                  hint={weatherHint}
                />
              ) : null}
              {id === 'home-assistant' ? <HaPreview /> : null}
              {id === 'openrouter' ? <OpenRouterPreview /> : null}
              {id === 'backup' ? <BackupPreview /> : null}
              {id === 'achievements' ? <AchievementsPreview /> : null}
              {id === 'stats' ? <StatsPreview /> : null}
              {id === 'learning' ? <LearningPreview /> : null}
              {id === 'calendar' ? <CalendarPreview /> : null}
              {id === 'notifications' ? <NotificationsPreview /> : null}
              {id === 'haptic' ? <HapticPreview /> : null}
              {id === 'admin' ? <AdminPreview /> : null}
            </SettingsAccordion>
          );
        })}
      </section>
    </PlatformPullToRefresh>
  );
}

function PlaceholderCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-ios-border/60 bg-white/60 p-3 text-sm text-ios-subtext dark:bg-zinc-950/60">
      <p className="font-semibold text-ios-text">{title}</p>
      <p className="mt-1 leading-5">{text}</p>
    </div>
  );
}

function detectPwaInstalled(): boolean {
  const match = window.matchMedia?.('(display-mode: standalone)')?.matches;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
  return Boolean(match || iosStandalone);
}

function PwaPreview({
  pwaUrl,
  pwaInstalled,
  pwaStatus,
  onCheckStatus,
  checking,
  onOpenPwa
}: {
  pwaUrl: string | null;
  pwaInstalled: boolean;
  pwaStatus: string | null;
  checking: boolean;
  onCheckStatus: () => void;
  onOpenPwa: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-ios-border/60 bg-white/65 p-3 dark:border-emerald-500/20 dark:bg-zinc-950/55">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[12px] uppercase tracking-wide text-ios-subtext">Статус PWA</p>
            <p className="text-sm font-semibold text-ios-text">
              {pwaStatus ?? 'Проверяем…'}
            </p>
          </div>
          {pwaInstalled ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-700 dark:text-emerald-200">
              <ShieldCheck className="h-4 w-4" />
              Установлено
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/45 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              Не установлено
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="android-ripple inline-flex items-center gap-1 rounded-2xl border border-ios-border/60 bg-white/70 px-3 py-2 text-sm font-medium text-ios-text dark:bg-zinc-900/70"
            onClick={onCheckStatus}
          >
            {checking ? 'Проверяем…' : 'Проверить статус'}
          </button>
          <button
            type="button"
            className="android-ripple inline-flex items-center gap-1 rounded-2xl border border-ios-border/60 bg-white/70 px-3 py-2 text-sm font-medium text-ios-text dark:bg-zinc-900/70"
            onClick={onOpenPwa}
            disabled={!pwaUrl}
          >
            Открыть PWA
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
        <div className="mb-1 inline-flex items-center gap-1.5 font-medium">
          <AlertTriangle className="h-4 w-4" />
          Миграция данных
        </div>
        При установке PWA будет использована текущая сессия. Убедитесь, что Telegram-данные актуальны.
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-ios-border/60 bg-white/65 p-3 dark:border-emerald-500/20 dark:bg-zinc-950/55">
          <p className="mb-2 text-sm font-semibold text-ios-text">QR-код для установки</p>
          {pwaUrl ? (
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pwaUrl)}`}
              alt="QR для PWA"
              className="h-48 w-48 rounded-xl border border-ios-border/50 bg-white p-2"
            />
          ) : (
            <p className="text-xs text-red-600">Не задан VITE_PWA_URL</p>
          )}
          {pwaUrl ? (
            <p className="mt-2 break-words text-[12px] text-ios-subtext">Ссылка: {pwaUrl}</p>
          ) : null}
        </div>

        <div className="space-y-3">
          <SettingsTutorial
            tone="blue"
            steps={[
              { title: '1. Сканируйте QR', description: 'Откройте ссылку в Safari / Chrome', icon: QrCode },
              { title: '2. Добавьте на экран', description: 'iOS: «Поделиться» → «На экран Домой»; Android: «Добавить на главный экран».', icon: Smartphone },
              { title: '3. Откройте из иконки', description: 'Приложение загрузится в полноэкранном режиме и подтянет данные.', icon: Leaf }
            ]}
          />

          <div className="rounded-2xl border border-ios-border/60 bg-white/60 p-3 text-[12px] leading-5 text-ios-subtext dark:bg-zinc-950/55">
            <p className="mb-1 inline-flex items-center gap-1.5 font-medium text-ios-text">
              <Waves className="h-4 w-4 text-ios-accent" />
              Быстрый чек-лист
            </p>
            <ul className="space-y-1.5 pl-4 marker:text-ios-accent">
              <li className="list-disc">Есть интернет при первом открытии.</li>
              <li className="list-disc">В Telegram mini-app авторизованы.</li>
              <li className="list-disc">Разрешите уведомления для PWA при запросе.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function WeatherPreview({
  providers,
  selected,
  city,
  suggestions,
  onSelectCity,
  onSelectProvider,
  onSaveProvider,
  saving,
  onPreview,
  current,
  forecast,
  loadingPreview,
  hint
}: {
  providers: WeatherProvidersResponse['providers'];
  selected: string | null;
  city: string;
  suggestions: string[];
  onSelectCity: (city: string) => void;
  onSelectProvider: (id: string) => void;
  onSaveProvider: () => void;
  saving: boolean;
  onPreview: () => void;
  current: WeatherCurrentDto | null;
  forecast: WeatherForecastDto | null;
  loadingPreview: boolean;
  hint?: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-ios-border/60 bg-white/65 p-3 text-sm text-ios-subtext dark:border-emerald-500/20 dark:bg-zinc-950/55">
        <p className="font-semibold text-ios-text">Выберите провайдера — приложение само получит прогноз без ввода ключей</p>
        <p className="mt-1 text-[12px] leading-5">
          Open-Meteo без ключа, остальные бесплатные tier с публичным ключом на бэкенде. После выбора бэкенд переключит эндпоинт для /current и /forecast.
        </p>
      </div>

      <WeatherProviderSelector
        providers={providers}
        selected={selected ?? undefined}
        onChange={onSelectProvider}
        saving={saving}
        current={current}
        forecast={forecast}
        loadingPreview={loadingPreview}
      />

      <div className="rounded-2xl border border-ios-border/60 bg-white/65 p-3 dark:border-emerald-500/20 dark:bg-zinc-950/55">
        <label className="block space-y-1">
          <span className="text-xs text-ios-subtext">Город (автодополнение Open-Meteo)</span>
          <input
            value={city}
            onChange={(e) => onSelectCity(e.target.value)}
            placeholder="Например, Москва"
            className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/70 px-4 text-ios-body outline-none backdrop-blur-ios dark:border-emerald-500/20 dark:bg-zinc-900/60"
          />
        </label>
        {suggestions.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.slice(0, 6).map((item) => (
              <button
                key={item}
                type="button"
                className="rounded-full border border-ios-border/60 bg-white/70 px-2 py-1 text-[12px] text-ios-text hover:border-ios-accent/60 dark:bg-zinc-900/60"
                onClick={() => onSelectCity(item)}
              >
                {item}
              </button>
            ))}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={!city.trim() || !selected || saving}
            onClick={onSaveProvider}
            variant="secondary"
          >
            {saving ? 'Сохраняем...' : 'Сохранить провайдера'}
          </Button>
          <Button type="button" disabled={!city.trim() || !selected || loadingPreview} onClick={onPreview}>
            {loadingPreview ? 'Обновляем...' : 'Предпросмотр'}
          </Button>
        </div>
        {hint ? <p className="mt-2 text-[12px] text-ios-subtext">{hint}</p> : null}
      </div>

      <SettingsTutorial
        tone="emerald"
        steps={[
          { title: '1. Выберите провайдера', description: 'Open-Meteo или любой из бесплатных, ключи уже на сервере.' },
          { title: '2. Укажите город', description: 'Автодополнение на Open-Meteo без ключей.' },
          { title: '3. Нажмите «Предпросмотр»', description: 'Покажем температуру, влажность и прогноз на 3 дня.' }
        ]}
      />
    </div>
  );
}

function HaPreview() {
  type HaInstance = { id: string; baseUrl: string; token: string; name?: string };
  const [instances, setInstances] = useState<HaInstance[]>(() => {
    try {
      const stored = localStorage.getItem('settings:ha-instances');
      const parsed = stored ? (JSON.parse(stored) as HaInstance[]) : [];
      return parsed;
    } catch {
      return [];
    }
  });
  const [activeId, setActiveId] = useState<string | null>(instances[0]?.id ?? null);
  const activeInstance = useMemo(() => instances.find((item) => item.id === activeId) ?? null, [instances, activeId]);
  const [baseUrl, setBaseUrl] = useState(activeInstance?.baseUrl ?? '');
  const [token, setToken] = useState(activeInstance?.token ?? '');
  const [agreeRisk, setAgreeRisk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<HomeAssistantRoomsSensorsResponse | null>(null);

  useEffect(() => {
    localStorage.setItem('settings:ha-instances', JSON.stringify(instances));
  }, [instances]);

  useEffect(() => {
    if (activeInstance) {
      setBaseUrl(activeInstance.baseUrl);
      setToken(activeInstance.token);
    }
  }, [activeInstance]);

  const handleAdd = () => {
    if (!baseUrl.trim() || !token.trim()) {
      setStatus('Укажите URL и токен');
      return;
    }
    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    const next: HaInstance = { id, baseUrl: baseUrl.trim(), token: token.trim() };
    setInstances((prev) => [...prev, next]);
    setActiveId(id);
    setStatus('Инстанс добавлен локально');
    hapticImpact('light');
  };

  const handleDelete = (id: string) => {
    setInstances((prev) => prev.filter((item) => item.id !== id));
    if (activeId === id) {
      const rest = instances.filter((item) => item.id !== id);
      setActiveId(rest[0]?.id ?? null);
    }
    setStatus('Удалено из списка (без влияния на HA)');
    hapticImpact('light');
  };

  const handleSaveActive = async () => {
    if (!agreeRisk) {
      setStatus('Подтвердите риски полного доступа');
      return;
    }
    if (!baseUrl.trim() || !token.trim()) {
      setStatus('Нужен URL и токен');
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const res = await saveHomeAssistantConfig({ baseUrl: baseUrl.trim(), token: token.trim() });
      setStatus(res.message ?? (res.connected ? 'Подключено' : 'Не удалось подключиться'));
      setInstances((prev) =>
        prev.map((item) => (item.id === activeId ? { ...item, baseUrl: baseUrl.trim(), token: token.trim(), name: res.instanceName } : item))
      );
      hapticImpact(res.connected ? 'medium' : 'light');
    } catch (error) {
      console.error(error);
      setStatus('Ошибка сохранения');
      hapticImpact('light');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!agreeRisk || !baseUrl.trim() || !token.trim()) {
      setStatus('Сохраните активный инстанс и подтвердите риски');
      return;
    }
    setTesting(true);
    setStatus('Тестируем подключение...');
    try {
      // Сохраняем текущий активный инстанс перед тестом
      await saveHomeAssistantConfig({ baseUrl: baseUrl.trim(), token: token.trim() });
      const res = await getHomeAssistantRoomsAndSensors();
      setTestResult(res);
      setStatus(res.connected ? 'Подключено: комнаты и сенсоры получены' : res.message ?? 'Не подключено');
      hapticImpact(res.connected ? 'medium' : 'light');
    } catch (error) {
      console.error(error);
      setStatus('Не удалось протестировать HA');
      hapticImpact('light');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-ios-border/60 bg-white/65 p-3 dark:border-amber-500/20 dark:bg-zinc-950/55">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-ios-text">
            <Home className="h-4 w-4 text-ios-accent" /> Инстансы Home Assistant
          </div>
          <button
            type="button"
            onClick={handleAdd}
            className="android-ripple inline-flex items-center gap-1 rounded-full border border-ios-border/60 bg-white/70 px-2 py-1 text-[12px] font-semibold text-ios-text dark:bg-zinc-900/60"
          >
            <Plus className="h-3.5 w-3.5" /> Добавить
          </button>
        </div>

        {instances.length ? (
          <div className="space-y-2">
            {instances.map((item) => (
              <div
                key={item.id}
                className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${
                  item.id === activeId ? 'border-ios-accent/50 bg-ios-accent/10' : 'border-ios-border/50 bg-white/70 dark:bg-zinc-900/60'
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ios-text">{item.name ?? item.baseUrl}</p>
                  <p className="truncate text-[12px] text-ios-subtext">{item.baseUrl}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="android-ripple rounded-full border border-ios-border/60 bg-white/70 px-2 py-1 text-[11px] text-ios-text dark:bg-zinc-900/60"
                    onClick={() => {
                      setActiveId(item.id);
                      setStatus('Активный инстанс выбран');
                      hapticImpact('light');
                    }}
                  >
                    Активировать
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-red-300/60 bg-red-500/10 p-1 text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200"
                    onClick={() => handleDelete(item.id)}
                    aria-label="Удалить инстанс"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-ios-subtext">Добавьте первый HA: URL + долговременный токен.</p>
        )}

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="space-y-1 text-sm text-ios-text">
            <span className="text-[12px] text-ios-subtext">Base URL</span>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://ha.yourdomain.com"
              className="h-11 w-full rounded-ios-button border border-ios-border/60 bg-white/70 px-3 text-sm outline-none backdrop-blur-ios dark:bg-zinc-900/60"
            />
          </label>
          <label className="space-y-1 text-sm text-ios-text">
            <span className="text-[12px] text-ios-subtext">Long-lived token</span>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="eyJ0eXAiOiJKV1QiLCJh..."
              className="h-11 w-full rounded-ios-button border border-ios-border/60 bg-white/70 px-3 text-sm outline-none backdrop-blur-ios dark:bg-zinc-900/60"
            />
          </label>
        </div>

        <label className="mt-2 flex items-start gap-2 text-[12px] text-ios-subtext">
          <input
            type="checkbox"
            checked={agreeRisk}
            onChange={(e) => setAgreeRisk(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-ios-border/60 text-ios-accent focus:ring-ios-accent"
          />
          <span>Я понимаю риски полного доступа Home Assistant (все данные и управление).</span>
        </label>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="android-ripple inline-flex items-center gap-1 rounded-full border border-ios-border/60 bg-white/70 px-3 py-2 text-sm font-semibold text-ios-text dark:bg-zinc-900/60"
            disabled={saving}
            onClick={handleSaveActive}
          >
            <ShieldCheck className="h-4 w-4" /> {saving ? 'Сохраняем...' : 'Сохранить активный'}
          </button>
          <button
            type="button"
            className="android-ripple inline-flex items-center gap-1 rounded-full border border-ios-border/60 bg-white/70 px-3 py-2 text-sm font-semibold text-ios-text dark:bg-zinc-900/60"
            disabled={testing}
            onClick={handleTest}
          >
            <Wifi className="h-4 w-4" /> {testing ? 'Тестируем...' : 'Тест устройств'}
          </button>
        </div>

        {status ? <p className="mt-2 text-[12px] text-ios-subtext">{status}</p> : null}

        {testResult ? (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border border-ios-border/60 bg-white/70 p-3 text-sm dark:bg-zinc-900/60">
              <p className="inline-flex items-center gap-1 text-ios-text">
                <ServerCog className="h-4 w-4 text-ios-accent" />
                Комнаты: {testResult.rooms.length}
              </p>
              <p className="mt-1 text-[12px] text-ios-subtext">Привяжите растения к комнатам для точных подсказок.</p>
            </div>
            <div className="rounded-2xl border border-ios-border/60 bg-white/70 p-3 text-sm dark:bg-zinc-900/60">
              <p className="inline-flex items-center gap-1 text-ios-text">
                <Droplet className="h-4 w-4 text-ios-accent" />
                Сенсоры: {testResult.sensors.length}
              </p>
              <p className="mt-1 text-[12px] text-ios-subtext">Температура/влажность/грунт подтянутся автоматически.</p>
            </div>
          </div>
        ) : null}
      </div>

      <SettingsTutorial
        steps={[
          { title: '1. Создайте токен', description: 'HA → Профиль → Tokens', icon: ShieldCheck },
          { title: '2. Введите URL + токен', description: 'Можно хранить несколько инстансов', icon: Home },
          { title: '3. Тест устройств', description: 'Покажем комнаты и датчики, предупредим об ошибках', icon: Wifi }
        ]}
        tone="amber"
      />
    </div>
  );
}

function OpenRouterPreview() {
  return (
    <div className="space-y-3">
      <OpenRouterConfigurator />
    </div>
  );
}

function BackupPreview() {
  const [mode, setMode] = useState<'MERGE' | 'REPLACE'>('MERGE');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  const handleExportPdf = async () => {
    setExporting(true);
    setImportError(null);
    try {
      const blob = await exportPdf();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'my-plants-report.pdf';
      link.click();
      URL.revokeObjectURL(url);
      setLastBackup(new Date().toLocaleString('ru-RU'));
      hapticImpact('medium');
    } catch (error) {
      console.error(error);
      setImportError('Не удалось экспортировать PDF');
      hapticImpact('light');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (provider: 'drive' | 'dropbox') => {
    setImporting(true);
    setImportError(null);
    setImportedCount(null);
    setProgress(15);
    try {
      const res = await importFromCloud(provider);
      setProgress(100);
      setImportedCount(res.imported);
      hapticImpact('medium');
    } catch (error) {
      console.error(error);
      setImportError('Импорт не выполнен. Проверьте OAuth/файл.');
      hapticImpact('light');
    } finally {
      setTimeout(() => setProgress(0), 1200);
      setImporting(false);
    }
  };

  const handleBackupTelegram = async () => {
    setImporting(true);
    setImportError(null);
    setProgress(25);
    try {
      const res = await backupToTelegram();
      setProgress(100);
      setImportedCount(res.ok ? 0 : null);
      setLastBackup(new Date().toLocaleString('ru-RU'));
      hapticImpact(res.ok ? 'medium' : 'light');
    } catch (error) {
      console.error(error);
      setImportError('Не удалось сохранить в Telegram Cloud');
    } finally {
      setTimeout(() => setProgress(0), 1200);
      setImporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <ExportImportSection
        restoreMode={mode}
        onChangeMode={setMode}
        onExport={handleExportPdf}
        onImport={() => handleImport('drive')}
        exportPending={exporting}
        importPending={importing}
        importError={importError}
        importedCount={importedCount}
      />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button
          variant="secondary"
          className="h-12 rounded-2xl"
          onClick={() => handleImport('dropbox')}
          disabled={importing}
        >
          Импорт из Dropbox
        </Button>
        <Button variant="secondary" className="h-12 rounded-2xl" onClick={handleBackupTelegram} disabled={importing}>
          Авто-бэкап в Telegram Cloud
        </Button>
        <Button
          variant="ghost"
          className="h-12 rounded-2xl border border-ios-border/50"
          onClick={() => setProgress((p) => (p ? 0 : 60))}
        >
          Восстановить с другого устройства
        </Button>
      </div>

      {progress > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-ios-border/60 bg-white/60">
          <div
            className="h-2 bg-gradient-to-r from-emerald-400 via-emerald-500 to-lime-500"
            style={{ width: `${Math.min(100, progress)}%`, transition: 'width 0.4s ease' }}
          />
        </div>
      ) : null}

      {lastBackup ? <p className="text-[12px] text-ios-subtext">Последний бэкап: {lastBackup}</p> : null}

      <SettingsTutorial
        steps={[
          { title: '1. Экспорт PDF', description: 'Статистика + графики', icon: Download },
          { title: '2. Drive/Dropbox', description: 'OAuth, выберите файл', icon: CloudDrizzle },
          { title: '3. Telegram Cloud', description: 'Ежедневный авто-бэкап', icon: CloudUpload }
        ]}
        tone="blue"
      />
    </div>
  );
}

function AchievementsPreview() {
  const [achievements, setAchievements] = useState<AchievementsDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getAchievements();
      setAchievements(res);
      setStatus(`Открыто ${res.unlocked}/${res.total}`);
    } catch (error) {
      console.error(error);
      setStatus('Не удалось загрузить достижения');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCheck = async () => {
    setLoading(true);
    try {
      const res = await checkAchievements();
      setAchievements(res);
      setStatus(`Проверили: ${res.unlocked}/${res.total}`);
      hapticImpact('medium');
    } catch (error) {
      console.error(error);
      setStatus('Не удалось обновить достижения');
    } finally {
      setLoading(false);
    }
  };

  const share = (platform: 'tg' | 'vk') => {
    const text = achievements
      ? `Мои достижения в «Мои Растения»: ${achievements.unlocked}/${achievements.total}! 🌿`
      : 'Мои достижения в «Мои Растения» 🌿';
    if (platform === 'tg') {
      window.open(`https://t.me/share/url?url=&text=${encodeURIComponent(text)}`, '_blank');
    } else {
      window.open(`https://vk.com/share.php?comment=${encodeURIComponent(text)}`, '_blank');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-ios-text">
          <p className="font-semibold">Ваши награды</p>
          <p className="text-xs text-ios-subtext">Новые: «Мастер сада», «AI-ботаник»</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleCheck} disabled={loading}>
            Проверить
          </Button>
          <Button variant="ghost" size="sm" onClick={() => share('tg')}>
            Поделиться в TG
          </Button>
          <Button variant="ghost" size="sm" onClick={() => share('vk')}>
            VK
          </Button>
        </div>
      </div>

      {loading ? <p className="text-xs text-ios-subtext">Грузим достижения...</p> : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {achievements?.items?.length
          ? achievements.items.map((item: AchievementsDto['items'][number]) => <AchievementCard key={item.key} item={item} />)
          : <PlaceholderCard title="Пока нет данных" text="Нажмите «Проверить», чтобы обновить прогресс." />}
      </div>

      {status ? <p className="text-[12px] text-ios-subtext">{status}</p> : null}
    </div>
  );
}

function StatsPreview() {
  const [stats, setStats] = useState<PlantStatsDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const overdueList = useMemo(() => (stats ?? []).filter((s) => s.overdue), [stats]);
  const topOverdue = overdueList[0]?.plantName;

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getStats();
      setStats(res);
      const overdue = res.filter((s) => s.overdue).length;
      setStatus(overdue ? `Просрочено у ${overdue} растений` : 'Без просрочек — отлично!');
    } catch (error) {
      console.error(error);
      setStatus('Не удалось загрузить статистику');
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    if (!stats?.length) return;
    const header = ['plantId', 'plantName', 'averageIntervalDays', 'totalWaterings', 'overdue', 'overdueDays'];
    const rows = stats.map((s) =>
      [s.plantId, s.plantName, s.averageIntervalDays ?? '', s.totalWaterings, s.overdue, s.overdueDays].join(',')
    );
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plant-stats.csv';
    link.click();
    URL.revokeObjectURL(url);
    hapticImpact('medium');
  };

  const aiHint = useMemo(() => {
    if (!stats?.length) return 'Получите первые данные, чтобы AI подсказал слабые места.';
    const overdue = stats.filter((s) => s.overdue);
    if (overdue.length) {
      return `AI: чаще всего опаздываете с ${topOverdue ?? 'некоторыми растениями'} — попробуйте сократить интервал или поставить уведомления.`;
    }
    return 'AI: у вас всё под контролем. Попробуйте недельный отчёт в PDF для сравнения.';
  }, [stats, topOverdue]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-ios-text">Мини-графики</p>
          <p className="text-[12px] text-ios-subtext">Неделя/месяц, CSV, AI советы</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={exportCsv} disabled={!stats?.length}>
            Экспорт CSV
          </Button>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            Обновить
          </Button>
        </div>
      </div>

      {loading ? <p className="text-xs text-ios-subtext">Загружаем статистику...</p> : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(stats ?? []).map((item) => {
          const intensity = Math.min(100, Math.max(10, item.totalWaterings * 4));
          return (
            <div
              key={item.plantId}
              className="rounded-2xl border border-ios-border/60 bg-white/65 p-3 text-sm dark:border-emerald-500/20 dark:bg-zinc-950/55"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-ios-text truncate">{item.plantName}</p>
                {item.overdue ? (
                  <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] text-red-600 dark:text-red-200">Просрок {item.overdueDays}д</span>
                ) : (
                  <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-200">Без просроков</span>
                )}
              </div>
              <p className="text-[12px] text-ios-subtext">Поливов: {item.totalWaterings} · Интервал ср.: {item.averageIntervalDays ?? '—'} дн.</p>
              <div className="mt-2 h-2 rounded-full bg-black/10 dark:bg-white/10">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-cyan-400"
                  style={{ width: `${intensity}%`, transition: 'width 0.4s ease' }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-ios-subtext">{status ?? aiHint}</p>
      <p className="text-[11px] text-ios-subtext">{aiHint}</p>
    </div>
  );
}

function LearningPreview() {
  const [learning, setLearning] = useState<PlantLearningDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [manualIntervals, setManualIntervals] = useState<Record<number, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('learning:manual-intervals') ?? '{}');
    } catch {
      return {};
    }
  });

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    localStorage.setItem('learning:manual-intervals', JSON.stringify(manualIntervals));
  }, [manualIntervals]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getLearning();
      setLearning(res);
      setStatus('AI обновил интервалы с учётом сезона/погоды/горшка');
    } catch (error) {
      console.error(error);
      setStatus('Не удалось загрузить данные обучения');
    } finally {
      setLoading(false);
    }
  };

  const optimality = (item: PlantLearningDto) => {
    const target = manualIntervals[item.plantId] ?? item.finalIntervalDays;
    const ratio = target / Math.max(1, item.finalIntervalDays);
    const pct = Math.round(Math.min(150, Math.max(40, ratio * 100)));
    return pct;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-ios-text">Адаптивное обучение</p>
          <p className="text-[12px] text-ios-subtext">Ручная коррекция + AI оптимальность</p>
        </div>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          Обновить
        </Button>
      </div>

      {loading ? <p className="text-xs text-ios-subtext">Готовим рекомендации AI...</p> : null}

      <div className="space-y-2">
        {(learning ?? []).map((item) => {
          const manual = manualIntervals[item.plantId] ?? item.finalIntervalDays;
          const opt = optimality(item);
          return (
            <div
              key={item.plantId}
              className="rounded-2xl border border-ios-border/60 bg-white/65 p-3 text-sm dark:border-emerald-500/20 dark:bg-zinc-950/55"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-ios-text">{item.plantName}</p>
                  <p className="text-[12px] text-ios-subtext">
                    База: {item.baseIntervalDays}д · AI: {item.finalIntervalDays}д · Погода: ×{item.weatherFactor.toFixed(2)} · Горшок: ×
                    {item.potFactor.toFixed(2)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[11px] ${
                    opt >= 90 ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-200' : 'bg-amber-500/12 text-amber-700 dark:text-amber-200'
                  }`}
                >
                  Оптимальность {opt}%
                </span>
              </div>
              <div className="mt-2">
                <input
                  type="range"
                  min={3}
                  max={30}
                  value={manual}
                  onChange={(e) => setManualIntervals((prev) => ({ ...prev, [item.plantId]: Number(e.target.value) }))}
                  className="w-full accent-emerald-500"
                />
                <div className="mt-1 flex justify-between text-[12px] text-ios-subtext">
                  <span>Ручной интервал: {manual} дн.</span>
                  <span>AI: {item.finalIntervalDays} дн.</span>
                </div>
              </div>
              <p className="mt-2 text-[12px] text-ios-subtext">
                Совет AI: {opt < 90 ? 'Сократите интервал для этого растения.' : 'Текущий график выглядит оптимально.'}
              </p>
            </div>
          );
        })}
      </div>

      {status ? <p className="text-[12px] text-ios-subtext">{status}</p> : null}
    </div>
  );
}

function CalendarPreview() {
  const [sync, setSync] = useState<CalendarSyncDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getCalendarSync();
      setSync(res);
      setStatus(res.enabled ? 'Синхронизация включена' : 'Отключена');
    } catch (error) {
      console.error(error);
      setStatus('Не удалось загрузить ссылки календаря');
    } finally {
      setLoading(false);
    }
  };

  const toggle = async (enabled: boolean) => {
    setLoading(true);
    try {
      const res = await updateCalendarSync(enabled);
      setSync(res);
      setStatus(res.enabled ? 'Включено' : 'Выключено');
      hapticImpact('medium');
    } catch (error) {
      console.error(error);
      setStatus('Не удалось обновить статус');
      hapticImpact('light');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-ios-text">Синхронизация календаря</p>
          <p className="text-[12px] text-ios-subtext">QR + ссылки для Outlook/Yandex/Apple</p>
        </div>
        <label className="flex items-center gap-2 text-[12px] text-ios-subtext">
          <input
            type="checkbox"
            checked={Boolean(sync?.enabled)}
            onChange={(e) => toggle(e.target.checked)}
            disabled={loading}
            className="h-4 w-4 rounded border-ios-border/60 text-ios-accent focus:ring-ios-accent"
          />
          Включить
        </label>
      </div>

      {sync ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-ios-border/60 bg-white/70 p-3 dark:bg-zinc-950/55">
            <p className="mb-2 text-xs font-semibold text-ios-subtext">Apple / iOS (webcal)</p>
            <Copyable text={sync.webcalUrl} />
            <div className="mt-2">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(sync.httpsUrl)}`}
                alt="QR Calendar"
                className="h-40 w-40 rounded-xl border border-ios-border/50 bg-white p-2"
              />
              <p className="mt-1 text-[11px] text-ios-subtext">Сканируйте на телефоне, чтобы добавить календарь.</p>
            </div>
          </div>
          <div className="space-y-2 rounded-2xl border border-ios-border/60 bg-white/70 p-3 text-sm dark:bg-zinc-950/55">
            <p className="text-xs font-semibold text-ios-subtext">Google/Outlook/Yandex</p>
            <Copyable text={sync.httpsUrl} />
            <div className="rounded-xl border border-ios-border/60 bg-white/60 p-2 text-[12px] text-ios-subtext dark:bg-zinc-900/60">
              <p className="font-semibold text-ios-text">Тест синхронизации</p>
              <p>Добавьте ссылку и дождитесь появления события «Test watering» (добавляем автоматически при следующем обновлении).</p>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? <p className="text-[12px] text-ios-subtext">Обновляем ссылки…</p> : null}
      {status ? <p className="text-[12px] text-ios-subtext">{status}</p> : null}

      <SettingsTutorial
        steps={[
          { title: '1. Включите sync', description: 'Переключатель выше', icon: CalendarSync },
          { title: '2. Сканируйте QR', description: 'Для iOS/Apple Calendar или Android', icon: QrCode },
          { title: '3. Проверка', description: 'Появится событие «Test watering»', icon: AlertTriangle }
        ]}
        tone="blue"
      />
    </div>
  );
}

function Copyable({ text }: { text: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        hapticImpact('light');
      }}
      className="w-full truncate rounded-ios-button border border-ios-border/60 bg-white/70 px-3 py-2 text-left text-[12px] text-ios-subtext outline-none backdrop-blur-ios dark:bg-zinc-900/60"
      title={text}
    >
      {text}
    </button>
  );
}

function NotificationsPreview() {
  const [time, setTime] = useState<string>(() => localStorage.getItem('notifications:time') ?? '09:00');
  const [pattern, setPattern] = useState<string>(() => localStorage.getItem('notifications:pattern') ?? 'light');
  const [pushKey, setPushKey] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<{ enabled: boolean; subscribed: boolean; count: number }>({
    enabled: false,
    subscribed: false,
    count: 0
  });
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void loadPush();
  }, []);

  const loadPush = async () => {
    setLoading(true);
    try {
      const [pub, st] = await Promise.all([getPwaPushPublicKey(), getPwaPushStatus()]);
      setPushKey(pub.publicKey);
      setPushStatus({ enabled: st.enabled, subscribed: st.subscribed, count: st.subscriptionsCount });
      setStatus(st.subscribed ? 'Уведомления активны' : 'Уведомления выключены');
    } catch (error) {
      console.error(error);
      setStatus('Не удалось получить статус Web Push');
    } finally {
      setLoading(false);
    }
  };

  const saveLocal = (t: string, p: string) => {
    localStorage.setItem('notifications:time', t);
    localStorage.setItem('notifications:pattern', p);
  };

  const testVibrate = () => {
    const map: Record<string, number[]> = {
      light: [40],
      medium: [80, 40, 80],
      heavy: [150, 60, 150]
    };
    navigator.vibrate?.(map[pattern] ?? [60]);
  };

  const subscribe = async () => {
    if (!pushKey) {
      setStatus('Публичный ключ не получен');
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: pushKey
      });
      await subscribePwaPush(sub.toJSON());
      setStatus('Подписка оформлена');
      hapticImpact('medium');
      await loadPush();
    } catch (error) {
      console.error(error);
      setStatus('Не удалось подписаться');
      hapticImpact('light');
    }
  };

  const unsubscribe = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await unsubscribePwaPush(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus('Подписка отключена');
      await loadPush();
    } catch (error) {
      console.error(error);
      setStatus('Не удалось отключить уведомления');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-ios-text">Уведомления</p>
          <p className="text-[12px] text-ios-subtext">Время, звук/вибрация, Web Push + Telegram</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={testVibrate}>
            Тест вибрации
          </Button>
          <Button size="sm" variant="ghost" onClick={loadPush} disabled={loading}>
            Обновить
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-sm text-ios-text">
          <span className="text-[12px] text-ios-subtext">Время напоминания</span>
          <input
            type="time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              saveLocal(e.target.value, pattern);
            }}
            className="h-11 w-full rounded-ios-button border border-ios-border/60 bg-white/70 px-3 text-sm outline-none backdrop-blur-ios dark:bg-zinc-900/60"
          />
        </label>

        <label className="space-y-1 text-sm text-ios-text">
          <span className="text-[12px] text-ios-subtext">Паттерн вибрации / звук</span>
          <select
            value={pattern}
            onChange={(e) => {
              setPattern(e.target.value);
              saveLocal(time, e.target.value);
            }}
            className="h-11 w-full rounded-ios-button border border-ios-border/60 bg-white/70 px-3 text-sm outline-none backdrop-blur-ios dark:bg-zinc-900/60"
          >
            <option value="light">Лёгкий</option>
            <option value="medium">Средний</option>
            <option value="heavy">Интенсивный</option>
          </select>
        </label>
      </div>

      <div className="rounded-2xl border border-ios-border/60 bg-white/70 p-3 text-sm dark:bg-zinc-950/55">
        <p className="text-[12px] uppercase tracking-wide text-ios-subtext">Web Push</p>
        <p className="text-[12px] text-ios-subtext">Статус: {pushStatus.subscribed ? 'Подписаны' : 'Не подписаны'} · подписок: {pushStatus.count}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={subscribe} disabled={pushStatus.subscribed}>
            Включить Web Push
          </Button>
          <Button size="sm" variant="ghost" onClick={unsubscribe} disabled={!pushStatus.subscribed}>
            Отключить
          </Button>
          <Button size="sm" variant="ghost" onClick={testVibrate}>
            Тестовый звук/вибрация
          </Button>
        </div>
      </div>

      {status ? <p className="text-[12px] text-ios-subtext">{status}</p> : null}

      <SettingsTutorial
        steps={[
          { title: '1. Выберите время', description: 'Например, 09:00', icon: Bell },
          { title: '2. Включите Web Push', description: 'Подтвердите разрешение браузера', icon: BellRing },
          { title: '3. Тест', description: 'Проверьте вибрацию/звук, Telegram оповещения', icon: Sparkles }
        ]}
        tone="amber"
      />
    </div>
  );
}

function HapticPreview() {
  return (
    <div className="space-y-3">
      <PlaceholderCard title="Интенсивность" text="Слайдер low/medium/high, паттерны, режим энергосбережения." />
      <div className="flex flex-wrap gap-2">
        <Badge>Low</Badge>
        <Badge>Medium</Badge>
        <Badge>High</Badge>
      </div>
    </div>
  );
}

function AdminPreview() {
  return (
    <div className="space-y-2 text-sm text-ios-subtext">
      <AlertTriangle className="h-4 w-4 text-red-500" />
      Доступно только для администраторов. Откроется отдельный поток настроек.
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <motion.span
      layout
      className="rounded-full border border-ios-border/60 bg-white/70 px-2 py-1 text-[11px] font-semibold text-ios-text dark:bg-zinc-900/60"
      whileHover={{ scale: 1.02 }}
    >
      {children}
    </motion.span>
  );
}

function OpenRouterConfigurator() {
  const [models, setModels] = useState<OpenRouterModelsDto | null>(null);
  const [prefs, setPrefs] = useState<OpenRouterPreferencesDto | null>(null);
  const [onlyFree, setOnlyFree] = useState(true);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyMasked, setApiKeyMasked] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [m, p] = await Promise.all([getOpenRouterModels(), getOpenRouterPreferences()]);
      setModels(m);
      setPrefs(p);
      setApiKeyMasked(Boolean(p.apiKey || p.hasApiKey));
      setStatus('Модели и настройки загружены');
    } catch (error) {
      console.error(error);
      setStatus('Не удалось загрузить модели');
    } finally {
      setLoading(false);
    }
  };

  const selectDefault = (list: OpenRouterModelsDto['models'], filter: (m: any) => boolean) => {
    const found = list.find(filter);
    return found?.id ?? null;
  };

  const derivedChat = prefs?.chatModel ?? selectDefault(models?.models ?? [], (m) => !m.supportsImageToText && m.free);
  const derivedVision =
    prefs?.photoIdentifyModel ??
    prefs?.photoDiagnoseModel ??
    selectDefault(models?.models ?? [], (m) => m.supportsImageToText && m.free);

  const handleSave = async () => {
    if (!prefs) return;
    setSaving(true);
    setStatus(null);
    try {
      const payload: OpenRouterPreferencesDto = {
        ...prefs,
        chatModel: derivedChat ?? prefs.chatModel ?? 'qwen/qwen2-7b-instruct',
        plantModel: derivedChat ?? prefs.plantModel ?? 'qwen/qwen2-7b-instruct',
        photoIdentifyModel: derivedVision ?? prefs.photoIdentifyModel ?? 'qwen/qwen2-vl-7b-instruct',
        photoDiagnoseModel: derivedVision ?? prefs.photoDiagnoseModel ?? 'qwen/qwen2-vl-7b-instruct',
        apiKey: apiKeyInput.trim() ? apiKeyInput.trim() : undefined
      };
      const res = await saveOpenRouterPreferences(payload);
      setPrefs(res);
      setApiKeyMasked(Boolean(res.apiKey || res.hasApiKey));
      setStatus('Сохранено: бэкенд сам выберет vision/text по типу запроса.');
      hapticImpact('medium');
    } catch (error) {
      console.error(error);
      setStatus('Не удалось сохранить настройки');
      hapticImpact('light');
    } finally {
      setSaving(false);
    }
  };

  const handleValidateKey = async () => {
    if (!apiKeyInput.trim()) {
      setStatus('Введите ключ OpenRouter');
      return;
    }
    setSaving(true);
    setStatus('Проверяем ключ...');
    try {
      const res = await validateOpenRouterKey(apiKeyInput.trim());
      setStatus(res.ok ? 'Ключ валиден' : res.message ?? 'Ключ отклонён');
      hapticImpact(res.ok ? 'medium' : 'light');
    } catch (error) {
      console.error(error);
      setStatus('Ошибка проверки ключа');
    } finally {
      setSaving(false);
    }
  };

  const handleClearKey = async () => {
    setSaving(true);
    try {
      const res = await clearOpenRouterApiKey();
      setPrefs(res);
      setApiKeyInput('');
      setApiKeyMasked(false);
      setStatus('Ключ удалён');
    } catch (error) {
      console.error(error);
      setStatus('Не удалось удалить ключ');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setStatus('Отправляем пробный запрос...');
    try {
      const res = await sendOpenRouterTest({
        message: 'Проверка связи: назови одно комнатное растение.'
      });
      setStatus(res.answer ? `Успех: ${res.answer.slice(0, 64)}...` : 'Ответ получен');
      hapticImpact('medium');
    } catch (error) {
      console.error(error);
      setStatus('Тест не прошёл');
      hapticImpact('light');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-ios-border/60 bg-white/65 p-3 dark:border-emerald-500/20 dark:bg-zinc-950/55">
        <p className="text-[12px] uppercase tracking-wide text-ios-subtext">Ключ OpenRouter</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="password"
            placeholder={apiKeyMasked ? 'Ключ сохранён на бэкенде' : 'Введите API Key'}
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            className="h-11 flex-1 min-w-[240px] rounded-ios-button border border-ios-border/60 bg-white/70 px-3 text-sm outline-none backdrop-blur-ios dark:bg-zinc-900/60"
          />
          <button
            type="button"
            className="android-ripple rounded-full border border-ios-border/60 bg-white/70 px-3 py-2 text-sm font-semibold text-ios-text dark:bg-zinc-900/60"
            onClick={handleValidateKey}
            disabled={saving}
          >
            Проверить
          </button>
          <button
            type="button"
            className="android-ripple rounded-full border border-ios-border/60 bg-white/70 px-3 py-2 text-sm font-semibold text-ios-text dark:bg-zinc-900/60"
            onClick={handleSave}
            disabled={saving}
          >
            {apiKeyMasked ? 'Обновить' : 'Сохранить'}
          </button>
          {apiKeyMasked ? (
            <button
              type="button"
              className="rounded-full border border-red-300/60 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200"
              onClick={handleClearKey}
              disabled={saving}
            >
              Очистить
            </button>
          ) : null}
        </div>
      </div>

      <ModelSelector
        models={models?.models ?? []}
        chatModel={derivedChat ?? undefined}
        visionModel={derivedVision ?? undefined}
        onlyFree={onlyFree}
        apiKeyMasked={apiKeyMasked}
        onToggleFree={setOnlyFree}
        onSelectChat={(id) => setPrefs((prev) => ({ ...prev, chatModel: id, plantModel: id }))}
        onSelectVision={(id) => setPrefs((prev) => ({ ...prev, photoIdentifyModel: id, photoDiagnoseModel: id }))}
        onSave={handleSave}
        saving={saving}
        onTest={handleTest}
        testing={testing}
        status={status}
      />

      <SettingsTutorial
        steps={[
          { title: '1. Получите ключ', description: 'openrouter.ai → Dashboard → API Key', icon: ShieldCheck },
          { title: '2. Выберите модели', description: 'Чат (text) и Фото (vision). Автовыбор по типу запроса.', icon: Brain },
          { title: '3. Тест', description: 'Пробный запрос убедится, что ключ работает.', icon: Sparkles }
        ]}
        tone="emerald"
      />

      {loading ? <p className="text-[12px] text-ios-subtext">Загружаем модели…</p> : null}
    </div>
  );
}

async function fetchOpenMeteoCities(q: string, signal?: AbortSignal): Promise<string[]> {
  if (!q.trim()) {
    return [];
  }
  const url = `https://geocoding-api.open-meteo.com/v1/search?count=5&language=ru&name=${encodeURIComponent(q.trim())}`;
  try {
    const res = await fetch(url, { signal });
    const data = (await res.json()) as { results?: Array<{ name: string; country?: string }> };
    return (data.results ?? []).map((item) => (item.country ? `${item.name}, ${item.country}` : item.name));
  } catch {
    return [];
  }
}
