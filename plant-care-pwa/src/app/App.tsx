import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { PlatformBottomNav } from '@/components/adaptive/PlatformBottomNav';
import { PlatformTopNav } from '@/components/adaptive/PlatformTopNav';
import { InstallPrompt } from '@/components/InstallPrompt';
import { OfflineStatusBar } from '@/components/OfflineStatusBar';
import { HomeScreen } from '@/app/home-screen';
import { PlantDetailSheet } from '@/app/plant-detail-sheet';
import { AddPlantScreen } from '@/app/add-plant-screen';
import { CalendarScreen } from '@/app/calendar-screen';
import { SettingsScreen } from '@/app/settings-screen';
import { AiScreen } from '@/app/ai-screen';
import { AuthPage } from '@/app/auth/AuthPage';
import { AdminScreen } from '@/app/admin-screen';
import { AdminGuard } from '@/components/AdminGuard';
import { pwaMe } from '@/lib/api';
import { hapticImpact, useTelegramThemeSync } from '@/lib/telegram';
import { useAuthStore, useUiStore } from '@/lib/store';
import { useOpenRouterModels } from '@/hooks/useOpenRouterModels';
import { applyThemeToDocument, useThemeStore } from '@/lib/theme/themeStore';

export function App() {
  useTelegramThemeSync();

  const { isAuthorized, isReady } = useAuthStore();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const selectedThemeId = useThemeStore((s) => s.selectedThemeId);
  const useSystemTheme = useThemeStore((s) => s.useSystemTheme);
  const setSystemTheme = useThemeStore((s) => s.setSystemTheme);
  const resolvedTheme = useThemeStore((s) => s.getResolvedTheme());
  const hasAutoAuthAttemptRef = useRef(false);
  const previousThemeIdRef = useRef<string | null>(null);
  const [themeTransitionTick, setThemeTransitionTick] = useState(0);
  const [themeTransitionColor, setThemeTransitionColor] = useState<string | null>(null);
  const [isLandscapeBlocked, setIsLandscapeBlocked] = useState(false);
  const isAndroid = typeof document !== 'undefined' && document.documentElement.classList.contains('android');
  const prefersReducedMotion = useReducedMotion();
  useOpenRouterModels();

  useEffect(() => {
    // T4: глобально применяем тему к CSS variables + data-theme.
    applyThemeToDocument(resolvedTheme);
  }, [resolvedTheme, selectedThemeId, useSystemTheme]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const previousThemeId = previousThemeIdRef.current;
    previousThemeIdRef.current = resolvedTheme.id;

    // На первом рендере и при reduce-motion не запускаем crossfade.
    if (!previousThemeId || previousThemeId === resolvedTheme.id || prefersReducedMotion) {
      return;
    }

    const root = document.documentElement;
    root.classList.add('theme-transition-active');
    root.dataset.themeSwitching = 'true';

    setThemeTransitionColor(resolvedTheme.palette.background);
    setThemeTransitionTick((value) => value + 1);

    const timer = window.setTimeout(() => {
      root.classList.remove('theme-transition-active');
      delete root.dataset.themeSwitching;
    }, 520);

    return () => {
      window.clearTimeout(timer);
    };
  }, [prefersReducedMotion, resolvedTheme]);

  useEffect(() => {
    if (!useSystemTheme || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      setSystemTheme();
    };
    media.addEventListener('change', handleSystemThemeChange);
    return () => {
      media.removeEventListener('change', handleSystemThemeChange);
    };
  }, [setSystemTheme, useSystemTheme]);

  const meMutation = useMutation({
    mutationFn: pwaMe,
    onSuccess: (payload) => {
      useAuthStore.getState().setAuth({
        isAuthorized: true,
        telegramUserId: payload.telegramId,
        username: payload.username,
        firstName: payload.firstName,
        email: payload.email,
        roles: payload.roles,
        isAdmin: payload.roles.includes('ROLE_ADMIN')
      });
      hapticImpact('medium');
    },
    onError: () => {
      useAuthStore.getState().clearAuth();
    }
  });

  useEffect(() => {
    if (!isReady || hasAutoAuthAttemptRef.current) {
      return;
    }
    hasAutoAuthAttemptRef.current = true;
    if (localStorage.getItem('plant-pwa-jwt')) {
      meMutation.mutate();
    }
  }, [isReady, meMutation.mutate]);

  useEffect(() => {
    if (!isAdmin && activeTab === 'admin') {
      setActiveTab('home');
    }
  }, [isAdmin, activeTab, setActiveTab]);

  useEffect(() => {
    const evaluateOrientation = () => {
      const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
      const isLandscape = window.matchMedia('(orientation: landscape)').matches;
      const compactHeight = window.innerHeight <= 560;
      setIsLandscapeBlocked(coarsePointer && isLandscape && compactHeight);
    };

    evaluateOrientation();
    window.addEventListener('resize', evaluateOrientation, { passive: true });
    window.addEventListener('orientationchange', evaluateOrientation);
    return () => {
      window.removeEventListener('resize', evaluateOrientation);
      window.removeEventListener('orientationchange', evaluateOrientation);
    };
  }, []);

  if (!isAuthorized) {
    return (
      <main className="app-shell">
        <InstallPrompt />
        <AuthPage />
        {isLandscapeBlocked ? <LandscapeOrientationOverlay /> : null}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <AnimatePresence>
        {!prefersReducedMotion && themeTransitionColor ? (
          <motion.div
            key={`${resolvedTheme.id}-${themeTransitionTick}`}
            className="theme-crossfade-layer"
            style={{ backgroundColor: themeTransitionColor }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.16, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
          />
        ) : null}
      </AnimatePresence>

      <InstallPrompt />
      <OfflineStatusBar />
      <PlatformTopNav tab={activeTab} />

      <AnimatePresence mode="wait">
        <motion.section
          key={activeTab}
          className="space-y-4 pb-5"
          initial={prefersReducedMotion ? { opacity: 1 } : isAndroid ? { opacity: 0, scale: 0.985 } : { opacity: 0, x: 26 }}
          animate={prefersReducedMotion ? { opacity: 1 } : isAndroid ? { opacity: 1, scale: 1 } : { opacity: 1, x: 0 }}
          exit={prefersReducedMotion ? { opacity: 1 } : isAndroid ? { opacity: 0, scale: 0.99 } : { opacity: 0, x: -18 }}
          transition={prefersReducedMotion
            ? { duration: 0.01 }
            : isAndroid
              ? { duration: 0.26, ease: [0.2, 0, 0, 1] }
              : { type: 'spring', stiffness: 380, damping: 31, mass: 1 }}
        >
          {activeTab === 'home' ? (
            <HomeScreen />
          ) : null}

          {activeTab === 'calendar' ? (
            <CalendarScreen />
          ) : null}

          {activeTab === 'add' ? (
            <AddPlantScreen />
          ) : null}

          {activeTab === 'ai' ? (
            <AiScreen />
          ) : null}

          {activeTab === 'settings' ? (
            <SettingsScreen />
          ) : null}

          {activeTab === 'admin' ? (
            <AdminGuard>
              <AdminScreen />
            </AdminGuard>
          ) : null}

        </motion.section>
      </AnimatePresence>

      <div className="mt-auto pt-2">
        <PlatformBottomNav />
      </div>

      <PlantDetailSheet />
      {isLandscapeBlocked ? <LandscapeOrientationOverlay /> : null}
    </main>
  );
}

function LandscapeOrientationOverlay() {
  return (
    <div className="fixed inset-0 z-[120] flex min-h-[100dvh] w-screen items-center justify-center bg-black/85 px-6 text-center text-white">
      <div className="max-w-sm space-y-2 rounded-2xl border border-white/20 bg-black/35 p-5 backdrop-blur-sm">
        <h2 className="text-lg font-semibold">Портретный режим</h2>
        <p className="text-sm text-white/80">
          Для стабильной работы Plant Bot поверните устройство вертикально.
        </p>
      </div>
    </div>
  );
}
