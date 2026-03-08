import { motion, useReducedMotion } from 'framer-motion';
import { Leaf, UserRound } from 'lucide-react';

export type ChatAuthor = 'assistant' | 'user';

export interface ChatMessageItem {
  id: string;
  author: ChatAuthor;
  text: string;
  createdAt?: string;
  model?: string | null;
  imageUrl?: string | null;
}

interface ChatMessageProps {
  message: ChatMessageItem;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.author === 'user';
  const reduceMotion = useReducedMotion();
  const timeLabel = message.createdAt
    ? new Date(message.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: reduceMotion ? 0 : isUser ? 8 : 12, scale: reduceMotion ? 1 : 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.99 }}
      transition={{
        type: 'spring',
        stiffness: isUser ? 320 : 400,
        damping: isUser ? 28 : 30
      }}
      className={`flex w-full items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser ? (
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ios-border/60 bg-white/70 text-ios-accent dark:bg-zinc-900/60">
          <Leaf className="h-4 w-4" />
        </span>
      ) : null}

      <div
        className={[
          'relative isolate max-w-[82%] overflow-hidden rounded-[24px] px-3 py-2 text-[14px] leading-5',
          isUser
            ? 'rounded-br-[12px] bg-ios-accent text-white shadow-[0_8px_20px_rgba(52,199,89,0.28)]'
            : 'rounded-bl-[12px] border border-ios-border/55 bg-white/68 text-ios-text backdrop-blur-[14px] shadow-[0_8px_24px_rgba(16,185,129,0.08)] dark:border-emerald-500/20 dark:bg-zinc-900/62 dark:shadow-[0_10px_28px_rgba(16,185,129,0.18)]'
        ].join(' ')}
      >
        {!isUser && !reduceMotion ? (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: [0, 0.35, 0], scale: [0.8, 1, 1.12] }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            style={{
              background:
                'radial-gradient(130% 90% at 22% 20%, rgba(52,199,89,0.32) 0%, rgba(52,199,89,0.14) 32%, rgba(52,199,89,0) 72%)'
            }}
          />
        ) : null}

        {message.imageUrl ? (
          <img
            src={message.imageUrl}
            alt="Вложение"
            className="relative z-[1] mb-2 max-h-52 w-full rounded-2xl object-cover"
          />
        ) : null}

        <p className="relative z-[1] whitespace-pre-wrap break-words">{message.text}</p>
        <div className={`relative z-[1] mt-1 flex items-center gap-1 text-[10px] ${isUser ? 'text-white/75' : 'text-ios-subtext'}`}>
          {timeLabel ? <span>{timeLabel}</span> : null}
          {!isUser && message.model ? <span>· {message.model}</span> : null}
        </div>
      </div>

      {isUser ? (
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ios-border/60 bg-white/70 text-ios-subtext dark:bg-zinc-900/60">
          <UserRound className="h-4 w-4" />
        </span>
      ) : null}
    </motion.article>
  );
}
