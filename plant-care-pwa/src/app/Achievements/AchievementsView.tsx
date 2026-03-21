import { Award } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { checkAchievements, getAchievements } from '@/lib/api';
import { error as hapticError, impactLight, impactMedium, impactHeavy, success as hapticSuccess, warning as hapticWarning } from '@/lib/haptics';
import { Button } from '@/components/ui/button';
import { AchievementCard } from '@/components/AchievementCard';

export function AchievementsView() {
  const query = useQuery({ queryKey: ['achievements'], queryFn: getAchievements });
  const prevUnlockedRef = useRef<number | null>(null);
  const checkMutation = useMutation({
    mutationFn: checkAchievements,
    onSuccess: () => {
      hapticSuccess();
      void query.refetch();
    },
    onError: () => hapticError()
  });

  useEffect(() => {
    const unlocked = query.data?.unlocked;
    if (typeof unlocked !== 'number') {
      return;
    }
    if (prevUnlockedRef.current != null && unlocked > prevUnlockedRef.current) {
      impactHeavy();
    }
    prevUnlockedRef.current = unlocked;
  }, [query.data?.unlocked]);

  return (
    <div className="space-y-3">
      <div className="rounded-ios-button border border-ios-border/60 bg-white/60 p-3 dark:border-emerald-500/20 dark:bg-zinc-900/45">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-ios-accent" />
            <p className="text-ios-body font-semibold">Достижения</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              impactLight();
              checkMutation.mutate();
            }}
          >
            Проверить
          </Button>
        </div>

        <p className="mt-2 text-ios-caption text-ios-subtext">
          {query.data ? `Открыто ${query.data.unlocked} из ${query.data.total}` : 'Загружаем прогресс...'}
        </p>
      </div>

      <div className="space-y-2">
        {(query.data?.items ?? []).map((item) => (
          <AchievementCard key={item.key} item={item} />
        ))}
      </div>
    </div>
  );
}
