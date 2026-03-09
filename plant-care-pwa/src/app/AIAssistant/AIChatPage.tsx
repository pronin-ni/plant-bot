import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Eraser } from 'lucide-react';

import { askAssistant, clearAssistantHistory, diagnosePlantOpenRouter, getAssistantHistory } from '@/lib/api';
import { cacheGet, cacheSet } from '@/lib/indexeddb';
import { hapticImpact, hapticNotify } from '@/lib/telegram';
import { QuickQuestionsCarousel } from '@/components/QuickQuestionsCarousel';
import { ChatHistory } from '@/components/ChatHistory';
import { ChatInput } from '@/components/ChatInput';
import type { ChatMessageItem } from '@/components/ChatMessage';
import type { AssistantHistoryItemDto } from '@/types/api';

const QUICK_QUESTIONS = [
  'Почему желтеют листья у фикуса?',
  'Как часто поливать орхидею?',
  'Что делать с паутинным клещом?',
  'Почему не цветёт спатифиллум?',
  'Как спасти залитое растение?'
];

const CHAT_CACHE_KEY = 'assistant:chat:messages:v1';
const CLEAR_PENDING_KEY = 'assistant:chat:clear-pending';
const SERVER_HISTORY_LIMIT = 50;
const MAX_LOCAL_MESSAGES = 100;

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function inferPlantName(question: string): string {
  const cleaned = question.trim();
  if (!cleaned) {
    return 'растение';
  }
  const firstWord = cleaned.split(/\s+/).find((item) => item.length > 2);
  return firstWord ?? 'растение';
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Не удалось прочитать фото'));
    reader.readAsDataURL(file);
  });
}

function formatDiagnosisAnswer(raw: {
  problem?: string;
  confidence: number;
  description?: string;
  treatment?: string;
  prevention?: string;
  urgency: 'low' | 'medium' | 'high';
}) {
  const tone = raw.urgency === 'high'
    ? 'Ой, похоже растение просит срочной помощи 😔'
    : raw.urgency === 'medium'
      ? 'Похоже, есть проблема, но всё поправимо 🌿'
      : 'Хорошая новость: критичных проблем не видно 🌱';

  const parts = [
    tone,
    raw.problem ? `Проблема: ${raw.problem}.` : null,
    raw.description ? raw.description : null,
    raw.treatment ? `Что сделать: ${raw.treatment}` : null,
    raw.prevention ? `Профилактика: ${raw.prevention}` : null,
    `Уверенность: ${raw.confidence}%.`
  ].filter(Boolean);

  return parts.join('\n\n');
}

function fromServerHistory(items: AssistantHistoryItemDto[]): ChatMessageItem[] {
  return items
    .slice()
    .reverse()
    .flatMap((item) => [
      {
        id: `server-q-${item.id}`,
        author: 'user' as const,
        text: item.question,
        createdAt: item.createdAt
      },
      {
        id: `server-a-${item.id}`,
        author: 'assistant' as const,
        text: item.answer,
        model: item.model,
        createdAt: item.createdAt
      }
    ]);
}

function sortByCreatedAt(messages: ChatMessageItem[]): ChatMessageItem[] {
  return messages.slice().sort((left, right) => {
    const leftTs = left.createdAt ? Date.parse(left.createdAt) : 0;
    const rightTs = right.createdAt ? Date.parse(right.createdAt) : 0;
    return leftTs - rightTs;
  });
}

function trimMessages(messages: ChatMessageItem[]): ChatMessageItem[] {
  if (messages.length <= MAX_LOCAL_MESSAGES) {
    return messages;
  }
  return messages.slice(-MAX_LOCAL_MESSAGES);
}

function mergeMessages(current: ChatMessageItem[], incoming: ChatMessageItem[]): ChatMessageItem[] {
  const mergedMap = new Map<string, ChatMessageItem>();
  for (const item of [...current, ...incoming]) {
    mergedMap.set(item.id, item);
  }
  return trimMessages(sortByCreatedAt(Array.from(mergedMap.values())));
}

