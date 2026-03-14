import { ShieldCheck } from 'lucide-react';

export function PrivacyNote() {
  return (
    <div className="theme-surface-1 rounded-2xl border px-3 py-2 text-xs text-ios-subtext">
      <span className="inline-flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-ios-accent" />
        Ваши данные безопасны — мы не храним пароли, только токены провайдеров.
      </span>
    </div>
  );
}
