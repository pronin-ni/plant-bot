import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { Leaf, MoonStar, SunMedium } from 'lucide-react';

import { AnimatedBackground } from '@/components/login/AnimatedBackground';
import { AuthProvidersList } from '@/components/auth/AuthProvidersList';
import { TelegramWidgetLogin } from '@/components/auth/TelegramWidgetLogin';
import { GuestModeButton } from '@/components/GuestModeButton';
import { PrivacyNote } from '@/components/PrivacyNote';
import { QuickTip } from '@/components/QuickTip';
import { authProviders, type AuthProviderId } from '@/lib/auth/authProviders';
import { cacheSet } from '@/lib/indexeddb';
import { pwaLoginTelegram, pwaLoginTelegramWidget } from '@/lib/api';
import { hapticImpact, hapticNotify } from '@/lib/telegram';
import { useAuthStore, useUiStore } from '@/lib/store';
import type { CalendarEventDto, PlantDto } from '@/types/api';

const LOGIN_THEME_KEY = 'plant-pwa-login-theme';

type LoginTheme = 'dark' | 'light';
type LoginSuccessOverlay = { title: string; subtitle: string } | null;
type AuthSuccessPayload = {
  isAuthorized: boolean;
  accessToken?: string;
  telegramUserId?: number;
  username?: string;
  firstName?: string;
  email?: string;
  roles?: string[];
  isAdmin?: boolean;
};

function readInitialLoginTheme(): LoginTheme {
  const savedTheme = localStorage.getItem(LOGIN_THEME_KEY);
  if (savedTheme === 'dark' || savedTheme === 'light') {
    return savedTheme;
  }
  // Ночной сад по умолчанию для login-экрана.
  return 'dark';
}

function getMigrationInitDataFromUrl(): string | null {
  const queryValue = new URLSearchParams(window.location.search).get('tg_init_data');
  if (queryValue) {
    return queryValue;
  }

  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) {
    return null;
  }
  const hashParams = new URLSearchParams(hash);
  return hashParams.get('tg_init_data');
}

function clearMigrationInitDataFromUrl() {
  if (!window.location.hash.includes('tg_init_data') && !window.location.search.includes('tg_init_data')) {
    return;
  }
  window.history.replaceState(null, '', window.location.pathname);
}

function GrowingLogo() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="relative mx-auto mb-3 flex h-[116px] w-[148px] items-end justify-center">
      <motion.span
        className="absolute bottom-0 h-3 w-16 rounded-[999px] bg-emerald-700/25 blur-[1px]"
        initial={{ scaleX: 0.5, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 0.42, ease: 'easeOut' }}
      />

      <motion.span
        className="absolute bottom-0 h-2.5 w-2.5 rounded-full bg-emerald-500/85"
        initial={{ scale: 0.25, opacity: 0.45 }}
        animate={{ scale: [0.25, 1.08, 1], opacity: [0.45, 1, 1] }}
        transition={{ duration: 0.72, ease: 'easeOut' }}
      />

      <motion.span
        className="absolute bottom-2 h-14 w-[3px] rounded-full bg-gradient-to-t from-emerald-600 via-emerald-500 to-emerald-300"
        initial={{ scaleY: 0, opacity: 0.78 }}
        animate={{ scaleY: 1, opacity: 1 }}
        transition={{
          type: prefersReducedMotion ? 'tween' : 'spring',
          duration: prefersReducedMotion ? 0.5 : undefined,
          stiffness: 150,
          damping: 22,
          mass: 1.5,
          delay: 0.28
        }}
        style={{ transformOrigin: 'bottom center' }}
      />

      <motion.span
        className="absolute bottom-[46px] left-[62px]"
        initial={{ x: -4, y: 4, opacity: 0, rotate: -22, scale: 0.52 }}
        animate={{ x: 0, y: 0, opacity: 1, rotate: -8, scale: 1 }}
        transition={{
          type: prefersReducedMotion ? 'tween' : 'spring',
          duration: prefersReducedMotion ? 0.35 : undefined,
          stiffness: 165,
          damping: 22,
          mass: 1.5,
          delay: 1.24
        }}
      >
        <Leaf className="h-8 w-8 text-emerald-300" />
      </motion.span>

      <motion.span
        className="absolute bottom-[36px] right-[52px]"
        initial={{ x: 4, y: 3, opacity: 0, rotate: 22, scale: 0.52 }}
        animate={{ x: 0, y: 0, opacity: 0.96, rotate: 9, scale: 0.88 }}
        transition={{
          type: prefersReducedMotion ? 'tween' : 'spring',
          duration: prefersReducedMotion ? 0.35 : undefined,
          stiffness: 165,
          damping: 22,
          mass: 1.5,
          delay: 1.48
        }}
      >
        <Leaf className="h-7 w-7 text-emerald-200" />
      </motion.span>

      <motion.span
        className="absolute bottom-[-2px] left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-emerald-600 dark:text-emerald-300"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0.2 : 0.5, delay: prefersReducedMotion ? 0.2 : 2.18 }}
      >
        Добро пожаловать в сад!
      </motion.span>
    </div>
  );
}

