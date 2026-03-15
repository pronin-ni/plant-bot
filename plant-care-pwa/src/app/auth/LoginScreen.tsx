import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { Leaf, MoonStar, SunMedium } from 'lucide-react';

import { AnimatedBackground } from '@/components/login/AnimatedBackground';
import { AuthProvidersList } from '@/components/auth/AuthProvidersList';
import { MagicLinkForm } from '@/components/auth/MagicLinkForm';
import { TelegramWidgetLogin } from '@/components/auth/TelegramWidgetLogin';
import { GuestModeButton } from '@/components/GuestModeButton';
import { PrivacyNote } from '@/components/PrivacyNote';
import { QuickTip } from '@/components/QuickTip';
import { authProviders, type AuthProviderId } from '@/lib/auth/authProviders';
import { ApiError } from '@/lib/api';
import { cacheSet } from '@/lib/indexeddb';
import { pwaLoginTelegram, pwaLoginTelegramWidget, pwaRequestEmailMagicLink, pwaVerifyEmailMagicLink } from '@/lib/api';
import { isTestAuditMode } from '@/lib/runtime';
import {
  error as hapticError,
  impactLight,
  selection,
  success as hapticSuccess,
  warning as hapticWarning
} from '@/lib/haptics';
import { useAuthStore, useUiStore } from '@/lib/store';
import type { CalendarEventDto, PlantDto } from '@/types/api';

const LOGIN_THEME_KEY = 'plant-pwa-login-theme';

type LoginTheme = 'dark' | 'light';
type LoginSuccessOverlay = { title: string; subtitle: string } | null;
type AuthSuccessPayload = {
  isAuthorized: boolean;
  isGuest?: boolean;
  accessToken?: string;
  telegramUserId?: number;
  username?: string;
  firstName?: string;
  email?: string;
  city?: string;
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

function getMagicLinkTokenFromUrl(): string | null {
  const path = window.location.pathname.toLowerCase();
  const queryToken = new URLSearchParams(window.location.search).get('token');
  if (path.includes('/auth/verify') && queryToken) {
    return queryToken;
  }

  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) {
    return null;
  }
  const hashParts = hash.split('?');
  const hashPath = (hashParts[0] ?? '').toLowerCase();
  if (!hashPath.includes('/auth/verify')) {
    return null;
  }
  const hashQuery = hashParts.length > 1 ? hashParts.slice(1).join('?') : '';
  return new URLSearchParams(hashQuery).get('token');
}

function clearMagicLinkTokenFromUrl() {
  if (!window.location.pathname.toLowerCase().includes('/auth/verify') && !window.location.hash.toLowerCase().includes('/auth/verify')) {
    return;
  }
  const path = window.location.pathname.toLowerCase();
  const fallbackPath = path.startsWith('/pwa/') || path === '/pwa' ? '/pwa/' : '/';
  window.history.replaceState(null, '', fallbackPath);
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

function mapTelegramAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const normalized = message.trim().toLowerCase();
  const status = error instanceof ApiError ? error.status : null;

  if (
    status === 502 ||
    status === 503 ||
    normalized.includes('failed to fetch') ||
    normalized.includes('networkerror') ||
    normalized.includes('network request failed')
  ) {
    return 'Telegram временно недоступен. Попробуйте снова чуть позже.';
  }

  if (
    normalized.includes('не настроен bot.token') ||
    normalized.includes('не задан username') ||
    normalized.includes('не настроен telegram вход')
  ) {
    return 'Не настроен Telegram вход. Попробуйте позже или используйте другой способ входа.';
  }

  if (
    normalized.includes('некорректный telegram payload') ||
    normalized.includes('подпись telegram') ||
    normalized.includes('данные входа telegram устарели')
  ) {
    return 'Не удалось завершить вход через Telegram. Начните вход заново.';
  }

  return 'Не удалось завершить вход через Telegram. Попробуйте ещё раз.';
}

