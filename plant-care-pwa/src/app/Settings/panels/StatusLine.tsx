export function StatusLine({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-ios-border/50 bg-white/72 px-3.5 py-2.5 text-xs shadow-sm dark:bg-zinc-900/50">
      <span className="truncate font-medium text-ios-subtext">{label}</span>
      <span className={`truncate font-medium ${ok == null ? 'text-ios-text' : ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300'}`}>
        {value}
      </span>
    </div>
  );
}