function createDemoPlants(): PlantDto[] {
  const now = new Date();
  const plusDays = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    return d.toISOString();
  };

  return [
    {
      id: 900001,
      name: 'Фикус Бенджамина (демо)',
      placement: 'INDOOR',
      category: 'HOME',
      potVolumeLiters: 2,
      lastWateredDate: plusDays(-2),
      nextWateringDate: plusDays(2),
      baseIntervalDays: 4,
      preferredWaterMl: 240,
      photoUrl: '',
      type: 'DEFAULT'
    },
    {
      id: 900002,
      name: 'Монстера (демо)',
      placement: 'INDOOR',
      category: 'HOME',
      potVolumeLiters: 3,
      lastWateredDate: plusDays(-5),
      nextWateringDate: plusDays(1),
      baseIntervalDays: 6,
      preferredWaterMl: 320,
      photoUrl: '',
      type: 'DEFAULT'
    },
    {
      id: 900003,
      name: 'Базилик на балконе (демо)',
      placement: 'OUTDOOR',
      category: 'OUTDOOR_DECORATIVE',
      potVolumeLiters: 1.2,
      lastWateredDate: plusDays(-1),
      nextWateringDate: plusDays(1),
      baseIntervalDays: 2,
      preferredWaterMl: 120,
      photoUrl: '',
      type: 'DEFAULT'
    }
  ];
}

function createDemoCalendar(plants: PlantDto[]): CalendarEventDto[] {
  return plants.map((plant) => ({
    date: (plant.nextWateringDate ?? new Date().toISOString()).slice(0, 10),
    plantId: plant.id,
    plantName: plant.name
  }));
}

