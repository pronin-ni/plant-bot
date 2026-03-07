import { Droplets } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { hapticImpact } from '@/lib/telegram';

interface WaterButtonProps {
  isLoading?: boolean;
  onClick: () => void;
}

export function WaterButton({ isLoading = false, onClick }: WaterButtonProps) {
  const [burst, setBurst] = useState(false);

  return (
    <motion.div
      animate={{ scale: burst ? 1.03 : 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28, mass: 1 }}
      className="relative"
    >
      {burst ? (
        <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className="water-drop water-drop-1" />
          <span className="water-drop water-drop-2" />
          <span className="water-drop water-drop-3" />
        </span>
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        className="w-full bg-ios-accent/12 text-ios-accent hover:bg-ios-accent/18"
        disabled={isLoading}
        onClick={() => {
          // В момент полива делаем более выраженный отклик.
          hapticImpact('heavy');
          setBurst(true);
          window.setTimeout(() => setBurst(false), 320);
          onClick();
        }}
      >
        <Droplets className="mr-1.5 h-4 w-4" />
        {isLoading ? 'Сохраняем...' : 'Полито'}
      </Button>
    </motion.div>
  );
}
