import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircleHeart } from 'lucide-react';

import { ChatMessage, type ChatMessageItem } from '@/components/ChatMessage';
import { useMotionGuard } from '@/lib/motion';

interface ChatHistoryProps {
  messages: ChatMessageItem[];
  isTyping?: boolean;
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
      <div className="rounded-xl border border-ios-border/55 bg-ios-card/80 px-4 py-2 shadow-sm dark:border-emerald-500/20 dark:bg-zinc-900/72">
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

export function ChatHistory({ messages, isTyping = false }: ChatHistoryProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollTop = viewport.scrollHeight;
  }, [messages, isTyping]);

  return (
    <section className="rounded-xl border border-ios-border/60 bg-white/55 p-2 shadow-sm dark:border-emerald-500/20 dark:bg-zinc-950/50">
      <div ref={viewportRef} className="max-h-[54dvh] space-y-2 overflow-y-auto px-1 py-1">
        <AnimatePresence mode="popLayout" initial={false}>
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          {isTyping ? <TypingBubble key="typing" /> : null}
        </AnimatePresence>

        {!messages.length && !isTyping ? (
          <div className="rounded-xl border border-dashed border-ios-border/60 bg-white/45 p-4 text-center text-sm text-ios-subtext dark:bg-zinc-900/45">
            <MessageCircleHeart className="mx-auto mb-2 h-5 w-5 text-ios-accent" />
            Задайте вопрос про уход за растениями.
          </div>
        ) : null}
      </div>
    </section>
  );
}