export function LoginScreen() {
  const prefersReducedMotion = useReducedMotion();
  const [activeProvider, setActiveProvider] = useState<AuthProviderId | null>(null);
  const [migrationState, setMigrationState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showTelegramWidget, setShowTelegramWidget] = useState(false);
  const [successOverlay, setSuccessOverlay] = useState<LoginSuccessOverlay>(null);
  const [loginTheme, setLoginTheme] = useState<LoginTheme>(() => readInitialLoginTheme());
  const [isOffline, setIsOffline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? !navigator.onLine : false));
  const successTimerRef = useRef<number | null>(null);
  const migrationInitData = useMemo(() => getMigrationInitDataFromUrl(), []);
  const telegramBotUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'plant_at_home_bot';
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  const scheduleAuthSuccess = (payload: AuthSuccessPayload, subtitle: string) => {
    if (successTimerRef.current) {
      window.clearTimeout(successTimerRef.current);
    }
    setSuccessOverlay({
      title: 'Добро пожаловать!',
      subtitle
    });
    hapticImpact('rigid');
    navigator.vibrate?.(300);

    successTimerRef.current = window.setTimeout(() => {
      useAuthStore.getState().setAuth(payload);
      setActiveTab('home');
      setSuccessOverlay(null);
      successTimerRef.current = null;
    }, prefersReducedMotion ? 260 : 1500);
  };

  const loginMutation = useMutation({
    mutationFn: async (providerId: AuthProviderId) => {
      const provider = authProviders.find((item) => item.id === providerId);
      if (!provider) {
        throw new Error('Провайдер не найден');
      }
      setActiveProvider(providerId);
      setLoginError(null);
      setShowTelegramWidget(false);
      return provider.login();
    },
    onSuccess: (session) => {
      scheduleAuthSuccess({
        isAuthorized: true,
        accessToken: session.accessToken,
        telegramUserId: session.user.telegramId,
        username: session.user.username,
        firstName: session.user.firstName,
        email: session.user.email,
        roles: session.user.roles,
        isAdmin: session.user.roles.includes('ROLE_ADMIN')
      }, 'Ваши растения ждут вас');
      setActiveProvider(null);
    },
    onError: (error) => {
      hapticNotify('error');
      const message = error instanceof Error ? error.message : 'Ошибка входа. Проверьте провайдер и настройки backend.';
      if (message === 'TELEGRAM_WIDGET_REQUIRED') {
        setShowTelegramWidget(true);
        setLoginError(null);
      } else {
        setLoginError(message);
      }
      setActiveProvider(null);
    }
  });

  const telegramWidgetMutation = useMutation({
    mutationFn: pwaLoginTelegramWidget,
    onSuccess: (session) => {
      scheduleAuthSuccess({
        isAuthorized: true,
        accessToken: session.accessToken,
        telegramUserId: session.user.telegramId,
        username: session.user.username,
        firstName: session.user.firstName,
        email: session.user.email,
        roles: session.user.roles,
        isAdmin: session.user.roles.includes('ROLE_ADMIN')
      }, 'Вход через Telegram выполнен');
      setShowTelegramWidget(false);
      setLoginError(null);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Ошибка входа через Telegram Widget';
      setLoginError(message);
      hapticNotify('error');
    }
  });

  const migrationMutation = useMutation({
    mutationFn: (initData: string) => pwaLoginTelegram(initData),
    onSuccess: (session) => {
      scheduleAuthSuccess({
        isAuthorized: true,
        accessToken: session.accessToken,
        telegramUserId: session.user.telegramId,
        username: session.user.username,
        firstName: session.user.firstName,
        email: session.user.email,
        roles: session.user.roles,
        isAdmin: session.user.roles.includes('ROLE_ADMIN')
      }, 'Сессия Telegram Mini App перенесена');
      setMigrationState('done');
      clearMigrationInitDataFromUrl();
    },
    onError: () => {
      setMigrationState('error');
      hapticNotify('error');
    }
  });

  useEffect(() => {
    if (!migrationInitData || migrationState !== 'idle') {
      return;
    }
    setMigrationState('running');
    migrationMutation.mutate(migrationInitData);
  }, [migrationInitData, migrationState, migrationMutation]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', loginTheme === 'dark');
    localStorage.setItem(LOGIN_THEME_KEY, loginTheme);
  }, [loginTheme]);

  useEffect(() => {
    // Приветственный haptic-паттерн для логин-экрана.
    hapticImpact('light');
    navigator.vibrate?.([50, 100, 50, 100]);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => () => {
    if (successTimerRef.current) {
      window.clearTimeout(successTimerRef.current);
    }
  }, []);

  const activateGuestMode = async () => {
    const demoPlants = createDemoPlants();
    await cacheSet('api:cache:/api/plants', demoPlants);
    await cacheSet('api:cache:/api/calendar', createDemoCalendar(demoPlants));

    scheduleAuthSuccess({
      isAuthorized: true,
      username: 'guest_demo',
      firstName: 'Гость',
      roles: [],
      isAdmin: false
    }, 'Демо-режим активирован');
    hapticImpact('medium');
  };

  const toggleLoginTheme = () => {
    setLoginTheme((current) => (current === 'dark' ? 'light' : 'dark'));
    hapticImpact('light');
  };

  return (
    <section className="relative mx-auto w-full max-w-[430px] space-y-4 px-2 pb-24 pt-2">
      <AnimatedBackground />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="relative ios-blur-card border border-emerald-500/20 bg-white/55 p-5 dark:bg-zinc-950/45"
      >
        <div className="mb-2 flex justify-end">
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={toggleLoginTheme}
            className="inline-flex items-center gap-2 rounded-full border border-ios-border/70 bg-white/75 px-3 py-1.5 text-xs font-medium text-ios-subtext shadow-[0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-zinc-700/70 dark:bg-zinc-900/70"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={loginTheme}
                initial={{ rotate: -30, opacity: 0, scale: 0.7 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                exit={{ rotate: 30, opacity: 0, scale: 0.7 }}
                transition={{ type: 'spring', stiffness: 360, damping: 24 }}
              >
                {loginTheme === 'dark' ? (
                  <SunMedium className="h-4 w-4 text-amber-500" />
                ) : (
                  <MoonStar className="h-4 w-4 text-indigo-500" />
                )}
              </motion.span>
            </AnimatePresence>
            <span>{loginTheme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</span>
          </motion.button>
        </div>

        <GrowingLogo />

        <h1 className="text-center text-ios-title-1">Вход в Мои Растения</h1>
        <p className="mt-2 text-center text-ios-body text-ios-subtext">
          Войдите, чтобы заботиться о своих растениях 🌿
        </p>

        <AnimatePresence initial={false}>
          {migrationInitData ? (
            <motion.p
              key={migrationState}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              className="mt-3 rounded-2xl border border-ios-border/60 bg-white/60 px-3 py-2 text-xs text-ios-subtext dark:bg-zinc-900/55"
            >
              {migrationState === 'running' ? 'Переносим аккаунт из Telegram Mini App...' : null}
              {migrationState === 'error' ? 'Не удалось автоматически перенести сессию. Выполните вход вручную.' : null}
              {migrationState === 'done' ? 'Сессия успешно перенесена. Добро пожаловать.' : null}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28, delay: 0.08 }}
        className="ios-blur-card border border-ios-border/60 bg-white/55 p-4 dark:border-emerald-500/20 dark:bg-zinc-950/45"
      >
        <AuthProvidersList
          loadingProvider={activeProvider}
          disabledAll={isOffline}
          onLogin={(providerId) => {
            if (isOffline) {
              setLoginError('Нет подключения к сети. Войдите позже или используйте демо-режим.');
              hapticNotify('warning');
              return;
            }
            loginMutation.mutate(providerId);
          }}
        />

        <AnimatePresence initial={false}>
          {isOffline ? (
            <motion.div
              key="offline-login-note"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              className="mt-3 rounded-2xl border border-amber-400/35 bg-amber-400/12 px-3 py-2 text-xs text-amber-100"
            >
              Оффлайн: вход через провайдеры временно недоступен. Можно продолжить в демо-режиме.
            </motion.div>
          ) : null}
        </AnimatePresence>

        {showTelegramWidget ? (
          <div className="mt-3 rounded-ios-button border border-ios-border/60 bg-white/60 p-3 dark:border-emerald-500/20 dark:bg-zinc-900/55">
            <p className="text-xs text-ios-subtext">Подтвердите вход через Telegram:</p>
            <TelegramWidgetLogin
              botUsername={telegramBotUsername}
              onAuth={(payload) => telegramWidgetMutation.mutate(payload)}
              onError={(message) => setLoginError(message)}
            />
          </div>
        ) : null}

        {loginError ? <p className="mt-3 text-xs text-red-500">{loginError}</p> : null}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28, delay: 0.14 }}
        className="space-y-3"
      >
        <GuestModeButton onActivate={activateGuestMode} isOffline={isOffline} />
        <QuickTip />
        <PrivacyNote />
      </motion.div>

      <AnimatePresence>
        {successOverlay ? (
          <motion.div
            key="login-success-overlay"
            className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-600/18 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.16 : 0.32 }}
          >
            <motion.div
              className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.2),transparent_58%)]"
              initial={{ scale: 1 }}
              animate={{ scale: prefersReducedMotion ? 1 : [1, 1.02, 1] }}
              transition={{ duration: 1.15, ease: 'easeInOut' }}
            />

            <div className="pointer-events-none absolute inset-0">
              {Array.from({ length: 14 }).map((_, index) => (
                <motion.span
                  key={index}
                  className="absolute text-emerald-300/85"
                  style={{
                    left: `${18 + ((index * 13) % 65)}%`,
                    top: `${20 + ((index * 11) % 58)}%`
                  }}
                  initial={{ opacity: 0, scale: 0.45, y: 0, rotate: 0 }}
                  animate={{ opacity: [0, 1, 0], scale: [0.45, 1.06, 0.86], y: [0, -28, 12], rotate: [0, index % 2 === 0 ? 24 : -24, 0] }}
                  transition={{ duration: 1.1, delay: index * 0.03, ease: 'easeOut' }}
                >
                  <Leaf className="h-3.5 w-3.5" />
                </motion.span>
              ))}
            </div>

            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 18 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 10 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              className="mx-6 w-full max-w-[360px] rounded-3xl border border-emerald-200/60 bg-white/88 p-5 text-center shadow-[0_24px_70px_rgba(16,185,129,0.28)] dark:border-emerald-500/40 dark:bg-zinc-900/88"
            >
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/90 text-white shadow-lg shadow-emerald-500/35">
                <Leaf className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">{successOverlay.title}</h3>
              <p className="mt-1 text-sm text-ios-subtext">{successOverlay.subtitle}</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
