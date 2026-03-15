import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Eraser, RefreshCcw } from 'lucide-react';

import { askAssistant, clearAssistantHistory, diagnosePlantOpenRouter, getAssistantHistory } from '@/lib/api';
import { cacheGet, cacheSet } from '@/lib/indexeddb';
import { error as hapticError, impactLight, selection } from '@/lib/haptics';
import { QuickQuestionsCarousel } from '@/components/QuickQuestionsCarousel';
import { ChatHistory } from '@/components/ChatHistory';
import { ChatInput } from '@/components/ChatInput';
import type { ChatMessageItem } from '@/components/ChatMessage';
import type { AssistantHistoryItemDto } from '@/types/api';

const QUICK_QUESTIONS = [
  'Почему желтеют листья у фикуса?',
  'Как часто поливать орхидею?',
  'Что делать с паутинным клещом?',
  'Почему не цветёт спатифиллум?'
];

const CHAT_CACHE_KEY = 'assistant:chat:messages:v1';
const CLEAR_PENDING_KEY = 'assistant:chat:clear-pending';
const SERVER_HISTORY_LIMIT = 50;
const MAX_LOCAL_MESSAGES = 100;

interface AssistantRequestPayload {
  text: string;
  imageDataUrl: string | null;
}

interface ChatErrorState {
  message: string;
  request: AssistantRequestPayload;
}

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
    ? 'Похоже, нужна срочная помощь растению.'
    : raw.urgency === 'medium'
      ? 'Есть проблема, но её можно быстро исправить.'
      : 'Критичных проблем не видно.';

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

function messageFingerprint(message: ChatMessageItem): string {
  return [
    message.author,
    message.text.trim(),
    message.imageUrl ?? '',
    message.model ?? ''
  ].join('::');
}

function isNearDuplicate(left: ChatMessageItem, right: ChatMessageItem): boolean {
  if (messageFingerprint(left) !== messageFingerprint(right)) {
    return false;
  }

  if (!left.createdAt || !right.createdAt) {
    return true;
  }

  const leftTs = Date.parse(left.createdAt);
  const rightTs = Date.parse(right.createdAt);
  if (Number.isNaN(leftTs) || Number.isNaN(rightTs)) {
    return true;
  }

  return Math.abs(leftTs - rightTs) <= 120_000;
}

