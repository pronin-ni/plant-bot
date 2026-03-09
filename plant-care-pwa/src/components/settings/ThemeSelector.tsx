import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, Monitor, Paintbrush } from 'lucide-react';

import { APP_THEMES } from '@/lib/theme/themes';
import { useThemeStore } from '@/lib/theme/themeStore';

// T3: mobile-first селектор 5 тем для настроек PWA.
export function ThemeSelector() {
  const prefersReducedMotion = useReducedMotion();
  const selectedThemeId = useThemeStore((s) => s.selectedThemeId);
  const useSystemTheme = useThemeStore((s) => s.useSystemTheme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setSystemTheme = useThemeStore((s) => s.setSystemTheme);
  const resolvedTheme = useThemeStore((s) => s.getResolvedTheme());
  const [justAppliedText, setJustAppliedText] = useState<string | null>(null);
  const previousResolvedThemeIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = previousResolvedThemeIdRef.current;
    previousResolvedThemeIdRef.current = resolvedTheme.id;
    if (!prev || prev === resolvedTheme.id) {
      return;
    }
    const text = useSystemTheme
      ? `Применено: ${resolvedTheme.name} (системная)`
      : `Применено: ${resolvedTheme.name}`;
    setJustAppliedText(text);
    const timer = window.setTimeout(() => setJustAppliedText(null), 1200);
    return () => window.clearTimeout(timer);
  }, [resolvedTheme.id, resolvedTheme.name, useSystemTheme]);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-ios-border/60 bg-white/65 p-3 dark:border-emerald-500/20 dark:bg-zinc-950/55">
        <p className="text-[12px] uppercase tracking-wide text-ios-subtext">Тема оформления</p>
        <p className="mt-1 text-sm text-ios-text">
          Выберите визуальный стиль приложения. Тема применяется глобально и сохраняется на устройстве.
        </p>
        <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-ios-border/60 bg-white/70 px-2.5 py-1 text-[12px] text-ios-subtext dark:bg-zinc-900/60">
          <Paintbrush className="h-3.5 w-3.5 text-ios-accent" />
          Текущая: <span className="font-medium text-ios-text">{resolvedTheme.name}</span>
          {useSystemTheme ? <span>· Системная</span> : <span>· Ручная</span>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={setSystemTheme}
          className={`touch-target inline-flex items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors ${
            useSystemTheme
              ? 'border-emerald-500/55 bg-emerald-500/12 text-emerald-800 dark:text-emerald-200'
              : 'border-ios-border/60 bg-white/70 text-ios-text hover:border-ios-accent/45 dark:bg-zinc-900/60'
          } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ios-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent`}
        >
          <Monitor className="h-4 w-4" />
          Следовать системе
        </button>
      </div>

      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        role="radiogroup"
        aria-label="Выбор темы оформления"
      >
        {APP_THEMES.map((theme) => {
          const isActive = useSystemTheme ? theme.id === resolvedTheme.id : theme.id === selectedThemeId;
          const isSystemPicked = useSystemTheme && theme.id === resolvedTheme.id;

          return (
            <motion.button
              key={theme.id}
              type="button"
              onClick={() => setTheme(theme.id)}
              whileTap={prefersReducedMotion ? undefined : { scale: 0.985 }}
              role="radio"
              aria-checked={isActive}
              aria-label={`${theme.name}. ${theme.mood}`}
              className={`relative overflow-hidden rounded-2xl border p-3 text-left transition-colors ${
                isActive
                  ? 'border-emerald-500/55 bg-emerald-500/10'
                  : 'border-ios-border/60 bg-white/65 hover:border-ios-accent/45 dark:bg-zinc-950/55'
              } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ios-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ios-text">{theme.name}</p>
                  <p className="mt-1 text-[12px] leading-5 text-ios-subtext">{theme.mood}</p>
                </div>
                {isActive ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/45 bg-emerald-500/12 px-2 py-1 text-[11px] text-emerald-800 dark:text-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {isSystemPicked ? 'Системная' : 'Выбрана'}
                  </span>
                ) : null}
              </div>

              <div className="mt-3 flex items-center gap-1.5">
                {theme.previewSwatches.slice(0, 5).map((color) => (
                  <span
                    key={`${theme.id}-${color}`}
                    className="h-6 w-6 rounded-full border border-black/10 shadow-sm"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                ))}
              </div>
            </motion.button>
          );
        })}
      </div>

      {justAppliedText ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          aria-live="polite"
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[12px] text-emerald-800 dark:text-emerald-200"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {justAppliedText}
        </motion.div>
      ) : null}
    </div>
  );
}
