import { Award, Camera, Droplets, Sparkles, Sprout, Sun, Trees } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { checkAchievements, getAchievements } from '@/lib/api';
import { hapticImpact, hapticNotify } from '@/lib/telegram';
import type { AchievementItem } from '@/types/api';
import { Button } from '@/components/ui/button';

const iconMap = {
  Sprout,
  Trees,
  Droplets,
  Droplet: Droplets,
  Sun,
  Camera,
  Sparkles
} as const;

export function AchievementsView() {
  const query = useQuery({ queryKey: ['achievements'], queryFn: getAchievements });
  const prevUnlockedRef = useRef<number | null>(null);
  const checkMutation = useMutation({
    mutationFn: checkAchievements,
    onSuccess: () => {
      hapticNotify('success');
      void query.refetch();
    },
    onError: () => hapticNotify('error')
  });

  useEffect(() => {
    const unlocked = query.data?.unlocked;
    if (typeof unlocked !== 'number') {
      return;
    }
    if (prevUnlockedRef.current != null && unlocked > prevUnlockedRef.current) {
      // При разблокировке достижения делаем выраженный отклик.
      hapticImpact('heavy');
    }
    prevUnlockedRef.current = unlocked;
  }, [query.data?.unlocked]);

  return (
    <div className="ios-blur-card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-ios-accent" />
          <p className="text-ios-body font-semibold">Достижения</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            hapticImpact('light');
            checkMutation.mutate();
          }}
        >
          Проверить
        </Button>
      </div>

      <p className="text-ios-caption text-ios-subtext">
        {query.data ? `Открыто ${query.data.unlocked} из ${query.data.total}` : 'Загружаем прогресс...'}
      </p>

      <div className="space-y-2">
        {(query.data?.items ?? []).map((item) => (
          <AchievementRow key={item.key} item={item} />
        ))}
      </div>
    </div>
  );
}

function AchievementRow({ item }: { item: AchievementItem }) {
  const Icon = iconMap[item.icon as keyof typeof iconMap] ?? Award;
  const pct = Math.round((item.progress / Math.max(1, item.target)) * 100);

  return (
    <div className={`rounded-ios-button border p-3 ${item.unlocked ? 'border-green-300 bg-green-50/70' : 'border-ios-border/60 bg-white/60 dark:bg-zinc-900/40'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-ios-accent" />
          <div>
            <p className="text-sm font-semibold">{item.title}</p>
            <p className="text-xs text-ios-subtext">{item.description}</p>
          </div>
        </div>
        <p className="text-xs text-ios-subtext">{item.progress}/{item.target}</p>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-black/10">
        <div className="h-1.5 rounded-full bg-ios-accent" style={{ width: `${Math.max(4, Math.min(100, pct))}%` }} />
      </div>
    </div>
  );
}
