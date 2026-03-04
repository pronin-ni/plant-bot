import { Droplets } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { hapticImpact } from '@/lib/telegram';

interface WaterButtonProps {
  isLoading?: boolean;
  onClick: () => void;
}

export function WaterButton({ isLoading = false, onClick }: WaterButtonProps) {
  return (
    <Button
      variant="secondary"
      size="sm"
      className="w-full bg-ios-accent/12 text-ios-accent hover:bg-ios-accent/18"
      disabled={isLoading}
      onClick={() => {
        // Легкая тактильная отдача как в iOS при быстрых действиях.
        hapticImpact('light');
        onClick();
      }}
    >
      <Droplets className="mr-1.5 h-4 w-4" />
      {isLoading ? 'Сохраняем...' : 'Полито'}
    </Button>
  );
}
