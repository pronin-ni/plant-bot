import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Clock3,
  Leaf,
  MapPinned,
  Search,
  Sprout,
  TriangleAlert,
  UserRound,
  Users
} from 'lucide-react';

import { PlatformPullToRefresh } from '@/components/adaptive/PlatformPullToRefresh';
import { AdminBackupList } from '@/components/AdminBackupList';
import { AdminPushTest } from '@/components/AdminPushTest';
import { AdminStatsCard } from '@/components/AdminStatsCard';
import { AdminPlantTable } from '@/components/AdminPlantTable';
import { AdminUserTable } from '@/components/AdminUserTable';
import { Button } from '@/components/ui/button';
import { getAdminOverview, getAdminStats, getAdminUsers } from '@/lib/api';
import { useMotionGuard } from '@/lib/motion';
import { error as hapticError, impactLight, impactMedium, impactHeavy, success as hapticSuccess, warning as hapticWarning } from '@/lib/haptics';
import type { AdminStatsItemDto } from '@/types/api';

type AdminTab = 'users' | 'plants';
type CategoryFilter = 'ALL' | 'HOME' | 'OUTDOOR_DECORATIVE' | 'OUTDOOR_GARDEN';
type StatusFilter = 'ALL' | 'OVERDUE' | 'ACTIVE';
type SortFilter = 'PLANTS_DESC' | 'ACTIVITY_DESC' | 'ALPHA';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

function topLabel(items: AdminStatsItemDto[]): string {
  const top = items[0];
  if (!top) return 'Нет данных';
  return `${top.key} (${top.value})`;
}

function activityBars(active7d: number, active30d: number): number[] {
  const base = Math.max(1, active30d);
  const peak = Math.max(active7d, Math.floor(active30d / 4), 1);
  return Array.from({ length: 30 }).map((_, idx) => {
    const wave = 0.6 + Math.sin(idx / 3.2) * 0.25 + Math.cos(idx / 5.5) * 0.15;
    const weekendBoost = idx % 7 === 5 || idx % 7 === 6 ? 1.08 : 0.92;
    const value = Math.max(0.08, (wave * weekendBoost * peak) / base);
    return Number(value.toFixed(3));
  });
}

