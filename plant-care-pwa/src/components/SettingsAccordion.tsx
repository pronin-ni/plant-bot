import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';

type Tone = 'default' | 'emerald' | 'amber' | 'red' | 'blue';

const toneClasses: Record<Tone, { badge: string; border: string; bg: string; icon: string }> = {
  default: {
    badge: 'bg-black/5 text-ios-subtext dark:bg-white/10',
    border: 'border-ios-border/60 dark:border-emerald-500/20',
    bg: 'bg-white/60 dark:bg-zinc-950/55',
    icon: 'text-ios-accent'
  },
  emerald: {
    badge: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-500/25',
    bg: 'bg-emerald-500/8 dark:bg-emerald-500/10',
    icon: 'text-emerald-500'
  },
  amber: {
    badge: 'bg-amber-500/12 text-amber-800 dark:text-amber-200',
    border: 'border-amber-500/25',
    bg: 'bg-amber-500/8 dark:bg-amber-500/10',
    icon: 'text-amber-500'
  },
  red: {
    badge: 'bg-red-500/12 text-red-700 dark:text-red-300',
    border: 'border-red-500/25',
    bg: 'bg-red-500/8 dark:bg-red-500/10',
    icon: 'text-red-500'
  },
  blue: {
    badge: 'bg-sky-500/12 text-sky-700 dark:text-sky-200',
    border: 'border-sky-500/25',
    bg: 'bg-sky-500/8 dark:bg-sky-500/10',
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
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-ios-border/60 bg-white/70 ${toneCls.icon}`}>
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
            <div className="border-t border-ios-border/55 px-4 pb-4 pt-3 dark:border-emerald-500/15">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
