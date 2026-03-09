import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, Clock3, Loader2, Mail, RefreshCcw, Sparkles } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type MagicLinkFormProps = {
  email: string;
  onEmailChange: (value: string) => void;
  onSubmit: () => void;
  onResend: () => void;
  onResetSent: () => void;
  loading?: boolean;
  disabled?: boolean;
  error?: string | null;
  sent?: boolean;
  sentToEmail?: string | null;
  expiresAt?: string | null;
};

export function MagicLinkForm({
  email,
  onEmailChange,
  onSubmit,
  onResend,
  onResetSent,
  loading = false,
  disabled = false,
  error,
  sent = false,
  sentToEmail,
  expiresAt
}: MagicLinkFormProps) {
  const prefersReducedMotion = useReducedMotion();
  const fallbackExpiryMinutes = Number(import.meta.env.VITE_MAGIC_LINK_EXPIRY_MINUTES ?? '20');
  const targetTimestamp = useMemo(() => {
    if (!sent) {
      return null;
    }
    if (expiresAt) {
      const parsed = Date.parse(expiresAt);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    const minutes = Number.isFinite(fallbackExpiryMinutes) && fallbackExpiryMinutes > 0 ? fallbackExpiryMinutes : 20;
    return Date.now() + minutes * 60 * 1000;
  }, [expiresAt, fallbackExpiryMinutes, sent]);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  useEffect(() => {
    if (!targetTimestamp) {
      setSecondsLeft(0);
      return;
    }
    const update = () => {
      const diffSeconds = Math.max(0, Math.ceil((targetTimestamp - Date.now()) / 1000));
      setSecondsLeft(diffSeconds);
    };
    update();
    const intervalId = window.setInterval(update, 1000);
    return () => window.clearInterval(intervalId);
  }, [targetTimestamp]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const submitDisabled = disabled || loading || !emailIsValid;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timerLabel = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="mt-4 rounded-ios-button border border-emerald-500/20 bg-emerald-500/5 p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
          <Mail className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-ios-label">Или войдите по email</p>
          <p className="text-[11px] text-ios-subtext">Без пароля: только волшебная ссылка на почту</p>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {sent ? (
          <motion.div
            key="magic-link-sent-state"
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="space-y-3"
          >
            <motion.div
              className="rounded-2xl border border-emerald-400/35 bg-emerald-500/12 p-3"
              animate={prefersReducedMotion ? undefined : { boxShadow: ['0 0 0 rgba(16,185,129,0)', '0 0 0.8rem rgba(16,185,129,0.18)', '0 0 0 rgba(16,185,129,0)'] }}
              transition={prefersReducedMotion ? undefined : { duration: 1.2, ease: 'easeInOut', repeat: 1 }}
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/25 text-emerald-200">
                  <CheckCircle2 className="h-4.5 w-4.5" />
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-emerald-100">Проверьте почту — мы отправили волшебную ссылку! ✨</p>
                  <p className="text-xs text-emerald-200/90">
                    {sentToEmail ? `Письмо отправлено на ${sentToEmail}.` : 'Письмо отправлено на указанный email.'}
                  </p>
                </div>
              </div>

              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-100">
                <Clock3 className="h-3.5 w-3.5" />
                Ссылка активна: {timerLabel}
              </div>
            </motion.div>

            <div className="grid grid-cols-2 gap-2">
              <motion.button
                type="button"
                whileTap={{ scale: disabled || loading ? 1 : 0.98 }}
                onClick={onResend}
                disabled={disabled || loading}
                className="touch-target inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(16,185,129,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Отправка...
                  </>
                ) : (
                  <>
                    <RefreshCcw className="h-3.5 w-3.5" />
                    Отправить еще раз
                  </>
                )}
              </motion.button>

              <button
                type="button"
                onClick={onResetSent}
                className="touch-target rounded-xl border border-ios-border/70 bg-white/80 text-xs font-medium text-ios-subtext transition hover:bg-white/95 dark:border-zinc-700/70 dark:bg-zinc-900/75"
              >
                Изменить email
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {!sent ? (
          <motion.form
            key="magic-link-form"
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="space-y-2.5"
          >
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-ios-subtext">Email</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
                disabled={disabled || loading}
                className="touch-target w-full rounded-xl border border-ios-border/70 bg-white/85 px-3 text-sm text-ios-label outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/70 dark:bg-zinc-900/80"
              />
            </label>

            <motion.button
              type="submit"
              whileTap={{ scale: submitDisabled ? 1 : 0.98 }}
              disabled={submitDisabled}
              className="touch-target inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(16,185,129,0.30)] transition disabled:cursor-not-allowed disabled:opacity-55"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Отправляем ссылку...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Продолжить
                </>
              )}
            </motion.button>
          </motion.form>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {error ? (
          <motion.p
            key="magic-link-error"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="mt-2.5 rounded-xl border border-red-400/35 bg-red-500/10 px-2.5 py-2 text-xs text-red-200 dark:text-red-300"
          >
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
