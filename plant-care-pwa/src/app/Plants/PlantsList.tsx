import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CloudFog, CloudRain, CloudSun, Plus, RefreshCw, Search, SlidersHorizontal, Sprout, Sun } from 'lucide-react';

import { PlantCard } from '@/components/PlantCard';
import { CategoryTabs, type PlantCategoryFilter } from '@/components/CategoryTabs';
import { PlatformPullToRefresh } from '@/components/adaptive/PlatformPullToRefresh';
import { Button } from '@/components/ui/button';
import { normalizeWeatherCity } from '@/app/Settings/panels/panel-shared';
import { getPlants, getWeatherCurrent, waterPlant } from '@/lib/api';
import { parseDateOnly } from '@/lib/date';
import {
  error as hapticError,
  impactLight,
  selection,
  success as hapticSuccess
} from '@/lib/haptics';
import { useAuthStore, useOfflineStore, useUiStore } from '@/lib/store';
import type { CalendarEventDto, PlantDto } from '@/types/api';

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
  const date = startOfDay(parseDateOnly(dateIso));
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
  if (plant.wateringProfile === 'SEED_START') {
    return Math.max(1, Math.ceil((plant.recommendedCheckIntervalHours ?? 12) / 24));
  }
  return Math.max(1, plant.baseIntervalDays ?? 7);
}

function getLastWateredDate(plant: PlantDto): Date {
  return plant.lastWateredDate ? startOfDay(parseDateOnly(plant.lastWateredDate)) : startOfDay(new Date());
}

