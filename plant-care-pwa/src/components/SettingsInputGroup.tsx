import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface SettingsInputGroupProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
  saveText?: string;
  savingText?: string;
  successText?: string | null;
}

export function SettingsInputGroup({
  label,
  placeholder,
  value,
  onChange,
  onSave,
  saving = false,
  saveDisabled = false,
  saveText = 'Сохранить',
  savingText = 'Сохраняем...',
  successText = null
}: SettingsInputGroupProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs text-ios-subtext">{label}</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="theme-field h-11 w-full rounded-ios-button border px-4 text-ios-body outline-none backdrop-blur-ios"
        />
      </label>

      <Button className="w-full" disabled={saveDisabled || saving} onClick={onSave}>
        {saving ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-4 w-4 animate-spin" />
            {savingText}
          </span>
        ) : (
          saveText
        )}
      </Button>

      <AnimatePresence initial={false}>
        {successText ? (
          <motion.div
            key="saved"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="theme-banner-success relative overflow-hidden rounded-2xl border px-3 py-2 text-xs"
          >
            {!reduceMotion ? (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-0"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: [0, 0.35, 0], scale: [0.85, 1, 1.14] }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                style={{
                  background:
                    'radial-gradient(120% 90% at 20% 18%, rgba(52,199,89,0.34) 0%, rgba(52,199,89,0.16) 36%, rgba(52,199,89,0) 76%)'
                }}
              />
            ) : null}

            <span className="relative inline-flex items-center gap-2">
              <motion.span
                initial={{ scale: 0.65, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 330, damping: 23 }}
              >
                <CheckCircle2 className="h-4 w-4" />
              </motion.span>
              <span>Сохранено! {successText}</span>
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
