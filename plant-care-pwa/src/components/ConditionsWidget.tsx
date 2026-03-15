import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertTriangle, Droplets, SunMedium, Thermometer, Waves } from 'lucide-react';

import { getPlantConditions } from '@/lib/api';

export function ConditionsWidget({ plantId, compact = false }: { plantId: number; compact?: boolean }) {
  const query = useQuery({
    queryKey: ['plant-conditions', plantId],
    queryFn: () => getPlantConditions(plantId),
    refetchInterval: 60_000
  });

  if (query.isLoading || query.isError || !query.data) {
    return null;
  }

  const conditions = query.data;
  const hasAnyValue = conditions.sampledAt || conditions.temperatureC != null || conditions.humidityPercent != null
    || conditions.soilMoisturePercent != null || conditions.illuminanceLux != null || !!conditions.source;
  if (!hasAnyValue) {
    return null;
  }
  const className = compact ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-2 gap-2';

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 340, damping: 28, mass: 1 }} className="ios-blur-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-ios-caption text-ios-subtext">Текущие условия</p>
        <p className="text-[11px] text-ios-subtext">{conditions.sampledAt ? new Date(conditions.sampledAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
      </div>

      <div className={className}>
        <Metric icon={Thermometer} label="Температура" value={conditions.temperatureC != null ? `${conditions.temperatureC.toFixed(1)} °C` : '—'} />
        <Metric icon={Waves} label="Влажность" value={conditions.humidityPercent != null ? `${conditions.humidityPercent.toFixed(0)} %` : '—'} />
        <Metric icon={Droplets} label="Почва" value={conditions.soilMoisturePercent != null ? `${conditions.soilMoisturePercent.toFixed(0)} %` : '—'} />
        <Metric icon={SunMedium} label="Свет" value={conditions.illuminanceLux != null ? `${Math.round(conditions.illuminanceLux)} lux` : '—'} />
      </div>

      {conditions.illuminanceWarning ? (
        <p className="theme-text-warning mt-2 inline-flex items-center gap-1 text-[12px]">
          <AlertTriangle className="h-3.5 w-3.5" />
          {conditions.illuminanceWarning}
        </p>
      ) : null}

      <p className="mt-1 text-[11px] text-ios-subtext">
        {conditions.adjustedToday
          ? `Скорректировано сегодня: ${conditions.latestAdjustmentPercent?.toFixed(1) ?? '0'}%`
          : 'Сегодня без дополнительной корректировки'}
      </p>
    </motion.div>
  );
}

function Metric({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Thermometer;
  label: string;
  value: string;
}) {
  return (
    <div className="theme-surface-subtle rounded-ios-button border p-2">
      <div className="inline-flex items-center gap-1 text-[11px] text-ios-subtext">
        <Icon className="h-3.5 w-3.5 text-ios-accent" />
        {label}
      </div>
      <div className="mt-0.5 text-[13px] font-semibold text-ios-text">{value}</div>
    </div>
  );
}
