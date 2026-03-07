import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
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
import { LoginScreen } from '@/app/auth/LoginScreen';
import { AdminScreen } from '@/app/admin-screen';
import { AdminGuard } from '@/components/AdminGuard';
import { pwaMe } from '@/lib/api';
import { hapticImpact, useTelegramThemeSync } from '@/lib/telegram';
import { useAuthStore, useUiStore } from '@/lib/store';

export function App() {
  useTelegramThemeSync();

  const { isAuthorized, isReady } = useAuthStore();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const hasAutoAuthAttemptRef = useRef(false);
  const isAndroid = typeof document !== 'undefined' && document.documentElement.classList.contains('android');
  const prefersReducedMotion = useReducedMotion();

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

  if (!isAuthorized) {
    return (
      <main className="app-shell">
        <InstallPrompt />
        <LoginScreen />
      </main>
    );
  }

  return (
    <main className="app-shell">
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
    </main>
  );
}
