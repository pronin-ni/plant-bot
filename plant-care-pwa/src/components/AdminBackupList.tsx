import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Database, Loader2, RefreshCcw, ShieldAlert, Sparkles, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  clearAdminCache,
  clearAdminCacheScope,
  createAdminBackup,
  getAdminBackups,
  restoreAdminBackup
} from '@/lib/api';
import { error as hapticError, impactLight, impactMedium, impactHeavy, success as hapticSuccess, warning as hapticWarning } from '@/lib/haptics';

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
}

function formatDate(epochMs: number): string {
  const date = new Date(epochMs);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

function confirmDangerousAction(primary: string, secondary: string): boolean {
  return window.confirm(primary) && window.confirm(secondary);
}

export function AdminBackupList() {
  const queryClient = useQueryClient();
  const backupsQuery = useQuery({
    queryKey: ['admin-backups'],
    queryFn: getAdminBackups
  });

  const clearAllMutation = useMutation({
    mutationFn: clearAdminCache
  });
  const clearWeatherMutation = useMutation({
    mutationFn: () => clearAdminCacheScope('weather')
  });
  const clearOpenRouterMutation = useMutation({
    mutationFn: () => clearAdminCacheScope('openrouter')
  });
  const clearUsersMutation = useMutation({
    mutationFn: () => clearAdminCacheScope('users')
  });

  const createBackupMutation = useMutation({
    mutationFn: createAdminBackup,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-backups'] })
  });

  const restoreBackupMutation = useMutation({
    mutationFn: (fileName: string) => restoreAdminBackup(fileName),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-backups'] })
  });

  const totalBackupsSize = useMemo(
    () => (backupsQuery.data ?? []).reduce((acc, item) => acc + (item.sizeBytes ?? 0), 0),
    [backupsQuery.data]
  );

  const onClearAll = async () => {
    if (
      !confirmDangerousAction(
        'Очистить весь кэш системы?',
        'Подтвердите очистку кэша погоды, OpenRouter и служебных данных.'
      )
    ) {
      return;
    }
    impactMedium();
    const result = await clearAllMutation.mutateAsync();
    hapticSuccess();
    window.alert(
      `Кэш очищен.\nПогода: ${result.weatherEntries}\nOpenRouter: ${result.openRouterCareEntries + result.openRouterWateringEntries + result.openRouterChatEntries}`
    );
  };

  const onClearScope = async (scope: 'weather' | 'openrouter' | 'users') => {
    const titleByScope = {
      weather: 'кэш погоды',
      openrouter: 'кэш OpenRouter',
      users: 'пользовательский кэш'
    } as const;
    if (
      !confirmDangerousAction(
        `Очистить ${titleByScope[scope]}?`,
        'Подтвердите выполнение операции.'
      )
    ) {
      return;
    }
    impactLight();
    const mutation = scope === 'weather'
      ? clearWeatherMutation
      : scope === 'openrouter'
        ? clearOpenRouterMutation
        : clearUsersMutation;
    const result = await mutation.mutateAsync();
    hapticSuccess();
    window.alert(result.message);
  };

  const onCreateBackup = async () => {
    if (
      !confirmDangerousAction(
        'Создать резервную копию БД сейчас?',
        'Подтвердите ручное создание backup.'
      )
    ) {
      return;
    }
    impactMedium();
    const result = await createBackupMutation.mutateAsync();
    hapticSuccess();
    window.alert(`Backup создан: ${result.fileName}`);
  };

  const onRestoreBackup = async (fileName: string) => {
    if (
      !confirmDangerousAction(
        `Восстановить БД из ${fileName}?`,
        'Это необратимо. Подтвердите восстановление ещё раз.'
      )
    ) {
      return;
    }
    impactHeavy();
    const result = await restoreBackupMutation.mutateAsync(fileName);
    if (result.ok) {
      hapticWarning();
      window.alert(`${result.message}\nФайл: ${result.restoredFile}`);
    } else {
      hapticError();
      window.alert('Не удалось восстановить backup');
    }
  };

  return (
    <section className="space-y-3">
      <article className="ios-blur-card rounded-2xl border border-ios-border/60 bg-white/70 p-4 dark:border-emerald-500/20 dark:bg-zinc-950/60">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-ios-text">Очистка кэша</p>
            <p className="text-xs text-ios-subtext">Операции выполняются с подтверждением и логируются на бэкенде.</p>
          </div>
          <Button
            variant="secondary"
            className="h-9 rounded-xl"
            disabled={clearAllMutation.isPending}
            onClick={() => void onClearAll()}
          >
            {clearAllMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
            Очистить весь кэш
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button
            variant="secondary"
            className="h-10 rounded-xl"
            disabled={clearWeatherMutation.isPending}
            onClick={() => void onClearScope('weather')}
          >
            {clearWeatherMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Кэш погоды
          </Button>
          <Button
            variant="secondary"
            className="h-10 rounded-xl"
            disabled={clearOpenRouterMutation.isPending}
            onClick={() => void onClearScope('openrouter')}
          >
            {clearOpenRouterMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Кэш OpenRouter
          </Button>
          <Button
            variant="secondary"
            className="h-10 rounded-xl"
            disabled={clearUsersMutation.isPending}
            onClick={() => void onClearScope('users')}
          >
            {clearUsersMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Кэш пользователей
          </Button>
        </div>
      </article>

      <article className="ios-blur-card rounded-2xl border border-ios-border/60 bg-white/70 p-4 dark:border-emerald-500/20 dark:bg-zinc-950/60">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-ios-text">Резервные копии БД</p>
            <p className="text-xs text-ios-subtext">
              Всего: {backupsQuery.data?.length ?? 0} • Размер: {formatSize(totalBackupsSize)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="h-9 rounded-xl"
              disabled={backupsQuery.isFetching}
              onClick={() => void backupsQuery.refetch()}
            >
              <RefreshCcw className="mr-1 h-4 w-4" />
              Обновить
            </Button>
            <Button
              variant="secondary"
              className="h-9 rounded-xl"
              disabled={createBackupMutation.isPending}
              onClick={() => void onCreateBackup()}
            >
              {createBackupMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Database className="mr-1 h-4 w-4" />}
              Создать backup сейчас
            </Button>
          </div>
        </div>

        <div className="mt-3 max-h-[38vh] space-y-2 overflow-auto">
          <AnimatePresence initial={false}>
            {(backupsQuery.data ?? []).map((item) => (
              <motion.div
                key={item.fileName}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                className="rounded-xl border border-ios-border/50 bg-white/60 p-3 dark:bg-zinc-900/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ios-text">{item.fileName}</p>
                    <p className="text-xs text-ios-subtext">
                      {formatDate(item.modifiedAtEpochMs)} • {formatSize(item.sizeBytes)} • автор: {item.createdBy ?? '—'}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    className="h-8 rounded-lg px-2 text-red-500"
                    disabled={restoreBackupMutation.isPending}
                    onClick={() => void onRestoreBackup(item.fileName)}
                  >
                    {restoreBackupMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-1 h-4 w-4" />}
                    Восстановить
                  </Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {(backupsQuery.data ?? []).length === 0 && !backupsQuery.isLoading ? (
            <p className="flex items-center gap-2 rounded-xl border border-dashed border-ios-border/50 bg-white/50 px-3 py-4 text-xs text-ios-subtext dark:bg-zinc-900/50">
              <Sparkles className="h-4 w-4" />
              Backup-файлов пока нет
            </p>
          ) : null}
        </div>
      </article>
    </section>
  );
}
