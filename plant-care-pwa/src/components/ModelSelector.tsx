import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Camera, CheckCircle2, Image as ImageIcon, Lock, Sparkles, Wand2 } from 'lucide-react';

import type { OpenRouterModelOption } from '@/types/api';

interface ModelSelectorProps {
  models: OpenRouterModelOption[];
  chatModel?: string | null;
  visionModel?: string | null;
  onlyFree: boolean;
  apiKeyMasked?: boolean;
  onToggleFree: (next: boolean) => void;
  onSelectChat: (id: string) => void;
  onSelectVision: (id: string) => void;
  onSave: () => void;
  saving: boolean;
  onTest: () => void;
  testing: boolean;
  status?: string | null;
}

function tagFree(model: OpenRouterModelOption) {
  return model.free ? 'Бесплатно' : 'Оплачиваемая';
}

function priceLabel(model: OpenRouterModelOption) {
  if (model.free) return '0$';
  if (model.inputPrice || model.outputPrice) {
    return `${model.inputPrice ?? ''}${model.inputPrice && model.outputPrice ? ' / ' : ''}${model.outputPrice ?? ''}`;
  }
  return 'по тарифу';
}

export function ModelSelector({
  models,
  chatModel,
  visionModel,
  onlyFree,
  apiKeyMasked,
  onToggleFree,
  onSelectChat,
  onSelectVision,
  onSave,
  saving,
  onTest,
  testing,
  status
}: ModelSelectorProps) {
  const textModels = useMemo(
    () => models.filter((m) => !m.supportsImageToText && (!onlyFree || m.free)),
    [models, onlyFree]
  );
  const visionModels = useMemo(
    () => models.filter((m) => m.supportsImageToText && (!onlyFree || m.free)),
    [models, onlyFree]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-ios-border/60 bg-white/70 px-3 py-2 text-sm dark:bg-zinc-950/60">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-ios-accent" />
          <span className="font-semibold text-ios-text">Автовыбор моделей</span>
        </div>
        <label className="flex items-center gap-1 text-[12px] text-ios-subtext">
          <input
            type="checkbox"
            checked={onlyFree}
            onChange={(e) => onToggleFree(e.target.checked)}
            className="h-4 w-4 rounded border-ios-border/60 text-ios-accent focus:ring-ios-accent"
          />
          Только бесплатные
        </label>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ModelCard
          title="Чат / текст"
          icon={<Wand2 className="h-4 w-4 text-ios-accent" />}
          models={textModels}
          selected={chatModel}
          onSelect={onSelectChat}
        />
        <ModelCard
          title="Фото / диагностика"
          icon={<Camera className="h-4 w-4 text-ios-accent" />}
          models={visionModels}
          selected={visionModel}
          onSelect={onSelectVision}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="android-ripple inline-flex items-center gap-1 rounded-full border border-ios-border/60 bg-white/70 px-3 py-2 text-sm font-semibold text-ios-text dark:bg-zinc-900/60"
          onClick={onSave}
          disabled={saving}
        >
          <CheckCircle2 className="h-4 w-4 text-ios-accent" />
          {saving ? 'Сохраняем...' : 'Сохранить выбор'}
        </button>
        <button
          type="button"
          className="android-ripple inline-flex items-center gap-1 rounded-full border border-ios-border/60 bg-white/70 px-3 py-2 text-sm font-semibold text-ios-text dark:bg-zinc-900/60"
          onClick={onTest}
          disabled={testing || !apiKeyMasked}
        >
          <ImageIcon className="h-4 w-4 text-ios-accent" />
          {testing ? 'Тестируем...' : 'Тест модели'}
        </button>
        {!apiKeyMasked ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-200">
            <Lock className="h-3.5 w-3.5" /> Добавьте ключ для реального запроса
          </span>
        ) : null}
      </div>

      {status ? <p className="text-[12px] text-ios-subtext">{status}</p> : null}
    </div>
  );
}

function ModelCard({
  title,
  icon,
  models,
  selected,
  onSelect
}: {
  title: string;
  icon: React.ReactNode;
  models: OpenRouterModelOption[];
  selected?: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-ios-border/60 bg-white/70 p-3 text-sm dark:bg-zinc-950/60">
      <div className="mb-2 flex items-center gap-2 text-ios-text">
        {icon}
        <span className="font-semibold">{title}</span>
      </div>
      <div className="space-y-2">
        {models.length ? (
          models.map((m) => (
            <motion.button
              key={m.id}
              type="button"
              className={`w-full rounded-xl border px-3 py-2 text-left ${
                selected === m.id ? 'border-ios-accent/60 bg-ios-accent/10' : 'border-ios-border/60 bg-white/60 dark:bg-zinc-900/60'
              }`}
              whileHover={{ scale: 1.01 }}
              onClick={() => onSelect(m.id)}
            >
              <p className="font-semibold text-ios-text">{m.name}</p>
              <p className="text-[12px] text-ios-subtext">
                {tagFree(m)} · {priceLabel(m)} · контекст {m.contextLength ?? '—'}
              </p>
            </motion.button>
          ))
        ) : (
          <p className="text-[12px] text-ios-subtext">Нет моделей под выбранный фильтр.</p>
        )}
      </div>
    </div>
  );
}
