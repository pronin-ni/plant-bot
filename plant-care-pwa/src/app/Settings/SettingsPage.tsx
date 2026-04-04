import { useEffect, useMemo, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  SmartphoneNfc,
  Bot,
  CalendarSync,
  ChevronRight,
  Cloud,
  Download,
  HardDrive,
  Home,
  Info,
  LifeBuoy,
  LogOut,
  Palette,
  Settings2,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  Upload,
  Waves
} from 'lucide-react';

import { PlatformPullToRefresh } from '@/components/adaptive/PlatformPullToRefresh';
import { ThemeSelector } from '@/components/settings/ThemeSelector';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { OpenRouterSettings } from '@/components/OpenRouterSettings';
import { impactLight, impactMedium, selection, success as hapticSuccess } from '@/lib/haptics';
import { useAuthStore, useUiStore } from '@/lib/store';
import {
  AppStatusPanel,
  BackupsPanel,
  CalendarPanel,
  HapticsPanel,
  DiagnosticsPanel,
  ExportDataPanel,
  HomeAssistantPanel,
  ImportDataPanel,
  NotificationsPanel,
  PwaInstallPanel,
  SupportPanel,
  VersionPanel,
  WeatherPanel
} from '@/app/Settings/panels';

type SettingsDetailId =
  | 'theme'
  | 'notifications'
  | 'haptics'
  | 'weather'
  | 'home-assistant'
  | 'calendar'
  | 'export-data'
  | 'import-data'
  | 'backups'
  | 'install-pwa'
  | 'app-status'
  | 'diagnostics'
  | 'version'
  | 'support'
  | 'openrouter';

interface SettingsItem {
  id: string;
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  detailId?: SettingsDetailId;
  adminOnly?: boolean;
  action?: 'dialog' | 'admin-tab' | 'ai-tab';
}

interface SettingsGroup {
  id: string;
  title: string;
  items: SettingsItem[];
}

const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: 'general',
    title: 'Общие',
    items: [
      {
        id: 'theme',
        title: 'Тема оформления',
        subtitle: 'Светлая, тёмная, ботаническая палитра',
        icon: Palette,
        detailId: 'theme',
        action: 'dialog'
      },
      {
        id: 'haptics',
        title: 'Виброотклик',
        subtitle: 'Включение haptic feedback и быстрый preview',
        icon: SmartphoneNfc,
        detailId: 'haptics',
        action: 'dialog'
      },
      {
        id: 'notifications',
        title: 'Уведомления',
        subtitle: 'Web Push, время и вибро-паттерн',
        icon: Bell,
        detailId: 'notifications',
        action: 'dialog'
      },
      {
        id: 'weather',
        title: 'Погода и город',
        subtitle: 'Город, автоисточник и предпросмотр прогноза',
        icon: Cloud,
        detailId: 'weather',
        action: 'dialog'
      }
    ]
  },
  {
    id: 'integrations',
    title: 'Интеграции',
    items: [
      {
        id: 'ha',
        title: 'Home Assistant',
        subtitle: 'Подключение датчиков и автоматики',
        icon: Home,
        detailId: 'home-assistant',
        action: 'dialog'
      },
      {
        id: 'calendar',
        title: 'Календарь',
        subtitle: 'Синхронизация событий полива (ICS)',
        icon: CalendarSync,
        detailId: 'calendar',
        action: 'dialog'
      },
      {
        id: 'ai-diagnostics',
        title: 'AI диагностика',
        subtitle: 'Переход в чат и фото-диагностику',
        icon: Bot,
        action: 'ai-tab'
      }
    ]
  },
  {
    id: 'data',
    title: 'Данные',
    items: [
      {
        id: 'export',
        title: 'Экспорт данных',
        subtitle: 'Скачать JSON-экспорт растений',
        icon: Download,
        detailId: 'export-data',
        action: 'dialog'
      },
      {
        id: 'import',
        title: 'Импорт данных',
        subtitle: 'Импорт данных из JSON-файла',
        icon: Upload,
        detailId: 'import-data',
        action: 'dialog'
      },
      {
        id: 'backups',
        title: 'Резервные копии',
        subtitle: 'Серверные бэкапы (только админ)',
        icon: HardDrive,
        detailId: 'backups',
        action: 'dialog'
      }
    ]
  },
  {
    id: 'app',
    title: 'Приложение',
    items: [
      {
        id: 'install',
        title: 'Установка PWA',
        subtitle: 'Добавить на экран Домой',
        icon: Smartphone,
        detailId: 'install-pwa',
        action: 'dialog'
      },
      {
        id: 'status',
        title: 'Статус приложения',
        subtitle: 'Сеть, сервис-воркер, версия',
        icon: Waves,
        detailId: 'app-status',
        action: 'dialog'
      },
      {
        id: 'diagnostics',
        title: 'Диагностика',
        subtitle: 'Быстрый runtime smoke устройства',
        icon: Stethoscope,
        detailId: 'diagnostics',
        action: 'dialog'
      }
    ]
  },
  {
    id: 'about',
    title: 'О приложении',
    items: [
      {
        id: 'version',
        title: 'Версия',
        subtitle: 'Сборка и окружение',
        icon: Info,
        detailId: 'version',
        action: 'dialog'
      },
      {
        id: 'support',
        title: 'Поддержка',
        subtitle: 'Контакты и полезные ссылки',
        icon: LifeBuoy,
        detailId: 'support',
        action: 'dialog'
      }
    ]
  },
  {
    id: 'developer',
    title: 'Developer',
    items: [
      {
        id: 'openrouter',
        title: 'AI Providers',
        subtitle: 'Провайдеры, модели и AI аналитика (только админ)',
        icon: Settings2,
        detailId: 'openrouter',
        action: 'dialog',
        adminOnly: true
      },
      {
        id: 'admin',
        title: 'Администрирование',
        subtitle: 'Пользователи, бэкапы, мониторинг',
        icon: ShieldCheck,
        action: 'admin-tab',
        adminOnly: true
      }
    ]
  }
];

