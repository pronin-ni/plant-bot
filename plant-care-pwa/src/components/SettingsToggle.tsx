import { motion } from 'framer-motion';

interface SettingsToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

export function SettingsToggle({
  label,
  description,
  checked,
  onChange,
  disabled = false
}: SettingsToggleProps) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className="android-ripple flex w-full items-center justify-between gap-3 rounded-2xl border border-ios-border/60 bg-white/60 px-3 py-2 text-left disabled:opacity-60 dark:border-emerald-500/20 dark:bg-zinc-900/60"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ios-text">{label}</span>
        {description ? <span className="block text-xs text-ios-subtext">{description}</span> : null}
      </span>

      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${checked ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          className="h-5 w-5 rounded-full bg-white shadow-sm"
          style={{ x: checked ? 20 : 0 }}
        />
      </span>
    </button>
  );
}
