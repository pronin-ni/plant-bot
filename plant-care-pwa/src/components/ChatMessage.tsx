import { motion, useReducedMotion } from 'framer-motion';

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
      initial={{ opacity: 0, y: reduceMotion ? 0 : 8, scale: reduceMotion ? 1 : 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      className={`flex w-full items-end ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={[
          'relative max-w-[88%] overflow-hidden rounded-xl px-4 py-2 text-[14px] leading-5',
          isUser
            ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm'
            : 'theme-surface-subtle border text-ios-text shadow-sm'
        ].join(' ')}
      >
        {!isUser && !reduceMotion ? (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
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
            className="mb-2 max-h-52 w-full rounded-lg object-cover"
          />
        ) : null}

        <p className="whitespace-pre-wrap break-words">{message.text}</p>
        <div className={`mt-1 flex items-center gap-1 text-[10px] ${isUser ? 'text-[hsl(var(--primary-foreground)/0.78)]' : 'text-ios-subtext'}`}>
          {timeLabel ? <span>{timeLabel}</span> : null}
          {!isUser && message.model ? <span>· {message.model}</span> : null}
        </div>
      </div>
    </motion.article>
  );
}
