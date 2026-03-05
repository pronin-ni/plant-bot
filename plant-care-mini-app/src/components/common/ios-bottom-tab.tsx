import { motion } from 'framer-motion';
import { CalendarDays, Leaf, MessageCircle, PlusCircle, Settings, ShieldCheck } from 'lucide-react';

import { cn } from '@/lib/cn';
import { hapticSelectionChanged } from '@/lib/telegram';
import { useAuthStore, useUiStore } from '@/lib/store';
import type { AppTabKey } from '@/types/navigation';

interface TabItem {
  key: AppTabKey;
  title: string;
  icon: typeof Leaf;
}

const TABS: TabItem[] = [
  { key: 'home', title: 'Растения', icon: Leaf },
  { key: 'calendar', title: 'Календарь', icon: CalendarDays },
  { key: 'add', title: 'Добавить', icon: PlusCircle },
  { key: 'ai', title: 'AI', icon: MessageCircle },
  { key: 'admin', title: 'Админ', icon: ShieldCheck },
  { key: 'settings', title: 'Настройки', icon: Settings }
];

export function IOSBottomTab() {
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const tabs = isAdmin ? TABS : TABS.filter((tab) => tab.key !== 'admin');

  return (
    <nav className="ios-tabbar">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setActiveTab(tab.key);
              hapticSelectionChanged();
            }}
            className={cn(
              'relative flex min-w-[74px] flex-col items-center justify-center rounded-ios-tab px-2 py-2 text-ios-caption transition-colors',
              isActive ? 'text-ios-accent' : 'text-ios-subtext'
            )}
            aria-label={tab.title}
          >
            {isActive ? (
              <motion.span
                layoutId="ios-tab-active"
                className="absolute inset-0 rounded-ios-tab bg-ios-accent/12"
                transition={{ type: 'spring', stiffness: 360, damping: 28, mass: 1 }}
              />
            ) : null}
            <motion.span
              className="relative z-10"
              animate={{ y: isActive ? -3 : 0, scale: isActive ? 1.08 : 1 }}
              transition={{ type: 'spring', stiffness: 340, damping: 27, mass: 1 }}
            >
              <Icon className="h-5 w-5" />
            </motion.span>
            <span className="relative z-10 mt-1 leading-none">{tab.title}</span>
          </button>
        );
      })}
    </nav>
  );
}
