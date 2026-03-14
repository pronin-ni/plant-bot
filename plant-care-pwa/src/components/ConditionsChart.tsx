import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CloudSun, Link2 } from 'lucide-react';

import { getPlantConditionsHistory } from '@/lib/api';

interface ChartPoint {
  label: string;
  x: number;
  tempY: number | null;
  humY: number | null;
}

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

    const width = 328;
    const height = 180;
    const padTop = 16;
    const padBottom = 30;
    const padX = 14;
    const plotHeight = height - padTop - padBottom;

    const temps = points
      .map((p) => p.temperatureC)
      .filter((v): v is number => typeof v === 'number');

    const minTemp = temps.length ? Math.min(...temps) - 1 : 0;
    const maxTemp = temps.length ? Math.max(...temps) + 1 : 30;

    const mapTempY = (value: number) => {
      const norm = (value - minTemp) / Math.max(0.0001, maxTemp - minTemp);
      return padTop + (1 - norm) * plotHeight;
    };

    const mapHumY = (value: number) => {
      const norm = value / 100;
      return padTop + (1 - norm) * plotHeight;
    };

    const mapped: ChartPoint[] = points.map((point, idx) => {
      const x = padX + (idx / Math.max(1, points.length - 1)) * (width - padX * 2);
      const label = new Date(point.sampledAt).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
      return {
        label,
        x,
        tempY: typeof point.temperatureC === 'number' ? mapTempY(point.temperatureC) : null,
        humY: typeof point.humidityPercent === 'number' ? mapHumY(point.humidityPercent) : null
      };
    });

    const toPath = (selector: (p: ChartPoint) => number | null) => {
      const coords = mapped
        .map((p) => {
          const y = selector(p);
          if (y == null) {
            return null;
          }
          return `${p.x},${y}`;
        })
        .filter((v): v is string => Boolean(v));
      return coords.join(' ');
    };

    return {
      width,
      height,
      mapped,
      tempPath: toPath((p) => p.tempY),
      humPath: toPath((p) => p.humY)
    };
  }, [points]);

  if (historyQuery.isLoading) {
    return (
      <div className="ios-blur-card p-4 text-sm text-ios-subtext">
        Готовим динамику условий за 7 дней...
      </div>
    );
  }

  return (
    <motion.section
      className="ios-blur-card overflow-hidden p-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 330, damping: 30 }}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-ios-body font-semibold">Динамика условий · 7 дней</p>
        <p className="text-[11px] text-ios-subtext">{points.length} точек</p>
      </div>

      <AnimatePresence mode="wait">
        {chart ? (
          <motion.div
            key="chart"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          >
            <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="h-44 w-full">
              <defs>
                <linearGradient id="temp-line" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="hsl(var(--primary))" />
                  <stop offset="100%" stopColor="hsl(var(--accent))" />
                </linearGradient>
                <linearGradient id="hum-line" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="hsl(var(--accent))" />
                  <stop offset="100%" stopColor="hsl(var(--ring))" />
                </linearGradient>
              </defs>

              <rect x="0" y="0" width={chart.width} height={chart.height} rx="20" fill="rgba(255,255,255,0.08)" />

              {[0, 1, 2, 3].map((g) => {
                const y = 16 + g * ((chart.height - 46) / 3);
                return <line key={g} x1="12" y1={y} x2={chart.width - 12} y2={y} stroke="rgba(148,163,184,0.22)" strokeWidth="1" />;
              })}

              <polyline fill="none" stroke="url(#temp-line)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={chart.tempPath} />
              <polyline fill="none" stroke="url(#hum-line)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" points={chart.humPath} />

              {chart.mapped.map((p, idx) => (
                <g key={`${p.label}-${idx}`}>
                  {p.tempY != null ? <circle cx={p.x} cy={p.tempY} r="2.4" fill="hsl(var(--primary))" /> : null}
                  {p.humY != null ? <circle cx={p.x} cy={p.humY} r="2.2" fill="hsl(var(--accent))" /> : null}
                </g>
              ))}

              {chart.mapped.filter((_, idx) => idx % 2 === 0).map((p, idx) => (
                <text key={`${p.label}-tick-${idx}`} x={p.x} y={chart.height - 10} textAnchor="middle" fontSize="10" fill="rgba(113,113,122,0.85)">
                  {p.label}
                </text>
              ))}
            </svg>

            <div className="mt-2 flex items-center gap-4 text-[11px] text-ios-subtext">
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--primary))]" />Температура</span>
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--accent))]" />Влажность</span>
            </div>

            <p className="mt-1 text-[11px] text-ios-subtext">
              {historyQuery.data?.adjustedToday
                ? `Сегодня скорректировано на ${historyQuery.data.latestAdjustmentPercent?.toFixed(1) ?? '0'}%`
                : 'Сегодня авто-корректировка не применялась'}
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            className="theme-surface-subtle rounded-2xl border border-dashed p-4 text-center"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          >
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-ios-accent/14 text-ios-accent">
              <CloudSun className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-ios-text">Недостаточно данных для графика</p>
            <p className="mt-1 text-xs text-ios-subtext">Подключите HA или Яндекс — и увидите живую динамику температуры и влажности.</p>
            <p className="mt-2 inline-flex items-center gap-1 text-xs text-ios-subtext">
              <Link2 className="h-3.5 w-3.5" />
              Настройки → Интеграции
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
