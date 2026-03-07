import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { IOSBottomTab } from '@/components/common/ios-bottom-tab';
import { InstallPrompt } from '@/components/InstallPrompt';
import { OfflineStatusBar } from '@/components/OfflineStatusBar';
import { AdminGuard } from '@/components/AdminGuard';
import { HomeScreen } from '@/app/home-screen';
import { PlantDetailSheet } from '@/app/plant-detail-sheet';
import { AddPlantScreen } from '@/app/add-plant-screen';
import { CalendarScreen } from '@/app/calendar-screen';
import { SettingsScreen } from '@/app/settings-screen';
import { AiScreen } from '@/app/ai-screen';
import { AdminScreen } from '@/app/admin-screen';
import { LoginScreen } from '@/app/auth/LoginScreen';
import { pwaMe } from '@/lib/api';
import { hapticImpact, useTelegramThemeSync } from '@/lib/telegram';
import { useAuthStore, useUiStore } from '@/lib/store';
import type { AppTabKey } from '@/types/navigation';

function TabTitle({ tab }: { tab: AppTabKey }) {
  switch (tab) {
    case 'home':
      return (
        <div className="mb-5 mt-1">
          <h1 className="text-ios-large-title text-ios-text">Мои Растения</h1>
          <p className="mt-2 text-ios-body text-ios-subtext">Главный экран с карточками растений и быстрым поливом.</p>
        </div>
      );
    case 'calendar':
      return (
        <div className="mb-5 mt-1">
          <h1 className="text-ios-large-title text-ios-text">Календарь</h1>
          <p className="mt-2 text-ios-body text-ios-subtext">План поливов и напоминания по датам.</p>
        </div>
      );
    case 'add':
      return (
        <div className="mb-5 mt-1">
          <h1 className="text-ios-large-title text-ios-text">Добавить</h1>
          <p className="mt-2 text-ios-body text-ios-subtext">Новый мастер добавления растений в стиле iOS sheet.</p>
        </div>
      );
    case 'ai':
      return (
        <div className="mb-5 mt-1">
          <h1 className="text-ios-large-title text-ios-text">AI-ассистент</h1>
          <p className="mt-2 text-ios-body text-ios-subtext">Вопросы по садоводству и уходу за растениями.</p>
        </div>
      );
    case 'settings':
      return (
        <div className="mb-5 mt-1">
          <h1 className="text-ios-large-title text-ios-text">Настройки</h1>
          <p className="mt-2 text-ios-body text-ios-subtext">Параметры приложения, города и уведомлений.</p>
        </div>
      );
    case 'admin':
      return (
        <div className="mb-5 mt-1">
          <h1 className="text-ios-large-title text-ios-text">Админ</h1>
          <p className="mt-2 text-ios-body text-ios-subtext">Системная статистика, пользователи и растения.</p>
        </div>
      );
    default:
      return null;
  }
}

export function App() {
  useTelegramThemeSync();

  const { isAuthorized, isReady } = useAuthStore();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const hasAutoAuthAttemptRef = useRef(false);

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
    if (activeTab === 'admin' && !isAdmin) {
      setActiveTab('home');
    }
  }, [activeTab, isAdmin, setActiveTab]);

  if (!isAuthorized) {
    return (
      <main className="app-shell">
        <LoginScreen />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <InstallPrompt />
      <OfflineStatusBar />
      <TabTitle tab={activeTab} />

      <AnimatePresence mode="wait">
        <motion.section
          key={activeTab}
          className="space-y-4 pb-5"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28, mass: 1 }}
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
        <IOSBottomTab />
      </div>

      <PlantDetailSheet />
    </main>
  );
}
