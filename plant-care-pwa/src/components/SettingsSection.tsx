import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface SettingsSectionProps {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  open: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}

export function SettingsSection({
  id,
  title,
  description,
  icon: Icon,
  open,
  onToggle,
  children
}: SettingsSectionProps) {
  return (
    <section className="ios-blur-card overflow-hidden border border-ios-border/60 bg-white/60 dark:border-emerald-500/20 dark:bg-zinc-950/55">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="android-ripple flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-ios-border/60 bg-white/70 text-ios-accent dark:bg-zinc-900/60">
          <Icon className="h-4 w-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ios-text">{title}</span>
          <span className="mt-0.5 block truncate text-xs text-ios-subtext">{description}</span>
        </span>

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
