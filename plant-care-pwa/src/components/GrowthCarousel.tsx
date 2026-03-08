import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Sprout } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { uploadPlantPhoto } from '@/lib/api';
import { cloudStorageGet, cloudStorageSet, hapticImpact, hapticNotify } from '@/lib/telegram';

interface GrowthCarouselProps {
  plantId: number;
  currentPhotoUrl?: string;
}

type GrowthShot = {
  createdAt: string;
  photoUrl: string;
};

function storageKey(plantId: number) {
  return `growth:plant:${plantId}`;
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Не удалось прочитать фото'));
    reader.readAsDataURL(file);
  });
}

function prettyDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
}

export function GrowthCarousel({ plantId, currentPhotoUrl }: GrowthCarouselProps) {
  const queryClient = useQueryClient();
  const [history, setHistory] = useState<GrowthShot[]>([]);

  const uploadMutation = useMutation({
    mutationFn: ({ id, dataUrl }: { id: number; dataUrl: string }) => uploadPlantPhoto(id, dataUrl),
    onSuccess: async (res) => {
      hapticNotify('success');
      const next: GrowthShot[] = [
        {
          createdAt: new Date().toISOString(),
          photoUrl: res.photoUrl ?? ''
        },
        ...history
      ]
        .filter((item) => item.photoUrl)
        .slice(0, 30);

      setHistory(next);
      await cloudStorageSet(storageKey(plantId), JSON.stringify(next));
      void queryClient.invalidateQueries({ queryKey: ['plant', plantId] });
      void queryClient.invalidateQueries({ queryKey: ['plants'] });
    },
    onError: () => hapticNotify('error')
  });

  useEffect(() => {
    let cancelled = false;
    void cloudStorageGet(storageKey(plantId)).then((raw) => {
      if (cancelled || !raw) {
        return;
      }
      try {
        const parsed = JSON.parse(raw) as GrowthShot[];
        setHistory(parsed.filter((item) => item.photoUrl));
      } catch {
        // ignore malformed cached payload
      }
    });
    return () => {
      cancelled = true;
    };
  }, [plantId]);

  const slides = useMemo(() => {
    const base = history.filter((item) => item.photoUrl);
    if (currentPhotoUrl && !base.some((item) => item.photoUrl === currentPhotoUrl)) {
      return [{ createdAt: new Date().toISOString(), photoUrl: currentPhotoUrl }, ...base].slice(0, 6);
    }
    return base.slice(0, 6);
  }, [currentPhotoUrl, history]);

  return (
    <motion.section
      className="ios-blur-card relative overflow-hidden p-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-ios-body font-semibold">Камера роста</p>
        <p className="text-xs text-ios-subtext">Последние снимки</p>
      </div>

      <AnimatePresence mode="wait">
        {slides.length ? (
          <motion.div
            key="carousel"
            className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          >
            {slides.map((shot, index) => (
              <motion.figure
                key={`${shot.createdAt}-${shot.photoUrl}`}
                className="relative w-[172px] shrink-0 snap-start overflow-hidden rounded-2xl border border-ios-border/55 bg-white/60 dark:bg-zinc-900/50"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 360, damping: 30, delay: index * 0.04 }}
              >
                <img src={shot.photoUrl} alt="Снимок роста" className="h-36 w-full object-cover" />
                <figcaption className="border-t border-ios-border/45 px-2.5 py-1.5 text-[11px] text-ios-subtext">
                  {prettyDate(shot.createdAt)}
                </figcaption>
              </motion.figure>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            className="relative flex h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-ios-border/60 bg-white/45 text-center dark:bg-zinc-900/35"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
          >
            <div className="mb-2 rounded-full bg-ios-accent/14 p-3 text-ios-accent">
              <Sprout className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-ios-text">Начните документировать рост</p>
            <p className="mt-1 max-w-[220px] text-xs text-ios-subtext">
              Добавляйте фото каждую неделю, чтобы видеть, как растение меняется.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <label className="absolute bottom-4 right-4">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) {
              return;
            }
            hapticImpact('medium');
            void toDataUrl(file).then((dataUrl) => uploadMutation.mutate({ id: plantId, dataUrl }));
          }}
        />
        <Button
          type="button"
          size="sm"
          className="h-11 rounded-full px-4 shadow-[0_10px_24px_rgba(52,199,89,0.25)]"
          disabled={uploadMutation.isPending}
        >
          <Camera className="mr-1.5 h-4 w-4" />
          {uploadMutation.isPending ? 'Добавляем...' : 'Добавить'}
        </Button>
      </label>
    </motion.section>
  );
}
