import { useRef } from 'react';
import { motion } from 'framer-motion';
import { Camera, Droplets, LampDesk, Shield, Sprout, SunMedium } from 'lucide-react';

import { PlantAvatar } from '@/components/PlantAvatar';
import { seedDaysSinceSowing, seedStageLabel, targetEnvironmentLabel } from '@/components/seed/seedStageUi';
import { impactLight } from '@/lib/haptics';
import type { PlantDto } from '@/types/api';

interface SeedHeroCardProps {
  plant: PlantDto;
  previewDataUrl?: string | null;
  photoUploading?: boolean;
  onPickPhoto: (file: File) => void | Promise<void>;
}

export function SeedHeroCard({
  plant,
  previewDataUrl,
  photoUploading = false,
  onPickPhoto
}: SeedHeroCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const photoSrc = previewDataUrl ?? plant.photoUrl ?? null;
  const daysSinceSowing = seedDaysSinceSowing(plant);
  const statusLine = buildSeedStatusLine(plant);
  const ageLabel = daysSinceSowing == null
    ? 'Дата посева не указана'
    : daysSinceSowing === 0
      ? 'Посев сегодня'
      : `${daysSinceSowing} ${pluralizeDays(daysSinceSowing)} после посева`;

  return (
    <motion.section
      className="theme-surface-1 relative overflow-hidden rounded-[30px] border shadow-[0_18px_48px_rgba(15,23,42,0.14)]"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(52,199,89,0.18),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(10,132,255,0.14),transparent_40%)]" />
      <div className="relative p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            {photoSrc ? (
              <img src={photoSrc} alt={plant.name} className="h-24 w-24 rounded-[26px] object-cover shadow-[0_14px_32px_rgba(15,23,42,0.18)] sm:h-28 sm:w-28" />
            ) : (
              <PlantAvatar
                name={plant.name}
                plant={plant}
                className="h-24 w-24 rounded-[26px] sm:h-28 sm:w-28"
                labelClassName="bottom-1.5 left-1.5 h-6 min-w-6 px-1.5 text-[10px]"
              />
            )}

            <button
              type="button"
              className="absolute -bottom-1 -right-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-white/90 text-ios-text shadow-[0_10px_22px_rgba(15,23,42,0.16)] backdrop-blur-sm transition-colors hover:bg-white"
              disabled={photoUploading}
              onClick={() => {
                impactLight();
                inputRef.current?.click();
              }}
              aria-label="Обновить фото"
            >
              <Camera className="h-4 w-4" />
            </button>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              <Badge>{seedStageLabel(plant.seedStage)}</Badge>
              <Badge tone="calm">{targetEnvironmentLabel(plant.targetEnvironmentType)}</Badge>
              <Badge tone="soft">{ageLabel}</Badge>
            </div>

            <h1 className="mt-3 text-[1.45rem] font-semibold leading-tight tracking-[-0.03em] text-ios-text sm:text-[1.65rem]">
              {plant.name}
            </h1>
            <p className="mt-2 max-w-[30rem] text-sm leading-6 text-ios-subtext sm:text-[0.95rem]">
              {statusLine}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {plant.underCover ? (
                <MetaPill icon={Shield} label="Под крышкой" />
              ) : null}
              {plant.growLight ? (
                <MetaPill icon={LampDesk} label="Под светом" />
              ) : null}
              {plant.germinationTemperatureC != null ? (
                <MetaPill icon={SunMedium} label={`${plant.germinationTemperatureC}°C`} />
              ) : null}
              {plant.recommendedWateringMode ? (
                <MetaPill icon={Droplets} label={humanizeHeroWateringMode(plant.recommendedWateringMode)} />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }
          void onPickPhoto(file);
          event.currentTarget.value = '';
        }}
      />
    </motion.section>
  );
}

function buildSeedStatusLine(plant: PlantDto): string {
  switch (plant.seedStage) {
    case 'SOWN':
      return 'Посеву сейчас важны ровная влажность, спокойный микроклимат и минимум лишних вмешательств.';
    case 'GERMINATING':
      return 'Семена уже в процессе прорастания: следите за мягкой влажностью и не перегревайте контейнер.';
    case 'SPROUTED':
      return 'Первые всходы уже показались, поэтому свет и аккуратный режим сейчас важнее любых лишних действий.';
    case 'SEEDLING':
      return 'Сеянец набирает силу: держите стабильный режим и готовьте его к следующему спокойному шагу.';
    case 'READY_TO_TRANSPLANT':
      return 'Этап проращивания почти завершён, и карточка уже готовится к переходу в обычный режим растения.';
    default:
      return 'Seed-flow помогает быстро понять стадию, следующий шаг и всё важное для раннего роста.';
  }
}

function humanizeHeroWateringMode(mode: NonNullable<PlantDto['recommendedWateringMode']>): string {
  switch (mode) {
    case 'MIST':
      return 'Лёгкая влага';
    case 'BOTTOM_WATER':
      return 'Нижний полив';
    case 'KEEP_COVERED':
      return 'Под укрытием';
    case 'VENT_AND_MIST':
      return 'Проветривать';
    case 'LIGHT_SURFACE_WATER':
      return 'Лёгкое увлажнение';
    case 'CHECK_ONLY':
      return 'Только наблюдение';
  }
}

function pluralizeDays(value: number): string {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return 'день';
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return 'дня';
  }
  return 'дней';
}

function Badge({ children, tone = 'default' }: { children: string; tone?: 'default' | 'calm' | 'soft' }) {
  const className = tone === 'default'
    ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
    : tone === 'calm'
      ? 'bg-ios-accent/10 text-ios-accent'
      : 'bg-ios-card text-ios-subtext';

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${className}`}>
      {children}
    </span>
  );
}

function MetaPill({ icon: Icon, label }: { icon: typeof Sprout; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-ios-border/60 bg-white/70 px-3 py-1.5 text-[11px] font-medium text-ios-text backdrop-blur-sm dark:bg-ios-card/70">
      <Icon className="h-3.5 w-3.5 text-ios-subtext" />
      {label}
    </span>
  );
}
