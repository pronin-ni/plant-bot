import { Database, Download, Upload } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { createPlant, deletePlant, getPlants } from '@/lib/api';
import { cloudStorageGet, cloudStorageSet, hapticImpact, hapticNotify } from '@/lib/telegram';
import type { PlantDto } from '@/types/api';
import { Button } from '@/components/ui/button';

const BACKUP_KEY = 'plantbot:backup:v1';

type BackupPayload = {
  savedAt: string;
  plants: PlantDto[];
};

type RestoreMode = 'MERGE' | 'REPLACE';

export function BackupRestore() {
  const queryClient = useQueryClient();
  const plantsQuery = useQuery({ queryKey: ['plants'], queryFn: getPlants });
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('MERGE');

  const exportMutation = useMutation({
    mutationFn: async () => {
      const plants = plantsQuery.data ?? [];
      const payload: BackupPayload = { savedAt: new Date().toISOString(), plants };
      await cloudStorageSet(BACKUP_KEY, JSON.stringify(payload));
      return payload;
    },
    onSuccess: () => hapticNotify('success'),
    onError: () => hapticNotify('error')
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const raw = await cloudStorageGet(BACKUP_KEY);
      if (!raw) {
        throw new Error('В Cloud Storage нет бэкапа');
      }
      const payload = JSON.parse(raw) as BackupPayload;
      const existing = await getPlants();
      if (restoreMode === 'REPLACE') {
        for (const plant of existing) {
          await deletePlant(plant.id);
        }
      }
      const existingKeys = new Set((restoreMode === 'REPLACE' ? [] : existing).map((plant) => keyOf(plant.name, plant.placement)));
      let imported = 0;

      for (const plant of payload.plants) {
        const key = keyOf(plant.name, plant.placement);
        if (restoreMode === 'MERGE' && existingKeys.has(key)) {
          continue;
        }
        await createPlant({
          name: plant.name,
          placement: plant.placement,
          potVolumeLiters: plant.potVolumeLiters ?? (plant.placement === 'INDOOR' ? 1.5 : 1),
          baseIntervalDays: plant.baseIntervalDays ?? 7,
          type: plant.type ?? 'DEFAULT',
          outdoorAreaM2: plant.outdoorAreaM2 ?? null,
          outdoorSoilType: plant.outdoorSoilType ?? null,
          sunExposure: plant.sunExposure ?? null,
          mulched: plant.mulched ?? null,
          perennial: plant.perennial ?? null,
          winterDormancyEnabled: plant.winterDormancyEnabled ?? null
        });
        imported += 1;
        existingKeys.add(key);
      }
      return imported;
    },
    onSuccess: () => {
      hapticNotify('success');
      void queryClient.invalidateQueries({ queryKey: ['plants'] });
      void queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
    onError: () => hapticNotify('error')
  });

  return (
    <div className="ios-blur-card space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-ios-accent" />
        <p className="text-ios-body font-semibold">Экспорт / импорт</p>
      </div>
      <p className="text-ios-caption text-ios-subtext">
        Данные можно сохранить в Telegram Cloud Storage и восстановить на другом устройстве.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={restoreMode === 'MERGE' ? 'default' : 'secondary'}
          onClick={() => setRestoreMode('MERGE')}
        >
          Объединить
        </Button>
        <Button
          variant={restoreMode === 'REPLACE' ? 'default' : 'secondary'}
          onClick={() => setRestoreMode('REPLACE')}
        >
          Заменить
        </Button>
      </div>
      <p className="text-xs text-ios-subtext">
        {restoreMode === 'MERGE'
          ? 'Merge: существующие растения не дублируются (по имени и размещению).'
          : 'Replace: текущие растения удаляются, затем импортируются из бэкапа.'}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            hapticImpact('light');
            exportMutation.mutate();
          }}
          disabled={exportMutation.isPending}
        >
          <Download className="mr-2 h-4 w-4" />
          {exportMutation.isPending ? 'Сохраняем...' : 'Экспорт'}
        </Button>

        <Button
          variant="secondary"
          onClick={() => {
            hapticImpact('light');
            importMutation.mutate();
          }}
          disabled={importMutation.isPending}
        >
          <Upload className="mr-2 h-4 w-4" />
          {importMutation.isPending ? 'Импорт...' : 'Импорт'}
        </Button>
      </div>

      {importMutation.error ? <p className="text-xs text-red-600">{(importMutation.error as Error).message}</p> : null}
      {importMutation.data != null ? <p className="text-xs text-ios-subtext">Импортировано растений: {importMutation.data}</p> : null}
    </div>
  );
}

function keyOf(name: string, placement: string) {
  return `${name.trim().toLowerCase()}::${placement}`;
}
