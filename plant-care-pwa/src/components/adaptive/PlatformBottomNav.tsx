import { motion } from 'framer-motion';
import { CalendarDays, Leaf, MessageCircle, PlusCircle, Settings } from 'lucide-react';

import { cn } from '@/lib/cn';
import { hapticSelectionChanged } from '@/lib/telegram';
import { useUiStore } from '@/lib/store';
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
  { key: 'settings', title: 'Настройки', icon: Settings }
];

export function PlatformBottomNav() {
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const isAndroid = typeof document !== 'undefined' && document.documentElement.classList.contains('android');

  return (
    <nav className="ios-tabbar android-bottom-nav">
      {TABS.map((tab) => {
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
              'relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-ios-tab px-1 py-1.5 text-[10px] transition-colors android:rounded-[16px] android:py-2 android:text-[11px]',
              isActive ? 'text-ios-accent' : 'text-ios-subtext android:text-[#5F6368]'
            )}
            aria-label={tab.title}
          >
            {isActive ? (
              <motion.span
                layoutId={isAndroid ? 'android-tab-active' : 'ios-tab-active'}
                className={cn(
                  'absolute inset-0 rounded-ios-tab',
                  isAndroid ? 'bg-[#4CAF50]/18' : 'bg-ios-accent/12'
                )}
                transition={isAndroid
                  ? { duration: 0.24, ease: [0.2, 0, 0, 1] }
                  : { type: 'spring', stiffness: 360, damping: 28, mass: 1 }}
              />
            ) : null}
            <motion.span
              className="relative z-10"
              animate={isAndroid
                ? { y: 0, scale: isActive ? 1.02 : 1 }
                : { y: isActive ? -3 : 0, scale: isActive ? 1.08 : 1 }}
              transition={isAndroid
                ? { duration: 0.2, ease: [0.2, 0, 0, 1] }
                : { type: 'spring', stiffness: 340, damping: 27, mass: 1 }}
            >
              <Icon className={cn('h-5 w-5', isAndroid && isActive ? 'text-[#2E7D32]' : '')} />
            </motion.span>
            <span className="relative z-10 mt-1 leading-none whitespace-nowrap">{tab.title}</span>
          </button>
        );
      })}
    </nav>
  );
}