async function loadLocalMessages(): Promise<ChatMessageItem[]> {
  const cached = await cacheGet<ChatMessageItem[]>(CHAT_CACHE_KEY);
  return Array.isArray(cached) ? trimMessages(sortByCreatedAt(cached)) : [];
}

async function persistLocalMessages(messages: ChatMessageItem[]) {
  await cacheSet(CHAT_CACHE_KEY, trimMessages(messages));
}

function createLocalId(prefix: 'user' | 'assistant'): string {
  const uuid = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `local-${prefix}-${uuid}`;
}

function buildSuggestion(text: string): string | null {
  const q = text.toLowerCase();
  if (q.includes('желте') || q.includes('пятн')) {
    return 'Уточните растение: «у какого именно растения проблема?»';
  }
  if (q.includes('полив') || q.includes('сохнет')) {
    return 'Добавьте контекст: «объём горшка, свет, как давно поливали»';
  }
  if (q.includes('вредител') || q.includes('клещ')) {
    return 'Лучше прикрепить фото листа — AI даст более точный диагноз.';
  }
  return null;
}

export function AIChatPage() {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [attachedPhotoDataUrl, setAttachedPhotoDataUrl] = useState<string | null>(null);
  const [attachedPhotoName, setAttachedPhotoName] = useState<string | null>(null);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const [dictationPreview, setDictationPreview] = useState<string>('');
  const [syncHint, setSyncHint] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [assistantPulseKey, setAssistantPulseKey] = useState(0);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const historyQuery = useQuery({
    queryKey: ['assistant-history', SERVER_HISTORY_LIMIT],
    queryFn: () => getAssistantHistory(SERVER_HISTORY_LIMIT),
    staleTime: 45_000
  });

  useEffect(() => {
    const ctor = (window as Window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    }).SpeechRecognition ?? (window as Window & {
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    }).webkitSpeechRecognition;

    if (!ctor) {
      setMicSupported(false);
      setVoiceHint('Голосовой ввод не поддерживается в этом браузере.');
      return;
    }

    const recognition = new ctor();
    recognition.lang = 'ru-RU';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (eventUnknown: unknown) => {
      const event = eventUnknown as {
        resultIndex: number;
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      };
      let finalChunk = '';
      let interimChunk = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const chunk = result?.[0]?.transcript?.trim() ?? '';
        if (!chunk) {
          continue;
        }
        if (result.isFinal) {
          finalChunk += `${chunk} `;
        } else {
          interimChunk += `${chunk} `;
        }
      }

      if (finalChunk.trim()) {
        setQuestion((prev) => `${prev.trim()} ${finalChunk.trim()}`.trim());
        setDictationPreview('');
      } else {
        setDictationPreview(interimChunk.trim());
      }
    };
    recognition.onerror = () => {
      setIsListening(false);
      setDictationPreview('');
      setVoiceHint('Ошибка голосового ввода. Попробуйте ещё раз.');
      hapticNotify('error');
    };
    recognition.onend = () => {
      setIsListening(false);
      setDictationPreview('');
      setVoiceHint((prev) => prev ?? 'Голосовой ввод завершён.');
    };

    recognitionRef.current = recognition;
    setMicSupported(true);

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadLocalMessages().then((local) => {
      if (cancelled) {
        return;
      }
      setMessages(local);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!historyQuery.data) {
      return;
    }
    const serverMessages = fromServerHistory(historyQuery.data);
    setMessages((previous) => {
      const next = mergeMessages(previous, serverMessages);
      void persistLocalMessages(next);
      return next;
    });
    setSyncHint(`История синхронизирована (${historyQuery.data.length} диалогов).`);
  }, [historyQuery.data]);

  useEffect(() => {
    const onOnline = () => {
      if (localStorage.getItem(CLEAR_PENDING_KEY) === '1') {
        void clearAssistantHistory()
          .then(() => {
            localStorage.removeItem(CLEAR_PENDING_KEY);
            setSyncHint('История очищена на сервере после восстановления сети.');
          })
          .catch(() => {
            setSyncHint('Сеть появилась, но сервер пока не принял очистку истории.');
          });
      }
      void historyQuery.refetch();
    };

    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
    };
  }, [historyQuery.refetch]);

  const canSend = useMemo(() => {
    return !isSending && (question.trim().length > 1 || Boolean(attachedPhotoDataUrl));
  }, [attachedPhotoDataUrl, isSending, question]);

  const suggestion = useMemo(() => buildSuggestion(question), [question]);

  const pushMessage = (nextMessage: ChatMessageItem) => {
    setMessages((previous) => {
      const next = trimMessages([...previous, nextMessage]);
      void persistLocalMessages(next);
      return next;
    });
  };

  const markAssistantResponse = () => {
    setAssistantPulseKey(Date.now());
    hapticImpact('light');
    navigator.vibrate?.(50);
  };

  const submitMessage = async () => {
    if (!canSend) {
      return;
    }

    const normalized = question.trim();
    const outgoingText = normalized || 'Проверь это растение по фото';
    const userMessage: ChatMessageItem = {
      id: createLocalId('user'),
      author: 'user',
      text: outgoingText,
      imageUrl: attachedPhotoDataUrl,
      createdAt: new Date().toISOString()
    };

    pushMessage(userMessage);
    setQuestion('');
    setIsSending(true);
    setIsTyping(true);
    hapticImpact('light');

    try {
      if (attachedPhotoDataUrl) {
        const diagnosis = await diagnosePlantOpenRouter(
          attachedPhotoDataUrl,
          inferPlantName(outgoingText),
          outgoingText
        );

        pushMessage({
          id: createLocalId('assistant'),
          author: 'assistant',
          text: formatDiagnosisAnswer(diagnosis),
          createdAt: new Date().toISOString()
        });
        markAssistantResponse();
        hapticNotify('success');
      } else {
        const res = await askAssistant(outgoingText);
        pushMessage({
          id: createLocalId('assistant'),
          author: 'assistant',
          text: res.answer,
          model: res.model ?? null,
          createdAt: new Date().toISOString()
        });
        markAssistantResponse();
        hapticNotify(res.ok ? 'success' : 'warning');
      }

      setAttachedPhotoDataUrl(null);
      setAttachedPhotoName(null);
      setSyncHint('Сообщение отправлено и сохранено в истории.');
      void historyQuery.refetch();
    } catch {
      pushMessage({
        id: createLocalId('assistant'),
        author: 'assistant',
        text: navigator.onLine
          ? 'Не удалось получить ответ. Проверьте OpenRouter ключ/модель/лимиты.'
          : 'Сейчас нет сети. Сообщения сохранены локально, ответ придёт при подключении.',
        createdAt: new Date().toISOString()
      });
      setSyncHint(navigator.onLine ? 'Ошибка синхронизации с AI.' : 'Оффлайн-режим: история сохранена локально.');
      hapticNotify('error');
    } finally {
      setIsTyping(false);
      setIsSending(false);
    }
  };

  const toggleVoiceInput = () => {
    if (!micSupported || !recognitionRef.current) {
      setVoiceHint('Голосовой ввод не поддерживается в этом браузере.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      setDictationPreview('');
      setVoiceHint('Голосовой ввод остановлен.');
      return;
    }

    try {
      recognitionRef.current.start();
      setIsListening(true);
      setVoiceHint('Слушаю... Говорите, я добавлю текст в поле ввода.');
      hapticImpact('medium');
    } catch {
      setIsListening(false);
      setVoiceHint('Не удалось запустить микрофон. Проверьте разрешения браузера.');
      hapticNotify('error');
    }
  };

  const clearHistory = async () => {
    hapticImpact('light');
    setQuestion('');
    setMessages([]);
    setAttachedPhotoDataUrl(null);
    setAttachedPhotoName(null);
    setVoiceHint(null);
    setDictationPreview('');
    await persistLocalMessages([]);

    if (!navigator.onLine) {
      localStorage.setItem(CLEAR_PENDING_KEY, '1');
      setSyncHint('История очищена локально. Сервер очистим автоматически, когда вернётся сеть.');
      return;
    }

    try {
      await clearAssistantHistory();
      localStorage.removeItem(CLEAR_PENDING_KEY);
      setSyncHint('История очищена локально и на сервере.');
    } catch {
      localStorage.setItem(CLEAR_PENDING_KEY, '1');
      setSyncHint('Локально очищено. Очистка на сервере будет повторена при сети.');
    }
  };

  return (
    <section className="space-y-3 pb-28">
      <div className="ios-blur-card border border-ios-border/60 bg-white/60 p-4 dark:border-emerald-500/20 dark:bg-zinc-950/55">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-ios-caption uppercase tracking-wide text-ios-subtext">AI-ассистент по растениям</p>
            <h2 className="mt-1 text-[28px] font-semibold leading-[1.05] text-ios-text">Ваш ботаник-друг</h2>
            <p className="mt-1 text-sm text-ios-subtext">Спрашивайте что угодно: от болезней до черенкования.</p>
          </div>

          <button
            type="button"
            className="touch-target android-ripple inline-flex shrink-0 items-center rounded-full border border-ios-border/60 bg-white/60 px-3 text-ios-caption text-ios-subtext dark:bg-zinc-900/55"
            onClick={() => {
              void clearHistory();
            }}
          >
            <Eraser className="mr-1.5 h-3.5 w-3.5" />
            Очистить
          </button>
        </div>
      </div>

      <QuickQuestionsCarousel
        items={QUICK_QUESTIONS}
        onPick={(item) => {
          setQuestion(item);
          hapticImpact('light');
        }}
      />

      {voiceHint ? (
        <div className="ios-blur-card px-3 py-2 text-xs text-ios-subtext">{voiceHint}</div>
      ) : null}

      {dictationPreview ? (
        <div className="ios-blur-card px-3 py-2 text-xs text-ios-subtext">Слушаю: {dictationPreview}</div>
      ) : null}

      {suggestion ? (
        <div className="ios-blur-card border border-emerald-500/20 px-3 py-2 text-xs text-ios-subtext dark:border-emerald-400/30">
          Подсказка: {suggestion}
        </div>
      ) : null}

      {syncHint ? (
        <div className="ios-blur-card px-3 py-2 text-xs text-ios-subtext">{syncHint}</div>
      ) : null}

      <div className="relative overflow-hidden rounded-iosCard">
        <AnimatePresence>
          {assistantPulseKey ? (
            <motion.div
              key={assistantPulseKey}
              className="pointer-events-none absolute inset-0 z-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.22, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.65, ease: 'easeOut' }}
              style={{
                background:
                  'radial-gradient(120% 80% at 50% 15%, rgba(52,199,89,0.35) 0%, rgba(52,199,89,0.08) 38%, rgba(52,199,89,0) 100%)'
              }}
            />
          ) : null}
        </AnimatePresence>
        <ChatHistory messages={messages} isTyping={isTyping} />
      </div>

      <ChatInput
        value={question}
        disabled={false}
        sending={isSending}
        attachedLabel={attachedPhotoName}
        micSupported={micSupported}
        micActive={isListening}
        onChange={setQuestion}
        onSubmit={() => {
          void submitMessage();
        }}
        onAttachPhoto={(file) => {
          void toDataUrl(file).then((dataUrl) => {
            setAttachedPhotoDataUrl(dataUrl);
            setAttachedPhotoName(file.name || 'Фото растения');
          });
        }}
        onClearAttachment={() => {
          setAttachedPhotoDataUrl(null);
          setAttachedPhotoName(null);
        }}
        onMicToggle={toggleVoiceInput}
      />
    </section>
  );
}
