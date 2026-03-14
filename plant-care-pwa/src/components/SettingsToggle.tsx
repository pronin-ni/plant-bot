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
      className="android-ripple theme-surface-2 flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left disabled:opacity-60"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ios-text">{label}</span>
        {description ? <span className="block text-xs text-ios-subtext">{description}</span> : null}
      </span>

      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition ${
          checked
            ? 'border-[hsl(var(--primary)/0.28)] bg-[hsl(var(--primary))]'
            : 'border-[hsl(var(--border)/0.72)] bg-[hsl(var(--secondary))]'
        }`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          className="h-5 w-5 rounded-full bg-[hsl(var(--primary-foreground))] shadow-sm"
          style={{ x: checked ? 20 : 0 }}
        />
      </span>
    </button>
  );
}
