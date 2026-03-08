import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Camera, Home, Share2, Sprout, Trash2, TreePine } from 'lucide-react';

import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { hapticImpact } from '@/lib/telegram';
import type { PlantDto } from '@/types/api';

interface PlantHeroProps {
  plant: PlantDto;
  previewDataUrl?: string | null;
  photoUploading?: boolean;
  onPickPhoto: (file: File) => void | Promise<void>;
  onRequestDelete?: () => void;
  celebratePulse?: number;
}

function categoryMeta(plant: PlantDto): { label: string; icon: typeof Home } {
  if (plant.category === 'OUTDOOR_DECORATIVE') {
    return { label: 'Декоративное уличное', icon: TreePine };
  }
  if (plant.category === 'OUTDOOR_GARDEN') {
    return { label: 'Садовое', icon: Sprout };
  }
  if (plant.placement === 'OUTDOOR') {
    return { label: 'Уличное растение', icon: TreePine };
  }
  return { label: 'Домашнее растение', icon: Home };
}

export function PlantHero({
  plant,
  previewDataUrl,
  photoUploading = false,
  onPickPhoto,
  onRequestDelete,
  celebratePulse = 0
}: PlantHeroProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const prevPhotoSrcRef = useRef<string | null>(null);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [photoBloom, setPhotoBloom] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const photoSrc = previewDataUrl ?? plant.photoUrl ?? null;
  const meta = categoryMeta(plant);
  const Icon = meta.icon;

  const handleShare = async () => {
    if (!navigator.share) {
      return;
    }
    hapticImpact('light');
    try {
      await navigator.share({
        title: `Моё растение: ${plant.name}`,
        text: `Карточка растения ${plant.name}`,
        url: window.location.href
      });
    } catch {
      // Пользователь мог закрыть системный share-sheet: это нормальный сценарий.
    }
  };

  useEffect(() => {
    if (!photoSrc) {
      prevPhotoSrcRef.current = photoSrc;
      return;
    }
    if (prevPhotoSrcRef.current && prevPhotoSrcRef.current !== photoSrc) {
      setPhotoBloom(true);
      window.setTimeout(() => setPhotoBloom(false), 820);
    }
    prevPhotoSrcRef.current = photoSrc;
  }, [photoSrc]);

  return (
    <>
      <motion.section
        className="relative overflow-hidden rounded-[28px] border border-ios-border/45 bg-white/35 shadow-[0_18px_42px_rgba(0,0,0,0.15)] android:rounded-[24px] android:border-[#E7E0EC] android:bg-[#FFFBFE] android:shadow-[0_3px_12px_rgba(0,0,0,0.2)]"
        initial={{ opacity: 0, y: 14, scale: 0.99 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 1 }}
        animate={
          celebratePulse > 0
            ? { opacity: 1, y: 0, scale: [1, 1.08, 1] }
            : { opacity: 1, y: 0, scale: 1 }
        }
        onContextMenu={(event) => {
          // Быстрое меню по long-press/context-menu: share или удаление.
          event.preventDefault();
          hapticImpact('light');
          setQuickMenuOpen(true);
        }}
      >
        <div className="relative h-[260px] w-full overflow-hidden sm:h-[300px]">
          {photoSrc ? (
            <motion.div layoutId={`plant-photo-${plant.id}`} className="h-full w-full">
              <motion.img
                key={photoSrc}
                src={photoSrc}
                alt={plant.name}
                className="h-full w-full object-cover"
                initial={
                  previewDataUrl
                    ? { opacity: 0, scale: 0.78, y: 20 }
                    : { opacity: 0, scale: 1.06, y: 0 }
                }
                animate={
                  celebratePulse > 0
                    ? { opacity: 1, scale: [1, 1.02, 1], rotate: [0, -1.2, 1.2, 0], y: 0 }
                    : { opacity: 1, scale: 1, y: 0 }
                }
                transition={{
                  type: prefersReducedMotion ? 'tween' : 'spring',
                  duration: prefersReducedMotion ? 0.24 : undefined,
                  mass: 1.2,
                  stiffness: 250,
                  damping: 24
                }}
              />
            </motion.div>
          ) : (
            <motion.div
              layoutId={`plant-photo-${plant.id}`}
              className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_20%_20%,rgba(52,199,89,0.28),transparent_40%),radial-gradient(circle_at_78%_12%,rgba(96,165,250,0.25),transparent_40%),linear-gradient(160deg,rgba(255,255,255,0.44),rgba(240,247,243,0.25))] backdrop-blur-[16px] dark:bg-[radial-gradient(circle_at_20%_20%,rgba(52,199,89,0.30),transparent_45%),radial-gradient(circle_at_78%_12%,rgba(96,165,250,0.28),transparent_45%),linear-gradient(160deg,rgba(30,30,32,0.58),rgba(18,18,20,0.48))]"
            >
              <div className="rounded-full border border-white/35 bg-white/30 p-4 backdrop-blur-[10px] dark:border-white/20 dark:bg-white/10">
                <Sprout className="h-8 w-8 text-ios-accent" />
              </div>
            </motion.div>
          )}

          <AnimatePresence>
            {photoBloom && !prefersReducedMotion ? (
              <motion.div
                className="pointer-events-none absolute inset-0 z-20"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {Array.from({ length: 8 }).map((_, index) => (
                  <motion.span
                    key={index}
                    className="absolute bottom-8 h-2 w-2 rounded-full bg-emerald-300/85"
                    style={{ left: `${16 + index * 9}%` }}
                    initial={{ y: 10, opacity: 0, scale: 0.7 }}
                    animate={{ y: -32 - index * 2, opacity: [0, 1, 0], scale: [0.7, 1.1, 0.9] }}
                    transition={{ duration: 0.65, delay: index * 0.02, ease: 'easeOut' }}
                  />
                ))}
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/62 via-black/26 to-transparent" />

          <div className="absolute inset-x-0 bottom-0 p-4">
            <p className="inline-flex items-center gap-1 rounded-full border border-white/35 bg-black/20 px-2.5 py-1 text-[11px] text-white/90 backdrop-blur-[10px]">
              <Icon className="h-3.5 w-3.5" />
              {meta.label}
            </p>
            <h2 className="mt-2 text-[30px] font-semibold leading-[1.05] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
              {plant.name}
            </h2>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) {
              return;
            }
            void onPickPhoto(file);
          }}
        />

        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          className="android-ripple absolute bottom-4 right-4 inline-flex h-12 items-center gap-2 rounded-full border border-white/40 bg-white/30 px-4 text-sm font-medium text-white shadow-[0_8px_24px_rgba(0,0,0,0.26)] backdrop-blur-[18px] android:h-11 android:rounded-[18px] android:border-[#D0C9D8] android:bg-[#F2ECF8] android:text-[#2D2730] android:shadow-[0_1px_3px_rgba(0,0,0,0.22)] android:backdrop-blur-0"
          onClick={() => {
            hapticImpact('light');
            inputRef.current?.click();
          }}
          disabled={photoUploading}
        >
          <Camera className="h-4 w-4" />
          {photoUploading ? 'Загрузка...' : 'Загрузить фото'}
        </motion.button>
      </motion.section>

      <Dialog
        open={quickMenuOpen}
        onOpenChange={setQuickMenuOpen}
        title="Быстрое меню"
        description="Действия для карточки растения"
      >
        <div className="grid grid-cols-1 gap-2">
          <Button
            variant="secondary"
            className="h-11 justify-start"
            onClick={() => {
              void handleShare();
              setQuickMenuOpen(false);
            }}
          >
            <Share2 className="mr-2 h-4 w-4" />
            Поделиться
          </Button>
          <Button
            variant="ghost"
            className="h-11 justify-start border border-red-300/70 bg-red-50/70 text-red-600 hover:bg-red-100/70 dark:border-red-700/60 dark:bg-red-950/35 dark:text-red-300"
            onClick={() => {
              hapticImpact('medium');
              setQuickMenuOpen(false);
              onRequestDelete?.();
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Удалить растение
          </Button>
        </div>
      </Dialog>
    </>
  );
}
