import { motion } from 'framer-motion';
import type { PropsWithChildren } from 'react';

import { cn } from '@/lib/cn';

export function BlurCard({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <motion.div
      className={cn('ios-blur-card p-5 ios:backdrop-blur-[28px] ios:bg-ios-card/58 ios:border-ios-border/50', className)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30, mass: 1 }}
    >
      {children}
    </motion.div>
  );
}
