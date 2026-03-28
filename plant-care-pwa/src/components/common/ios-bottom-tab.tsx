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

export function IOSBottomTab() {
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const tabs = TABS;

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
              selection();
            }}
            className={cn(
              'relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-ios-tab px-1 py-1.5 text-[10px] transition-colors',
              isActive ? 'text-ios-accent' : 'text-ios-subtext'
            )}
            aria-label={tab.title}
          >
            {isActive ? (
              <motion.span
                layoutId="ios-tab-active"
                className="absolute inset-0 rounded-ios-tab bg-ios-accent/18"
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
            <span className="relative z-10 mt-1 leading-none whitespace-nowrap">{tab.title}</span>
          </button>
        );
      })}
    </nav>
  );
}
