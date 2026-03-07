import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownAZ, ArrowDownWideNarrow, CalendarClock, RefreshCcw } from 'lucide-react';

import { clearAdminCache, getAdminOverview, getAdminPlants, getAdminStats, getAdminUsers, getAdminUserPlants } from '@/lib/api';
import { Button } from '@/components/ui/button';
import type { AdminUserItemDto } from '@/types/api';
import { hapticNotify } from '@/lib/telegram';

export function AdminScreen() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [usersPage, setUsersPage] = useState(0);
  const [plantsPage, setPlantsPage] = useState(0);
  const [usersSort, setUsersSort] = useState<'created' | 'alpha'>('created');
  const [plantsSort, setPlantsSort] = useState<'created' | 'alpha' | 'next-water'>('created');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const overviewQuery = useQuery({ queryKey: ['admin-overview'], queryFn: getAdminOverview });
  const statsQuery = useQuery({ queryKey: ['admin-stats'], queryFn: getAdminStats });
  const usersQuery = useQuery({ queryKey: ['admin-users', q, usersPage], queryFn: () => getAdminUsers(usersPage, 20, q) });
  const plantsQuery = useQuery({ queryKey: ['admin-plants', q, plantsPage], queryFn: () => getAdminPlants(plantsPage, 20, q) });
  const userPlantsQuery = useQuery({
    queryKey: ['admin-user-plants', selectedUserId],
    queryFn: () => getAdminUserPlants(selectedUserId as number),
    enabled: selectedUserId !== null
  });
  const clearCacheMutation = useMutation({
    mutationFn: clearAdminCache,
    onSuccess: () => {
      hapticNotify('success');
      void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
    onError: () => hapticNotify('error')
  });

  const selectedUser = useMemo(
    () => usersQuery.data?.items.find((u) => u.id === selectedUserId),
    [usersQuery.data?.items, selectedUserId]
  );

  const sortedUsers = useMemo(() => {
    const items = [...(usersQuery.data?.items ?? [])];
    if (usersSort === 'alpha') {
      return items.sort((a, b) => displayUser(a).localeCompare(displayUser(b), 'ru'));
    }
    return items;
  }, [usersQuery.data?.items, usersSort]);

  const sortedPlants = useMemo(() => {
    const items = [...(plantsQuery.data?.items ?? [])];
    if (plantsSort === 'alpha') {
      return items.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'ru'));
    }
    if (plantsSort === 'next-water') {
      return items.sort((a, b) => dateSortValue(a.nextWateringDate) - dateSortValue(b.nextWateringDate));
    }
    return items;
  }, [plantsQuery.data?.items, plantsSort]);

  const totalUsersPages = Math.max(1, Math.ceil((usersQuery.data?.total ?? 0) / 20));
  const totalPlantsPages = Math.max(1, Math.ceil((plantsQuery.data?.total ?? 0) / 20));

  return (
    <section className="space-y-3">
      <div className="ios-blur-card p-4">
        <p className="text-ios-body font-semibold">Админ-панель</p>
        <p className="mt-1 text-ios-caption text-ios-subtext">Пользователи и растения системы</p>
      </div>

      <div className="ios-blur-card grid grid-cols-2 gap-2 p-4 text-sm">
        <Metric title="Пользователи" value={overviewQuery.data?.totalUsers} />
        <Metric title="Растения" value={overviewQuery.data?.totalPlants} />
        <Metric title="Пользователи с растениями" value={overviewQuery.data?.usersWithPlants} />
        <Metric title="Уличные растения" value={overviewQuery.data?.outdoorPlants} />
        <Metric title="Активные за 7 дней" value={overviewQuery.data?.activeUsers7d} />
        <Metric title="Активные за 30 дней" value={overviewQuery.data?.activeUsers30d} />
      </div>

      <div className="ios-blur-card p-4">
        <input
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setUsersPage(0);
            setPlantsPage(0);
          }}
          placeholder="Поиск: username / telegram id / растение"
          className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/70 px-4 text-ios-body outline-none backdrop-blur-ios dark:bg-zinc-900/60"
        />
      </div>

      <div className="ios-blur-card p-4">
        <p className="mb-2 text-ios-body font-semibold">Системная статистика</p>
        <p className="text-xs text-ios-subtext">Просроченных растений: {statsQuery.data?.overduePlants ?? 0}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-ios-button border border-ios-border/60 bg-white/60 p-3 text-xs dark:bg-zinc-900/50">
            <p className="mb-1 font-semibold">Топ городов</p>
            {(statsQuery.data?.topCities ?? []).slice(0, 5).map((row) => (
              <p key={`city-${row.key}`}>{row.key}: {row.value}</p>
            ))}
          </div>
          <div className="rounded-ios-button border border-ios-border/60 bg-white/60 p-3 text-xs dark:bg-zinc-900/50">
            <p className="mb-1 font-semibold">Топ типов растений</p>
            {(statsQuery.data?.topPlantTypes ?? []).slice(0, 5).map((row) => (
              <p key={`type-${row.key}`}>{row.key}: {row.value}</p>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <Button
            variant="secondary"
            className="w-full"
            disabled={clearCacheMutation.isPending}
            onClick={() => clearCacheMutation.mutate()}
          >
            {clearCacheMutation.isPending ? 'Очищаем кэши...' : 'Очистить кэши (как /clearcache)'}
          </Button>
          {clearCacheMutation.data ? (
            <p className="mt-2 text-xs text-ios-subtext">
              Очищено: поиск {clearCacheMutation.data.plantLookupRows}, OpenRouter {clearCacheMutation.data.openRouterCareEntries}/
              {clearCacheMutation.data.openRouterWateringEntries}/{clearCacheMutation.data.openRouterChatEntries}, погода {clearCacheMutation.data.weatherEntries}
            </p>
          ) : null}
        </div>
      </div>

      <div className="ios-blur-card p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-ios-body font-semibold">Пользователи</p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setUsersSort((prev) => (prev === 'created' ? 'alpha' : 'created'))}
            >
              {usersSort === 'created' ? <CalendarClock className="mr-1 h-4 w-4" /> : <ArrowDownAZ className="mr-1 h-4 w-4" />}
              {usersSort === 'created' ? 'По дате' : 'По алфавиту'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void usersQuery.refetch()}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {sortedUsers.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => setSelectedUserId(user.id)}
              className={`w-full rounded-ios-button border p-3 text-left ${selectedUserId === user.id ? 'border-ios-accent bg-ios-accent/10' : 'border-ios-border/60 bg-white/60 dark:bg-zinc-900/50'}`}
            >
              <p className="text-sm font-semibold">@{user.username ?? 'без username'} • {user.telegramId}</p>
              <p className="text-xs text-ios-subtext">Растений: {user.plantCount} • Город: {user.city ?? 'не указан'}</p>
            </button>
          ))}
          {!sortedUsers.length ? <p className="text-xs text-ios-subtext">Пользователи не найдены.</p> : null}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <Button variant="secondary" size="sm" disabled={usersPage <= 0} onClick={() => setUsersPage((p) => Math.max(0, p - 1))}>
            Назад
          </Button>
          <p className="text-xs text-ios-subtext">
            Стр. {usersPage + 1} / {totalUsersPages}
          </p>
          <Button
            variant="secondary"
            size="sm"
            disabled={usersPage + 1 >= totalUsersPages}
            onClick={() => setUsersPage((p) => p + 1)}
          >
            Далее
          </Button>
        </div>
      </div>

      {selectedUserId ? (
        <div className="ios-blur-card p-4">
          <p className="mb-2 text-ios-body font-semibold">Растения пользователя @{selectedUser?.username ?? selectedUserId}</p>
          <div className="space-y-2">
            {(userPlantsQuery.data ?? []).map((plant) => (
              <div key={plant.id} className="rounded-ios-button border border-ios-border/60 bg-white/60 p-3 text-sm dark:bg-zinc-900/50">
                <p className="font-semibold">{plant.name}</p>
                <p className="text-xs text-ios-subtext">{plant.placement} • {plant.type} • интервал {plant.baseIntervalDays ?? '-'} дн.</p>
              </div>
            ))}
            {!userPlantsQuery.data?.length ? <p className="text-xs text-ios-subtext">У пользователя нет растений.</p> : null}
          </div>
        </div>
      ) : null}

      <div className="ios-blur-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-ios-body font-semibold">Последние растения</p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPlantsSort((prev) => {
                if (prev === 'created') return 'alpha';
                if (prev === 'alpha') return 'next-water';
                return 'created';
              })}
            >
              {plantsSort === 'created' ? <CalendarClock className="mr-1 h-4 w-4" /> : null}
              {plantsSort === 'alpha' ? <ArrowDownAZ className="mr-1 h-4 w-4" /> : null}
              {plantsSort === 'next-water' ? <ArrowDownWideNarrow className="mr-1 h-4 w-4" /> : null}
              {plantsSort === 'created' ? 'По дате' : plantsSort === 'alpha' ? 'По алфавиту' : 'Скоро полив'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { void plantsQuery.refetch(); }}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {sortedPlants.map((plant) => (
            <div key={plant.id} className="rounded-ios-button border border-ios-border/60 bg-white/60 p-3 text-sm dark:bg-zinc-900/50">
              <p className="font-semibold">{plant.name} <span className="text-xs text-ios-subtext">(@{plant.username ?? '—'})</span></p>
              <p className="text-xs text-ios-subtext">{plant.placement} • {plant.type} • след. полив: {plant.nextWateringDate ?? '—'}</p>
            </div>
          ))}
          {!sortedPlants.length ? <p className="text-xs text-ios-subtext">Растения не найдены.</p> : null}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <Button variant="secondary" size="sm" disabled={plantsPage <= 0} onClick={() => setPlantsPage((p) => Math.max(0, p - 1))}>
            Назад
          </Button>
          <p className="text-xs text-ios-subtext">
            Стр. {plantsPage + 1} / {totalPlantsPages}
          </p>
          <Button
            variant="secondary"
            size="sm"
            disabled={plantsPage + 1 >= totalPlantsPages}
            onClick={() => setPlantsPage((p) => p + 1)}
          >
            Далее
          </Button>
        </div>
      </div>
    </section>
  );
}

function Metric({ title, value }: { title: string; value?: number }) {
  return (
    <div className="rounded-ios-button border border-ios-border/60 bg-white/60 p-3 dark:bg-zinc-900/50">
      <p className="text-[11px] text-ios-subtext">{title}</p>
      <p className="text-lg font-semibold">{value ?? 0}</p>
    </div>
  );
}

function displayUser(user: AdminUserItemDto) {
  if (user.username?.trim()) {
    return user.username;
  }
  if (user.firstName?.trim()) {
    return user.firstName;
  }
  return String(user.telegramId ?? '');
}

function dateSortValue(value?: string) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}
