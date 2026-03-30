import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, ChevronDown, Loader2, MoreVertical, Pencil, Plus, Sprout, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { addGrowthEntry, deleteGrowthEntry, getGrowthEntries, updateGrowthEntry } from '@/lib/api';
import { error as hapticError, impactLight, impactMedium, success as hapticSuccess } from '@/lib/haptics';
import type { GrowthEntryDto } from '@/types/api';

interface GrowthTimelineProps {
  plantId: number;
  currentPhotoUrl?: string;
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Не удалось прочитать фото'));
    reader.readAsDataURL(file);
  });
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Сегодня';
  } else if (diffDays === 1) {
    return 'Вчера';
  } else if (diffDays < 7) {
    return `${diffDays} дн. назад`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} нед. назад`;
  } else {
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
  }
}

function formatFullDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

function groupEntriesByDate(entries: GrowthEntryDto[]): Map<string, GrowthEntryDto[]> {
  const groups = new Map<string, GrowthEntryDto[]>();
  
  for (const entry of entries) {
    const date = new Date(entry.createdAt);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(entry);
  }
  
  return groups;
}

function TimelineEntry({
  entry,
  onDelete,
  onEdit
}: {
  entry: GrowthEntryDto;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <motion.div
      className="relative flex gap-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
    >
      <div className="flex flex-col items-center">
        <div className="h-3 w-3 rounded-full bg-ios-accent ring-4 ring-ios-accent/20" />
        <div className="w-px flex-1 bg-ios-border/50" />
      </div>

      <div className="mb-6 flex-1 pb-2">
        <div className="theme-surface-subtle overflow-hidden rounded-2xl border">
          <div className="relative">
            <img
              src={entry.imageUrl}
              alt={`Фото от ${formatDate(entry.createdAt)}`}
              className="w-full object-cover"
              style={{ maxHeight: '280px' }}
            />
            <div className="absolute right-2 top-2">
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                <AnimatePresence>
                  {menuOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="absolute right-0 top-10 z-10 min-w-[140px] overflow-hidden rounded-xl border bg-ios-bg shadow-lg"
                    >
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          onEdit();
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ios-text hover:bg-ios-border/30"
                      >
                        <Pencil className="h-4 w-4" />
                        Изменить заметку
                      </button>
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          onDelete();
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                        Удалить
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="space-y-2 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-ios-accent">
                {formatDate(entry.createdAt)}
              </span>
              {entry.source && entry.source !== 'MANUAL' && (
                <span className="rounded-full bg-ios-border/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-ios-subtext">
                  {entry.source === 'CAMERA' ? 'Камера' : 'Авто'}
                </span>
              )}
            </div>

            {entry.note && (
              <p className="text-sm text-ios-text">{entry.note}</p>
            )}

            {entry.aiSummary && (
              <div className="rounded-lg bg-ios-accent/10 p-2 text-xs leading-relaxed text-ios-accent">
                <span className="font-medium">AI: </span>
                {entry.aiSummary}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function AddEntryForm({
  plantId,
  onSuccess
}: {
  plantId: number;
  onSuccess: () => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addMutation = useMutation({
    mutationFn: ({ id, dataUrl, noteText }: { id: number; dataUrl: string; noteText?: string }) =>
      addGrowthEntry(id, { photoBase64: dataUrl, note: noteText || undefined, source: 'CAMERA' }),
    onSuccess: () => {
      hapticSuccess();
      setSelectedFile(null);
      setPreviewUrl(null);
      setNote('');
      onSuccess();
    },
    onError: () => hapticError()
  });

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleSubmit = async () => {
    if (!selectedFile || !previewUrl) return;
    
    setIsSubmitting(true);
    try {
      const dataUrl = await toDataUrl(selectedFile);
      addMutation.mutate({ id: plantId, dataUrl, noteText: note.trim() || undefined });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {!previewUrl ? (
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-ios-border/60 py-8 hover:border-ios-accent/50">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
          <Camera className="mb-2 h-8 w-8 text-ios-subtext" />
          <span className="text-sm font-medium text-ios-text">Добавить фото</span>
          <span className="mt-1 text-xs text-ios-subtext">или сделать снимок</span>
        </label>
      ) : (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-2xl">
            <img src={previewUrl} alt="Превью" className="w-full object-cover" style={{ maxHeight: '200px' }} />
            <button
              onClick={() => {
                setSelectedFile(null);
                setPreviewUrl(null);
              }}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Заметка (необязательно)"
            className="w-full rounded-xl border border-ios-border/50 bg-transparent px-3 py-2.5 text-sm text-ios-text placeholder:text-ios-subtext focus:border-ios-accent focus:outline-none"
            rows={2}
          />

          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || addMutation.isPending}
            className="w-full"
          >
            {isSubmitting || addMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Добавляем...
              </>
            ) : (
              'Добавить в хронологию'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function EditNoteDialog({
  open,
  onOpenChange,
  entry,
  onSave
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: GrowthEntryDto | null;
  onSave: (note: string) => void;
}) {
  const [note, setNote] = useState('');

  useEffect(() => {
    if (entry) {
      setNote(entry.note || '');
    }
  }, [entry]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Изменить заметку">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Заметка о состоянии растения..."
        className="mb-4 w-full rounded-xl border border-ios-border/50 bg-transparent px-3 py-2.5 text-sm text-ios-text placeholder:text-ios-subtext focus:border-ios-accent focus:outline-none"
        rows={3}
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Отмена
        </Button>
        <Button
          onClick={() => {
            onSave(note.trim());
            onOpenChange(false);
          }}
        >
          Сохранить
        </Button>
      </div>
    </Dialog>
  );
}

export function GrowthTimeline({ plantId, currentPhotoUrl }: GrowthTimelineProps) {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<GrowthEntryDto | null>(null);

  const entriesQuery = useQuery({
    queryKey: ['growth-entries', plantId],
    queryFn: () => getGrowthEntries(plantId, { limit: 50 }),
    staleTime: 30_000
  });

  const deleteMutation = useMutation({
    mutationFn: ({ plantId: pId, entryId }: { plantId: number; entryId: number }) =>
      deleteGrowthEntry(pId, entryId),
    onSuccess: () => {
      hapticSuccess();
      void queryClient.invalidateQueries({ queryKey: ['growth-entries', plantId] });
    },
    onError: () => hapticError()
  });

  const updateMutation = useMutation({
    mutationFn: ({ plantId: pId, entryId, note }: { plantId: number; entryId: number; note: string }) =>
      updateGrowthEntry(pId, entryId, { note }),
    onSuccess: () => {
      hapticSuccess();
      void queryClient.invalidateQueries({ queryKey: ['growth-entries', plantId] });
    },
    onError: () => hapticError()
  });

  const entries = useMemo(() => {
    const result: GrowthEntryDto[] = [];
    
    if (currentPhotoUrl) {
      result.push({
        id: 0,
        plantId,
        imageUrl: currentPhotoUrl,
        createdAt: new Date().toISOString(),
        note: 'Текущее фото',
        source: 'MANUAL',
        aiSummary: null,
        metadataJson: null
      });
    }
    
    if (entriesQuery.data) {
      for (const entry of entriesQuery.data) {
        if (!result.some(r => r.imageUrl === entry.imageUrl)) {
          result.push(entry);
        }
      }
    }
    
    return result;
  }, [entriesQuery.data, currentPhotoUrl, plantId]);

  const groupedEntries = useMemo(() => {
    return groupEntriesByDate(entries);
  }, [entries]);

  const handleDelete = (entry: GrowthEntryDto) => {
    impactMedium();
    deleteMutation.mutate({ plantId, entryId: entry.id });
  };

  const handleEdit = (entry: GrowthEntryDto) => {
    setEditingEntry(entry);
  };

  const handleSaveNote = (note: string) => {
    if (editingEntry) {
      updateMutation.mutate({ plantId, entryId: editingEntry.id, note });
      setEditingEntry(null);
    }
  };

  return (
    <motion.section
      className="ios-blur-card overflow-hidden p-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-ios-body font-semibold">Хронология роста</p>
          <p className="mt-0.5 text-xs text-ios-subtext">История развития растения по фото</p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            impactLight();
            setShowAddForm(!showAddForm);
          }}
          className="shrink-0"
        >
          <Plus className="mr-1 h-4 w-4" />
          Добавить
        </Button>
      </div>

      <AnimatePresence mode="wait">
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 overflow-hidden"
          >
            <AddEntryForm
              plantId={plantId}
              onSuccess={() => setShowAddForm(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {entriesQuery.isLoading && !entriesQuery.data ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-ios-subtext" />
        </div>
      ) : entries.length === 0 ? (
        <motion.div
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-10 text-center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="mb-3 rounded-full bg-ios-accent/14 p-4 text-ios-accent">
            <Sprout className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-ios-text">Хронология пуста</p>
          <p className="mt-1 max-w-[220px] text-xs text-ios-subtext">
            Добавьте первое фото, чтобы начать отслеживать рост растения
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-4"
            onClick={() => {
              impactLight();
              setShowAddForm(true);
            }}
          >
            <Camera className="mr-1.5 h-4 w-4" />
            Добавить фото
          </Button>
        </motion.div>
      ) : (
        <div className="relative pl-2">
          {entries.map((entry) => (
            <TimelineEntry
              key={entry.id}
              entry={entry}
              onDelete={() => handleDelete(entry)}
              onEdit={() => handleEdit(entry)}
            />
          ))}
        </div>
      )}

      <EditNoteDialog
        open={editingEntry !== null}
        onOpenChange={(open) => {
          if (!open) setEditingEntry(null);
        }}
        entry={editingEntry}
        onSave={handleSaveNote}
      />
    </motion.section>
  );
}
