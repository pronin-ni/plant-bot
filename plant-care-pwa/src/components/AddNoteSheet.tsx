import { useState } from 'react';

import { BottomSheet } from '@/components/common/bottom-sheet';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { CreateNoteRequest, NoteType } from '@/types/api';

interface AddNoteSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (request: CreateNoteRequest) => void;
  saving?: boolean;
  sheetTitle?: string;
  submitLabel?: string;
  noteTypeLabels?: Partial<Record<NoteType, string>>;
  placeholders?: {
    title?: string;
    amount?: string;
    text?: string;
    issueText?: string;
  };
}

const noteTypes: { value: NoteType; label: string }[] = [
  { value: 'GENERAL', label: 'Заметка' },
  { value: 'FEEDING', label: 'Подкормка' },
  { value: 'ISSUE', label: 'Проблема' }
];

export function AddNoteSheet({
  open,
  onOpenChange,
  onSave,
  saving = false,
  sheetTitle = 'Добавить заметку',
  submitLabel = 'Сохранить',
  noteTypeLabels,
  placeholders
}: AddNoteSheetProps) {
  const [type, setType] = useState<NoteType>('GENERAL');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [text, setText] = useState('');

  const isFeeding = type === 'FEEDING';
  const canSave = text.trim().length > 0;
  const labels = {
    GENERAL: noteTypeLabels?.GENERAL ?? 'Заметка',
    FEEDING: noteTypeLabels?.FEEDING ?? 'Подкормка',
    ISSUE: noteTypeLabels?.ISSUE ?? 'Проблема'
  } satisfies Record<NoteType, string>;

  function handleSave() {
    if (!canSave) return;
    const payload: CreateNoteRequest = {
      type,
      text: text.trim()
    };
    if (isFeeding && title.trim()) payload.title = title.trim();
    if (isFeeding && amount.trim()) payload.amount = amount.trim();
    onSave(payload);
  }

  function handleClose() {
    setType('GENERAL');
    setTitle('');
    setAmount('');
    setText('');
    onOpenChange(false);
  }

  const formContent = (
    <div className="space-y-4 py-2">
      <div className="flex gap-1 rounded-xl bg-ios-bg p-1">
        {noteTypes.map((nt) => (
          <button
            key={nt.value}
            type="button"
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
              type === nt.value
                ? 'bg-white text-ios-text shadow-sm'
                : 'text-ios-subtext hover:text-ios-text'
            }`}
            onClick={() => setType(nt.value)}
          >
             {labels[nt.value]}
           </button>
         ))}
       </div>

      {isFeeding ? (
        <>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ios-subtext">Название</label>
            <input
              type="text"
              className="w-full rounded-xl border border-ios-border/50 bg-white/80 px-3.5 py-2.5 text-sm text-ios-text placeholder:text-ios-subtext/50 focus:border-ios-accent/40 focus:outline-none focus:ring-2 focus:ring-ios-accent/20"
             placeholder={placeholders?.title ?? 'Например, Фертика Люкс'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ios-subtext">Дозировка</label>
            <input
              type="text"
              className="w-full rounded-xl border border-ios-border/50 bg-white/80 px-3.5 py-2.5 text-sm text-ios-text placeholder:text-ios-subtext/50 focus:border-ios-accent/40 focus:outline-none focus:ring-2 focus:ring-ios-accent/20"
             placeholder={placeholders?.amount ?? 'Например, 5 мл'}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </>
      ) : null}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-ios-subtext">
          {isFeeding ? 'Комментарий' : 'Текст'}
        </label>
        <textarea
          className="w-full resize-none rounded-xl border border-ios-border/50 bg-white/80 px-3.5 py-2.5 text-sm text-ios-text placeholder:text-ios-subtext/50 focus:border-ios-accent/40 focus:outline-none focus:ring-2 focus:ring-ios-accent/20"
          rows={isFeeding ? 2 : 3}
          placeholder={type === 'ISSUE'
            ? (placeholders?.issueText ?? 'Опишите проблему...')
            : (placeholders?.text ?? 'Текст заметки...')}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      <Button
        variant="default"
        size="default"
        className="w-full"
        disabled={!canSave || saving}
        onClick={handleSave}
      >
        {saving ? 'Сохраняем...' : submitLabel}
      </Button>
    </div>
  );

  return (
    <>
      <div className="md:hidden">
        <BottomSheet open={open} onClose={handleClose}>
          <h3 className="mb-3 text-ios-title-2 font-semibold">{sheetTitle}</h3>
          {formContent}
        </BottomSheet>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) handleClose();
        }}
        title={sheetTitle}
        className="hidden md:block"
      >
        {formContent}
      </Dialog>
    </>
  );
}
