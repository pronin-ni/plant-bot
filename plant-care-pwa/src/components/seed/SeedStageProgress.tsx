import { cn } from '@/lib/cn';
import { getSeedProgressItems, type SeedStage } from '@/components/seed/seedStageUi';

export function SeedStageProgress({ stage }: { stage?: SeedStage | null }) {
  const items = getSeedProgressItems(stage);
  const currentIndex = items.findIndex((item) => item.state === 'current');

  return (
    <div className="theme-surface-subtle rounded-2xl border px-2.5 py-2.5">
      <div className="relative grid grid-cols-5 gap-0.5">
        <div className="pointer-events-none absolute left-[10%] right-[10%] top-[11px] h-px bg-ios-border/60" />
        <div
          className="pointer-events-none absolute left-[10%] top-[11px] h-px bg-emerald-400/70 transition-all duration-300"
          style={{
            width: currentIndex <= 0 ? '0%' : `${Math.min(80, currentIndex * 20)}%`
          }}
        />
        {items.map((item) => {
          const isCurrent = item.state === 'current';
          const isDone = item.state === 'done';

          return (
            <div key={item.key} className="relative z-[1] flex min-w-0 flex-col items-center gap-1.5 text-center">
              <div
                className={cn(
                  'flex items-center justify-center rounded-full border bg-[hsl(var(--background))] text-[10px] font-semibold transition-all duration-200',
                  isCurrent && 'h-7 w-7 border-transparent bg-ios-accent text-white shadow-[0_0_0_4px_rgba(10,132,255,0.12)]',
                  isDone && 'h-6 w-6 border-emerald-400/35 bg-emerald-500/90 text-white',
                  !isCurrent && !isDone && 'h-5.5 w-5.5 border-ios-border/70 text-ios-subtext'
                )}
              >
                {isDone ? '✓' : isCurrent ? <span className="h-2 w-2 rounded-full bg-white" /> : <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
              </div>
              <span
                className={cn(
                  'line-clamp-2 min-h-[1.8rem] max-w-[4rem] text-[9px] leading-4 sm:text-[10px]',
                  isCurrent && 'font-semibold text-ios-text',
                  isDone && 'font-medium text-ios-text/90',
                  !isCurrent && !isDone && 'text-ios-subtext/85'
                )}
              >
                {item.shortLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
