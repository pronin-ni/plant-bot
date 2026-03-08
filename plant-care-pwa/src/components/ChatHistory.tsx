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
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ios-border/60 bg-white/70 text-ios-accent dark:bg-zinc-900/60">
        🌿
      </span>
      <div className="rounded-[24px] rounded-bl-[12px] border border-ios-border/55 bg-white/68 px-3 py-2 backdrop-blur-[14px] dark:bg-zinc-900/62">
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
  return (
    <section className="ios-blur-card p-3">
      <p className="mb-2 text-xs text-ios-subtext">Диалог</p>

      <div className="max-h-[46dvh] space-y-2 overflow-y-auto pr-1">
        <AnimatePresence mode="popLayout" initial={false}>
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          {isTyping ? <TypingBubble key="typing" /> : null}
        </AnimatePresence>

        {!messages.length && !isTyping ? (
          <div className="rounded-2xl border border-dashed border-ios-border/60 bg-white/45 p-4 text-center text-sm text-ios-subtext dark:bg-zinc-900/45">
            <MessageCircleHeart className="mx-auto mb-2 h-5 w-5 text-ios-accent" />
            Спросите что-нибудь — и ботаник сразу подключится.
          </div>
        ) : null}
      </div>
    </section>
  );
}
