import { motion } from 'framer-motion';
import type { ComponentType } from 'react';

interface LoginButtonProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  gradientClassName: string;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}

export function LoginButton({
  icon: Icon,
  title,
  subtitle,
  gradientClassName,
  disabled = false,
  loading = false,
  onClick
}: LoginButtonProps) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      whileHover={{ y: -1 }}
      onClick={onClick}
      disabled={disabled}
      className={`android-ripple relative w-full overflow-hidden rounded-[24px] border border-white/20 p-3 text-left shadow-[0_12px_30px_rgba(0,0,0,0.16)] transition disabled:cursor-not-allowed disabled:opacity-60 ${gradientClassName}`}
    >
      <div className="relative z-10 flex items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/35 bg-white/20 text-white backdrop-blur-[8px]">
          <Icon className="h-5 w-5" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">
            {loading ? 'Выполняем вход...' : `Войти через ${title}`}
          </span>
          <span className="block truncate text-xs text-white/85">{subtitle}</span>
        </span>
      </div>

      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.24),transparent_45%)]" />
    </motion.button>
  );
}
