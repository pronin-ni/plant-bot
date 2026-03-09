import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CloudFog, CloudRain, CloudSun, RefreshCw, Search, Sparkles, Sprout, Sun } from 'lucide-react';

import { PlantCard } from '@/components/PlantCard';
import { CategoryTabs, type PlantCategoryFilter } from '@/components/CategoryTabs';
import { PlatformPullToRefresh } from '@/components/adaptive/PlatformPullToRefresh';
import { Button } from '@/components/ui/button';
import { getPlants, getWeatherCurrent, waterPlant } from '@/lib/api';
import { hapticImpact, hapticNotify } from '@/lib/telegram';
import { useAuthStore, useOfflineStore, useUiStore } from '@/lib/store';
import type { PlantDto, WeatherCurrentDto } from '@/types/api';

type SortMode = 'needs_water' | 'created_desc' | 'alpha' | 'category';

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function isToday(dateIso?: string): boolean {
  if (!dateIso) {
    return false;
  }
  const date = startOfDay(new Date(dateIso));
  return date.getTime() === startOfDay(new Date()).getTime();
}

function formatDateRu(value: Date): string {
  return value.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short'
  });
}

function formatTimeRu(value: Date): string {
  return value.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getIntervalDays(plant: PlantDto): number {
  return Math.max(1, plant.baseIntervalDays ?? 7);
}

function getLastWateredDate(plant: PlantDto): Date {
  return plant.lastWateredDate ? startOfDay(new Date(plant.lastWateredDate)) : startOfDay(new Date());
}

function getNextWateringDate(plant: PlantDto): Date {
  if (plant.nextWateringDate) {
    return startOfDay(new Date(plant.nextWateringDate));
  }
  const last = getLastWateredDate(plant);
  const next = new Date(last);
  next.setDate(next.getDate() + getIntervalDays(plant));
  return startOfDay(next);
}

function getDaysLeft(plant: PlantDto): number {
  const now = startOfDay(new Date());
  const next = getNextWateringDate(plant);
  return Math.floor((next.getTime() - now.getTime()) / 86_400_000);
}

function getProgress(plant: PlantDto): number {
  const last = getLastWateredDate(plant);
  const next = getNextWateringDate(plant);
  const now = startOfDay(new Date());
  const cycleDays = Math.max(1, Math.floor((next.getTime() - last.getTime()) / 86_400_000));
  const elapsedDays = Math.max(0, Math.floor((now.getTime() - last.getTime()) / 86_400_000));
  const raw = (elapsedDays / cycleDays) * 100;
  return Math.max(0, Math.min(100, raw));
}

function getNextWateringText(plant: PlantDto): string {
  const daysLeft = getDaysLeft(plant);
  if (daysLeft < 0) {
    return `Просрочено на ${Math.abs(daysLeft)} дн.`;
  }
  if (daysLeft === 0) {
    return 'Пора поливать сегодня';
  }
  if (daysLeft === 1) {
    return 'Полив завтра';
  }
  return `Полив через ${daysLeft} дн. (${formatDateRu(getNextWateringDate(plant))})`;
}

function sortPlants(plants: PlantDto[], mode: SortMode): PlantDto[] {
  const copy = [...plants];
  if (mode === 'alpha') {
    copy.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return copy;
  }
  if (mode === 'needs_water') {
    copy.sort((a, b) => getDaysLeft(a) - getDaysLeft(b));
    return copy;
  }
  if (mode === 'category') {
    const rank = (plant: PlantDto) => {
      switch (plant.category) {
        case 'HOME':
          return 1;
        case 'OUTDOOR_DECORATIVE':
          return 2;
        case 'OUTDOOR_GARDEN':
          return 3;
        default:
          return 9;
      }
    };
    copy.sort((a, b) => {
      const categoryDiff = rank(a) - rank(b);
      if (categoryDiff !== 0) {
        return categoryDiff;
      }
      return a.name.localeCompare(b.name, 'ru');
    });
    return copy;
  }
  copy.sort((a, b) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (bt !== at) {
      return bt - at;
    }
    return (b.id ?? 0) - (a.id ?? 0);
  });
  return copy;
}