const DETAIL_META: Record<SettingsDetailId, { title: string; description: string }> = {
  theme: {
    title: 'Тема оформления',
    description: 'Переключение палитры применяется сразу и сохраняется на устройстве.'
  },
  notifications: {
    title: 'Уведомления',
    description: 'Настройте push-подписку, время и тактильный паттерн.'
  },
  haptics: {
    title: 'Виброотклик',
    description: 'Включите haptic feedback для значимых действий и проверьте его на этом устройстве.'
  },
  weather: {
    title: 'Город и погода',
    description: 'Выберите город и проверьте автоматический погодный источник.'
  },
  'home-assistant': {
    title: 'Home Assistant',
    description: 'Подключите HA для датчиков и автоматизации ухода.'
  },
  calendar: {
    title: 'Календарь',
    description: 'Включите ICS-синхронизацию для внешнего календаря.'
  },
  'export-data': {
    title: 'Экспорт данных',
    description: 'Скачайте актуальную копию растений в JSON.'
  },
  'import-data': {
    title: 'Импорт данных',
    description: 'Восстановите растения из JSON-файла экспорта.'
  },
  backups: {
    title: 'Резервные копии',
    description: 'Создайте серверный бэкап (доступно только администратору).'
  },
  'install-pwa': {
    title: 'Установка PWA',
    description: 'Установите приложение на домашний экран.'
  },
  'app-status': {
    title: 'Статус приложения',
    description: 'Проверьте текущее состояние клиента.'
  },
  diagnostics: {
    title: 'Диагностика',
    description: 'Быстрая проверка ключевых возможностей браузера.'
  },
  version: {
    title: 'Версия',
    description: 'Текущая версия сборки и среды.'
  },
  support: {
    title: 'Поддержка',
    description: 'Куда писать, если нужна помощь.'
  },
  openrouter: {
    title: 'AI Providers',
    description: 'Активные AI провайдеры, модели и операционная аналитика запросов.'
  }
};

