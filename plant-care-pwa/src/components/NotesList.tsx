import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Sprout, AlertTriangle, Trash2 } from 'lucide-react';

import type { NoteType, PlantNoteDto } from '@/types/api';
import { cn } from '@/lib/cn';

const noteIcons: Record<NoteType, typeof FileText> = {
  GENERAL: FileText,
  FEEDING: Sprout,
  ISSUE: AlertTriangle
};

const noteLabels: Record<NoteType, string> = {
  GENERAL: '',
  FEEDING: 'Подкормка',
  ISSUE: 'Проблема'
};

function formatNoteDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short'
  });
}

function buildMainLine(note: PlantNoteDto): string {
  if (note.type === 'FEEDING') {
    const parts: string[] = ['Подкормка'];
    if (note.title) parts.push(note.title);
    if (note.amount) parts.push(note.amount);
    return parts.length > 1 ? parts.join(': ') : parts.join('');
  }
  return note.text;
}

function buildSecondaryLine(note: PlantNoteDto): string | null {
  if (note.type === 'FEEDING' && note.text) {
    return note.text;
  }
  return null;
}

interface NotesListProps {
  notes: PlantNoteDto[];
  onDelete: (noteId: string) => void;
}

export function NotesList({ notes, onDelete }: NotesListProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (!notes.length) {
    return (
      <p className="px-2 py-3 text-center text-sm text-ios-subtext">
        Добавьте заметки, чтобы отслеживать уход за растением
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {notes.map((note) => {
        const Icon = noteIcons[note.type];
        const isConfirming = confirmDeleteId === note.id;

        return (
          <motion.div
            key={note.id}
            layout
            className="group flex items-start gap-2.5 rounded-xl px-2.5 py-2.5 transition-colors active:bg-ios-card/50 hover:bg-ios-card/50"
          >
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ios-card text-base">
              <Icon className="h-3.5 w-3.5 text-ios-subtext" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-5 text-ios-text line-clamp-2">{buildMainLine(note)}</p>
              {buildSecondaryLine(note) ? (
                <p className="mt-0.5 text-xs leading-4 text-ios-subtext line-clamp-1">{buildSecondaryLine(note)}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span className="text-[11px] text-ios-subtext">{formatNoteDate(note.createdAt)}</span>
              {isConfirming ? (
                <AnimatePresence>
                  <motion.button
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    type="button"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-500 transition-colors"
                    onClick={() => onDelete(note.id)}
                    aria-label="Подтвердить удаление"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </motion.button>
                </AnimatePresence>
              ) : (
                <button
                  type="button"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ios-subtext/0 transition-all group-hover:text-ios-subtext/50 group-hover:hover:text-red-400"
                  onClick={() => setConfirmDeleteId(note.id)}
                  aria-label="Удалить заметку"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
