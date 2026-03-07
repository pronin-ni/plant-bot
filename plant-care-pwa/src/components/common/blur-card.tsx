import { motion } from 'framer-motion';
import type { PropsWithChildren } from 'react';

import { cn } from '@/lib/cn';

export function BlurCard({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <motion.div
      className={cn('ios-blur-card p-5', className)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 340, damping: 28, mass: 1 }}
    >
      {children}
    </motion.div>
  );
}
