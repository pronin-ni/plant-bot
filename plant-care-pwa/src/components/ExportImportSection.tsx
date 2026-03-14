import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CloudUpload, Download, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';

type RestoreMode = 'MERGE' | 'REPLACE';

interface ExportImportSectionProps {
  restoreMode: RestoreMode;
  onChangeMode: (next: RestoreMode) => void;
  onExport: () => void;
  onImport: () => void;
  exportPending?: boolean;
  importPending?: boolean;
  importError?: string | null;
  importedCount?: number | null;
}

export function ExportImportSection({
  restoreMode,
  onChangeMode,
  onExport,
  onImport,
  exportPending = false,
  importPending = false,
  importError = null,
  importedCount = null
}: ExportImportSectionProps) {
  const mergeMode = restoreMode === 'MERGE';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChangeMode('MERGE')}
          className={[
            'android-ripple rounded-2xl border p-3 text-left transition',
            mergeMode
              ? 'theme-pill-active'
              : 'theme-surface-2'
          ].join(' ')}
        >
          <p className="text-sm font-semibold text-ios-text">Объединить</p>
          <p className="mt-1 text-xs text-ios-subtext">Добавит новые растения, без дублей.</p>
        </button>

        <button
          type="button"
          onClick={() => onChangeMode('REPLACE')}
          className={[
            'android-ripple rounded-2xl border p-3 text-left transition',
            !mergeMode
              ? 'theme-banner-warning'
              : 'theme-surface-2'
          ].join(' ')}
        >
          <p className="text-sm font-semibold text-ios-text">Заменить</p>
          <p className="mt-1 text-xs text-ios-subtext">Удалит текущие и восстановит из бэкапа.</p>
        </button>
      </div>

      <div className="theme-surface-2 rounded-2xl border p-3 text-xs text-ios-subtext">
        <p className="inline-flex items-center gap-1.5 font-medium text-ios-text">
          <AlertTriangle className="h-3.5 w-3.5" />
          Важно
        </p>
        <p className="mt-1">
          {mergeMode
            ? 'Режим Merge: существующие растения не дублируются (по имени и размещению).'
            : 'Режим Replace: текущие растения будут удалены перед импортом.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button variant="secondary" onClick={onExport} disabled={exportPending} className="h-12 rounded-2xl">
          <Download className="mr-2 h-4 w-4" />
          {exportPending ? 'Сохраняем...' : 'Экспорт в Cloud'}
        </Button>

        <Button variant="secondary" onClick={onImport} disabled={importPending} className="h-12 rounded-2xl">
          <Upload className="mr-2 h-4 w-4" />
          {importPending ? 'Импорт...' : 'Импорт из Cloud'}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {importedCount != null ? (
          <motion.div
            key={`ok-${importedCount}`}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="theme-banner-success relative overflow-hidden rounded-2xl border px-3 py-2 text-xs"
          >
            <motion.div
              className="pointer-events-none absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.24, 0] }}
              transition={{ duration: 0.75 }}
              style={{ background: 'radial-gradient(80% 120% at 50% 10%, rgba(16,185,129,0.34) 0%, rgba(16,185,129,0) 100%)' }}
            />
            <span className="relative inline-flex items-center gap-1.5">
              <CloudUpload className="h-4 w-4" />
              Данные сохранены в облаке. Импортировано растений: {importedCount}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {importError ? <p className="theme-banner-danger rounded-xl border px-3 py-2 text-xs">{importError}</p> : null}
    </div>
  );
}
