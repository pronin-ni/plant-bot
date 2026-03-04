import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Home, LoaderCircle, Lock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { saveHomeAssistantConfig } from '@/lib/api';
import { hapticImpact, hapticNotify } from '@/lib/telegram';

const springTransition = {
  type: 'spring',
  stiffness: 360,
  damping: 28,
  mass: 1
} as const;

export function HomeAssistantSetup() {
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const normalizedUrl = useMemo(() => baseUrl.trim().replace(/\/+$/, ''), [baseUrl]);

  const canSubmit = useMemo(() => {
    return normalizedUrl.startsWith('http://') || normalizedUrl.startsWith('https://')
      ? token.trim().length >= 20
      : false;
  }, [normalizedUrl, token]);

  const connectMutation = useMutation({
    mutationFn: () => saveHomeAssistantConfig({
      baseUrl: normalizedUrl,
      token: token.trim()
    }),
    onMutate: () => {
      hapticImpact('light');
      setLastMessage(null);
    },
    onSuccess: (response) => {
      hapticNotify('success');
      setLastMessage(response.message || 'Home Assistant подключен');
      setToken('');
    },
    onError: (error) => {
      hapticNotify('error');
      const message = error instanceof Error ? error.message : 'Не удалось подключиться к Home Assistant';
      setLastMessage(message);
    }
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springTransition}
      className="ios-blur-card space-y-3 p-4"
    >
      <div className="flex items-center gap-2">
        <Home className="h-4 w-4 text-ios-accent" />
        <p className="text-ios-body font-medium">Home Assistant</p>
      </div>

      <p className="text-ios-caption text-ios-subtext">
        Подключение используется для IoT-датчиков: температура, влажность, освещённость и влажность почвы.
      </p>

      <div className="rounded-ios-button border border-ios-border/60 bg-white/60 p-3 text-[12px] leading-5 text-ios-subtext dark:bg-zinc-900/40">
        <p className="font-medium text-ios-text">Как заполнить поля:</p>
        <ol className="mt-1 list-decimal pl-4">
          <li>В Home Assistant откройте: <b>Profile → Long-Lived Access Tokens</b>.</li>
          <li>Создайте новый токен и скопируйте его полностью.</li>
          <li>В поле <b>URL</b> укажите адрес HA, например: <code>http://192.168.1.50:8123</code> или <code>https://ha.example.com</code>.</li>
          <li>В поле <b>Long-Lived Access Token</b> вставьте токен из шага 2.</li>
          <li>Нажмите <b>Проверить и подключить</b>.</li>
        </ol>
      </div>

      <div className="rounded-ios-button border border-amber-500/30 bg-amber-100/60 p-3 text-[12px] leading-5 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
        <div className="mb-1 flex items-center gap-1.5 font-medium">
          <AlertTriangle className="h-4 w-4" />
          Важно по безопасности
        </div>
        Токен даёт полный доступ к Home Assistant. Токен отправляется только на backend и не возвращается в клиент.
      </div>

      <label className="block">
        <span className="mb-1 block text-ios-caption text-ios-subtext">URL Home Assistant</span>
        <input
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="https://ha.example.local:8123"
          className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/70 px-4 text-ios-body outline-none backdrop-blur-ios dark:bg-zinc-900/60"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-ios-caption text-ios-subtext">Long-Lived Access Token</span>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ios-subtext" />
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            type="password"
            placeholder="Вставьте токен"
            className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/70 pl-10 pr-4 text-ios-body outline-none backdrop-blur-ios dark:bg-zinc-900/60"
          />
        </div>
      </label>

      <Button
        className="w-full"
        disabled={!canSubmit || connectMutation.isPending}
        onClick={() => connectMutation.mutate()}
      >
        {connectMutation.isPending ? (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Проверка подключения...
          </span>
        ) : 'Проверить и подключить'}
      </Button>

      {lastMessage ? (
        <p className="flex items-center gap-1.5 text-[12px] text-ios-subtext">
          <CheckCircle2 className="h-4 w-4 text-ios-accent" />
          {lastMessage}
        </p>
      ) : null}
    </motion.div>
  );
}
