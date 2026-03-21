import { motion } from 'framer-motion';
import { CalendarDays, Leaf, MessageCircle, PlusCircle, Settings } from 'lucide-react';

import { cn } from '@/lib/cn';
import { selection } from '@/lib/haptics';
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
              selection();
            }}
            className={cn(
              'touch-target relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-ios-tab px-1 py-1.5 text-[10px] transition-colors max-[359px]:px-0.5 max-[359px]:py-1 android:rounded-[16px] android:py-2 android:text-[11px]',
              isActive ? 'text-ios-accent' : 'text-ios-subtext'
            )}
            aria-label={tab.title}
          >
            {isActive ? (
              <motion.span
                layoutId={isAndroid ? 'android-tab-active' : 'ios-tab-active'}
                className={cn(
                  'absolute inset-0 rounded-ios-tab',
                  'bg-[hsl(var(--primary)/0.18)]'
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
              <Icon className="h-5 w-5 max-[359px]:h-[18px] max-[359px]:w-[18px]" />
            </motion.span>
            <span className="relative z-10 mt-1 leading-none whitespace-nowrap max-[359px]:mt-0.5 max-[359px]:text-[8px]">
              {tab.title}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
