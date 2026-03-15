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
  emerald: 'theme-surface-success',
  amber: 'theme-surface-warning',
  blue: 'theme-surface-info'
};

export function SettingsTutorial({ steps, tone = 'emerald' }: SettingsTutorialProps) {
  const toneCls = toneByKey[tone];
  return (
    <div className={`space-y-2 rounded-2xl border px-3 py-2 text-[13px] ${toneCls}`}>
      {steps.map((step, index) => {
        const Icon = step.icon;
        return (
          <div key={step.title} className="flex items-start gap-2">
            <span className="theme-surface-subtle mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold text-ios-accent">
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
