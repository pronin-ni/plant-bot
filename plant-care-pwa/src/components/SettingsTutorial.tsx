import type { LucideIcon } from 'lucide-react';

interface Step {
  title: string;
  description?: string;
  icon?: LucideIcon;
}

interface SettingsTutorialProps {
  steps: Step[];
  tone?: 'emerald' | 'amber' | 'blue';
}

const toneByKey: Record<NonNullable<SettingsTutorialProps['tone']>, string> = {
  emerald: 'bg-emerald-500/8 border-emerald-500/25 text-emerald-800 dark:text-emerald-200',
  amber: 'bg-amber-500/10 border-amber-500/35 text-amber-900 dark:text-amber-200',
  blue: 'bg-sky-500/10 border-sky-500/30 text-sky-900 dark:text-sky-100'
};

export function SettingsTutorial({ steps, tone = 'emerald' }: SettingsTutorialProps) {
  const toneCls = toneByKey[tone];
  return (
    <div className={`space-y-2 rounded-2xl border px-3 py-2 text-[13px] ${toneCls}`}>
      {steps.map((step, index) => {
        const Icon = step.icon;
        return (
          <div key={step.title} className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/70 text-[11px] font-semibold text-ios-accent dark:bg-black/20">
              {Icon ? <Icon className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <div className="space-y-0.5">
              <p className="font-semibold leading-5">{step.title}</p>
              {step.description ? <p className="text-[12px] leading-5 opacity-80">{step.description}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
