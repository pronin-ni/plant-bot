import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, Home, LoaderCircle, Thermometer, Waves, SunMedium, Droplets } from 'lucide-react';

import { bindPlantRoom, getHomeAssistantRoomsAndSensors } from '@/lib/api';
import { hapticImpact, hapticNotify } from '@/lib/telegram';
import type { HaSensor, HaSelectionMode, PlantRoomBindingRequest } from '@/types/home-assistant';
import { Button } from '@/components/ui/button';

interface Props {
  plantId?: number;
  compact?: boolean;
  onSaved?: () => void;
}

const springTransition = { type: 'spring', stiffness: 360, damping: 28, mass: 1 } as const;

export function RoomAndSensorSelector({ plantId, compact = false, onSaved }: Props) {
  const [selectionMode, setSelectionMode] = useState<HaSelectionMode>('AUTO_DISCOVERY');
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [selectedRoomName, setSelectedRoomName] = useState<string>('');
  const [temperatureEntityId, setTemperatureEntityId] = useState<string>('');
  const [humidityEntityId, setHumidityEntityId] = useState<string>('');
  const [soilMoistureEntityId, setSoilMoistureEntityId] = useState<string>('');
  const [illuminanceEntityId, setIlluminanceEntityId] = useState<string>('');
  const [autoAdjustmentEnabled, setAutoAdjustmentEnabled] = useState(true);

  const roomsSensorsQuery = useQuery({
    queryKey: ['ha-rooms-and-sensors'],
    queryFn: getHomeAssistantRoomsAndSensors
  });

  const bindMutation = useMutation({
    mutationFn: (payload: PlantRoomBindingRequest) => {
      if (!plantId) {
        throw new Error('Сначала сохраните растение, затем привяжите датчики');
      }
      return bindPlantRoom(plantId, payload);
    },
    onSuccess: () => {
      hapticNotify('success');
      onSaved?.();
    },
    onError: () => hapticNotify('error')
  });

  const sensorsByKind = useMemo(() => {
    const sensors = roomsSensorsQuery.data?.sensors ?? [];
    return {
      TEMPERATURE: sensors.filter((sensor) => sensor.kind === 'TEMPERATURE'),
      HUMIDITY: sensors.filter((sensor) => sensor.kind === 'HUMIDITY'),
      SOIL_MOISTURE: sensors.filter((sensor) => sensor.kind === 'SOIL_MOISTURE'),
      ILLUMINANCE: sensors.filter((sensor) => sensor.kind === 'ILLUMINANCE')
    } satisfies Record<'TEMPERATURE' | 'HUMIDITY' | 'SOIL_MOISTURE' | 'ILLUMINANCE', HaSensor[]>;
  }, [roomsSensorsQuery.data?.sensors]);

  const roomOptions = roomsSensorsQuery.data?.rooms ?? [];

  if (roomsSensorsQuery.data && !roomsSensorsQuery.data.connected) {
    return null;
  }

  const saveBinding = () => {
    const payload: PlantRoomBindingRequest = {
      areaId: selectedRoomId || undefined,
      areaName: selectedRoomName || undefined,
      selectionMode,
      temperatureEntityId: temperatureEntityId || undefined,
      humidityEntityId: humidityEntityId || undefined,
      soilMoistureEntityId: soilMoistureEntityId || undefined,
      illuminanceEntityId: illuminanceEntityId || undefined,
      autoAdjustmentEnabled,
      maxAdjustmentFraction: 0.35
    };
    hapticImpact('medium');
    bindMutation.mutate(payload);
  };

  const cardClass = compact ? 'space-y-3 rounded-ios-card border border-ios-border/60 bg-ios-card/45 p-3' : 'ios-blur-card space-y-3 p-4';

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={springTransition} className={cardClass}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-ios-body font-medium">Home Assistant: комнаты и сенсоры</p>
        {roomsSensorsQuery.isFetching ? <LoaderCircle className="h-4 w-4 animate-spin text-ios-subtext" /> : null}
      </div>

      {!roomsSensorsQuery.data?.connected ? (
        <p className="theme-banner-danger rounded-lg border px-3 py-2 text-ios-caption">{roomsSensorsQuery.data?.message ?? 'Home Assistant не подключен'}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={selectionMode === 'AUTO_DISCOVERY' ? 'default' : 'secondary'}
          onClick={() => setSelectionMode('AUTO_DISCOVERY')}
        >
          Авто по комнате
        </Button>
        <Button
          variant={selectionMode === 'MANUAL' ? 'default' : 'secondary'}
          onClick={() => setSelectionMode('MANUAL')}
        >
          Ручной выбор
        </Button>
      </div>

      <label className="block">
        <span className="mb-1 block text-ios-caption text-ios-subtext">Комната (Area)</span>
        <select
          value={selectedRoomId}
          onChange={(event) => {
            const id = event.target.value;
            setSelectedRoomId(id);
            const room = roomOptions.find((item) => item.id === id);
            setSelectedRoomName(room?.name ?? '');
          }}
          className="theme-field h-11 w-full rounded-ios-button border px-3 text-ios-body outline-none backdrop-blur-ios"
        >
          <option value="">Не выбрано</option>
          {roomOptions.map((room) => (
            <option key={room.id} value={room.id}>{room.name}</option>
          ))}
        </select>
      </label>

      {selectionMode === 'MANUAL' ? (
        <div className="space-y-2">
          <SensorSelect icon={Thermometer} label="Температура" value={temperatureEntityId} onChange={setTemperatureEntityId} options={sensorsByKind.TEMPERATURE} />
          <SensorSelect icon={Waves} label="Влажность" value={humidityEntityId} onChange={setHumidityEntityId} options={sensorsByKind.HUMIDITY} />
          <SensorSelect icon={Droplets} label="Влажность почвы" value={soilMoistureEntityId} onChange={setSoilMoistureEntityId} options={sensorsByKind.SOIL_MOISTURE} />
          <SensorSelect icon={SunMedium} label="Освещенность" value={illuminanceEntityId} onChange={setIlluminanceEntityId} options={sensorsByKind.ILLUMINANCE} />
        </div>
      ) : (
        <p className="text-ios-caption text-ios-subtext">Сенсоры подберутся автоматически по комнате и названию растения.</p>
      )}

      <button
        type="button"
        onClick={() => setAutoAdjustmentEnabled((prev) => !prev)}
        className="theme-surface-subtle flex w-full items-center justify-between rounded-ios-button border px-3 py-2 text-left"
      >
        <span className="inline-flex items-center gap-2 text-ios-body">
          <Home className="h-4 w-4 text-ios-accent" />
          Автокоррекция интервала
        </span>
        {autoAdjustmentEnabled ? <Check className="h-4 w-4 text-ios-accent" /> : null}
      </button>

      <Button className="w-full" onClick={saveBinding} disabled={bindMutation.isPending || !plantId}>
        {bindMutation.isPending ? 'Сохраняем...' : 'Сохранить привязку'}
      </Button>

      {bindMutation.isError ? (
        <p className="theme-banner-danger rounded-lg border px-3 py-2 text-ios-caption">{(bindMutation.error as Error).message}</p>
      ) : null}
    </motion.div>
  );
}

function SensorSelect({
  icon: Icon,
  label,
  value,
  onChange,
  options
}: {
  icon: typeof Thermometer;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: HaSensor[];
}) {
  return (
    <label className="block">
      <span className="mb-1 inline-flex items-center gap-1 text-ios-caption text-ios-subtext">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="theme-field h-10 w-full rounded-ios-button border px-3 text-[13px] outline-none backdrop-blur-ios"
      >
        <option value="">Не выбрано</option>
        {options.map((sensor) => (
          <option key={sensor.entityId} value={sensor.entityId}>
            {sensor.friendlyName} ({sensor.entityId})
          </option>
        ))}
      </select>
    </label>
  );
}
