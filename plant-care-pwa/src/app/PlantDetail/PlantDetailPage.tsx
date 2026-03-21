import { type PropsWithChildren, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';

import { PlantHero } from '@/components/PlantHero';
import type { PlantDto } from '@/types/api';

interface PlantDetailPageProps extends PropsWithChildren {
  plant: PlantDto;
  previewDataUrl?: string | null;
  photoUploading?: boolean;
  onPickPhoto: (file: File) => void | Promise<void>;
  wateringPulse?: number;
  mainWatering?: ReactNode;
  explainability?: ReactNode;
  secondary?: ReactNode;
  mainSection?: {
    eyebrow: string;
    title: string;
    subtitle: string;
  };
  explainabilitySection?: {
    eyebrow: string;
    title: string;
    subtitle: string;
  };
  secondarySection?: {
    eyebrow: string;
    title: string;
    subtitle: string;
  };
}

function SectionBlock({
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
        <div className="mt-1 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[1.12rem] font-semibold tracking-[-0.02em] text-ios-text">{title}</h3>
            <p className="mt-1 max-w-[28rem] text-sm leading-5 text-ios-subtext">{subtitle}</p>
          </div>
          <ChevronRight className="mt-1 h-4 w-4 text-ios-subtext/60" />
        </div>
      </div>
      {children}
    </motion.section>
  );
}

export function PlantDetailPage({
  plant,
  previewDataUrl,
  photoUploading = false,
  onPickPhoto,
  wateringPulse = 0,
  mainWatering,
  explainability,
  secondary,
  mainSection,
  explainabilitySection,
  secondarySection,
  children
}: PlantDetailPageProps) {
  return (
    <motion.div
      className="relative space-y-5 pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
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
        className="space-y-5"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut', delay: 0.04 }}
      >
        {mainWatering ? (
          <SectionBlock
            eyebrow={mainSection?.eyebrow ?? 'Главное'}
            title={mainSection?.title ?? 'Полив и следующий шаг'}
            subtitle={mainSection?.subtitle ?? 'Сначала то, что нужно сделать сейчас.'}
          >
            {mainWatering}
          </SectionBlock>
        ) : null}

        {explainability ? (
          <SectionBlock
            eyebrow={explainabilitySection?.eyebrow ?? 'Пояснение'}
            title={explainabilitySection?.title ?? 'Почему такой режим'}
            subtitle={explainabilitySection?.subtitle ?? 'Краткая логика рекомендации без перегруза.'}
          >
            {explainability}
          </SectionBlock>
        ) : null}

        {secondary ? (
          <SectionBlock
            eyebrow={secondarySection?.eyebrow ?? 'Дополнительно'}
            title={secondarySection?.title ?? 'Рост, диагностика и настройки'}
            subtitle={secondarySection?.subtitle ?? 'Вторичные инструменты и более редкие действия.'}
          >
            {secondary}
          </SectionBlock>
        ) : null}

        {children}
      </motion.div>
    </motion.div>
  );
}
