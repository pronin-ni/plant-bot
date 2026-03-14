import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';

type Tone = 'default' | 'emerald' | 'amber' | 'red' | 'blue';

const toneClasses: Record<Tone, { badge: string; border: string; bg: string; icon: string }> = {
  default: {
    badge: 'theme-surface-subtle text-ios-subtext',
    border: 'border-ios-border/60',
    bg: 'theme-surface-1',
    icon: 'text-ios-accent'
  },
  emerald: {
    badge: 'theme-badge-success',
    border: 'border-emerald-500/25',
    bg: 'theme-banner-success',
    icon: 'text-emerald-500'
  },
  amber: {
    badge: 'theme-badge-warning',
    border: 'border-amber-500/25',
    bg: 'theme-banner-warning',
    icon: 'text-amber-500'
  },
  red: {
    badge: 'theme-badge-danger',
    border: 'border-red-500/25',
    bg: 'theme-banner-danger',
    icon: 'text-red-500'
  },
  blue: {
    badge: 'theme-badge-info',
    border: 'border-sky-500/25',
    bg: 'theme-badge-info',
    icon: 'text-sky-500'
  }
};

interface SettingsAccordionProps {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  open: boolean;
  onToggle: (id: string) => void;
  tone?: Tone;
  statusBadge?: string | null;
  children: ReactNode;
}

export function SettingsAccordion({
  id,
  title,
  description,
  icon: Icon,
  open,
  onToggle,
  tone = 'default',
  statusBadge = null,
  children
}: SettingsAccordionProps) {
  const toneCls = toneClasses[tone];

  return (
    <section className={`ios-blur-card overflow-hidden border ${toneCls.border} ${toneCls.bg}`}>
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="android-ripple flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className={`theme-surface-subtle inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border ${toneCls.icon}`}>
          <Icon className="h-4 w-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ios-text">{title}</span>
          <span className="mt-0.5 block truncate text-xs text-ios-subtext">{description}</span>
        </span>

        {statusBadge ? (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneCls.badge}`}>{statusBadge}</span>
        ) : null}

        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 26 }}
          className="text-ios-subtext"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.85 }}
            className="overflow-hidden"
          >
            <div className="border-t border-ios-border/55 px-4 pb-4 pt-3">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
