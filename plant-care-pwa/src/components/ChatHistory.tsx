import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircleHeart } from 'lucide-react';

import { ChatMessage, type ChatMessageItem } from '@/components/ChatMessage';
import { cn } from '@/lib/cn';
import { useMotionGuard } from '@/lib/motion';

interface ChatHistoryProps {
  messages: ChatMessageItem[];
  isTyping?: boolean;
  className?: string;
  viewportClassName?: string;
}

function TypingBubble() {
  const { reduceMotion } = useMotionGuard();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="flex items-end gap-2"
    >
      <div className="theme-surface-subtle rounded-xl border px-4 py-2 shadow-sm">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-ios-subtext"
              animate={reduceMotion
                ? { opacity: [0.45, 1, 0.45] }
                : { y: [0, -4, 0], scale: [1, 1.2, 1], opacity: [0.45, 1, 0.45] }}
              transition={{ duration: 0.8, ease: 'easeInOut', repeat: Infinity, delay: i * 0.12 }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export function ChatHistory({ messages, isTyping = false, className, viewportClassName }: ChatHistoryProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollTop = viewport.scrollHeight;
  }, [messages, isTyping]);

  return (
    <section className={cn('theme-surface-1 flex min-h-0 flex-1 flex-col rounded-xl border p-2 shadow-sm', className)}>
      <div ref={viewportRef} className={cn('min-h-0 flex-1 space-y-2 overflow-y-auto px-1 py-1', viewportClassName)}>
        <AnimatePresence mode="popLayout" initial={false}>
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          {isTyping ? <TypingBubble key="typing" /> : null}
        </AnimatePresence>

        {!messages.length && !isTyping ? (
          <div className="theme-surface-subtle rounded-xl border border-dashed p-4 text-center text-sm text-ios-subtext">
            <MessageCircleHeart className="mx-auto mb-2 h-5 w-5 text-ios-accent" />
            Задайте вопрос про уход за растениями.
          </div>
        ) : null}
      </div>
    </section>
  );
}
