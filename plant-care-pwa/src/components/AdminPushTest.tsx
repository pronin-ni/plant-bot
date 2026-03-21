import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, AlertTriangle, Loader2, MessageSquare, Send, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getAdminActivityLogs, getAdminMonitoring, getAdminUsers, sendAdminPushTest } from '@/lib/api';
import { error as hapticError, impactLight, impactMedium, impactHeavy, success as hapticSuccess, warning as hapticWarning } from '@/lib/haptics';

type PushType = 'info' | 'urgent' | 'test';

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

function resolvePushTitle(type: PushType): string {
  if (type === 'urgent') return 'Срочное уведомление';
  if (type === 'test') return 'Тестовое уведомление';
  return 'Информационное уведомление';
}

function severityClass(severity?: string): string {
  if (severity === 'error') return 'bg-red-500/15 text-red-500';
  if (severity === 'warning') return 'bg-amber-500/15 text-amber-600';
  return 'bg-emerald-500/15 text-emerald-600';
}

export function AdminPushTest() {
  const [userSearch, setUserSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [message, setMessage] = useState('Проверка push-уведомлений от администратора');
  const [type, setType] = useState<PushType>('test');

  const usersQuery = useQuery({
    queryKey: ['admin-push-user-search', userSearch],
    queryFn: () => getAdminUsers(0, 8, userSearch.trim()),
    enabled: userSearch.trim().length >= 1
  });

  const monitoringQuery = useQuery({
    queryKey: ['admin-monitoring'],
    queryFn: getAdminMonitoring
  });

  const logsQuery = useQuery({
    queryKey: ['admin-activity-logs'],
    queryFn: () => getAdminActivityLogs(50)
  });

  const sendPushMutation = useMutation({
    mutationFn: ({ userId, title, body }: { userId: number; title: string; body: string }) =>
      sendAdminPushTest({ userId, title, body }),
    onSuccess: () => {
      void logsQuery.refetch();
      void monitoringQuery.refetch();
    }
  });

  const selectedUser = useMemo(
    () => (usersQuery.data?.items ?? []).find((user) => user.id === selectedUserId) ?? null,
    [usersQuery.data?.items, selectedUserId]
  );

  const onSend = async () => {
    if (!selectedUserId) {
      window.alert('Выберите пользователя');
      return;
    }
    if (!message.trim()) {
      window.alert('Введите сообщение');
      return;
    }
    if (!window.confirm('Отправить тестовый push выбранному пользователю?')) {
      return;
    }
    impactMedium();
    const result = await sendPushMutation.mutateAsync({
      userId: selectedUserId,
      title: resolvePushTitle(type),
      body: message.trim()
    });
    if (result.delivered > 0) {
      hapticSuccess();
    } else {
      hapticWarning();
    }
    window.alert(`Push отправлен: доставлено ${result.delivered} из ${result.subscriptions}`);
  };

  return (
    <section className="space-y-3">
      <article className="ios-blur-card rounded-2xl border border-ios-border/60 bg-white/70 p-4 dark:border-emerald-500/20 dark:bg-zinc-950/60">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-ios-subtext" />
          <p className="text-sm font-semibold text-ios-text">Тестовый Web Push</p>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-ios-subtext">Поиск пользователя</label>
            <input
              value={userSearch}
              onChange={(event) => {
                setUserSearch(event.target.value);
                setSelectedUserId(null);
              }}
              placeholder="username или telegram id"
              className="h-10 w-full rounded-xl border border-ios-border/60 bg-white/70 px-3 text-sm outline-none dark:bg-zinc-900/60"
            />
            <div className="max-h-32 space-y-1 overflow-auto rounded-xl border border-ios-border/40 bg-white/60 p-2 dark:bg-zinc-900/40">
              {(usersQuery.data?.items ?? []).length === 0 ? (
                <p className="text-xs text-ios-subtext">Начните вводить запрос...</p>
              ) : (
                (usersQuery.data?.items ?? []).map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      setSelectedUserId(user.id);
                      impactLight();
                    }}
                    className={`w-full rounded-lg px-2 py-1 text-left text-xs transition ${
                      selectedUserId === user.id ? 'bg-emerald-500/15 text-emerald-700' : 'hover:bg-ios-border/30 text-ios-text'
                    }`}
                  >
                    @{user.username ?? '—'} • {user.telegramId}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-ios-subtext">Тип уведомления</label>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as PushType)}
              className="h-10 w-full rounded-xl border border-ios-border/60 bg-white/70 px-3 text-sm outline-none dark:bg-zinc-900/60"
            >
              <option value="info">Информационное</option>
              <option value="urgent">Срочное</option>
              <option value="test">Тестовое</option>
            </select>
            <label className="text-xs text-ios-subtext">Текст уведомления</label>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
              className="w-full rounded-xl border border-ios-border/60 bg-white/70 px-3 py-2 text-sm outline-none dark:bg-zinc-900/60"
            />
            <Button
              variant="secondary"
              className="h-10 rounded-xl"
              disabled={sendPushMutation.isPending || !selectedUserId}
              onClick={() => void onSend()}
            >
              {sendPushMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
              Отправить тестовый push
            </Button>
            {selectedUser ? (
              <p className="text-xs text-ios-subtext">Выбран: @{selectedUser.username ?? '—'} ({selectedUser.telegramId})</p>
            ) : null}
          </div>
        </div>
      </article>

      <article className="ios-blur-card rounded-2xl border border-ios-border/60 bg-white/70 p-4 dark:border-emerald-500/20 dark:bg-zinc-950/60">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-ios-subtext" />
          <p className="text-sm font-semibold text-ios-text">Мониторинг</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Metric label="Online (15м)" value={monitoringQuery.data?.onlineUsers ?? 0} icon={<Users className="h-4 w-4" />} />
          <Metric label="Активные 24ч" value={monitoringQuery.data?.activeUsers24h ?? 0} icon={<Activity className="h-4 w-4" />} />
          <Metric label="Средняя сессия" value={`${monitoringQuery.data?.avgSessionMinutes ?? 0} мин`} icon={<Activity className="h-4 w-4" />} />
          <Metric label="Ошибки за день" value={monitoringQuery.data?.errorsToday ?? 0} icon={<AlertTriangle className="h-4 w-4" />} />
          <Metric label="Push failures" value={monitoringQuery.data?.pushFailuresToday ?? 0} icon={<AlertTriangle className="h-4 w-4" />} />
        </div>
      </article>

      <article className="ios-blur-card rounded-2xl border border-ios-border/60 bg-white/70 p-4 dark:border-emerald-500/20 dark:bg-zinc-950/60">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ios-text">Логи активности (последние 50)</p>
          <Button variant="secondary" className="h-8 rounded-lg px-3 text-xs" onClick={() => void logsQuery.refetch()}>
            Обновить
          </Button>
        </div>

        <div className="mt-3 max-h-[36vh] space-y-2 overflow-auto">
          <AnimatePresence initial={false}>
            {(logsQuery.data ?? []).map((item, idx) => (
              <motion.div
                key={`${item.type}-${item.at}-${idx}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                className="rounded-xl border border-ios-border/50 bg-white/60 p-2 dark:bg-zinc-900/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-ios-text">
                    <span className="font-semibold">@{item.username ?? '—'}</span> • {item.message}
                  </p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${severityClass(item.severity)}`}>
                    {item.severity ?? 'info'}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-ios-subtext">
                  {item.type} • {formatDate(item.at)} • tg:{item.telegramId ?? '—'}
                </p>
              </motion.div>
            ))}
          </AnimatePresence>
          {(logsQuery.data ?? []).length === 0 && !logsQuery.isLoading ? (
            <p className="text-xs text-ios-subtext">Логов пока нет</p>
          ) : null}
        </div>
      </article>
    </section>
  );
}

function Metric({ label, value, icon }: { label: string; value: string | number; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-ios-border/50 bg-white/60 p-2 dark:bg-zinc-900/60">
      <div className="flex items-center gap-1 text-ios-subtext">{icon}</div>
      <p className="mt-1 text-[11px] uppercase tracking-wide text-ios-subtext">{label}</p>
      <p className="text-sm font-semibold text-ios-text">{value}</p>
    </div>
  );
}
