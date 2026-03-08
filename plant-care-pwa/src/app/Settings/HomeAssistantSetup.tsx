import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Home,
  LoaderCircle,
  Lock,
  ShieldCheck,
  StepForward,
  Workflow
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { saveHomeAssistantConfig } from '@/lib/api';
import { hapticImpact, hapticNotify } from '@/lib/telegram';

const springTransition = {
  type: 'spring',
  stiffness: 360,
  damping: 28,
  mass: 1
} as const;

const HA_SETUP_STEPS = [
  'В Home Assistant откройте: Profile -> Long-Lived Access Tokens.',
  'Создайте новый токен и скопируйте его полностью.',
  'Укажите URL HA, например: http://192.168.1.50:8123 или https://ha.example.com.',
  'Вставьте токен в поле Long-Lived Access Token.',
  'Нажмите Проверить и подключить.'
] as const;

const HA_SETUP_INSTRUCTION_TEXT = [
  'Инструкция подключения Home Assistant',
  ...HA_SETUP_STEPS.map((step, index) => `${index + 1}. ${step}`),
  '',
  'Важно: токен даёт полный доступ к Home Assistant. Храните его безопасно.'
].join('\n');

export function HomeAssistantSetup() {
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [connectSuccess, setConnectSuccess] = useState<string | null>(null);
  const [connectPulseKey, setConnectPulseKey] = useState(0);
  const reduceMotion = useReducedMotion();

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
      setConnectSuccess(null);
    },
    onSuccess: (response) => {
      hapticImpact('medium');
      hapticNotify('success');
      navigator.vibrate?.(100);
      setLastMessage(response.message || 'Home Assistant подключен');
      setConnectSuccess('Ваши растения скажут спасибо 🌿');
      setConnectPulseKey(Date.now());
      setTimeout(() => setConnectSuccess(null), 2200);
      setToken('');
    },
    onError: (error) => {
      hapticNotify('error');
      const message = error instanceof Error ? error.message : 'Не удалось подключиться к Home Assistant';
      setLastMessage(message);
    }
  });

  const copyInstruction = async () => {
    try {
      await navigator.clipboard.writeText(HA_SETUP_INSTRUCTION_TEXT);
      hapticNotify('success');
      setCopySuccess('Инструкция скопирована');
      setTimeout(() => setCopySuccess(null), 1800);
    } catch {
      hapticNotify('error');
      setCopySuccess('Не удалось скопировать инструкцию');
      setTimeout(() => setCopySuccess(null), 1800);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springTransition}
      className="space-y-3"
    >
      <div className="rounded-ios-button border border-ios-border/60 bg-white/60 p-3 dark:border-emerald-500/20 dark:bg-zinc-900/45">
        <div className="mb-2 flex items-center gap-2">
          <Home className="h-4 w-4 text-ios-accent" />
          <p className="text-sm font-medium text-ios-text">Подключение Home Assistant</p>
        </div>

        <p className="text-ios-caption text-ios-subtext">
          Подключение используется для IoT-датчиков: температура, влажность, освещённость и влажность почвы.
        </p>

        <Button
          variant="secondary"
          className="mt-3 w-full"
          onClick={copyInstruction}
        >
          <ClipboardCopy className="mr-1.5 h-4 w-4" />
          Скопировать инструкцию
        </Button>

        <AnimatePresence initial={false}>
          {copySuccess ? (
            <motion.div
              key="copy-status"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ type: 'spring', stiffness: 340, damping: 26 }}
              className="mt-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-700 dark:text-emerald-300"
            >
              {copySuccess}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="rounded-ios-button border border-ios-border/60 bg-white/60 p-3 text-[12px] leading-5 text-ios-subtext dark:border-emerald-500/20 dark:bg-zinc-900/40">
        <p className="mb-2 inline-flex items-center gap-1.5 font-medium text-ios-text">
          <Workflow className="h-4 w-4 text-ios-accent" />
          Шаги подключения
        </p>

        <div className="space-y-2">
          {HA_SETUP_STEPS.map((step, index) => (
            <div key={step} className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-ios-border/60 bg-white/70 text-[11px] font-semibold text-ios-accent dark:bg-zinc-900/60">
                {index + 1}
              </span>
              <p>{step}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-ios-button border border-amber-500/30 bg-amber-100/60 p-3 text-[12px] leading-5 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
        <div className="mb-1 flex items-center gap-1.5 font-medium">
          <ShieldCheck className="h-4 w-4" />
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
          className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/70 px-4 text-ios-body outline-none backdrop-blur-ios dark:border-emerald-500/20 dark:bg-zinc-900/60"
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
            className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/70 pl-10 pr-4 text-ios-body outline-none backdrop-blur-ios dark:border-emerald-500/20 dark:bg-zinc-900/60"
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
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <StepForward className="h-4 w-4" />
            Проверить и подключить
          </span>
        )}
      </Button>

      <AnimatePresence initial={false}>
        {connectSuccess ? (
          <motion.div
            key="connect-success"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300"
          >
            {!reduceMotion ? (
              <motion.span
                key={connectPulseKey}
                aria-hidden
                className="pointer-events-none absolute inset-0"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: [0, 0.38, 0], scale: [0.85, 1, 1.15] }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                style={{
                  background:
                    'radial-gradient(120% 90% at 20% 18%, rgba(52,199,89,0.34) 0%, rgba(52,199,89,0.16) 36%, rgba(52,199,89,0) 76%)'
                }}
              />
            ) : null}

            <span className="relative inline-flex items-center gap-2">
              <span className="relative inline-flex h-5 w-5 items-center justify-center">
                <motion.svg
                  viewBox="0 0 24 24"
                  className="absolute inset-0 h-5 w-5 -rotate-90"
                  initial={false}
                >
                  <motion.circle
                    cx="12"
                    cy="12"
                    r="9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0.3 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: reduceMotion ? 0.2 : 1, ease: 'easeOut' }}
                  />
                </motion.svg>
                <motion.span
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 330, damping: 23 }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </motion.span>
              </span>
              <span>Сохранено! {connectSuccess}</span>
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {lastMessage ? (
        <p className="flex items-center gap-1.5 text-[12px] text-ios-subtext">
          {connectMutation.isError ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : <CheckCircle2 className="h-4 w-4 text-ios-accent" />}
          {lastMessage}
        </p>
      ) : null}
    </motion.div>
  );
}
