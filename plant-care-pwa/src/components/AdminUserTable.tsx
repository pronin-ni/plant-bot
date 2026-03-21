import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type RowSelectionState
} from '@tanstack/react-table';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, Eye, Loader2, ShieldBan, ShieldCheck, Trash2, Users } from 'lucide-react';

import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  clearAdminCache,
  deleteAdminUser,
  getAdminUserDetails,
  getAdminUsers,
  sendAdminPushTest,
  setAdminUserBlocked
} from '@/lib/api';
import { error as hapticError, impactLight, impactMedium, impactHeavy, success as hapticSuccess, warning as hapticWarning } from '@/lib/haptics';
import { cn } from '@/lib/cn';
import type { AdminUserDetailsDto, AdminUserItemDto } from '@/types/api';

type UserSort = 'PLANTS_DESC' | 'ACTIVITY_DESC' | 'ALPHA';
type MobileViewMode = 'table' | 'cards';

interface AdminUserTableProps {
  search: string;
  registeredFrom?: string;
  sort: UserSort;
}

const PAGE_SIZE = 20;
const columnHelper = createColumnHelper<AdminUserItemDto>();

function formatDate(value?: string): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

function confirmDangerousAction(primary: string, secondary: string): boolean {
  return window.confirm(primary) && window.confirm(secondary);
}

