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
  const canSend = value.trim().length >= 2 && !disabled && !sending;

  return (
    <section className="ios-blur-card space-y-2 border border-ios-border/60 bg-white/60 p-3 dark:border-emerald-500/15 dark:bg-zinc-950/60">
      {attachedLabel ? (
        <div className="flex items-center justify-between rounded-2xl border border-ios-border/60 bg-white/60 px-3 py-2 text-xs text-ios-subtext dark:bg-zinc-900/60">
          <span className="truncate">Фото: {attachedLabel}</span>
          <button
            type="button"
            className="rounded-full p-1 text-ios-subtext"
            onClick={() => {
              hapticImpact('light');
              onClearAttachment?.();
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <label className="android-ripple inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-ios-border/60 bg-white/65 text-ios-subtext dark:bg-zinc-900/60">
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

        <div className="relative min-h-[42px] flex-1 rounded-[22px] border border-ios-border/65 bg-white/68 px-3 py-2 dark:bg-zinc-900/62">
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Спросите что угодно о ваших растениях..."
            className="max-h-36 min-h-[24px] w-full resize-none bg-transparent text-[14px] text-ios-text outline-none placeholder:text-ios-subtext"
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
        </div>

        <button
          type="button"
          title={micSupported ? 'Голосовой ввод' : 'Голосовой ввод не поддерживается'}
          className={`android-ripple relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ios-border/60 ${micActive ? 'bg-red-500/15 text-red-500' : 'bg-white/65 text-ios-subtext'} disabled:cursor-not-allowed disabled:opacity-55 dark:bg-zinc-900/60`}
          onClick={() => {
            if (!micSupported || disabled) {
              return;
            }
            hapticImpact(micActive ? 'light' : 'medium');
            onMicToggle?.();
          }}
          disabled={disabled || !micSupported}
        >
          {micActive ? (
            <motion.span
              className="absolute inset-0 rounded-full border border-red-500/45"
              animate={{ scale: [1, 1.16, 1], opacity: [0.8, 0.2, 0.8] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
          ) : null}
          <motion.span
            animate={micActive ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={micActive ? { duration: 0.9, repeat: Infinity } : { duration: 0.2 }}
          >
            <Mic className="h-4 w-4" />
          </motion.span>
        </button>

        <button
          type="button"
          className={`android-ripple inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-[0_10px_24px_rgba(52,199,89,0.32)] transition ${canSend ? 'bg-ios-accent' : 'bg-ios-accent/45'}`}
          onClick={() => {
            if (!canSend) {
              return;
            }
            hapticImpact('medium');
            onSubmit();
          }}
          disabled={!canSend}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
        </button>
      </div>
    </section>
  );
}