export function SettingsPage() {
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const email = useAuthStore((s) => s.email);
  const username = useAuthStore((s) => s.username);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  const [activeDetail, setActiveDetail] = useState<SettingsDetailId | null>(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  useEffect(() => {
    const isOpen = activeDetail !== null || logoutConfirmOpen;
    if (isOpen) {
      document.body.classList.add('sheet-open');
      document.body.style.overflow = 'hidden';
    } else {
      document.body.classList.remove('sheet-open');
      document.body.style.overflow = '';
    }
    return () => {
      document.body.classList.remove('sheet-open');
      document.body.style.overflow = '';
    };
  }, [activeDetail, logoutConfirmOpen]);

  const handleRefresh = async () => {
    impactLight();
    await queryClient.invalidateQueries();
    await queryClient.refetchQueries({ type: 'active' });
  };

  const visibleGroups = useMemo(() => {
    return SETTINGS_GROUPS
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => (item.adminOnly ? isAdmin : true))
      }))
      .filter((group) => group.items.length > 0);
  }, [isAdmin]);

  const openDetail = (item: SettingsItem) => {
    selection();

    if (item.action === 'admin-tab') {
      setActiveTab('admin');
      return;
    }

    if (item.action === 'ai-tab') {
      setActiveTab('ai');
      return;
    }

    if (item.detailId) {
      setActiveDetail(item.detailId);
    }
  };

  const handleLogout = async () => {
    hapticSuccess();
    clearAuth();
    setActiveDetail(null);
    setLogoutConfirmOpen(false);
    setActiveTab('home');
    await queryClient.cancelQueries();
    queryClient.clear();
    const logoutTarget = new URL(import.meta.env.BASE_URL || '/', window.location.origin);
    window.location.replace(logoutTarget.toString());
  };

  return (
    <PlatformPullToRefresh onRefresh={handleRefresh} disabled={Boolean(activeDetail)}>
      <section className="settings-premium-shell space-y-6 pb-[calc(7rem+env(safe-area-inset-bottom))]">
        {visibleGroups.map((group) => (
          <SettingsGroupCard key={group.id} title={group.title}>
            {group.items.map((item, index) => (
              <SettingsRow
                key={item.id}
                item={item}
                onClick={() => openDetail(item)}
                withDivider={index < group.items.length - 1}
              />
            ))}
          </SettingsGroupCard>
        ))}

        <section className="space-y-2.5">
          <p className="px-1 text-[12px] font-medium uppercase tracking-wide text-ios-subtext">Сессия</p>
          <div className="theme-surface-1 rounded-2xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-semibold text-ios-text">{email ?? username ?? 'Аккаунт Plant Bot'}</p>
                <p className="mt-1 text-xs leading-5 text-ios-subtext">
                  Выход очистит текущую сессию на этом устройстве. После этого защищённые разделы снова потребуют вход.
                </p>
              </div>
              <span className="theme-surface-subtle inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-[hsl(var(--destructive))]">
                <LogOut className="h-5 w-5" />
              </span>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => {
                  impactMedium();
                  setLogoutConfirmOpen(true);
                }}
                className="theme-badge-danger touch-target inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-medium transition hover:border-[hsl(var(--destructive)/0.34)]"
              >
                <LogOut className="h-4 w-4" />
                Выйти из аккаунта
              </button>
            </div>
          </div>
        </section>

        <AnimatePresence>
          {activeDetail ? (
            <SettingsDetailDialog
              key={activeDetail}
              detailId={activeDetail}
              isAdmin={isAdmin}
              onClose={() => setActiveDetail(null)}
            />
          ) : null}
        </AnimatePresence>

        <Dialog
          open={logoutConfirmOpen}
          onOpenChange={setLogoutConfirmOpen}
          title="Выйти из аккаунта?"
          description="Мы очистим текущую сессию на этом устройстве и вернём вас на экран входа."
        >
          <div className="space-y-3">
            <p className="theme-banner-warning rounded-2xl border px-3 py-2 text-xs">
              После выхода защищённые разделы снова потребуют авторизацию.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setLogoutConfirmOpen(false)}
              >
                Отмена
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="flex-1"
                onClick={() => void handleLogout()}
              >
                Выйти
              </Button>
            </div>
          </div>
        </Dialog>
      </section>
    </PlatformPullToRefresh>
  );
}

function SettingsGroupCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <p className="px-1 text-[12px] font-medium uppercase tracking-wide text-ios-subtext">{title}</p>
      <div className="theme-surface-1 overflow-hidden rounded-2xl border">
        {children}
      </div>
    </section>
  );
}

function SettingsRow({ item, withDivider, onClick }: { item: SettingsItem; withDivider: boolean; onClick: () => void }) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`android-ripple flex w-full items-start gap-3.5 px-4 py-3.5 text-left transition-colors duration-200 ease-out active:bg-[hsl(var(--foreground)/0.04)] ${withDivider ? 'border-b border-ios-border/50' : ''}`}
    >
      <span className="theme-surface-subtle mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-ios-accent shadow-sm">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1 self-center pr-1">
        <span className="block break-words text-[15px] font-medium leading-5 text-ios-text">{item.title}</span>
        <span className="mt-1 block break-words text-xs leading-[1.2rem] text-ios-subtext">{item.subtitle}</span>
      </span>
      <ChevronRight className="mt-1 h-5 w-5 shrink-0 self-start text-ios-subtext/85" />
    </button>
  );
}

function SettingsDetailDialog({
  detailId,
  isAdmin,
  onClose
}: {
  detailId: SettingsDetailId | null;
  isAdmin: boolean;
  onClose: () => void;
}) {
  if (!detailId) return null;
  const meta = DETAIL_META[detailId];

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex min-h-[100dvh] w-full max-w-full overflow-hidden bg-[rgb(10_15_20/0.32)] backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      onClick={() => onClose()}
    >
      <motion.div
        className="relative ml-auto flex h-[100dvh] w-full min-w-0 max-w-none flex-col overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))] md:w-[min(92vw,760px)] md:max-w-[760px] md:border-l md:border-[hsl(var(--border)/0.45)] md:shadow-[-18px_0_40px_rgb(0_0_0/0.12)]"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-[hsl(var(--border)/0.55)] px-4 pt-[calc(env(safe-area-inset-top)+10px)] pb-3 shadow-sm">
          <button
            type="button"
            className="theme-surface-subtle touch-target inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border text-ios-text"
            onClick={onClose}
            aria-label="Назад"
          >
            ←
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-ios-subtext">Настройки</p>
            <h3 className="truncate text-lg font-semibold text-ios-text">{meta.title}</h3>
          </div>
        </header>

        {meta.description ? (
          <p className="px-4 pt-3 text-sm text-ios-subtext">{meta.description}</p>
        ) : null}

        <div className="mt-3 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 pb-[calc(env(safe-area-inset-bottom)+22px)]">
          {detailId === 'theme' ? <ThemeSelector /> : null}
          {detailId === 'notifications' ? <NotificationsPanel /> : null}
          {detailId === 'haptics' ? <HapticsPanel /> : null}
          {detailId === 'weather' ? <WeatherPanel /> : null}
          {detailId === 'home-assistant' ? <HomeAssistantPanel /> : null}
          {detailId === 'calendar' ? <CalendarPanel /> : null}
          {detailId === 'export-data' ? <ExportDataPanel /> : null}
          {detailId === 'import-data' ? <ImportDataPanel /> : null}
          {detailId === 'backups' ? <BackupsPanel /> : null}
          {detailId === 'install-pwa' ? <PwaInstallPanel /> : null}
          {detailId === 'app-status' ? <AppStatusPanel /> : null}
          {detailId === 'diagnostics' ? <DiagnosticsPanel /> : null}
          {detailId === 'version' ? <VersionPanel /> : null}
          {detailId === 'support' ? <SupportPanel /> : null}
          {detailId === 'openrouter' && isAdmin ? <OpenRouterSettings /> : null}
        </div>
      </motion.div>
    </motion.div>
  );
}