export function LoginScreen() {
  const prefersReducedMotion = useReducedMotion();
  const [activeProvider, setActiveProvider] = useState<AuthProviderId | null>(null);
  const [migrationState, setMigrationState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [magicLinkVerifyState, setMagicLinkVerifyState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [magicLinkVerifyError, setMagicLinkVerifyError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkSentToEmail, setMagicLinkSentToEmail] = useState<string | null>(null);
  const [magicLinkExpiresAt, setMagicLinkExpiresAt] = useState<string | null>(null);
  const [magicEmail, setMagicEmail] = useState('');
  const [showTelegramWidget, setShowTelegramWidget] = useState(false);
  const [successOverlay, setSuccessOverlay] = useState<LoginSuccessOverlay>(null);
  const [loginTheme, setLoginTheme] = useState<LoginTheme>(() => readInitialLoginTheme());
  const [isOffline, setIsOffline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? !navigator.onLine : false));
  const successTimerRef = useRef<number | null>(null);
  const magicLinkVerifyAttemptRef = useRef(false);
  const migrationInitData = useMemo(() => getMigrationInitDataFromUrl(), []);
  const magicLinkTokenFromUrl = useMemo(() => getMagicLinkTokenFromUrl(), []);
  const telegramBotUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'plant_at_home_bot';
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const testAuditMode = isTestAuditMode();

  const scheduleAuthSuccess = (payload: AuthSuccessPayload, subtitle: string) => {
    if (successTimerRef.current) {
      window.clearTimeout(successTimerRef.current);
    }
    setSuccessOverlay({
      title: 'Добро пожаловать в сад! 🌿',
      subtitle
    });
    hapticSuccess();

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
    onError: (error, providerId) => {
      hapticError();
      const message = error instanceof Error ? error.message : 'Ошибка входа. Проверьте провайдер и настройки backend.';
      if (message === 'TELEGRAM_WIDGET_REQUIRED') {
        setShowTelegramWidget(true);
        setLoginError(null);
      } else {
        setLoginError(providerId === 'telegram' ? mapTelegramAuthError(error) : message);
        setShowTelegramWidget(false);
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
      setLoginError(mapTelegramAuthError(error));
      hapticError();
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
      hapticError();
    }
  });

  const magicLinkMutation = useMutation({
    mutationFn: (email: string) => pwaRequestEmailMagicLink(email),
    onSuccess: (response) => {
      setMagicLinkError(null);
      setMagicLinkSent(true);
      setMagicLinkSentToEmail(magicEmail.trim().toLowerCase());
      setMagicLinkExpiresAt(response.expiresAt ?? null);
      hapticSuccess();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Не удалось отправить ссылку. Попробуйте еще раз.';
      setMagicLinkSent(false);
      setMagicLinkError(message);
      hapticError();
    }
  });

  const magicLinkVerifyMutation = useMutation({
    mutationFn: (token: string) => pwaVerifyEmailMagicLink(token),
    onSuccess: (session) => {
      setMagicLinkVerifyState('done');
      setMagicLinkVerifyError(null);
      clearMagicLinkTokenFromUrl();
      scheduleAuthSuccess({
        isAuthorized: true,
        accessToken: session.accessToken,
        telegramUserId: session.user.telegramId,
        username: session.user.username,
        firstName: session.user.firstName,
        email: session.user.email,
        roles: session.user.roles,
        isAdmin: session.user.roles.includes('ROLE_ADMIN')
      }, 'Magic Link подтвержден');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Не удалось подтвердить ссылку входа.';
      setMagicLinkVerifyState('error');
      setMagicLinkVerifyError(message);
      hapticError();
      clearMagicLinkTokenFromUrl();
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
    if (!magicLinkTokenFromUrl || magicLinkVerifyAttemptRef.current) {
      return;
    }
    magicLinkVerifyAttemptRef.current = true;
    setMagicLinkVerifyState('running');
    setMagicLinkVerifyError(null);
    magicLinkVerifyMutation.mutate(magicLinkTokenFromUrl);
  }, [magicLinkTokenFromUrl, magicLinkVerifyMutation]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', loginTheme === 'dark');
    localStorage.setItem(LOGIN_THEME_KEY, loginTheme);
  }, [loginTheme]);

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
    if (testAuditMode) {
      setLoginError('Demo mode отключён для test audit. Используйте реальную авторизацию.');
      hapticWarning();
      return;
    }

    const demoPlants = createDemoPlants();
    await cacheSet('api:cache:/api/plants', demoPlants);
    await cacheSet('api:cache:/api/calendar', createDemoCalendar(demoPlants));

    scheduleAuthSuccess({
      isAuthorized: true,
      isGuest: true,
      username: 'guest_demo',
      firstName: 'Гость',
      city: 'Санкт-Петербург',
      roles: [],
      isAdmin: false
    }, 'Демо-режим активирован');
    hapticSuccess();
  };

  const toggleLoginTheme = () => {
    setLoginTheme((current) => (current === 'dark' ? 'light' : 'dark'));
    selection();
  };

  // Опираемся на явный state, чтобы UI гарантированно разблокировался после ошибки verify.
  const isMagicLinkVerifying = magicLinkVerifyState === 'running';

  const submitMagicLink = () => {
    if (isMagicLinkVerifying) {
      return;
    }
    if (isOffline) {
      setMagicLinkError('Нет подключения к сети. Подключитесь к интернету и попробуйте снова.');
      setMagicLinkSent(false);
      hapticWarning();
      return;
    }
    const normalized = magicEmail.trim().toLowerCase();
    if (!normalized) {
      setMagicLinkError('Введите email.');
      setMagicLinkSent(false);
      hapticWarning();
      return;
    }
    setMagicLinkError(null);
    magicLinkMutation.mutate(normalized);
  };

  const resendMagicLink = () => {
    if (!magicEmail.trim()) {
      setMagicLinkError('Введите email перед повторной отправкой.');
      hapticWarning();
      return;
    }
    submitMagicLink();
  };

  return (
    <section className="relative mx-auto w-full max-w-[430px] space-y-4 px-2 pb-24 pt-2">
      <AnimatedBackground />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="theme-surface-1 relative rounded-[28px] border p-5"
      >
        <div className="mb-2 flex justify-end">
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={toggleLoginTheme}
            className="theme-surface-subtle inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium text-ios-subtext shadow-[0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl"
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
              className="theme-surface-subtle mt-3 rounded-2xl border px-3 py-2 text-xs text-ios-subtext"
            >
              {migrationState === 'running' ? 'Переносим аккаунт из Telegram Mini App...' : null}
              {migrationState === 'error' ? 'Не удалось автоматически перенести сессию. Выполните вход вручную.' : null}
              {migrationState === 'done' ? 'Сессия успешно перенесена. Добро пожаловать.' : null}
            </motion.p>
          ) : null}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {magicLinkVerifyState !== 'idle' ? (
            <motion.p
              key={`magic-link-verify-${magicLinkVerifyState}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              className={[
                'mt-3 rounded-2xl px-3 py-2 text-xs',
                magicLinkVerifyState === 'error'
                  ? 'theme-banner-danger border'
                  : 'theme-banner-success border'
              ].join(' ')}
            >
              {magicLinkVerifyState === 'running' ? 'Подтверждаем вход по волшебной ссылке...' : null}
              {magicLinkVerifyState === 'done' ? 'Ссылка подтверждена. Входим в ваш сад...' : null}
              {magicLinkVerifyState === 'error' ? (magicLinkVerifyError ?? 'Ссылка недействительна или срок ее действия истек.') : null}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28, delay: 0.08 }}
        className="theme-surface-1 rounded-[28px] border p-4"
      >
        {!showTelegramWidget ? (
          <AuthProvidersList
            loadingProvider={activeProvider}
            disabledAll={isOffline || isMagicLinkVerifying}
            onLogin={(providerId) => {
              if (isOffline) {
                setLoginError('Нет подключения к сети. Войдите позже или используйте демо-режим.');
                hapticWarning();
                return;
              }
              impactLight();
              loginMutation.mutate(providerId);
            }}
          />
        ) : null}

        <AnimatePresence initial={false}>
          {isOffline ? (
            <motion.div
              key="offline-login-note"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              className="theme-banner-warning mt-3 rounded-2xl border px-3 py-2 text-xs"
            >
              Оффлайн: вход через провайдеры временно недоступен.
            </motion.div>
          ) : null}
        </AnimatePresence>

        {showTelegramWidget ? (
          <div className="theme-surface-2 mt-1 rounded-[24px] border p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-ios-text">Вход через Telegram</h3>
              <p className="text-xs leading-5 text-ios-subtext">
                Вы открыли приложение вне Telegram Mini App. Подтвердите вход через защищённый Telegram Widget —
                после подтверждения мы сразу создадим сессию и вернём вас в приложение.
              </p>
            </div>
            <TelegramWidgetLogin
              botUsername={telegramBotUsername}
              onAuth={(payload) => telegramWidgetMutation.mutate(payload)}
              onError={(message) => setLoginError(mapTelegramAuthError(new Error(message)))}
            />
            {loginError ? <p className="theme-banner-danger mt-3 rounded-xl border px-3 py-2 text-xs">{loginError}</p> : null}
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowTelegramWidget(false);
                  setLoginError(null);
                }}
                className="theme-surface-subtle min-h-11 rounded-full border px-4 text-sm font-medium text-ios-text transition hover:border-ios-accent/45"
              >
                Назад к способам входа
              </button>
            </div>
          </div>
        ) : null}

        {loginError && !showTelegramWidget ? (
          <p className="theme-banner-danger mt-3 rounded-xl border px-3 py-2 text-xs">{loginError}</p>
        ) : null}

        <MagicLinkForm
          email={magicEmail}
          onEmailChange={(value) => {
            setMagicEmail(value);
            if (magicLinkError) {
              setMagicLinkError(null);
            }
          }}
          onSubmit={submitMagicLink}
          onResend={resendMagicLink}
          onResetSent={() => {
            setMagicLinkSent(false);
            setMagicLinkSentToEmail(null);
            setMagicLinkExpiresAt(null);
            setMagicLinkError(null);
          }}
          loading={magicLinkMutation.isPending}
          disabled={isOffline || isMagicLinkVerifying}
          error={magicLinkError}
          sent={magicLinkSent}
          sentToEmail={magicLinkSentToEmail}
          expiresAt={magicLinkExpiresAt}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28, delay: 0.14 }}
        className="space-y-3"
      >
        {!testAuditMode ? <GuestModeButton onActivate={activateGuestMode} isOffline={isOffline} /> : null}
        <QuickTip />
        <PrivacyNote />
      </motion.div>

      <AnimatePresence>
        {successOverlay ? (
          <motion.div
            key="login-success-overlay"
            className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(10_15_20/0.24)] backdrop-blur-md"
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
              {Array.from({ length: prefersReducedMotion ? 0 : 18 }).map((_, index) => (
                <motion.span
                  key={index}
                  className="absolute text-emerald-300/85"
                  style={{
                    left: `${18 + ((index * 13) % 65)}%`,
                    top: `${20 + ((index * 11) % 58)}%`
                  }}
                  initial={{ opacity: 0, scale: 0.45, y: 0, rotate: 0 }}
                  animate={{ opacity: [0, 1, 0], scale: [0.45, 1.08, 0.88], y: [0, -34, 14], rotate: [0, index % 2 === 0 ? 26 : -26, 0] }}
                  transition={{ duration: 1.15, delay: index * 0.028, ease: 'easeOut' }}
                >
                  <Leaf className="h-3.5 w-3.5" />
                </motion.span>
              ))}
            </div>

            <motion.div
              className="pointer-events-none absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: prefersReducedMotion ? 0.12 : 0.2 }}
            >
              <motion.span
                className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/65"
                initial={{ scale: 0.35, opacity: 0.65 }}
                animate={{ scale: prefersReducedMotion ? 1 : [0.35, 1.8], opacity: [0.65, 0] }}
                transition={{ duration: prefersReducedMotion ? 0.16 : 0.72, ease: 'easeOut' }}
              />
              <motion.span
                className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-200/45"
                initial={{ scale: 0.4, opacity: 0.5 }}
                animate={{ scale: prefersReducedMotion ? 1 : [0.4, 2.2], opacity: [0.5, 0] }}
                transition={{ duration: prefersReducedMotion ? 0.16 : 0.88, ease: 'easeOut', delay: prefersReducedMotion ? 0 : 0.08 }}
              />
            </motion.div>

            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 18 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 10 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              className="theme-surface-1 mx-6 w-full max-w-[360px] rounded-3xl border p-5 text-center shadow-[0_24px_70px_rgba(16,185,129,0.18)]"
            >
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-lg shadow-[hsl(var(--primary)/0.35)]">
                <Leaf className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-[hsl(var(--primary))]">{successOverlay.title}</h3>
              <p className="mt-1 text-sm text-ios-subtext">{successOverlay.subtitle}</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