function filterByCategory(plants: PlantDto[], filter: PlantCategoryFilter): PlantDto[] {
  if (filter === 'ALL') {
    return plants;
  }
  return plants.filter((plant) => (plant.category ?? 'HOME') === filter);
}

function sourceLabel(source?: string): string {
  if (!source) {
    return 'Локальные данные';
  }
  if (source.toUpperCase().includes('HA')) {
    return 'Home Assistant';
  }
  if (source.toUpperCase().includes('WEATHER') || source.toUpperCase().includes('METEO')) {
    return 'Погода';
  }
  return source;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function WeatherIcon({ code }: { code?: string | null }) {
  const icon = (code ?? '').toLowerCase();
  const cls = 'h-4 w-4 text-ios-accent';
  if (icon.includes('clear')) return <Sun className={cls} />;
  if (icon.includes('partly')) return <CloudSun className={cls} />;
  if (icon.includes('rain') || icon.includes('drizzle')) return <CloudRain className={cls} />;
  if (icon.includes('fog')) return <CloudFog className={cls} />;
  return <CloudSun className={cls} />;
}

function translateWeather(icon?: string | null, fallback?: string | null): string | null {
  const map: Record<string, string> = {
    'clear-day': 'Солнечно',
    'clear-night': 'Ясно',
    'partly-cloudy-day': 'Переменная облачность',
    'partly-cloudy-night': 'Облачно ночью',
    cloudy: 'Облачно',
    rain: 'Дождь',
    drizzle: 'Морось',
    snow: 'Снег',
    fog: 'Туман'
  };
  if (fallback) return fallback;
  if (!icon) return null;
  return map[icon.toLowerCase()] ?? null;
}

function AnimatedCount({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let raf = 0;
    let start: number | null = null;
    const from = display;
    const to = value;

    const tick = (ts: number) => {
      if (start == null) {
        start = ts;
      }
      const progress = Math.min(1, (ts - start) / 420);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <span>{display}</span>;
}

export function PlantsList() {
  const queryClient = useQueryClient();
  const openPlantDetail = useUiStore((s) => s.openPlantDetail);
  const telegramUserId = useAuthStore((s) => s.telegramUserId);
  const isOffline = useOfflineStore((s) => s.isOffline);
  const pendingMutations = useOfflineStore((s) => s.pendingMutations);

  const sortStorageKey = useMemo(() => `plantbot.home.sort.${telegramUserId ?? 'anonymous'}`, [telegramUserId]);
  const categoryStorageKey = useMemo(() => `plantbot.home.category.${telegramUserId ?? 'anonymous'}`, [telegramUserId]);
  const overdueStorageKey = useMemo(() => `plantbot.home.overdue.${telegramUserId ?? 'anonymous'}`, [telegramUserId]);
  const rescuedStorageKey = useMemo(() => `plantbot.home.rescued.${telegramUserId ?? 'anonymous'}`, [telegramUserId]);

  const [sortMode, setSortMode] = useState<SortMode>('needs_water');
  const [categoryFilter, setCategoryFilter] = useState<PlantCategoryFilter>('ALL');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [rescuedCount, setRescuedCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);

  useEffect(() => {
    const savedSort = localStorage.getItem(sortStorageKey) as SortMode | null;
    if (savedSort === 'needs_water' || savedSort === 'created_desc' || savedSort === 'alpha' || savedSort === 'category') {
      setSortMode(savedSort);
    } else {
      setSortMode('needs_water');
    }

    const savedCategory = localStorage.getItem(categoryStorageKey) as PlantCategoryFilter | null;
    if (savedCategory === 'ALL' || savedCategory === 'HOME' || savedCategory === 'OUTDOOR_DECORATIVE' || savedCategory === 'OUTDOOR_GARDEN') {
      setCategoryFilter(savedCategory);
    } else {
      setCategoryFilter('ALL');
    }

    const savedOverdue = localStorage.getItem(overdueStorageKey);
    setOnlyOverdue(savedOverdue === '1');

    const savedRescued = Number(localStorage.getItem(rescuedStorageKey) ?? '0');
    setRescuedCount(Number.isFinite(savedRescued) ? savedRescued : 0);
  }, [sortStorageKey, categoryStorageKey, overdueStorageKey, rescuedStorageKey]);

  const plantsQuery = useQuery({
    queryKey: ['plants'],
    queryFn: getPlants
  });

  useEffect(() => {
    if (plantsQuery.data) {
      setLastSyncAt(new Date());
    }
  }, [plantsQuery.data]);

  const priorityPlantId = useMemo(() => {
    const source = plantsQuery.data ?? [];
    const byNeed = sortPlants(source, 'needs_water');
    return byNeed[0]?.id ?? null;
  }, [plantsQuery.data]);

  const authCity = useAuthStore((s) => s.city);
  const [weatherCity, setWeatherCity] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('settings:weather-city');
    const next = (stored ?? authCity ?? '').trim();
    setWeatherCity(next || null);
  }, [authCity]);

  const weatherQuery = useQuery({
    queryKey: ['weather-current-home', weatherCity],
    queryFn: () => getWeatherCurrent(weatherCity as string),
    enabled: Boolean(weatherCity),
    staleTime: 10 * 60_000,
    retry: 1
  });

  const waterMutation = useMutation({
    mutationFn: (plantId: number) => waterPlant(plantId),
    onSuccess: () => {
      hapticNotify('success');
      void queryClient.invalidateQueries({ queryKey: ['plants'] });
    },
    onError: () => {
      hapticNotify('error');
    }
  });

  const plants = useMemo(() => {
    const base = plantsQuery.data ?? [];
    const byCategory = filterByCategory(base, categoryFilter);
    const byOverdue = onlyOverdue ? byCategory.filter((plant) => getDaysLeft(plant) < 0) : byCategory;
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const bySearch = normalizedSearch
      ? byOverdue.filter((plant) => {
          const haystack = `${plant.name} ${plant.type ?? ''}`.toLowerCase();
          return haystack.includes(normalizedSearch);
        })
      : byOverdue;

    return sortPlants(bySearch, sortMode);
  }, [plantsQuery.data, categoryFilter, onlyOverdue, searchQuery, sortMode]);

  const overdueCount = useMemo(
    () => (plantsQuery.data ?? []).filter((plant) => getDaysLeft(plant) < 0).length,
    [plantsQuery.data]
  );
  const dueTodayCount = useMemo(
    () => (plantsQuery.data ?? []).filter((plant) => getDaysLeft(plant) === 0).length,
    [plantsQuery.data]
  );
  const needWaterCount = useMemo(
    () => (plantsQuery.data ?? []).filter((plant) => getDaysLeft(plant) <= 0).length,
    [plantsQuery.data]
  );

  const totalPlantsCount = plantsQuery.data?.length ?? 0;
  const wateredTodayCount = useMemo(
    () => (plantsQuery.data ?? []).filter((plant) => isToday(plant.lastWateredDate)).length,
    [plantsQuery.data]
  );

  const weatherData = weatherQuery.data;

  const refreshAll = async () => {
    await Promise.all([
      plantsQuery.refetch(),
      weatherCity ? weatherQuery.refetch() : Promise.resolve()
    ]);
    setLastSyncAt(new Date());
  };

  if (plantsQuery.isLoading) {
    return (
      <div className="py-8 text-center text-ios-body text-ios-subtext">
        Загружаем растения...
      </div>
    );
  }

  if (plantsQuery.isError) {
    return (
      <div className="space-y-3 py-8 text-center">
        <p className="text-ios-body text-red-500">Не удалось загрузить список растений.</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            hapticImpact('light');
            void plantsQuery.refetch();
          }}
        >
          Попробовать снова
        </Button>
      </div>
    );
  }

  if (!(plantsQuery.data ?? []).length) {
    return (
      <motion.div
        className="ios-blur-card flex min-h-[240px] flex-col items-center justify-center p-6 text-center"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 27, mass: 1 }}
      >
        <Sprout className="mb-3 h-9 w-9 text-ios-accent" />
        <h3 className="text-ios-title-2">У вас пока нет растений 🌱</h3>
        <p className="mt-1 text-ios-body text-ios-subtext">Добавьте первое растение, чтобы отслеживать полив.</p>
      </motion.div>
    );
  }

  return (
    <PlatformPullToRefresh onRefresh={refreshAll}>
      <section className="space-y-4 pb-3 dark:bg-[radial-gradient(circle_at_18%_0%,rgba(52,199,89,0.10),transparent_38%),radial-gradient(circle_at_80%_10%,rgba(96,165,250,0.10),transparent_38%)]">
        <div className="px-1">
          <p className="text-xs uppercase tracking-[0.08em] text-ios-subtext">Главное</p>
          <h1 className="text-2xl font-semibold text-ios-text">Мои растения</h1>
        </div>

        <motion.div
          className="ios-blur-card grid grid-cols-1 gap-3 p-3 sm:grid-cols-2"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        >
          <div className="space-y-2 rounded-2xl border border-ios-border/45 bg-white/60 p-3 shadow-sm dark:bg-zinc-950/55">
            <div className="flex items-center gap-2 text-sm font-semibold text-ios-text">
              <Sparkles className="h-4 w-4 text-ios-accent" />
              Сегодня
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-ios-subtext">
              <div className="rounded-xl border border-ios-border/50 bg-white/70 px-2 py-2 text-center dark:bg-zinc-900/60">
                <p className="text-[11px]">Нужно полить</p>
                <p className="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-300">
                  <AnimatedCount value={needWaterCount} />
                </p>
              </div>
              <div className="rounded-xl border border-ios-border/50 bg-white/70 px-2 py-2 text-center dark:bg-zinc-900/60">
                <p className="text-[11px]">Просрочено</p>
                <p className="mt-1 text-lg font-semibold text-red-500">
                  <AnimatedCount value={overdueCount} />
                </p>
              </div>
              <div className="rounded-xl border border-ios-border/50 bg-white/70 px-2 py-2 text-center dark:bg-zinc-900/60">
                <p className="text-[11px]">Полито сегодня</p>
                <p className="mt-1 text-lg font-semibold text-ios-text">
                  <AnimatedCount value={wateredTodayCount} />
                </p>
              </div>
            </div>
            <p className="text-[11px] text-ios-subtext">
              {lastSyncAt ? `Обновлено в ${formatTimeRu(lastSyncAt)}` : 'Ожидаем первую синхронизацию...'}
            </p>
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-ios-border/45 bg-white/60 p-3 shadow-sm dark:bg-zinc-950/55">
            <div className="flex items-start gap-2">
              <div className="rounded-full bg-ios-accent/14 p-2 text-ios-accent">
                <CloudSun className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ios-text">{weatherCity || 'Ваш город'}</p>
                <p className="text-xs text-ios-subtext">
                  {isFiniteNumber(weatherData?.tempC) ? `${Math.round(weatherData.tempC)}°C` : '—'} ·{' '}
                  {isFiniteNumber(weatherData?.humidity) ? `${Math.round(weatherData.humidity)}% влажность` : '—'}
                </p>
                <p className="mt-1 text-[11px] text-ios-subtext/90">
                  {translateWeather(weatherData?.icon, weatherData?.description) ?? 'Совет: поливайте осторожно'}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-ios-subtext">
              <span className="rounded-full border border-ios-border/60 bg-white/70 px-2 py-1 dark:bg-zinc-900/60">
                {sourceLabel(weatherData?.source) ?? 'Погода'}
              </span>
              {weatherCity ? (
                <span className="rounded-full border border-ios-border/60 bg-white/70 px-2 py-1 dark:bg-zinc-900/60">
                  {weatherCity}
                </span>
              ) : null}
            </div>
          </div>
        </motion.div>

        <div className="flex flex-wrap items-center gap-2 px-1">
          <CategoryTabs
            value={categoryFilter}
            onChange={(next) => {
              setCategoryFilter(next);
              localStorage.setItem(categoryStorageKey, next);
              hapticImpact('light');
            }}
          />
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:block text-[11px] text-ios-subtext">Поиск</div>
            <div className="flex items-center gap-2 rounded-ios-button border border-ios-border/60 bg-white/70 px-2 py-1.5">
              <Search className="h-4 w-4 text-ios-subtext" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Найти растение"
                className="h-8 w-[150px] bg-transparent text-sm outline-none"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 px-3 text-ios-subtext"
              onClick={() => {
                hapticImpact('light');
                void refreshAll();
              }}
            >
              <RefreshCw className="mr-1 h-4 w-4" />
              Обновить
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {isOffline ? (
            <motion.div
              className="ios-blur-card flex items-center justify-between gap-3 border-amber-300/50 bg-amber-100/45 p-3 text-[12px] text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/25 dark:text-amber-200"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            >
              <span>Оффлайн-режим: показываем кеш.</span>
              <span className="rounded-full bg-amber-500/18 px-2 py-0.5 font-semibold">В очереди: {pendingMutations}</span>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="ios-blur-card flex flex-wrap items-center gap-2 p-3">
          <button
            type="button"
            className={`touch-target inline-flex items-center rounded-full border px-3 text-xs font-semibold ${
              onlyOverdue
                ? 'border-red-400/70 bg-red-500/15 text-red-600 dark:text-red-300'
                : 'border-ios-border/70 bg-white/60 text-ios-subtext dark:bg-zinc-900/55'
            }`}
            onClick={() => {
              const next = !onlyOverdue;
              setOnlyOverdue(next);
              localStorage.setItem(overdueStorageKey, next ? '1' : '0');
              hapticImpact('light');
            }}
          >
            Только просроченные ({overdueCount})
          </button>

          <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap">
            <select
              value={sortMode}
              onChange={(event) => {
                const next = event.target.value as SortMode;
                setSortMode(next);
                localStorage.setItem(sortStorageKey, next);
                hapticImpact('light');
              }}
              className="h-11 min-w-[150px] max-w-full rounded-ios-button border border-ios-border/70 bg-white/70 px-2 text-[12px] outline-none backdrop-blur-ios dark:bg-zinc-900/60"
            >
              <option value="needs_water">Нуждаются в поливе</option>
              <option value="created_desc">Сначала новые</option>
              <option value="alpha">По алфавиту</option>
              <option value="category">По категории</option>
            </select>
          </div>
        </div>

        <CategoryTabs
          value={categoryFilter}
          onChange={(next) => {
            setCategoryFilter(next);
            localStorage.setItem(categoryStorageKey, next);
            hapticImpact('light');
          }}
        />

        <AnimatePresence mode="wait">
          <motion.div
            layout
            key={`${categoryFilter}-${onlyOverdue}-${sortMode}-${searchQuery.trim()}`}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 330, damping: 28, mass: 1 }}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            {plants.map((plant) => {
              const isPlantOverdue = getDaysLeft(plant) <= 0;
              return (
                <motion.div
                  key={plant.id}
                  layout
                  transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.9 }}
                >
                  <PlantCard
                    plant={plant}
                    progress={getProgress(plant)}
                    daysLeft={getDaysLeft(plant)}
                    nextWateringText={getNextWateringText(plant)}
                    isWatering={waterMutation.isPending && waterMutation.variables === plant.id}
                    onWater={async () => {
                      await waterMutation.mutateAsync(plant.id);
                      if (isPlantOverdue) {
                        setRescuedCount((prev) => {
                          const next = prev + 1;
                          localStorage.setItem(rescuedStorageKey, String(next));
                          return next;
                        });
                      }
                    }}
                    onOpen={() => {
                      hapticImpact('light');
                      openPlantDetail(plant.id);
                    }}
                  />
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>

        {!plants.length ? (
          <motion.div
            className="ios-blur-card p-4 text-center text-sm text-ios-subtext"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            {searchQuery.trim()
              ? `По запросу «${searchQuery}» ничего не найдено.`
              : 'Нет растений в этой выборке.'}
          </motion.div>
        ) : null}
      </section>
    </PlatformPullToRefresh>
  );
}
