import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { createPlant, getPlants } from '@/lib/api';
import { impactLight, impactMedium, impactHeavy } from '@/lib/haptics';

interface ImportPlantShape {
  name?: string;
  placement?: 'INDOOR' | 'OUTDOOR';
  category?: 'HOME' | 'OUTDOOR_DECORATIVE' | 'OUTDOOR_GARDEN';
  type?: string;
  potVolumeLiters?: number;
  baseIntervalDays?: number;
  preferredWaterMl?: number;
  outdoorAreaM2?: number | null;
  outdoorSoilType?: 'SANDY' | 'LOAMY' | 'CLAY' | null;
  sunExposure?: 'FULL_SUN' | 'PARTIAL_SHADE' | 'SHADE' | null;
  mulched?: boolean | null;
  perennial?: boolean | null;
  winterDormancyEnabled?: boolean | null;
}

interface ImportPayload {
  plants?: ImportPlantShape[];
}

export function ImportDataPanel() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string>('');

  const extractPlants = (raw: unknown): ImportPlantShape[] => {
    if (Array.isArray(raw)) {
      return raw as ImportPlantShape[];
    }
    if (raw && typeof raw === 'object' && Array.isArray((raw as ImportPayload).plants)) {
      return (raw as ImportPayload).plants ?? [];
    }
    return [];
  };

  const doImport = async () => {
    if (!selectedFile) {
      setStatus('Сначала выберите JSON-файл экспорта.');
      return;
    }

    setPending(true);
    try {
      const fileText = await selectedFile.text();
      const parsed = JSON.parse(fileText) as unknown;
      const plants = extractPlants(parsed);

      if (!plants.length) {
        setStatus('Файл не содержит данных растений.');
        impactLight();
        return;
      }

      const existingPlants = await getPlants();
      const existingKeys = new Set(existingPlants.map((plant) => `${plant.name.trim().toLowerCase()}::${plant.placement}`));

      let imported = 0;
      let skipped = 0;
      let failed = 0;

      for (const plant of plants) {
        const normalizedName = plant.name?.trim();
        if (!normalizedName) {
          failed += 1;
          continue;
        }

        const placement = plant.placement === 'OUTDOOR' ? 'OUTDOOR' : 'INDOOR';
        const dedupeKey = `${normalizedName.toLowerCase()}::${placement}`;
        if (existingKeys.has(dedupeKey)) {
          skipped += 1;
          continue;
        }

        try {
          await createPlant({
            name: normalizedName,
            placement,
            category: plant.category ?? (placement === 'OUTDOOR' ? 'OUTDOOR_DECORATIVE' : 'HOME'),
            type: plant.type ?? 'DEFAULT',
            potVolumeLiters: typeof plant.potVolumeLiters === 'number' ? plant.potVolumeLiters : 1,
            baseIntervalDays: typeof plant.baseIntervalDays === 'number' ? plant.baseIntervalDays : 7,
            preferredWaterMl: typeof plant.preferredWaterMl === 'number' ? plant.preferredWaterMl : undefined,
            outdoorAreaM2: plant.outdoorAreaM2 ?? null,
            outdoorSoilType: plant.outdoorSoilType ?? null,
            sunExposure: plant.sunExposure ?? null,
            mulched: typeof plant.mulched === 'boolean' ? plant.mulched : null,
            perennial: typeof plant.perennial === 'boolean' ? plant.perennial : null,
            winterDormancyEnabled:
              typeof plant.winterDormancyEnabled === 'boolean' ? plant.winterDormancyEnabled : null
          });
          existingKeys.add(dedupeKey);
          imported += 1;
        } catch (error) {
          console.error(error);
          failed += 1;
        }
      }

      setStatus(`Импорт завершён. Добавлено: ${imported}, пропущено: ${skipped}, ошибок: ${failed}.`);
      if (imported > 0) {
        impactMedium();
      } else {
        impactLight();
      }

      if (imported > 0) {
        await queryClient.invalidateQueries({ queryKey: ['plants'] });
        await queryClient.invalidateQueries({ queryKey: ['calendar'] });
      }
    } catch (error) {
      console.error(error);
      setStatus('Не удалось прочитать файл импорта. Проверьте JSON-формат.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-ios-subtext">Импорт из локального JSON-файла (экспорт из приложения).</p>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
      />

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={pending}>
          <FileUp className="mr-2 h-4 w-4" />
          {selectedFile ? 'Заменить файл' : 'Выбрать файл'}
        </Button>

        <Button variant="secondary" onClick={() => void doImport()} disabled={pending || !selectedFile}>
          {pending ? 'Импортируем...' : 'Импортировать'}
        </Button>
      </div>

      <p className="text-xs text-ios-subtext">Файл: {selectedFile?.name ?? 'не выбран'}</p>
      {status ? <p className="text-xs text-ios-subtext">{status}</p> : null}
    </div>
  );
}
