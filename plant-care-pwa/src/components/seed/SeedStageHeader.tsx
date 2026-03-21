import { SeedStageProgress } from '@/components/seed/SeedStageProgress';
import type { SeedStage } from '@/components/seed/seedStageUi';

export function SeedStageHeader({
  stage,
  title,
  progressLabel
}: {
  stage?: SeedStage | null;
  title: string;
  progressLabel: string;
}) {
  return (
    <div className="space-y-2.5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ios-subtext">Стадия роста</p>
        <p className="mt-1 text-[1.02rem] font-semibold leading-6 text-ios-text">{title}</p>
      </div>
      <SeedStageProgress stage={stage} />
      <p className="text-xs leading-5 text-ios-subtext">{progressLabel}</p>
    </div>
  );
}
