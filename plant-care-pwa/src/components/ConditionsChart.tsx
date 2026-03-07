import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';

import { getPlantConditionsHistory } from '@/lib/api';

export function ConditionsChart({ plantId }: { plantId: number }) {
  const historyQuery = useQuery({
    queryKey: ['plant-conditions-history', plantId],
    queryFn: () => getPlantConditionsHistory(plantId, 7)
  });

  const points = historyQuery.data?.points ?? [];

  const chart = useMemo(() => {
    if (!points.length) {
      return null;
    }

    const width = 300;
    const height = 120;
    const pad = 10;

    const temps = points.map((p) => p.temperatureC).filter((v): v is number => typeof v === 'number');
    const minTemp = temps.length ? Math.min(...temps) : 0;
    const maxTemp = temps.length ? Math.max(...temps) : 1;

    const toXY = (index: number, value: number, min: number, max: number) => {
      const x = pad + (index / Math.max(1, points.length - 1)) * (width - pad * 2);
      const norm = (value - min) / Math.max(0.0001, max - min);
      const y = height - pad - norm * (height - pad * 2);
      return `${x},${y}`;
    };

    const tempPath = points
      .map((point, idx) => (point.temperatureC == null ? null : toXY(idx, point.temperatureC, minTemp, maxTemp)))
      .filter((item): item is string => Boolean(item))
      .join(' ');

    const humPath = points
      .map((point, idx) => (point.humidityPercent == null ? null : toXY(idx, point.humidityPercent, 0, 100)))
      .filter((item): item is string => Boolean(item))
      .join(' ');

    return { width, height, tempPath, humPath };
  }, [points]);

  if (historyQuery.isLoading) {
    return <div className="ios-blur-card p-3 text-ios-caption text-ios-subtext">Готовим график за 7 дней...</div>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 330, damping: 28, mass: 1 }} className="ios-blur-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-ios-caption text-ios-subtext">Температура и влажность за 7 дней</p>
        <p className="text-[11px] text-ios-subtext">{historyQuery.data?.points.length ?? 0} точек</p>
      </div>

      {chart ? (
        <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="h-28 w-full">
          <polyline fill="none" stroke="rgb(52 199 89)" strokeWidth="2.5" points={chart.tempPath} />
          <polyline fill="none" stroke="rgb(10 132 255)" strokeWidth="2.2" points={chart.humPath} />
        </svg>
      ) : (
        <p className="text-ios-caption text-ios-subtext">Недостаточно данных для графика</p>
      )}

      <div className="mt-2 flex items-center gap-4 text-[11px] text-ios-subtext">
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-[rgb(52,199,89)]" />
          Температура
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-[rgb(10,132,255)]" />
          Влажность
        </span>
      </div>

      <p className="mt-1 text-[11px] text-ios-subtext">
        {historyQuery.data?.adjustedToday
          ? `Скорректировано сегодня: ${historyQuery.data.latestAdjustmentPercent?.toFixed(1) ?? '0'}%, ${historyQuery.data.latestAdjustmentReason ?? ''}`
          : 'Сегодня корректировка не применялась'}
      </p>
    </motion.div>
  );
}
