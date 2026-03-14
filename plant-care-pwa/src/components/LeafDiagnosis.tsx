import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Camera, CheckCircle2, Loader2, ScanSearch, Stethoscope } from 'lucide-react';

import { diagnosePlantOpenRouter } from '@/lib/api';
import { hapticImpact, hapticNotify } from '@/lib/telegram';
import type { PlantDto } from '@/types/api';

interface LeafDiagnosisProps {
  plant: PlantDto;
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Не удалось прочитать фото'));
    reader.readAsDataURL(file);
  });
}

export function LeafDiagnosis({ plant }: LeafDiagnosisProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const diagnoseMutation = useMutation({
    mutationFn: (imageBase64: string) =>
      diagnosePlantOpenRouter(
        imageBase64,
        plant.name,
        `Категория=${plant.category ?? 'HOME'}; Тип=${plant.type ?? 'DEFAULT'}; Размещение=${plant.placement}; Интервал=${plant.baseIntervalDays ?? 7}; Последний полив=${plant.lastWateredDate}`
      ),
    onSuccess: () => hapticNotify('success'),
    onError: () => hapticNotify('error')
  });

  const result = diagnoseMutation.data;

  return (
    <motion.section
      className="ios-blur-card space-y-3 overflow-hidden p-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 330, damping: 30 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-ios-accent" />
          <div>
            <p className="text-ios-body font-semibold">AI-диагностика листьев</p>
            <p className="mt-0.5 text-xs text-ios-subtext">Быстрый CTA для проверки симптомов по фото.</p>
          </div>
        </div>
        <span className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-ios-subtext">AI</span>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-ios-border/60 bg-white/50 dark:bg-zinc-900/50">
        {preview ? (
          <img src={preview} alt="Лист растения" className="h-36 w-full object-cover" />
        ) : (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-center text-ios-subtext">
            <div className="rounded-full bg-ios-accent/14 p-3 text-ios-accent">
              <ScanSearch className="h-5 w-5" />
            </div>
            <p className="text-sm">Загрузите фото листа</p>
            <p className="max-w-[230px] text-xs">AI быстро оценит симптомы и подскажет следующий шаг.</p>
          </div>
        )}

        <AnimatePresence>
          {diagnoseMutation.isPending ? (
            <motion.div
              className="absolute inset-0 flex items-center justify-center bg-black/35 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="flex flex-col items-center gap-2 text-white">
                <motion.span
                  className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/40"
                  animate={{ scale: [1, 1.12, 1], opacity: [0.85, 1, 0.85] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <Loader2 className="h-5 w-5 animate-spin" />
                </motion.span>
                <p className="text-xs">Анализируем лист...</p>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }
          hapticImpact('medium');
          void toDataUrl(file).then((dataUrl) => {
            setPreview(dataUrl);
            diagnoseMutation.mutate(dataUrl);
          });
          event.currentTarget.value = '';
        }}
      />

      <button
        type="button"
        className="android-ripple inline-flex h-11 w-full items-center justify-center rounded-2xl border border-ios-border/70 bg-white/60 px-5 text-ios-body font-medium dark:bg-zinc-900/50"
        onClick={() => inputRef.current?.click()}
      >
        <Camera className="mr-2 h-4 w-4" />
        {diagnoseMutation.isPending ? 'Диагностика...' : 'Проверить по фото'}
      </button>

      {diagnoseMutation.isError ? (
        <p className="text-[12px] text-red-500">Не удалось выполнить диагностику. Проверьте модель OpenRouter и лимиты.</p>
      ) : null}

      {result ? (
        <motion.div
          className="rounded-2xl border border-ios-border/60 bg-white/60 p-3 text-sm dark:bg-zinc-900/45"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        >
          <p className="inline-flex items-center gap-1.5 font-semibold text-ios-text">
            {result.urgency === 'low' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            )}
            {result.problem ?? 'Проблема не определена'}
          </p>
          <p className="text-xs text-ios-subtext">Уверенность: {result.confidence}% · Срочность: {result.urgency}</p>
          {result.description ? <p className="mt-2">{result.description}</p> : null}
          {result.treatment ? <p className="mt-2"><b>Что сделать:</b> {result.treatment}</p> : null}
          {result.prevention ? <p className="mt-1"><b>Дальше:</b> {result.prevention}</p> : null}
          {result.confidence < 60 ? (
            <p className="mt-2 text-[12px] text-amber-700 dark:text-amber-400">Низкая уверенность. Сделайте ещё фото при хорошем освещении.</p>
          ) : null}
        </motion.div>
      ) : null}
    </motion.section>
  );
}