function downloadCsv(rows: AdminUserItemDto[]) {
  const header = ['id', 'username', 'telegramId', 'email', 'city', 'plantCount', 'lastSeenAt', 'blocked'];
  const csvRows = rows.map((row) =>
    [
      row.id,
      row.username ?? '',
      row.telegramId,
      row.email ?? '',
      row.city ?? '',
      row.plantCount,
      row.lastSeenAt ?? '',
      row.blocked ? 'yes' : 'no'
    ]
      .map((item) => `"${String(item).replaceAll('"', '""')}"`)
      .join(',')
  );
  const content = [header.join(','), ...csvRows].join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `admin-users-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function AdminUserTable({ search, registeredFrom, sort }: AdminUserTableProps) {
  const queryClient = useQueryClient();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [detailsUserId, setDetailsUserId] = useState<number | null>(null);
  const [isCompactMobile, setIsCompactMobile] = useState(false);
  const [mobileViewMode, setMobileViewMode] = useState<MobileViewMode>('table');
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const usersQuery = useInfiniteQuery({
    queryKey: ['admin-users-ad2', search],
    queryFn: async ({ pageParam }) => getAdminUsers(pageParam, PAGE_SIZE, search),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const nextPage = lastPage.page + 1;
      const loaded = (lastPage.page + 1) * lastPage.size;
      return loaded < lastPage.total ? nextPage : undefined;
    }
  });

  const detailsQuery = useQuery({
    queryKey: ['admin-user-details', detailsUserId],
    queryFn: () => getAdminUserDetails(detailsUserId as number),
    enabled: detailsUserId !== null
  });

  const toggleBlockMutation = useMutation({
    mutationFn: async ({ userId, blocked }: { userId: number; blocked?: boolean }) =>
      setAdminUserBlocked(userId, blocked),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users-ad2'] });
      if (detailsUserId !== null) {
        void queryClient.invalidateQueries({ queryKey: ['admin-user-details', detailsUserId] });
      }
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: number) => deleteAdminUser(userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users-ad2'] });
      if (detailsUserId !== null) {
        setDetailsUserId(null);
      }
    }
  });

  const bulkPushMutation = useMutation({
    mutationFn: async ({ userIds, message }: { userIds: number[]; message: string }) => {
      const tasks = userIds.map((userId) =>
        sendAdminPushTest({ userId, title: 'Сообщение от администратора', body: message })
      );
      return Promise.allSettled(tasks);
    }
  });

  const bulkCacheMutation = useMutation({
    mutationFn: () => clearAdminCache()
  });

  const flatItems = useMemo(
    () => usersQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [usersQuery.data?.pages]
  );

  const filteredItems = useMemo(() => {
    const fromTs = registeredFrom ? new Date(registeredFrom).getTime() : null;
    const list = flatItems.filter((user) => {
      if (!fromTs) {
        return true;
      }
      if (!user.createdAt) {
        return false;
      }
      const created = new Date(user.createdAt).getTime();
      return !Number.isNaN(created) && created >= fromTs;
    });

    list.sort((a, b) => {
      if (sort === 'ALPHA') {
        return (a.username ?? '').localeCompare(b.username ?? '', 'ru');
      }
      if (sort === 'ACTIVITY_DESC') {
        const aTs = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
        const bTs = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
        return bTs - aTs;
      }
      return b.plantCount - a.plantCount;
    });
    return list;
  }, [flatItems, registeredFrom, sort]);

  const selectedRows = useMemo(() => {
    const selected = new Set(Object.keys(rowSelection).filter((key) => rowSelection[key]).map((key) => Number(key)));
    return filteredItems.filter((item) => selected.has(item.id));
  }, [filteredItems, rowSelection]);
  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every((item) => Boolean(rowSelection[String(item.id)]));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const media = window.matchMedia('(max-width: 374px)');
    const apply = () => {
      const compact = media.matches;
      setIsCompactMobile(compact);
      if (compact) {
        setMobileViewMode((prev) => (prev === 'table' ? 'cards' : prev));
      } else {
        setMobileViewMode('table');
      }
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    setRowSelection({});
  }, [search, registeredFrom, sort]);

  const toggleUserSelection = (userId: number, checked: boolean) => {
    setRowSelection((prev) => {
      const next = { ...prev };
      if (checked) {
        next[String(userId)] = true;
      } else {
        delete next[String(userId)];
      }
      return next;
    });
  };

  const toggleAllFiltered = (checked: boolean) => {
    setRowSelection((prev) => {
      const next = { ...prev };
      filteredItems.forEach((item) => {
        if (checked) {
          next[String(item.id)] = true;
        } else {
          delete next[String(item.id)];
        }
      });
      return next;
    });
  };

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        size: 48,
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            className="h-4 w-4 accent-emerald-500"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onChange={row.getToggleSelectedHandler()}
            className="h-4 w-4 accent-emerald-500"
          />
        )
      }),
      columnHelper.accessor('username', {
        header: 'Пользователь',
        cell: (info) => {
          const value = info.getValue();
          const initial = (value?.[0] ?? 'U').toUpperCase();
          const row = info.row.original;
          return (
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/75 to-cyan-500/75 text-xs font-semibold text-white">
                {initial}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ios-text">@{value ?? 'без username'}</p>
                <p className="truncate text-xs text-ios-subtext">{row.firstName ?? 'Без имени'}</p>
              </div>
            </div>
          );
        }
      }),
      columnHelper.accessor('telegramId', {
        header: 'Telegram ID',
        cell: (info) => <span className="text-xs text-ios-subtext">{info.getValue()}</span>
      }),
      columnHelper.accessor('email', {
        header: 'Email',
        cell: (info) => <span className="text-xs text-ios-subtext">{info.getValue() ?? '—'}</span>
      }),
      columnHelper.accessor('city', {
        header: 'Город',
        cell: (info) => <span className="text-xs text-ios-subtext">{info.getValue() ?? '—'}</span>
      }),
      columnHelper.accessor('plantCount', {
        header: 'Растения',
        cell: (info) => <span className="text-sm font-semibold text-ios-text">{info.getValue()}</span>
      }),
      columnHelper.accessor('lastSeenAt', {
        header: 'Последний вход',
        cell: (info) => <span className="text-xs text-ios-subtext">{formatDate(info.getValue())}</span>
      }),
      columnHelper.display({
        id: 'status',
        header: 'Статус',
        cell: (info) => {
          const blocked = Boolean(info.row.original.blocked);
          return (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs',
                blocked ? 'bg-red-500/15 text-red-500' : 'bg-emerald-500/15 text-emerald-600'
              )}
            >
              {blocked ? 'Заблокирован' : 'Активен'}
            </span>
          );
        }
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Действия',
        cell: (info) => {
          const user = info.row.original;
          const blocked = Boolean(user.blocked);
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="secondary"
                className="h-10 min-w-10 rounded-lg px-2"
                onClick={() => {
                  impactLight();
                  setDetailsUserId(user.id);
                }}
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                className="h-10 min-w-10 rounded-lg px-2"
                onClick={() => {
                  if (!confirmDangerousAction('Изменить статус блокировки?', blocked ? 'Разблокировать пользователя?' : 'Заблокировать пользователя?')) {
                    return;
                  }
                  impactMedium();
                  toggleBlockMutation.mutate({ userId: user.id, blocked: !blocked });
                }}
              >
                {blocked ? <ShieldCheck className="h-4 w-4 text-emerald-500" /> : <ShieldBan className="h-4 w-4 text-amber-500" />}
              </Button>
              <Button
                variant="secondary"
                className="h-10 min-w-10 rounded-lg px-2 text-red-500"
                onClick={() => {
                  if (
                    !confirmDangerousAction(
                      'Удалить пользователя и связанные данные?',
                      'Действие необратимо. Подтверждаете удаление?'
                    )
                  ) {
                    return;
                  }
                  impactHeavy();
                  deleteUserMutation.mutate(user.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        }
      })
    ],
    [deleteUserMutation, toggleBlockMutation]
  );

  const table = useReactTable({
    data: filteredItems,
    columns,
    getRowId: (row) => String(row.id),
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: true
  });

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !usersQuery.hasNextPage || usersQuery.isFetchingNextPage) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void usersQuery.fetchNextPage();
        }
      },
      { rootMargin: '160px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [usersQuery]);

  const onBulkPush = async () => {
    if (selectedRows.length === 0) {
      return;
    }
    const message = window.prompt('Текст push-сообщения для выбранных пользователей:', 'Тестовое уведомление от администратора');
    if (!message || !message.trim()) {
      return;
    }
    impactMedium();
    const result = await bulkPushMutation.mutateAsync({
      userIds: selectedRows.map((row) => row.id),
      message: message.trim()
    });
    const success = result.filter((item) => item.status === 'fulfilled').length;
    const failed = result.length - success;
    if (failed === 0) {
      hapticSuccess();
    } else {
      hapticWarning();
    }
    window.alert(`Push отправлен: успешно ${success}, с ошибкой ${failed}`);
  };

  const onBulkCacheReset = async () => {
    if (selectedRows.length === 0) {
      return;
    }
    if (
      !confirmDangerousAction(
        `Сбросить системный кэш для выбранных (${selectedRows.length})?`,
        'Сброс глобальный и влияет на всех пользователей. Продолжить?'
      )
    ) {
      return;
    }
    impactMedium();
    await bulkCacheMutation.mutateAsync();
    hapticSuccess();
    window.alert('Кэш успешно очищен');
  };

  return (
    <article className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ios-text">Пользователи ({filteredItems.length})</p>
        <div className="flex flex-wrap items-center gap-2">
          {isCompactMobile ? (
            <div className="inline-flex items-center gap-1 rounded-xl border border-ios-border/60 bg-white/70 p-1 dark:bg-zinc-900/60">
              <button
                type="button"
                className={cn(
                  'touch-target rounded-lg px-2 text-xs font-medium transition-colors',
                  mobileViewMode === 'cards' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'text-ios-subtext'
                )}
                onClick={() => setMobileViewMode('cards')}
              >
                Карточки
              </button>
              <button
                type="button"
                className={cn(
                  'touch-target rounded-lg px-2 text-xs font-medium transition-colors',
                  mobileViewMode === 'table' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'text-ios-subtext'
                )}
                onClick={() => setMobileViewMode('table')}
              >
                Таблица
              </button>
            </div>
          ) : null}
          <Button
            variant="secondary"
            className="h-11 rounded-xl"
            disabled={selectedRows.length === 0 || bulkPushMutation.isPending}
            onClick={() => void onBulkPush()}
          >
            {bulkPushMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Users className="mr-1 h-4 w-4" />}
            Отправить push
          </Button>
          <Button
            variant="secondary"
            className="h-11 rounded-xl"
            disabled={selectedRows.length === 0 || bulkCacheMutation.isPending}
            onClick={() => void onBulkCacheReset()}
          >
            {bulkCacheMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Сбросить кэш
          </Button>
          <Button
            variant="secondary"
            className="h-11 rounded-xl"
            disabled={selectedRows.length === 0}
            onClick={() => {
              downloadCsv(selectedRows);
              impactLight();
            }}
          >
            <Download className="mr-1 h-4 w-4" />
            Экспорт CSV
          </Button>
        </div>
      </div>

      {isCompactMobile && mobileViewMode === 'cards' ? (
        <div className="space-y-2">
          <label className="flex touch-target items-center gap-2 rounded-xl border border-ios-border/60 bg-white/70 px-3 text-xs text-ios-subtext dark:bg-zinc-900/60">
            <input
              type="checkbox"
              className="h-4 w-4 accent-emerald-500"
              checked={allFilteredSelected}
              onChange={(event) => toggleAllFiltered(event.target.checked)}
            />
            Выбрать все ({filteredItems.length})
          </label>

          {filteredItems.map((user) => (
            <div key={user.id} className="rounded-2xl border border-ios-border/60 bg-white/65 p-3 dark:bg-zinc-900/60">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-emerald-500"
                  checked={Boolean(rowSelection[String(user.id)])}
                  onChange={(event) => toggleUserSelection(user.id, event.target.checked)}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ios-text">@{user.username ?? 'без username'}</p>
                  <p className="truncate text-xs text-ios-subtext">{user.firstName ?? 'Без имени'}</p>
                  <p className="mt-1 text-xs text-ios-subtext">ID: {user.telegramId}</p>
                  <p className="text-xs text-ios-subtext">Город: {user.city ?? '—'}</p>
                  <p className="text-xs text-ios-subtext">Растений: {user.plantCount}</p>
                  <p className="text-xs text-ios-subtext">Последний вход: {formatDate(user.lastSeenAt)}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-end gap-1">
                <Button
                  variant="secondary"
                  className="h-10 min-w-10 rounded-lg px-2"
                  onClick={() => {
                    impactLight();
                    setDetailsUserId(user.id);
                  }}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="secondary"
                  className="h-10 min-w-10 rounded-lg px-2"
                  onClick={() => {
                    const blocked = Boolean(user.blocked);
                    if (!confirmDangerousAction('Изменить статус блокировки?', blocked ? 'Разблокировать пользователя?' : 'Заблокировать пользователя?')) {
                      return;
                    }
                    impactMedium();
                    toggleBlockMutation.mutate({ userId: user.id, blocked: !blocked });
                  }}
                >
                  {user.blocked ? <ShieldCheck className="h-4 w-4 text-emerald-500" /> : <ShieldBan className="h-4 w-4 text-amber-500" />}
                </Button>
                <Button
                  variant="secondary"
                  className="h-10 min-w-10 rounded-lg px-2 text-red-500"
                  onClick={() => {
                    if (
                      !confirmDangerousAction(
                        'Удалить пользователя и связанные данные?',
                        'Действие необратимо. Подтверждаете удаление?'
                      )
                    ) {
                      return;
                    }
                    impactHeavy();
                    deleteUserMutation.mutate(user.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ios-border/60 bg-white/65 dark:bg-zinc-900/60">
          <div className="max-h-[58vh] overflow-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-white/85 backdrop-blur dark:bg-zinc-950/80">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th key={header.id} className="border-b border-ios-border/60 px-3 py-2 font-medium text-ios-subtext">
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {table.getRowModel().rows.map((row) => (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ type: 'spring', stiffness: 330, damping: 28 }}
                      className="border-b border-ios-border/40 hover:bg-emerald-500/5"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2 align-middle">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-ios-subtext">
        <p>Выбрано: {selectedRows.length}</p>
        <p>
          Загружено: {flatItems.length}
          {usersQuery.data?.pages?.[0] ? ` из ${usersQuery.data.pages[usersQuery.data.pages.length - 1]?.total ?? flatItems.length}` : ''}
        </p>
      </div>

      <div ref={loadMoreRef} />
      {usersQuery.isFetchingNextPage ? (
        <p className="flex items-center justify-center gap-2 text-xs text-ios-subtext">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Загружаем следующую страницу...
        </p>
      ) : null}
      {usersQuery.hasNextPage ? (
        <div className="flex justify-center">
          <Button variant="secondary" className="h-11 rounded-xl" onClick={() => void usersQuery.fetchNextPage()}>
            Показать ещё
          </Button>
        </div>
      ) : null}

      <Dialog
        open={detailsUserId !== null}
        onOpenChange={(open) => !open && setDetailsUserId(null)}
        title="Детали пользователя"
        description="Растения, статистика поливов, HA/OpenRouter настройки"
        className="w-[min(96vw,760px)]"
      >
        {detailsQuery.isPending ? (
          <div className="flex items-center gap-2 text-sm text-ios-subtext">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем данные...
          </div>
        ) : detailsQuery.isError ? (
          <p className="text-sm text-red-500">Не удалось загрузить детали пользователя</p>
        ) : (
          <UserDetailsContent data={detailsQuery.data as AdminUserDetailsDto} />
        )}
      </Dialog>
    </article>
  );
}

function UserDetailsContent({ data }: { data: AdminUserDetailsDto }) {
  return (
    <div className="space-y-4 text-sm">
      <section className="grid grid-cols-1 gap-2 rounded-xl border border-ios-border/50 bg-white/60 p-3 sm:grid-cols-2 dark:bg-zinc-900/60">
        <Info label="Username" value={data.username ? `@${data.username}` : '—'} />
        <Info label="Telegram" value={String(data.telegramId)} />
        <Info label="Email" value={data.email ?? '—'} />
        <Info label="Город" value={data.city ?? '—'} />
        <Info label="Последний вход" value={formatDate(data.lastSeenAt)} />
        <Info label="Статус" value={data.blocked ? 'Заблокирован' : 'Активен'} />
      </section>

      <section className="grid grid-cols-2 gap-2 rounded-xl border border-ios-border/50 bg-white/60 p-3 sm:grid-cols-3 dark:bg-zinc-900/60">
        <Info label="Растений" value={String(data.plantCount)} />
        <Info label="Просрочено" value={String(data.overduePlants)} />
        <Info label="Поливов" value={String(data.totalWaterings)} />
      </section>

      <section className="rounded-xl border border-ios-border/50 bg-white/60 p-3 dark:bg-zinc-900/60">
        <p className="text-xs uppercase tracking-wide text-ios-subtext">Home Assistant</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Info label="Подключение" value={data.homeAssistantConnected ? 'Подключено' : 'Не подключено'} />
          <Info label="Инстанс" value={data.homeAssistantInstanceName ?? '—'} />
          <Info label="URL" value={data.homeAssistantBaseUrlMasked ?? '—'} />
          <Info label="Последний успех" value={formatDate(data.homeAssistantLastSuccessAt)} />
        </div>
      </section>

      <section className="rounded-xl border border-ios-border/50 bg-white/60 p-3 dark:bg-zinc-900/60">
        <p className="text-xs uppercase tracking-wide text-ios-subtext">OpenRouter</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Info label="API ключ" value={data.hasOpenRouterKey ? 'Задан' : 'Не задан'} />
          <Info label="Chat модель" value={data.openrouterModelChat ?? '—'} />
          <Info label="Plant модель" value={data.openrouterModelPlant ?? '—'} />
          <Info label="Vision diagnose" value={data.openrouterModelPhotoDiagnose ?? '—'} />
        </div>
      </section>

      <section className="rounded-xl border border-ios-border/50 bg-white/60 p-3 dark:bg-zinc-900/60">
        <p className="text-xs uppercase tracking-wide text-ios-subtext">Растения пользователя</p>
        <div className="mt-2 max-h-48 space-y-2 overflow-auto">
          {data.plants.length === 0 ? (
            <p className="text-xs text-ios-subtext">Растений нет</p>
          ) : (
            data.plants.map((plant) => {
              const overdue = Boolean(
                plant.nextWateringDate &&
                  !Number.isNaN(new Date(plant.nextWateringDate).getTime()) &&
                  new Date(plant.nextWateringDate).getTime() < Date.now()
              );
              return (
                <div key={plant.id} className="rounded-lg border border-ios-border/40 bg-white/70 px-2 py-1.5 dark:bg-zinc-900/60">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-ios-text">{plant.name}</p>
                    <span className={cn('text-xs', overdue ? 'text-red-500' : 'text-emerald-600')}>
                      {overdue ? 'Просрочено' : 'Ок'}
                    </span>
                  </div>
                  <p className="text-xs text-ios-subtext">След. полив: {plant.nextWateringDate ?? '—'}</p>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-ios-subtext">{label}</p>
      <p className="break-words text-sm font-medium text-ios-text">{value}</p>
    </div>
  );
}
