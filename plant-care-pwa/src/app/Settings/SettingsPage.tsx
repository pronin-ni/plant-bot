import { useMemo, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  Bot,
  CalendarSync,
  ChevronRight,
  Cloud,
  Download,
  HardDrive,
  Home,
  Info,
  LifeBuoy,
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
import { OpenRouterSettings } from '@/components/OpenRouterSettings';
import { hapticImpact } from '@/lib/telegram';
import { useAuthStore, useUiStore } from '@/lib/store';
import {
  AppStatusPanel,
  BackupsPanel,
  CalendarPanel,
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
        id: 'notifications',
        title: 'Уведомления',
        subtitle: 'Web Push, время и вибро-паттерн',
        icon: Bell,
        detailId: 'notifications',
        action: 'dialog'
      },
      {
        id: 'weather',
        title: 'Город и погода',
        subtitle: 'Провайдер и предпросмотр прогноза',
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
        title: 'OpenRouter',
        subtitle: 'Глобальные AI-модели (только админ)',
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
  weather: {
    title: 'Город и погода',
    description: 'Выбор провайдера и предпросмотр текущих условий.'
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
    title: 'OpenRouter',
    description: 'Глобальные модели и тесты для всей системы.'
  }
};

export function SettingsPage() {
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  const [activeDetail, setActiveDetail] = useState<SettingsDetailId | null>(null);

  const handleRefresh = async () => {
    hapticImpact('light');
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
    hapticImpact('light');

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

  return (
    <PlatformPullToRefresh onRefresh={handleRefresh}>
      <section className="settings-premium-shell space-y-6 pb-[calc(7rem+env(safe-area-inset-bottom))]">
        <header className="space-y-2 px-1">
          <p className="text-ios-caption uppercase tracking-wide text-ios-subtext">Настройки</p>
          <h2 className="platform-top-title">Коротко и по делу</h2>
          <p className="platform-top-subtitle text-sm">Навигационный экран: открывайте только нужный раздел, без длинной простыни.</p>
        </header>

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
      </section>
    </PlatformPullToRefresh>
  );
}

function SettingsGroupCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <p className="px-1 text-[12px] font-medium uppercase tracking-wide text-ios-subtext">{title}</p>
      <div className="overflow-hidden rounded-2xl border border-ios-border/60 bg-white/72 shadow-[0_10px_28px_rgba(15,23,42,0.08)] backdrop-blur-ios dark:bg-zinc-950/62">
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
      className={`touch-target android-ripple flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors duration-200 ease-out active:bg-black/[0.03] dark:active:bg-white/[0.04] ${withDivider ? 'border-b border-ios-border/50' : ''}`}
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-ios-border/60 bg-white/85 text-ios-accent shadow-sm dark:bg-zinc-900/75">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1 pr-1">
        <span className="block break-words text-[15px] font-medium leading-5 text-ios-text">{item.title}</span>
        <span className="mt-0.5 block break-words text-xs leading-[1.2rem] text-ios-subtext">{item.subtitle}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-ios-subtext/85" />
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
      className="fixed inset-0 z-50 flex min-h-[100dvh] w-screen overflow-hidden bg-black/30 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      onClick={() => onClose()}
    >
      <motion.div
        className="relative ml-auto flex h-[100dvh] w-screen max-w-none flex-col overflow-hidden bg-white dark:bg-zinc-950"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+10px)] pb-3 shadow-sm">
          <button
            type="button"
            className="touch-target inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-slate-100 text-ios-text dark:bg-zinc-900"
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

        <div className="mt-3 flex-1 space-y-4 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+22px)]">
          {detailId === 'theme' ? <ThemeSelector /> : null}
          {detailId === 'notifications' ? <NotificationsPanel /> : null}
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
