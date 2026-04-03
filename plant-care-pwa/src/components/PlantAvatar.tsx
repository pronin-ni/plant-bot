import type { CSSProperties } from 'react';

import { cn } from '@/lib/cn';
import { getPlantAvatarDescriptor } from '@/lib/plants/plantAvatar';
import type { PlantDto } from '@/types/api';

interface PlantAvatarProps {
  name: string;
  plant?: Pick<PlantDto, 'category' | 'placement' | 'avatar'>;
  className?: string;
  labelClassName?: string;
  framed?: boolean;
}

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function LeafMotif({ accent, ink }: { accent: string; ink: string }) {
  return (
    <>
      <path d="M74 30C60 31 47 39 42 54c-4 11-2 21 2 27 17-4 31-16 36-31 4-10 2-17-6-20Z" fill={accent} opacity="0.92" />
      <path d="M41 56c10-6 22-10 33-12" stroke={ink} strokeWidth="3" strokeLinecap="round" opacity="0.72" />
      <path d="M30 43c-10 7-14 17-12 30 12 0 22-6 28-18 4-7 4-14 1-20-8 0-13 2-17 8Z" fill={accent} opacity="0.56" />
    </>
  );
}

function SproutMotif({ accent, ink }: { accent: string; ink: string }) {
  return (
    <>
      <path d="M50 76V44" stroke={ink} strokeWidth="4" strokeLinecap="round" opacity="0.76" />
      <path d="M49 46c-2-16-16-24-31-23 0 16 11 28 27 30 3 0 5-2 4-7Z" fill={accent} opacity="0.88" />
      <path d="M51 42c2-15 15-24 31-23 0 16-11 28-27 31-3 0-5-2-4-8Z" fill={accent} opacity="0.66" />
      <circle cx="50" cy="79" r="6" fill={accent} opacity="0.24" />
    </>
  );
}

function FlowerMotif({ accent, ink }: { accent: string; ink: string }) {
  return (
    <>
      <circle cx="50" cy="48" r="7" fill={ink} opacity="0.18" />
      <ellipse cx="50" cy="29" rx="10" ry="15" fill={accent} opacity="0.85" />
      <ellipse cx="50" cy="67" rx="10" ry="15" fill={accent} opacity="0.65" />
      <ellipse cx="31" cy="48" rx="15" ry="10" fill={accent} opacity="0.72" />
      <ellipse cx="69" cy="48" rx="15" ry="10" fill={accent} opacity="0.72" />
      <circle cx="50" cy="48" r="8" fill={ink} opacity="0.55" />
      <path d="M50 76V90" stroke={ink} strokeWidth="3.4" strokeLinecap="round" opacity="0.68" />
    </>
  );
}

function CactusMotif({ accent, ink }: { accent: string; ink: string }) {
  return (
    <>
      <path d="M50 22c8 0 12 6 12 14v14c0 3 1 5 4 5 6 0 10 6 10 14 0 11-8 19-19 19H41C29 88 21 80 21 69c0-8 4-14 10-14 3 0 4-2 4-5V36c0-8 6-14 15-14Z" fill={accent} opacity="0.86" />
      <path d="M39 44v26M50 36v34M61 44v26" stroke={ink} strokeWidth="2.5" strokeLinecap="round" opacity="0.28" />
      <circle cx="68" cy="39" r="4" fill={ink} opacity="0.14" />
    </>
  );
}

function HerbMotif({ accent, ink }: { accent: string; ink: string }) {
  return (
    <>
      <path d="M50 84V33" stroke={ink} strokeWidth="3.5" strokeLinecap="round" opacity="0.72" />
      <path d="M47 44c-12-2-20-11-21-24 13 1 23 9 27 20 1 3-1 5-6 4Z" fill={accent} opacity="0.84" />
      <path d="M53 49c11-1 20-8 24-20-13 0-23 6-28 16-1 3 1 5 4 4Z" fill={accent} opacity="0.62" />
      <path d="M46 62c-10-1-18-7-21-17 11 0 19 5 24 13 1 2-1 5-3 4Z" fill={accent} opacity="0.7" />
      <path d="M54 67c9-1 16-6 20-14-10 0-18 4-22 11-1 2 0 4 2 3Z" fill={accent} opacity="0.54" />
    </>
  );
}

