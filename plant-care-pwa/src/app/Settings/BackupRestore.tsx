import { Database } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { createPlant, deletePlant, getPlants } from '@/lib/api';
import { clientStorageGet, clientStorageSet } from '@/lib/clientStorage';
import { error as hapticError, impactLight, success as hapticSuccess } from '@/lib/haptics';
import type { PlantDto } from '@/types/api';
import { ExportImportSection } from '@/components/ExportImportSection';

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
      await clientStorageSet(BACKUP_KEY, JSON.stringify(payload));
      return payload;
    },
    onSuccess: () => hapticSuccess(),
    onError: () => hapticError()
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const raw = await clientStorageGet(BACKUP_KEY);
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
      hapticSuccess();
      void queryClient.invalidateQueries({ queryKey: ['plants'] });
      void queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
    onError: () => hapticError()
  });

  return (
    <div className="space-y-3">
      <div className="rounded-ios-button border border-ios-border/60 bg-white/60 p-3 dark:border-emerald-500/20 dark:bg-zinc-900/45">
        <div className="mb-1.5 flex items-center gap-2">
          <Database className="h-4 w-4 text-ios-accent" />
          <p className="text-ios-body font-semibold">Экспорт / импорт</p>
        </div>
        <p className="text-ios-caption text-ios-subtext">
          Сохранение и восстановление через локальное хранилище браузера.
        </p>
      </div>

      <ExportImportSection
        restoreMode={restoreMode}
        onChangeMode={(next) => {
          impactLight();
          setRestoreMode(next);
        }}
        onExport={() => {
          impactLight();
          exportMutation.mutate();
        }}
        onImport={() => {
          impactLight();
          importMutation.mutate();
        }}
        exportPending={exportMutation.isPending}
        importPending={importMutation.isPending}
        importError={importMutation.error ? (importMutation.error as Error).message : null}
        importedCount={importMutation.data ?? null}
      />
    </div>
  );
}

function keyOf(name: string, placement: string) {
  return `${name.trim().toLowerCase()}::${placement}`;
}