function mergeMessages(current: ChatMessageItem[], incoming: ChatMessageItem[]): ChatMessageItem[] {
  const merged: ChatMessageItem[] = [];
  for (const item of [...current, ...incoming]) {
    const duplicateIndex = merged.findIndex((existing) => isNearDuplicate(existing, item));
    if (duplicateIndex >= 0) {
      merged[duplicateIndex] = {
        ...merged[duplicateIndex],
        ...item,
        id: merged[duplicateIndex].id
      };
      continue;
    }
    merged.push(item);
  }
  return trimMessages(sortByCreatedAt(merged));
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

export function AIChatPage() {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [attachedPhotoDataUrl, setAttachedPhotoDataUrl] = useState<string | null>(null);
  const [attachedPhotoName, setAttachedPhotoName] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState<ChatErrorState | null>(null);

  const historyQuery = useQuery({
    queryKey: ['assistant-history', SERVER_HISTORY_LIMIT],
    queryFn: () => getAssistantHistory(SERVER_HISTORY_LIMIT),
    staleTime: 45_000
  });

  useEffect(() => {
    let cancelled = false;
    void loadLocalMessages().then((local) => {
      if (!cancelled) {
        setMessages(local);
      }
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
  }, [historyQuery.data]);

  useEffect(() => {
    const onOnline = () => {
      if (localStorage.getItem(CLEAR_PENDING_KEY) === '1') {
        void clearAssistantHistory()
          .then(() => {
            localStorage.removeItem(CLEAR_PENDING_KEY);
          })
          .catch(() => {
            // Повторим очистку в следующий online event.
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

  const pushMessage = (nextMessage: ChatMessageItem) => {
    setMessages((previous) => {
      const next = trimMessages([...previous, nextMessage]);
      void persistLocalMessages(next);
      return next;
    });
  };

  const requestAssistantResponse = async (request: AssistantRequestPayload) => {
    if (request.imageDataUrl) {
      const diagnosis = await diagnosePlantOpenRouter(
        request.imageDataUrl,
        inferPlantName(request.text),
        request.text
      );

      return {
        text: formatDiagnosisAnswer(diagnosis),
        model: null as string | null
      };
    }

    const res = await askAssistant(request.text);
    return {
      text: res.answer,
      model: res.model ?? null
    };
  };

  const sendAssistantRequest = async (request: AssistantRequestPayload, appendUserMessage: boolean) => {
    if (appendUserMessage) {
      pushMessage({
        id: createLocalId('user'),
        author: 'user',
        text: request.text,
        imageUrl: request.imageDataUrl,
        createdAt: new Date().toISOString()
      });
    }

    setIsSending(true);
    setIsTyping(true);
    setChatError(null);

    try {
      const answer = await requestAssistantResponse(request);

      pushMessage({
        id: createLocalId('assistant'),
        author: 'assistant',
        text: answer.text,
        model: answer.model,
        createdAt: new Date().toISOString()
      });
      void historyQuery.refetch();
    } catch {
      const message = navigator.onLine
        ? 'Не удалось получить ответ. Проверьте модель или лимиты OpenRouter и попробуйте снова.'
        : 'Нет сети. Вопрос сохранён локально. Повторите отправку после подключения.';

      setChatError({ message, request });
      hapticError();
    } finally {
      setIsTyping(false);
      setIsSending(false);
    }
  };

  const submitMessage = async () => {
    if (!canSend) {
      return;
    }

    const normalized = question.trim();
    const request: AssistantRequestPayload = {
      text: normalized || 'Проверь это растение по фото',
      imageDataUrl: attachedPhotoDataUrl
    };

    setQuestion('');
    setAttachedPhotoDataUrl(null);
    setAttachedPhotoName(null);
    impactLight();

    await sendAssistantRequest(request, true);
  };

  const retryLast = async () => {
    if (!chatError) {
      return;
    }
    impactLight();
    await sendAssistantRequest(chatError.request, false);
  };

  const clearHistory = async () => {
    selection();
    setQuestion('');
    setMessages([]);
    setAttachedPhotoDataUrl(null);
    setAttachedPhotoName(null);
    setChatError(null);
    await persistLocalMessages([]);

    if (!navigator.onLine) {
      localStorage.setItem(CLEAR_PENDING_KEY, '1');
      return;
    }

    try {
      await clearAssistantHistory();
      localStorage.removeItem(CLEAR_PENDING_KEY);
    } catch {
      localStorage.setItem(CLEAR_PENDING_KEY, '1');
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <header className="flex items-center justify-end gap-3 px-1">
        <button
          type="button"
          className="theme-surface-subtle touch-target android-ripple inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 text-xs text-ios-subtext"
          onClick={() => {
            void clearHistory();
          }}
        >
          <Eraser className="mr-1.5 h-3.5 w-3.5" />
          Очистить
        </button>
      </header>

      {!messages.length ? (
        <div className="shrink-0">
          <QuickQuestionsCarousel
            items={QUICK_QUESTIONS}
            onPick={(item) => {
              setQuestion(item);
              selection();
            }}
          />
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl">
        <ChatHistory
          messages={messages}
          isTyping={isTyping}
          className="flex-1"
          viewportClassName="h-full"
        />
      </div>

      {chatError ? (
        <div className="theme-banner-warning shrink-0 rounded-xl border px-3 py-2 text-sm shadow-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="min-w-0 break-words">{chatError.message}</p>
          </div>
          <button
            type="button"
            className="theme-surface-subtle touch-target mt-2 inline-flex min-h-11 items-center rounded-lg border px-3 text-xs font-medium"
            onClick={() => {
              void retryLast();
            }}
            disabled={isSending}
          >
            <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
            Попробовать снова
          </button>
        </div>
      ) : null}

      <div className="theme-surface-1 shrink-0 rounded-[20px] border p-2 shadow-[0_14px_34px_rgb(15_23_42/0.12)]">
        <ChatInput
          value={question}
          disabled={false}
          sending={isSending}
          attachedLabel={attachedPhotoName}
          micSupported={false}
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
        />
      </div>
    </section>
  );
}