export function PlantAvatar({
  name,
  plant,
  className,
  labelClassName,
  framed = true
}: PlantAvatarProps) {
  if (plant?.avatar?.svg) {
    return (
      <div
        className={cn(
          'relative isolate overflow-hidden',
          framed && 'rounded-[24px] border border-white/34 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_30px_rgba(15,23,42,0.10)]',
          className
        )}
        aria-label={`Аватар растения ${name}`}
      >
        <img src={svgToDataUri(plant.avatar.svg)} alt={name} className="h-full w-full object-cover" loading="lazy" />
      </div>
    );
  }

  const descriptor = getPlantAvatarDescriptor(name, plant);
  const style = {
    '--plant-avatar-base': descriptor.palette.base,
    '--plant-avatar-glow': descriptor.palette.glow,
    '--plant-avatar-accent': descriptor.palette.accent,
    '--plant-avatar-ink': descriptor.palette.ink,
    '--plant-avatar-veil': descriptor.palette.veil
  } as CSSProperties;

  const motifProps = {
    accent: descriptor.palette.accent,
    ink: descriptor.palette.ink
  };

  return (
    <div
      className={cn(
        'relative isolate overflow-hidden',
        framed && 'rounded-[24px] border border-white/34 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_30px_rgba(15,23,42,0.10)]',
        className
      )}
      style={style}
      aria-label={`Аватар растения ${name}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,var(--plant-avatar-glow),transparent_38%),linear-gradient(145deg,var(--plant-avatar-veil),var(--plant-avatar-base))]" />
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background: `linear-gradient(135deg, transparent ${descriptor.stripeOffset}%, rgba(255,255,255,0.18) ${descriptor.stripeOffset + 8}%, transparent ${descriptor.stripeOffset + 16}%)`
        }}
      />
      <div
        className="absolute right-[-10%] top-[-6%] h-[48%] w-[48%] rounded-full blur-[2px]"
        style={{ background: `${descriptor.palette.accent}22` }}
      />
      <div
        className="absolute bottom-[-16%] left-[-10%] h-[44%] w-[44%] rounded-full blur-[3px]"
        style={{ background: `${descriptor.palette.ink}12` }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(15,23,42,0.12),transparent_42%)]" />
      <div
        className="absolute bottom-[10%] left-[10%] h-3.5 w-3.5 rounded-full"
        style={{ background: `${descriptor.palette.accent}20`, transform: `translateX(${descriptor.dotOffset}%)` }}
      />

      <svg viewBox="0 0 100 100" className="relative h-full w-full">
        <g transform={`rotate(${descriptor.rotation} 50 50)`}>
          {descriptor.motif === 'leaf' ? <LeafMotif {...motifProps} /> : null}
          {descriptor.motif === 'sprout' ? <SproutMotif {...motifProps} /> : null}
          {descriptor.motif === 'flower' ? <FlowerMotif {...motifProps} /> : null}
          {descriptor.motif === 'cactus' ? <CactusMotif {...motifProps} /> : null}
          {descriptor.motif === 'herb' ? <HerbMotif {...motifProps} /> : null}
        </g>
      </svg>

      <span
        className={cn(
          'absolute bottom-2 left-2 inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-white/44 bg-white/56 px-2 text-[11px] font-semibold tracking-[0.08em] text-[color:var(--plant-avatar-ink)] backdrop-blur-sm',
          labelClassName
        )}
      >
        {descriptor.initial}
      </span>
    </div>
  );
}
