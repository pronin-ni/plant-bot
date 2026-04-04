import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Sprout } from 'lucide-react';
import type { PropsWithChildren, TouchEvent } from 'react';
import { useMemo, useRef, useState } from 'react';

interface PlatformPullToRefreshProps extends PropsWithChildren {
  onRefresh: () => Promise<unknown> | unknown;
  disabled?: boolean;
}

const TRIGGER_PX = 74;

export function PlatformPullToRefresh({ onRefresh, disabled = false, children }: PlatformPullToRefreshProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [startY, setStartY] = useState<number | null>(null);
  const [startX, setStartX] = useState<number | null>(null);
  const isAndroid = useMemo(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('android'),
    []
  );

  const progress = Math.min(1, pullY / TRIGGER_PX);

  async function triggerRefresh() {
    if (isRefreshing || disabled) {
      return;
    }
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
      setPullY(0);
    }
  }

  function resolveScrollRoot(): HTMLElement | null {
    let current = hostRef.current?.parentElement ?? null;
    while (current) {
      const style = window.getComputedStyle(current);
      if (/(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight + 1) {
        return current;
      }
      current = current.parentElement;
    }
    return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : document.documentElement;
  }

  function clearGesture() {
    setStartY(null);
    setStartX(null);
    scrollRootRef.current = null;
    setPullY(0);
  }

  function onTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (disabled || isRefreshing) {
      return;
    }
    const scrollRoot = resolveScrollRoot();
    if (!scrollRoot || scrollRoot.scrollTop > 0) {
      clearGesture();
      return;
    }
    scrollRootRef.current = scrollRoot;
    setStartY(event.touches[0]?.clientY ?? null);
    setStartX(event.touches[0]?.clientX ?? null);
  }

  function onTouchMove(event: TouchEvent<HTMLDivElement>) {
    if (startY == null || startX == null || disabled || isRefreshing) {
      return;
    }
    const scrollRoot = scrollRootRef.current;
    if (!scrollRoot || scrollRoot.scrollTop > 0) {
      clearGesture();
      return;
    }

    const currentY = event.touches[0]?.clientY ?? startY;
    const currentX = event.touches[0]?.clientX ?? startX;
    const delta = Math.max(0, currentY - startY);
    const deltaX = Math.abs(currentX - startX);

    if (deltaX > delta) {
      clearGesture();
      return;
    }

    if (delta <= 0) {
      setPullY(0);
      return;
    }

    event.preventDefault();

    // iOS rubber-band с более пружинистым демпфированием.
    const damped = isAndroid
      ? Math.min(96, delta * 0.42)
      : Math.min(110, Math.sqrt(delta) * 10);
    setPullY(damped);
  }

  async function onTouchEnd() {
    if (startY == null) {
      return;
    }
    setStartY(null);
    setStartX(null);
    scrollRootRef.current = null;
    if (pullY >= TRIGGER_PX) {
      await triggerRefresh();
      return;
    }
    setPullY(0);
  }

  return (
    <div ref={hostRef} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <AnimatePresence>
        {(pullY > 0 || isRefreshing) ? (
          <motion.div
            className="pointer-events-none sticky top-1 z-30 mx-auto mb-2 flex w-fit items-center gap-2 rounded-full border border-ios-border/50 bg-ios-card/70 px-3 py-1.5 text-[12px] text-ios-subtext shadow-[0_4px_14px_rgba(0,0,0,0.1)] backdrop-blur-[18px] android:rounded-[16px] android:backdrop-blur-0 android:bg-[#FFFBFE]"
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={isAndroid ? { duration: 0.2, ease: [0.2, 0, 0, 1] } : { type: 'spring', stiffness: 360, damping: 30, mass: 1 }}
          >
            <motion.span
              className="relative inline-flex h-4 w-4 items-end justify-center"
              animate={{ scale: isRefreshing ? [1, 1.08, 1] : 1 + progress * 0.06 }}
              transition={isRefreshing ? { duration: 0.8, repeat: Infinity } : { type: 'spring', stiffness: 380, damping: 30 }}
            >
              <motion.span
                className="absolute bottom-0 h-2 w-[2px] rounded-full bg-ios-accent/60"
                style={{ transformOrigin: 'bottom center' }}
                animate={{ scaleY: 0.4 + progress * 0.8 }}
              />
              <motion.span
                style={{ transformOrigin: 'bottom center' }}
                animate={{
                  rotate: isRefreshing ? [0, -8, 8, 0] : progress * 10,
                  y: isRefreshing ? [0, -1, 0] : -progress * 2
                }}
                transition={isRefreshing ? { duration: 0.7, repeat: Infinity } : { type: 'spring', stiffness: 320, damping: 26 }}
              >
                <Sprout className="h-3.5 w-3.5 text-ios-accent" />
              </motion.span>
            </motion.span>

            <Loader2
              className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
              style={{ transform: isRefreshing ? undefined : `rotate(${Math.floor(progress * 300)}deg)` }}
            />
            <span>{isRefreshing ? 'Росток обновляется...' : progress > 0.72 ? 'Отпусти, чтобы обновить' : 'Потяни — росток растёт'}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.div
        animate={{ y: isRefreshing ? 14 : pullY * 0.2 }}
        transition={isAndroid ? { duration: 0.2, ease: [0.2, 0, 0, 1] } : { type: 'spring', stiffness: 330, damping: 30, mass: 1 }}
      >
        {children}
      </motion.div>
    </div>
  );
}
