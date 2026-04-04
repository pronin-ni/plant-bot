import { type PropsWithChildren, type ReactNode } from 'react';
import { motion } from 'framer-motion';

import { SeedHeroCard } from '@/components/seed/SeedHeroCard';
import type { PlantDto } from '@/types/api';

interface SeedDetailPageProps extends PropsWithChildren {
  plant: PlantDto;
  previewDataUrl?: string | null;
  photoUploading?: boolean;
  onPickPhoto: (file: File) => void | Promise<void>;
  main: ReactNode;
  context: ReactNode;
  secondary: ReactNode;
}

export function SeedDetailPage({
  plant,
  previewDataUrl,
  photoUploading = false,
  onPickPhoto,
  main,
  context,
  secondary,
  children
}: SeedDetailPageProps) {
  return (
    <motion.div
      className="relative space-y-5 pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
    >
      <SeedHeroCard
        plant={plant}
        previewDataUrl={previewDataUrl}
        photoUploading={photoUploading}
        onPickPhoto={onPickPhoto}
      />

      <div className="space-y-5 md:grid md:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] md:gap-6 md:space-y-0">
        <div className="space-y-5">
          <SeedSection eyebrow="Сейчас" title="Что делать сейчас" subtitle="Главный следующий шаг, понятный контекст и только нужные действия.">
            {main}
          </SeedSection>

          <SeedSection eyebrow="Контекст" title="Что происходит сейчас" subtitle="Коротко о режиме проращивания, условиях и том, на что смотреть именно сейчас.">
            {context}
          </SeedSection>
        </div>

        <div className="space-y-5">
          <SeedSection eyebrow="Дальше" title="Рост и переход" subtitle="Журнал ухода, недавние события, фото роста и шаг к обычному растению.">
            {secondary}
          </SeedSection>
          {children}
        </div>
      </div>
    </motion.div>
  );
}

function SeedSection({
  eyebrow,
  title,
  subtitle,
  children
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      className="space-y-3"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
    >
      <div className="px-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ios-subtext">{eyebrow}</p>
        <h2 className="mt-1 text-[1.12rem] font-semibold tracking-[-0.02em] text-ios-text">{title}</h2>
        <p className="mt-1 max-w-[32rem] text-sm leading-5 text-ios-subtext">{subtitle}</p>
      </div>
      {children}
    </motion.section>
  );
}
