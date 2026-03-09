import { motion } from 'framer-motion';
import { Loader2, Mic, Paperclip, SendHorizonal, X } from 'lucide-react';

import { hapticImpact } from '@/lib/telegram';

interface ChatInputProps {
  value: string;
  disabled?: boolean;
  sending?: boolean;
  attachedLabel?: string | null;
  micActive?: boolean;
  micSupported?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onAttachPhoto?: (file: File) => void;
  onClearAttachment?: () => void;
  onMicToggle?: () => void;
}

export function ChatInput({
  value,
  disabled = false,
  sending = false,
  attachedLabel = null,
  micActive = false,
  micSupported = true,
  onChange,
  onSubmit,
  onAttachPhoto,
  onClearAttachment,
  onMicToggle
}: ChatInputProps) {
  const canSend = (value.trim().length >= 2 || Boolean(attachedLabel)) && !disabled && !sending;

  return (
    <section className="space-y-2 rounded-xl border border-ios-border/60 bg-ios-card/88 p-2 shadow-sm backdrop-blur-ios dark:border-emerald-500/20 dark:bg-zinc-950/85">
      {attachedLabel ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-ios-border/60 bg-white/70 px-3 py-1.5 text-xs text-ios-subtext dark:bg-zinc-900/70">
          <span className="min-w-0 truncate">Фото: {attachedLabel}</span>
          <button
            type="button"
            className="touch-target inline-flex min-w-11 items-center justify-center rounded-full text-ios-subtext"
            onClick={() => {
              hapticImpact('light');
              onClearAttachment?.();
            }}
            aria-label="Убрать вложение"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <label className="touch-target android-ripple inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-ios-border/60 bg-white/70 text-ios-subtext dark:bg-zinc-900/70">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }
              hapticImpact('light');
              onAttachPhoto?.(file);
              event.currentTarget.value = '';
            }}
          />
          <Paperclip className="h-4 w-4" />
        </label>

        <div className="relative min-h-11 flex-1 rounded-xl border border-ios-border/65 bg-white/75 px-3 py-2 dark:bg-zinc-900/72">
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Введите вопрос..."
            className="max-h-36 min-h-[24px] w-full resize-none bg-transparent pr-8 text-[14px] text-ios-text outline-none placeholder:text-ios-subtext"
            disabled={disabled}
            rows={1}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (canSend) {
                  onSubmit();
                }
              }
            }}
          />

          {micSupported ? (
            <button
              type="button"
              title={micActive ? 'Остановить голосовой ввод' : 'Голосовой ввод'}
              className={`touch-target absolute bottom-0.5 right-0.5 inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg ${micActive ? 'text-red-500' : 'text-ios-subtext'} disabled:cursor-not-allowed disabled:opacity-55`}
              onClick={() => {
                if (disabled) {
                  return;
                }
                hapticImpact(micActive ? 'light' : 'medium');
                onMicToggle?.();
              }}
              disabled={disabled}
              aria-label={micActive ? 'Остановить микрофон' : 'Включить микрофон'}
            >
              {micActive ? (
                <motion.span
                  className="absolute inset-1 rounded-md border border-red-500/40"
                  animate={{ opacity: [0.9, 0.2, 0.9] }}
                  transition={{ duration: 1.1, repeat: Infinity }}
                />
              ) : null}
              <Mic className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          className={`touch-target android-ripple inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition ${canSend ? 'bg-ios-accent' : 'bg-ios-accent/45'}`}
          onClick={() => {
            if (!canSend) {
              return;
            }
            hapticImpact('medium');
            onSubmit();
          }}
          disabled={!canSend}
          aria-label="Отправить сообщение"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
        </button>
      </div>
    </section>
  );
}
