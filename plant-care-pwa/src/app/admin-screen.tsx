import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownAZ, ArrowDownWideNarrow, CalendarClock, RefreshCcw } from 'lucide-react';

import { clearAdminCache, getAdminBackups, getAdminOverview, getAdminPlants, getAdminStats, getAdminUsers, getAdminUserPlants, restoreAdminBackup, sendAdminPushTest } from '@/lib/api';
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
  const [pushSearch, setPushSearch] = useState('');
  const [pushTarget, setPushTarget] = useState<AdminUserItemDto | null>(null);
  const [pushTitle, setPushTitle] = useState('Тестовое уведомление');
  const [pushBody, setPushBody] = useState('Проверка Web Push из админ-панели.');

  const overviewQuery = useQuery({ queryKey: ['admin-overview'], queryFn: getAdminOverview });
  const statsQuery = useQuery({ queryKey: ['admin-stats'], queryFn: getAdminStats });
  const usersQuery = useQuery({ queryKey: ['admin-users', q, usersPage], queryFn: () => getAdminUsers(usersPage, 20, q) });
  const pushSuggestQuery = useQuery({
    queryKey: ['admin-users-push-suggest', pushSearch],
    queryFn: () => getAdminUsers(0, 8, pushSearch.trim()),
    enabled: pushSearch.trim().length >= 2
  });
  const plantsQuery = useQuery({ queryKey: ['admin-plants', q, plantsPage], queryFn: () => getAdminPlants(plantsPage, 20, q) });
  const backupsQuery = useQuery({ queryKey: ['admin-backups'], queryFn: getAdminBackups });
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
  const restoreBackupMutation = useMutation({
    mutationFn: restoreAdminBackup,
    onSuccess: () => {
      hapticNotify('success');
      void queryClient.invalidateQueries({ queryKey: ['admin-backups'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-plants'] });
    },
    onError: () => hapticNotify('error')
  });
  const pushTestMutation = useMutation({
    mutationFn: sendAdminPushTest,
    onSuccess: () => hapticNotify('success'),
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
        <div className="mt-3 rounded-ios-button border border-ios-border/60 bg-white/60 p-3 text-xs dark:bg-zinc-900/50">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold">Резервные копии БД</p>
            <Button variant="secondary" size="sm" onClick={() => void backupsQuery.refetch()}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2">
            {(backupsQuery.data ?? []).map((backup) => (
              <div key={backup.fileName} className="rounded-ios-button border border-ios-border/60 bg-white/70 p-2 dark:bg-zinc-950/40">
                <p className="truncate font-medium">{backup.fileName}</p>
                <p className="text-[11px] text-ios-subtext">
                  {formatBytes(backup.sizeBytes)} • {new Date(backup.modifiedAtEpochMs).toLocaleString('ru-RU')}
                </p>
                <Button
                  className="mt-2 w-full"
                  size="sm"
                  variant="secondary"
                  disabled={restoreBackupMutation.isPending}
                  onClick={() => {
                    const ok = window.confirm(`Восстановить БД из "${backup.fileName}"?\nТекущие данные будут заменены.`);
                    if (ok) {
                      restoreBackupMutation.mutate(backup.fileName);
                    }
                  }}
                >
                  Восстановить из этого backup
                </Button>
              </div>
            ))}
            {!backupsQuery.data?.length ? <p className="text-ios-subtext">Backup-файлы не найдены.</p> : null}
            {restoreBackupMutation.data ? <p className="text-ios-subtext">{restoreBackupMutation.data.message}</p> : null}
          </div>
        </div>

        <div className="mt-3 rounded-ios-button border border-ios-border/60 bg-white/60 p-3 text-xs dark:bg-zinc-900/50">
          <p className="mb-2 font-semibold">Тестовое Web Push-сообщение</p>
          <input
            value={pushSearch}
            onChange={(event) => {
              setPushSearch(event.target.value);
              setPushTarget(null);
            }}
            placeholder="Найти пользователя (username / telegram id)"
            className="h-10 w-full rounded-ios-button border border-ios-border/70 bg-white/70 px-3 text-[12px] outline-none dark:bg-zinc-900/60"
          />
          {pushSearch.trim().length >= 2 && !pushTarget ? (
            <div className="mt-2 max-h-44 overflow-y-auto rounded-ios-button border border-ios-border/60 bg-white/80 p-1 dark:bg-zinc-900/70">
              {(pushSuggestQuery.data?.items ?? []).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="w-full rounded-ios-button px-2 py-2 text-left hover:bg-ios-accent/10"
                  onClick={() => {
                    setPushTarget(u);
                    setPushSearch(displayUser(u));
                  }}
                >
                  <p className="text-[12px] font-semibold">@{u.username ?? 'без username'}</p>
                  <p className="text-[11px] text-ios-subtext">id: {u.id} • tg: {u.telegramId}</p>
                </button>
              ))}
              {pushSuggestQuery.data && pushSuggestQuery.data.items.length === 0 ? (
                <p className="px-2 py-2 text-[11px] text-ios-subtext">Пользователи не найдены.</p>
              ) : null}
            </div>
          ) : null}
          {pushTarget ? (
            <p className="mt-2 text-[11px] text-ios-subtext">
              Выбран: @{pushTarget.username ?? 'без username'} (userId={pushTarget.id}, tg={pushTarget.telegramId})
            </p>
          ) : null}
          <input
            value={pushTitle}
            onChange={(event) => setPushTitle(event.target.value)}
            placeholder="Заголовок push"
            className="mt-2 h-10 w-full rounded-ios-button border border-ios-border/70 bg-white/70 px-3 text-[12px] outline-none dark:bg-zinc-900/60"
          />
          <textarea
            value={pushBody}
            onChange={(event) => setPushBody(event.target.value)}
            placeholder="Текст push"
            rows={3}
            className="mt-2 w-full rounded-ios-button border border-ios-border/70 bg-white/70 px-3 py-2 text-[12px] outline-none dark:bg-zinc-900/60"
          />
          <Button
            className="mt-2 w-full"
            variant="secondary"
            disabled={!pushTarget || pushTestMutation.isPending}
            onClick={() => {
              if (!pushTarget) return;
              pushTestMutation.mutate({
                userId: pushTarget.id,
                title: pushTitle.trim(),
                body: pushBody.trim()
              });
            }}
          >
            {pushTestMutation.isPending ? 'Отправляем...' : 'Отправить тестовый push'}
          </Button>
          {pushTestMutation.data ? (
            <>
              <p className="mt-2 text-[11px] text-ios-subtext">
                {pushTestMutation.data.message} (доставлено {pushTestMutation.data.delivered} из {pushTestMutation.data.subscriptions})
              </p>
              <div className="mt-2 space-y-1 rounded-ios-button border border-ios-border/60 bg-white/70 p-2 text-[11px] dark:bg-zinc-900/60">
                {(pushTestMutation.data.endpoints ?? []).map((item, idx) => (
                  <div key={`${item.endpoint}-${idx}`} className="rounded-ios-button border border-ios-border/50 bg-white/65 p-2 dark:bg-zinc-950/40">
                    <p className="truncate font-medium">{item.endpoint}</p>
                    <p className={item.delivered ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                      {item.delivered ? 'Доставлено' : 'Ошибка'}{item.status ? ` · HTTP ${item.status}` : ''}
                    </p>
                    {!item.delivered && item.error ? <p className="mt-0.5 text-ios-subtext">Причина: {item.error}</p> : null}
                  </div>
                ))}
                {!pushTestMutation.data.endpoints?.length ? <p className="text-ios-subtext">Детали endpoint отсутствуют.</p> : null}
              </div>
            </>
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

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} Б`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} КБ`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} МБ`;
}
