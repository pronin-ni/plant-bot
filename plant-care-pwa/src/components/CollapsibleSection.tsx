import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/cn';

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ReactNode;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function CollapsibleSection({
  title,
  icon,
  defaultCollapsed = false,
  children,
  className
}: CollapsibleSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className={cn('rounded-2xl bg-ios-bg/50 p-4', className)}>
      <button
        type="button"
        className="flex w-full items-center justify-between"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          {icon}
          <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-ios-subtext">{title}</h4>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-ios-subtext transition-transform duration-200',
            collapsed ? '-rotate-90' : 'rotate-0'
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="pt-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
