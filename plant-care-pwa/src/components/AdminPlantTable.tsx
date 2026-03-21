import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type RowSelectionState
} from '@tanstack/react-table';
import { AnimatePresence, motion } from 'framer-motion';
import { Droplets, Loader2, Pencil, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { deleteAdminPlant, getAdminPlants, updateAdminPlant, waterAdminOverduePlants, waterAdminPlant } from '@/lib/api';
import { error as hapticError, impactLight, impactMedium, impactHeavy, success as hapticSuccess, warning as hapticWarning } from '@/lib/haptics';
import type { AdminPlantItemDto } from '@/types/api';

type CategoryFilter = 'ALL' | 'HOME' | 'OUTDOOR_DECORATIVE' | 'OUTDOOR_GARDEN';
type StatusFilter = 'ALL' | 'OVERDUE' | 'ACTIVE';
type SortFilter = 'PLANTS_DESC' | 'ACTIVITY_DESC' | 'ALPHA';
type MobileViewMode = 'table' | 'cards';

interface AdminPlantTableProps {
  search: string;
  category: CategoryFilter;
  status: StatusFilter;
  sort: SortFilter;
  wateringFrom?: string;
}

const PAGE_SIZE = 20;
const columnHelper = createColumnHelper<AdminPlantItemDto>();

function parseDate(value?: string): number | null {
  if (!value) {
    return null;
  }
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? null : ts;
}

function isOverdue(nextWateringDate?: string): boolean {
  const ts = parseDate(nextWateringDate);
  return ts !== null && ts < Date.now();
}

function daysToWatering(nextWateringDate?: string): number | null {
  const ts = parseDate(nextWateringDate);
  if (ts === null) {
    return null;
  }
  return Math.ceil((ts - Date.now()) / (24 * 60 * 60 * 1000));
}

function toCategoryLabel(category?: string): string {
  if (category === 'HOME') return 'Дом';
  if (category === 'OUTDOOR_DECORATIVE') return 'Декор';
  if (category === 'OUTDOOR_GARDEN') return 'Сад';
  return '—';
}

function toStatusLabel(nextWateringDate?: string): { text: string; className: string } {
  const overdue = isOverdue(nextWateringDate);
  if (overdue) {
    return { text: 'Просрочено', className: 'bg-red-500/15 text-red-500' };
  }
  const days = daysToWatering(nextWateringDate);
  if (days !== null && days <= 2) {
    return { text: 'Скоро полив', className: 'bg-amber-500/15 text-amber-600' };
  }
  return { text: 'Нормально', className: 'bg-emerald-500/15 text-emerald-600' };
}

function formatDate(value?: string): string {
  const ts = parseDate(value);
  if (ts === null) {
    return '—';
  }
  return new Date(ts).toLocaleDateString('ru-RU');
}

function confirmDangerousAction(primary: string, secondary: string): boolean {
  return window.confirm(primary) && window.confirm(secondary);
}

export function AdminPlantTable({ search, category, status, sort, wateringFrom }: AdminPlantTableProps) {
  const queryClient = useQueryClient();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [ownerFilter, setOwnerFilter] = useState('');
  const [isCompactMobile, setIsCompactMobile] = useState(false);
  const [mobileViewMode, setMobileViewMode] = useState<MobileViewMode>('table');

  const plantsQuery = useInfiniteQuery({
    queryKey: ['admin-plants-ad3', search],
    queryFn: async ({ pageParam }) => getAdminPlants(pageParam, PAGE_SIZE, search),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const nextPage = lastPage.page + 1;
      const loaded = (lastPage.page + 1) * lastPage.size;
      return loaded < lastPage.total ? nextPage : undefined;
    }
  });

  const waterOneMutation = useMutation({
    mutationFn: (plantId: number) => waterAdminPlant(plantId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-plants-ad3'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-overview'] })
      ]);
    }
  });

  const waterBulkMutation = useMutation({
    mutationFn: (plantIds: number[]) => waterAdminOverduePlants(plantIds),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-plants-ad3'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-overview'] })
      ]);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (plantId: number) => deleteAdminPlant(plantId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-plants-ad3'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
      ]);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ plantId, payload }: { plantId: number; payload: { name?: string; baseIntervalDays?: number; category?: 'HOME' | 'OUTDOOR_DECORATIVE' | 'OUTDOOR_GARDEN' } }) =>
      updateAdminPlant(plantId, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-plants-ad3'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
      ]);
    }
  });

  const flatItems = useMemo(
    () => plantsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [plantsQuery.data?.pages]
  );

  const filteredItems = useMemo(() => {
    const fromTs = wateringFrom ? parseDate(wateringFrom) : null;
    const ownerNeedle = ownerFilter.trim().toLowerCase();

    const list = flatItems.filter((plant) => {
      if (category !== 'ALL' && plant.category !== category) {
        return false;
      }
      const overdue = isOverdue(plant.nextWateringDate);
      if (status === 'OVERDUE' && !overdue) {
        return false;
      }
      if (status === 'ACTIVE' && overdue) {
        return false;
      }
      if (fromTs !== null) {
        const lastWateredTs = parseDate(plant.lastWateredDate);
        if (lastWateredTs === null || lastWateredTs < fromTs) {
          return false;
        }
      }
      if (ownerNeedle) {
        const owner = (plant.username ?? '').toLowerCase();
        if (!owner.includes(ownerNeedle)) {
          return false;
        }
      }
      return true;
    });

    if (sort === 'ALPHA') {
      list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'ru'));
    } else if (sort === 'ACTIVITY_DESC') {
      list.sort((a, b) => (parseDate(b.lastWateredDate) ?? 0) - (parseDate(a.lastWateredDate) ?? 0));
    } else {
      list.sort((a, b) => {
        const ao = Number(isOverdue(a.nextWateringDate));
        const bo = Number(isOverdue(b.nextWateringDate));
        if (ao !== bo) return bo - ao;
        return (parseDate(a.nextWateringDate) ?? Number.MAX_SAFE_INTEGER) - (parseDate(b.nextWateringDate) ?? Number.MAX_SAFE_INTEGER);
      });
    }
    return list;
  }, [flatItems, category, status, sort, wateringFrom, ownerFilter]);

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
  }, [search, category, status, sort, wateringFrom, ownerFilter]);

  const togglePlantSelection = (plantId: number, checked: boolean) => {
    setRowSelection((prev) => {
      const next = { ...prev };
      if (checked) {
        next[String(plantId)] = true;
      } else {
        delete next[String(plantId)];
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
      columnHelper.display({
        id: 'photo',
        header: 'Фото',
        cell: (info) => {
          const hasPhoto = Boolean(info.row.original.hasPhoto);
          return (
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold',
                hasPhoto ? 'bg-emerald-500/20 text-emerald-700' : 'bg-zinc-500/15 text-zinc-500'
              )}
            >
              {hasPhoto ? 'Фото' : '—'}
            </div>
          );
        }
      }),
      columnHelper.accessor('name', {
        header: 'Название',
        cell: (info) => <span className="line-clamp-2 max-w-[220px] break-words text-sm font-semibold text-ios-text">{info.getValue()}</span>
      }),
      columnHelper.accessor('username', {
        header: 'Владелец',
        cell: (info) => <span className="text-xs text-ios-subtext">@{info.getValue() ?? '—'}</span>
      }),
      columnHelper.accessor('category', {
        header: 'Категория',
        cell: (info) => <span className="text-xs text-ios-subtext">{toCategoryLabel(info.getValue())}</span>
      }),
      columnHelper.accessor('nextWateringDate', {
        header: 'След. полив',
        cell: (info) => {
          const label = toStatusLabel(info.getValue());
          return (
            <div className="space-y-1">
              <p className={cn('text-xs', isOverdue(info.getValue()) ? 'text-red-500' : 'text-ios-subtext')}>
                {formatDate(info.getValue())}
              </p>
              <span className={cn('rounded-full px-2 py-0.5 text-[11px]', label.className)}>{label.text}</span>
            </div>
          );
        }
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Действия',
        cell: (info) => {
          const plant = info.row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="secondary"
                className="h-10 min-w-10 rounded-lg px-2"
                disabled={!isOverdue(plant.nextWateringDate) || waterOneMutation.isPending}
                onClick={() => {
                  if (!confirmDangerousAction('Отметить растение как политое?', 'Подтвердите действие.')) {
                    return;
                  }
                  impactMedium();
                  waterOneMutation.mutate(plant.id);
                }}
              >
                <Droplets className="h-4 w-4 text-emerald-600" />
              </Button>
              <Button
                variant="secondary"
                className="h-10 min-w-10 rounded-lg px-2"
                disabled={updateMutation.isPending}
                onClick={() => {
                  const nextName = window.prompt('Новое название растения:', plant.name ?? '');
                  if (nextName === null) {
                    return;
                  }
                  const currentInterval = plant.baseIntervalDays ?? 7;
                  const intervalRaw = window.prompt('Интервал полива (дни, 1..180):', String(currentInterval));
                  if (intervalRaw === null) {
                    return;
                  }
                  const parsedInterval = Number(intervalRaw);
                  if (!Number.isFinite(parsedInterval) || parsedInterval < 1 || parsedInterval > 180) {
                    window.alert('Некорректный интервал полива');
                    return;
                  }
                  const payload = {
                    name: nextName.trim() || plant.name,
                    baseIntervalDays: Math.round(parsedInterval),
                    category: plant.category
                  } as const;
                  impactLight();
                  updateMutation.mutate({ plantId: plant.id, payload });
                }}
              >
                <Pencil className="h-4 w-4 text-ios-subtext" />
              </Button>
              <Button
                variant="secondary"
                className="h-10 min-w-10 rounded-lg px-2 text-red-500"
                onClick={() => {
                  if (
                    !confirmDangerousAction(
                      `Удалить растение «${plant.name}»?`,
                      'Действие необратимо. Подтверждаете удаление?'
                    )
                  ) {
                    return;
                  }
                  impactHeavy();
                  deleteMutation.mutate(plant.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        }
      })
    ],
    [deleteMutation, updateMutation, waterOneMutation]
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
    if (!target || !plantsQuery.hasNextPage || plantsQuery.isFetchingNextPage) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void plantsQuery.fetchNextPage();
        }
      },
      { rootMargin: '160px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [plantsQuery]);

  const onWaterOverdue = async () => {
    const selectedOverdue = selectedRows.filter((row) => isOverdue(row.nextWateringDate)).map((row) => row.id);
    const targetIds = selectedOverdue.length > 0
      ? selectedOverdue
      : filteredItems.filter((item) => isOverdue(item.nextWateringDate)).map((item) => item.id);

    if (targetIds.length === 0) {
      window.alert('Нет просроченных растений для отметки');
      return;
    }
    if (
      !confirmDangerousAction(
        `Отметить как политые ${targetIds.length} просроченных растений?`,
        'Подтвердите массовое действие.'
      )
    ) {
      return;
    }
    impactMedium();
    const result = await waterBulkMutation.mutateAsync(targetIds);
    if (result.updated > 0) {
      hapticSuccess();
    } else {
      hapticWarning();
    }
    window.alert(`${result.message}. Обновлено: ${result.updated}, пропущено: ${result.skipped}`);
  };

  return (
    <article className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ios-text">Растения ({filteredItems.length})</p>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
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
          <input
            value={ownerFilter}
            onChange={(event) => setOwnerFilter(event.target.value)}
            placeholder="Фильтр по владельцу (@username)"
            className="h-11 w-full rounded-xl border border-ios-border/60 bg-white/70 px-3 text-xs outline-none sm:w-[280px] dark:bg-zinc-900/60"
          />
          <Button
            variant="secondary"
            className="h-11 rounded-xl"
            disabled={waterBulkMutation.isPending}
            onClick={() => void onWaterOverdue()}
          >
            {waterBulkMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Droplets className="mr-1 h-4 w-4" />}
            Отметить просроченные как политые
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

          {filteredItems.map((plant) => {
            const statusInfo = toStatusLabel(plant.nextWateringDate);
            return (
              <div key={plant.id} className="rounded-2xl border border-ios-border/60 bg-white/65 p-3 dark:bg-zinc-900/60">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-emerald-500"
                    checked={Boolean(rowSelection[String(plant.id)])}
                    onChange={(event) => togglePlantSelection(plant.id, event.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 break-words text-sm font-semibold text-ios-text">{plant.name}</p>
                    <p className="text-xs text-ios-subtext">Владелец: @{plant.username ?? '—'}</p>
                    <p className="text-xs text-ios-subtext">Категория: {toCategoryLabel(plant.category)}</p>
                    <p className="text-xs text-ios-subtext">След. полив: {formatDate(plant.nextWateringDate)}</p>
                    <span className={cn('mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px]', statusInfo.className)}>
                      {statusInfo.text}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-end gap-1">
                  <Button
                    variant="secondary"
                    className="h-10 min-w-10 rounded-lg px-2"
                    disabled={!isOverdue(plant.nextWateringDate) || waterOneMutation.isPending}
                    onClick={() => {
                      if (!confirmDangerousAction('Отметить растение как политое?', 'Подтвердите действие.')) {
                        return;
                      }
                      impactMedium();
                      waterOneMutation.mutate(plant.id);
                    }}
                  >
                    <Droplets className="h-4 w-4 text-emerald-600" />
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-10 min-w-10 rounded-lg px-2"
                    disabled={updateMutation.isPending}
                    onClick={() => {
                      const nextName = window.prompt('Новое название растения:', plant.name ?? '');
                      if (nextName === null) {
                        return;
                      }
                      const currentInterval = plant.baseIntervalDays ?? 7;
                      const intervalRaw = window.prompt('Интервал полива (дни, 1..180):', String(currentInterval));
                      if (intervalRaw === null) {
                        return;
                      }
                      const parsedInterval = Number(intervalRaw);
                      if (!Number.isFinite(parsedInterval) || parsedInterval < 1 || parsedInterval > 180) {
                        window.alert('Некорректный интервал полива');
                        return;
                      }
                      const payload = {
                        name: nextName.trim() || plant.name,
                        baseIntervalDays: Math.round(parsedInterval),
                        category: plant.category
                      } as const;
                      impactLight();
                      updateMutation.mutate({ plantId: plant.id, payload });
                    }}
                  >
                    <Pencil className="h-4 w-4 text-ios-subtext" />
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-10 min-w-10 rounded-lg px-2 text-red-500"
                    onClick={() => {
                      if (
                        !confirmDangerousAction(
                          `Удалить растение «${plant.name}»?`,
                          'Действие необратимо. Подтверждаете удаление?'
                        )
                      ) {
                        return;
                      }
                      impactHeavy();
                      deleteMutation.mutate(plant.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ios-border/60 bg-white/65 dark:bg-zinc-900/60">
          <div className="max-h-[58vh] overflow-auto">
            <table className="w-full min-w-[940px] border-collapse text-left text-sm">
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
          {plantsQuery.data?.pages?.[0] ? ` из ${plantsQuery.data.pages[plantsQuery.data.pages.length - 1]?.total ?? flatItems.length}` : ''}
        </p>
      </div>

      <div ref={loadMoreRef} />
      {plantsQuery.isFetchingNextPage ? (
        <p className="flex items-center justify-center gap-2 text-xs text-ios-subtext">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Загружаем следующую страницу...
        </p>
      ) : null}
      {plantsQuery.hasNextPage ? (
        <div className="flex justify-center">
          <Button variant="secondary" className="h-11 rounded-xl" onClick={() => void plantsQuery.fetchNextPage()}>
            Показать ещё
          </Button>
        </div>
      ) : null}
    </article>
  );
}