export function AdminDashboard() {
  const [tab, setTab] = useState<AdminTab>('users');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [sort, setSort] = useState<SortFilter>('PLANTS_DESC');
  const [registeredFrom, setRegisteredFrom] = useState('');
  const [wateringFrom, setWateringFrom] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const { canAnimate } = useMotionGuard();

  const overviewQuery = useQuery({ queryKey: ['admin-overview'], queryFn: getAdminOverview });
  const statsQuery = useQuery({ queryKey: ['admin-stats'], queryFn: getAdminStats });
  const usersQuery = useQuery({
    queryKey: ['admin-users-ad1', debouncedSearch],
    queryFn: () => getAdminUsers(0, 100, debouncedSearch)
  });
  const topUsers = useMemo(() => {
    return [...(usersQuery.data?.items ?? [])].sort((a, b) => b.plantCount - a.plantCount).slice(0, 3);
  }, [usersQuery.data?.items]);

  const miniBars = useMemo(
    () => activityBars(overviewQuery.data?.activeUsers7d ?? 0, overviewQuery.data?.activeUsers30d ?? 0),
    [overviewQuery.data?.activeUsers7d, overviewQuery.data?.activeUsers30d]
  );

  const refreshAll = async () => {
    await Promise.all([
      overviewQuery.refetch(),
      statsQuery.refetch(),
      usersQuery.refetch()
    ]);
    hapticSuccess();
  };

  return (
    <PlatformPullToRefresh onRefresh={refreshAll}>
      <motion.section
        className="space-y-4 pb-24"
        initial={canAnimate ? { opacity: 0, y: 10 } : false}
        animate={canAnimate ? { opacity: 1, y: 0 } : {}}
        transition={canAnimate ? { type: 'spring', stiffness: 260, damping: 28 } : undefined}
      >
        <header className="ios-blur-card relative overflow-hidden rounded-3xl border border-ios-border/60 bg-white/70 p-4 dark:border-emerald-500/20 dark:bg-zinc-950/60 dark:shadow-[0_0_0_1px_rgba(16,185,129,0.18),0_16px_42px_rgba(5,46,22,0.35)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_16%_14%,rgba(52,199,89,0.24),transparent_60%)]" />
          <p className="relative text-xs uppercase tracking-wide text-ios-subtext">Admin Center</p>
          <h2 className="relative mt-1 text-2xl font-semibold text-ios-text">Админ-панель</h2>
          <p className="relative mt-1 text-sm text-ios-subtext">
            Контроль пользователей, растений, активности и системных метрик.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <AdminStatsCard title="Пользователи" value={overviewQuery.data?.totalUsers ?? 0} icon={Users} tone="blue" />
          <AdminStatsCard title="Растения" value={overviewQuery.data?.totalPlants ?? 0} icon={Leaf} tone="emerald" />
          <AdminStatsCard title="Активные 7д" value={overviewQuery.data?.activeUsers7d ?? 0} icon={Activity} tone="amber" />
          <AdminStatsCard title="Активные 30д" value={overviewQuery.data?.activeUsers30d ?? 0} icon={Clock3} tone="default" />
          <AdminStatsCard title="Просроченные" value={statsQuery.data?.overduePlants ?? 0} icon={TriangleAlert} tone="red" />
          <AdminStatsCard title="Топ город" value={statsQuery.data?.topCities?.[0]?.value ?? 0} subtitle={topLabel(statsQuery.data?.topCities ?? [])} icon={MapPinned} tone="blue" />
          <AdminStatsCard title="Топ тип" value={statsQuery.data?.topPlantTypes?.[0]?.value ?? 0} subtitle={topLabel(statsQuery.data?.topPlantTypes ?? [])} icon={Sprout} tone="emerald" />
          <AdminStatsCard
            title="Топ пользователь"
            value={topUsers[0]?.plantCount ?? 0}
            subtitle={topUsers[0]?.username ? `@${topUsers[0].username}` : 'Нет данных'}
            icon={UserRound}
            tone="amber"
          />
        </div>

        <article className="ios-blur-card rounded-2xl border border-ios-border/60 bg-white/70 p-4 dark:border-emerald-500/20 dark:bg-zinc-950/60">
          <p className="text-xs uppercase tracking-wide text-ios-subtext">Активность за 30 дней</p>
          <div className="mt-3 flex h-20 items-end gap-1">
            {miniBars.map((value, idx) => (
              <motion.div
                key={`bar-${idx}`}
                className="flex-1 rounded-t bg-gradient-to-t from-emerald-500/70 to-cyan-400/70"
                style={{ minHeight: 6 }}
                initial={{ height: 6, opacity: 0.2 }}
                animate={{ height: `${Math.round(value * 100)}%`, opacity: 1 }}
                transition={canAnimate
                  ? { type: 'spring', stiffness: 300, damping: 30, delay: idx * 0.01 }
                  : { duration: 0 }}
              />
            ))}
          </div>
        </article>

        <article className="ios-blur-card rounded-2xl border border-ios-border/60 bg-white/70 p-4 dark:border-emerald-500/20 dark:bg-zinc-950/60">
          <div className="flex items-center gap-2 rounded-2xl border border-ios-border/60 bg-white/70 px-3 py-2 dark:bg-zinc-900/60">
            <Search className="h-4 w-4 text-ios-subtext" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск: username / telegram id / растение / город"
              className="h-8 w-full bg-transparent text-sm text-ios-text outline-none placeholder:text-ios-subtext"
            />
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as CategoryFilter)}
              className="h-10 rounded-xl border border-ios-border/60 bg-white/70 px-3 text-sm outline-none dark:bg-zinc-900/60"
            >
              <option value="ALL">Категория: Все</option>
              <option value="HOME">Дом</option>
              <option value="OUTDOOR_DECORATIVE">Декор</option>
              <option value="OUTDOOR_GARDEN">Сад</option>
            </select>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
              className="h-10 rounded-xl border border-ios-border/60 bg-white/70 px-3 text-sm outline-none dark:bg-zinc-900/60"
            >
              <option value="ALL">Статус: Все</option>
              <option value="OVERDUE">Просроченные</option>
              <option value="ACTIVE">Активные</option>
            </select>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortFilter)}
              className="h-10 rounded-xl border border-ios-border/60 bg-white/70 px-3 text-sm outline-none dark:bg-zinc-900/60"
            >
              <option value="PLANTS_DESC">Сортировка: по кол-ву растений</option>
              <option value="ACTIVITY_DESC">по активности</option>
              <option value="ALPHA">по алфавиту</option>
            </select>
            <Button
              variant="secondary"
              className="h-10 rounded-xl"
              onClick={() => {
                setSearch('');
                setCategory('ALL');
                setStatus('ALL');
                setSort('PLANTS_DESC');
                setRegisteredFrom('');
                setWateringFrom('');
                impactLight();
              }}
            >
              Сбросить фильтры
            </Button>
            <label className="text-xs text-ios-subtext">
              Регистрация с даты
              <input
                type="date"
                value={registeredFrom}
                onChange={(event) => setRegisteredFrom(event.target.value)}
                className="mt-1 h-10 w-full rounded-xl border border-ios-border/60 bg-white/70 px-3 text-sm outline-none dark:bg-zinc-900/60"
              />
            </label>
            <label className="text-xs text-ios-subtext">
              Последний полив с даты
              <input
                type="date"
                value={wateringFrom}
                onChange={(event) => setWateringFrom(event.target.value)}
                className="mt-1 h-10 w-full rounded-xl border border-ios-border/60 bg-white/70 px-3 text-sm outline-none dark:bg-zinc-900/60"
              />
            </label>
          </div>
        </article>

        <article className="ios-blur-card rounded-2xl border border-ios-border/60 bg-white/70 p-4 dark:border-emerald-500/20 dark:bg-zinc-950/60">
          <div className="inline-flex rounded-full border border-ios-border/60 bg-white/70 p-1 dark:bg-zinc-900/60">
            <TabButton label="Пользователи" active={tab === 'users'} onClick={() => setTab('users')} />
            <TabButton label="Растения" active={tab === 'plants'} onClick={() => setTab('plants')} />
          </div>

          <AnimatePresence mode="wait">
            {tab === 'users' ? (
              <motion.div
                key="users-preview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                className="mt-3"
              >
                <AdminUserTable search={debouncedSearch} registeredFrom={registeredFrom} sort={sort} />
              </motion.div>
            ) : (
              <motion.div
                key="plants-preview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                className="mt-3"
              >
                <AdminPlantTable
                  search={debouncedSearch}
                  category={category}
                  status={status}
                  sort={sort}
                  wateringFrom={wateringFrom}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </article>

        <AdminBackupList />
        <AdminPushTest />
      </motion.section>
    </PlatformPullToRefresh>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        impactLight();
        onClick();
      }}
      className={`rounded-full px-4 py-1.5 text-sm transition ${
        active ? 'bg-ios-accent text-white shadow-sm' : 'text-ios-subtext hover:text-ios-text'
      }`}
    >
      {label}
    </button>
  );
}
