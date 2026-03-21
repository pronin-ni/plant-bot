import { Camera } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { uploadPlantPhoto } from '@/lib/api';
import { clientStorageGet, clientStorageSet } from '@/lib/clientStorage';
import { error as hapticError, impactLight, impactMedium, impactHeavy, success as hapticSuccess, warning as hapticWarning } from '@/lib/haptics';
import { Button } from '@/components/ui/button';

type GrowthShot = {
  createdAt: string;
  photoUrl: string;
};

function keyForPlant(plantId: number) {
  return `growth:plant:${plantId}`;
}

export function GrowthGallery({ plantId, photoUrl }: { plantId: number; photoUrl?: string }) {
  const queryClient = useQueryClient();
  const [history, setHistory] = useState<GrowthShot[]>([]);

  const uploadMutation = useMutation({
    mutationFn: ({ id, dataUrl }: { id: number; dataUrl: string }) => uploadPlantPhoto(id, dataUrl),
    onSuccess: async (res) => {
      hapticSuccess();
      const next: GrowthShot[] = [
        {
          createdAt: new Date().toISOString(),
          photoUrl: res.photoUrl ?? ''
        },
        ...history
      ].filter((item) => item.photoUrl).slice(0, 20);
      setHistory(next);
      await clientStorageSet(keyForPlant(plantId), JSON.stringify(next));
      void queryClient.invalidateQueries({ queryKey: ['plant', plantId] });
      void queryClient.invalidateQueries({ queryKey: ['plants'] });
    },
    onError: () => hapticError()
  });

  useEffect(() => {
    let cancelled = false;
    void clientStorageGet(keyForPlant(plantId)).then((raw) => {
      if (cancelled || !raw) {
        return;
      }
      try {
        const parsed = JSON.parse(raw) as GrowthShot[];
        setHistory(parsed.filter((item) => item.photoUrl));
      } catch {
        // ignore invalid cache
      }
    });
    return () => {
      cancelled = true;
    };
  }, [plantId]);

  return (
    <div className="ios-blur-card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-ios-body font-semibold">Камера роста</p>
        <label>
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
              impactLight();
              void toDataUrl(file).then((dataUrl) => uploadMutation.mutate({ id: plantId, dataUrl }));
            }}
          />
          <Button type="button" size="sm" variant="secondary">
            <Camera className="mr-1 h-4 w-4" />
            Добавить
          </Button>
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {photoUrl ? (
          <img src={photoUrl} alt="Текущее фото" className="h-20 w-full rounded-ios-button object-cover" />
        ) : null}
        {history.map((shot) => (
          <img key={`${shot.createdAt}-${shot.photoUrl}`} src={shot.photoUrl} alt="История роста" className="h-20 w-full rounded-ios-button object-cover" />
        ))}
      </div>

      {!photoUrl && history.length === 0 ? <p className="text-ios-caption text-ios-subtext">Пока нет снимков динамики роста.</p> : null}
    </div>
  );
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Не удалось прочитать фото'));
    reader.readAsDataURL(file);
  });
}
