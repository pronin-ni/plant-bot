import { type PropsWithChildren } from 'react';
import { motion } from 'framer-motion';

import { PlantHero } from '@/components/PlantHero';
import type { PlantDto } from '@/types/api';

interface PlantDetailPageProps extends PropsWithChildren {
  plant: PlantDto;
  previewDataUrl?: string | null;
  photoUploading?: boolean;
  onPickPhoto: (file: File) => void | Promise<void>;
  wateringPulse?: number;
}

export function PlantDetailPage({
  plant,
  previewDataUrl,
  photoUploading = false,
  onPickPhoto,
  wateringPulse = 0,
  children
}: PlantDetailPageProps) {
  return (
    <motion.div
      className="relative space-y-4 pb-1"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
    >
      <PlantHero
        plant={plant}
        previewDataUrl={previewDataUrl}
        photoUploading={photoUploading}
        onPickPhoto={onPickPhoto}
        celebratePulse={wateringPulse}
      />

      <motion.div
        className="space-y-4"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut', delay: 0.04 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