function getNextWateringDate(plant: PlantDto): Date {
  if (plant.wateringProfile === 'SEED_START' && plant.sowingDate) {
    const sowing = startOfDay(parseDateOnly(plant.sowingDate));
    const next = new Date(sowing);
    next.setDate(next.getDate() + Math.max(1, plant.expectedGerminationDaysMax ?? 7));
    return startOfDay(next);
  }
  if (plant.nextWateringDate) {
    return startOfDay(parseDateOnly(plant.nextWateringDate));
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
  if (plant.wateringProfile === 'SEED_START') {
    if (plant.recommendedCheckIntervalHours) {
      return `Проверка каждые ${plant.recommendedCheckIntervalHours} ч.`;
    }
    return 'Контроль проращивания';
  }
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
        case 'SEED_START':
          return 4;
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

function mergeWateredPlant(plants: PlantDto[] | undefined, updatedPlant: PlantDto): PlantDto[] {
  const items = plants ?? [];
  return items.map((plant) => (plant.id === updatedPlant.id ? { ...plant, ...updatedPlant } : plant));
}

function updateCalendarAfterWatering(
  events: CalendarEventDto[] | undefined,
  updatedPlant: PlantDto
): CalendarEventDto[] {
  const items = (events ?? []).filter((event) => event.plantId !== updatedPlant.id);
  if (!updatedPlant.nextWateringDate) {
    return items;
  }
  return [
    ...items,
    {
      date: updatedPlant.nextWateringDate.slice(0, 10),
      plantId: updatedPlant.id,
      plantName: updatedPlant.name
    }
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function filterByCategory(plants: PlantDto[], filter: PlantCategoryFilter): PlantDto[] {
  if (filter === 'ALL') {
    return plants;
  }
  return plants.filter((plant) => (plant.category ?? 'HOME') === filter);
}

function weatherStatusLabel(source?: string): string {
  if (!source) {
    return 'Погодный контекст недоступен';
  }
  if (source.toUpperCase().includes('HA')) {
    return 'Данные датчиков обновлены';
  }
  return 'Погода обновлена';
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
  const setActiveTab = useUiStore((s) => s.setActiveTab);
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

  const authCity = useAuthStore((s) => s.city);
  const [weatherCity, setWeatherCity] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('settings:weather-city');
    const next = normalizeWeatherCity(stored) ?? normalizeWeatherCity(authCity);
    if (!next && stored) {
      localStorage.removeItem('settings:weather-city');
    }
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
    onSuccess: (updatedPlant) => {
      hapticSuccess();
      queryClient.setQueryData<PlantDto[]>(['plants'], (current) => mergeWateredPlant(current, updatedPlant));
      queryClient.setQueryData<CalendarEventDto[]>(['calendar'], (current) => updateCalendarAfterWatering(current, updatedPlant));
      void queryClient.invalidateQueries({ queryKey: ['plants'] });
      void queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
    onError: () => {
      hapticError();
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
    () => (plantsQuery.data ?? []).filter((plant) => plant.wateringProfile !== 'SEED_START' && getDaysLeft(plant) < 0).length,
    [plantsQuery.data]
  );
  const needWaterCount = useMemo(
    () => (plantsQuery.data ?? []).filter((plant) => plant.wateringProfile !== 'SEED_START' && getDaysLeft(plant) <= 0).length,
    [plantsQuery.data]
  );

  const weatherData = weatherQuery.data;
  const filteredHasNoResults = plants.length === 0;
  const hasActiveFilters = Boolean(searchQuery.trim()) || onlyOverdue || categoryFilter !== 'ALL';

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
        <p className="theme-text-danger text-ios-body">Не удалось загрузить список растений.</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            impactLight();
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
        <p className="mt-1 text-ios-body text-ios-subtext">Добавьте первое растение, чтобы отслеживать полив и советы по уходу.</p>
        <Button
          variant="secondary"
          className="mt-4 rounded-xl bg-ios-accent/15 text-ios-accent hover:bg-ios-accent/25"
          onClick={() => {
            impactLight();
            setActiveTab('add');
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Добавить растение
        </Button>
      </motion.div>
    );
  }

  return (
    <PlatformPullToRefresh onRefresh={refreshAll}>
      <section className="space-y-5 pb-[calc(1rem+env(safe-area-inset-bottom))] dark:bg-[radial-gradient(circle_at_18%_0%,rgba(52,199,89,0.10),transparent_38%),radial-gradient(circle_at_80%_10%,rgba(96,165,250,0.10),transparent_38%)]">
        <motion.header
          className="ios-blur-card rounded-[30px] p-5 shadow-[0_20px_44px_rgba(15,23,42,0.08)]"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 30 }}
        >
          <div className="theme-surface-2 rounded-[24px] border px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ios-subtext">Сегодня</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="theme-surface-subtle rounded-2xl px-3 py-2.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]">
                <p className="text-[12px] text-ios-subtext">Нужно полить</p>
                <p className={`mt-1 text-2xl font-semibold ${needWaterCount > 0 ? 'theme-text-warning' : 'theme-text-success'}`}>
                  <AnimatedCount value={needWaterCount} />
                </p>
              </div>
              <div className="theme-surface-subtle rounded-2xl px-3 py-2.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]">
                <p className="text-[12px] text-ios-subtext">Просрочено</p>
                <p className={`mt-1 text-2xl font-semibold ${overdueCount > 0 ? 'theme-text-danger' : 'text-ios-text'}`}>
                  <AnimatedCount value={overdueCount} />
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ios-subtext">
              <span>{plantsQuery.data?.length ?? 0} растений в коллекции</span>
              {lastSyncAt ? <span>Обновлено в {formatTimeRu(lastSyncAt)}</span> : null}
              {rescuedCount > 0 ? <span>Спасено: {rescuedCount}</span> : null}
              {weatherCity ? (
                <span className="inline-flex items-center gap-1">
                  <WeatherIcon code={weatherData?.icon} />
                  {weatherCity}
                  {isFiniteNumber(weatherData?.tempC) ? ` ${Math.round(weatherData.tempC)}°C` : ''}
                </span>
              ) : null}
            </div>
          </div>
        </motion.header>

        <div className="ios-blur-card space-y-3 rounded-[28px] p-3.5 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <div className="flex items-center gap-2">
            <div className="theme-surface-subtle flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3">
              <Search className="h-4 w-4 shrink-0 text-ios-subtext" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Поиск по названию"
                className="h-11 min-w-0 flex-1 bg-transparent text-sm text-ios-text outline-none placeholder:text-ios-subtext"
              />
            </div>
            <button
              type="button"
              className="theme-surface-subtle touch-target inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border text-ios-subtext transition-transform duration-150 active:scale-95"
              disabled={plantsQuery.isFetching || weatherQuery.isFetching}
              onClick={() => {
                impactLight();
                void refreshAll();
              }}
              aria-label="Обновить список"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <div className="theme-surface-subtle rounded-[20px] border p-1">
            <CategoryTabs
              value={categoryFilter}
              embedded
              onChange={(next) => {
                setCategoryFilter(next);
                localStorage.setItem(categoryStorageKey, next);
                selection();
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`touch-target inline-flex min-h-11 items-center rounded-full border px-3 text-xs font-semibold transition-transform duration-150 active:scale-[0.98] ${
                onlyOverdue
                  ? 'theme-surface-danger theme-text-danger'
                  : 'theme-surface-subtle text-ios-subtext'
              }`}
              onClick={() => {
                const next = !onlyOverdue;
                setOnlyOverdue(next);
                localStorage.setItem(overdueStorageKey, next ? '1' : '0');
                selection();
              }}
            >
              Просроченные
            </button>
            <div className="theme-surface-subtle inline-flex min-h-11 flex-1 items-center gap-2 rounded-full border px-3 sm:flex-none">
              <SlidersHorizontal className="h-4 w-4 text-ios-subtext" />
              <select
                value={sortMode}
                onChange={(event) => {
                  const next = event.target.value as SortMode;
                  setSortMode(next);
                  localStorage.setItem(sortStorageKey, next);
                  selection();
                }}
                className="h-8 min-w-0 flex-1 bg-transparent text-xs font-semibold text-ios-text outline-none sm:min-w-[138px] sm:flex-none"
              >
                <option value="needs_water">По поливу</option>
                <option value="created_desc">Сначала новые</option>
                <option value="alpha">По алфавиту</option>
                <option value="category">По категории</option>
              </select>
            </div>
            {weatherCity ? (
              <span className="theme-badge-info w-full truncate rounded-full px-3 py-1.5 text-[11px] sm:ml-auto sm:inline-flex sm:w-auto sm:items-center sm:gap-1.5">
                {translateWeather(weatherData?.icon, weatherData?.description) ?? weatherStatusLabel(weatherData?.source)}
              </span>
            ) : null}
          </div>
        </div>

        <AnimatePresence>
          {isOffline ? (
            <motion.div
              className="ios-blur-card theme-surface-warning flex items-center justify-between gap-3 p-3 text-[12px]"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            >
              <span>Оффлайн-режим: показываем кеш.</span>
              <span className="theme-badge-warning rounded-full px-2 py-0.5 font-semibold">В очереди: {pendingMutations}</span>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {!filteredHasNoResults ? (
            <motion.div
              layout
              key={`${categoryFilter}-${onlyOverdue}-${sortMode}-${searchQuery.trim()}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ type: 'spring', stiffness: 330, damping: 28, mass: 1 }}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
              {plants.map((plant, index) => {
                const isPlantOverdue = getDaysLeft(plant) <= 0;
                return (
                  <motion.div
                    key={plant.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    whileTap={{ scale: 0.992 }}
                    transition={{
                      type: 'spring',
                      stiffness: 420,
                      damping: 34,
                      mass: 0.9,
                      delay: Math.min(0.2, index * 0.035)
                    }}
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
                        selection();
                        openPlantDetail(plant.id);
                      }}
                    />
                  </motion.div>
                );
              })}
            </motion.div>
          ) : (
            <motion.div
              key="plants-empty-filtered"
              className="ios-blur-card flex min-h-[220px] flex-col items-center justify-center gap-2 p-5 text-center"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            >
              <Sprout className="h-8 w-8 text-ios-accent" />
              <h3 className="text-lg font-semibold text-ios-text">Ничего не найдено</h3>
              <p className="max-w-xs text-sm text-ios-subtext">
                {hasActiveFilters
                  ? 'Измените фильтры или очистите поиск, чтобы увидеть больше растений.'
                  : 'Добавьте новое растение, чтобы начать вести коллекцию.'}
              </p>
              <Button
                variant="secondary"
                className="mt-1 rounded-xl bg-ios-accent/15 text-ios-accent hover:bg-ios-accent/25"
                onClick={() => {
                  impactLight();
                  setActiveTab('add');
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Добавить растение
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </PlatformPullToRefresh>
  );
}
