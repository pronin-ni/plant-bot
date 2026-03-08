import { ShieldCheck } from 'lucide-react';

export function PrivacyNote() {
  return (
    <div className="ios-blur-card border border-white/20 bg-white/40 px-3 py-2 text-xs text-ios-subtext dark:bg-zinc-950/45">
      <span className="inline-flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
        Ваши данные безопасны — мы не храним пароли, только токены провайдеров.
      </span>
    </div>
  );
}
