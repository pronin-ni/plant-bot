import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SendHorizonal } from 'lucide-react';

import { askAssistant, getAssistantHistory } from '@/lib/api';
import { hapticImpact, hapticNotify } from '@/lib/telegram';
import { Button } from '@/components/ui/button';

export function AiScreen() {
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [answerModel, setAnswerModel] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: ['assistant-history'],
    queryFn: getAssistantHistory
  });

  const askMutation = useMutation({
    mutationFn: askAssistant,
    onMutate: () => hapticImpact('light'),
    onSuccess: (res) => {
      setAnswer(res.answer);
      setAnswerModel(res.model ?? null);
      hapticNotify(res.ok ? 'success' : 'warning');
      void queryClient.invalidateQueries({ queryKey: ['assistant-history'] });
    },
    onError: () => {
      setAnswer('Не удалось получить ответ. Проверьте OpenRouter ключ/модель/лимиты.');
      setAnswerModel(null);
      hapticNotify('error');
    }
  });

  return (
    <section className="space-y-3">
      <div className="ios-blur-card space-y-3 p-4">
        <p className="text-ios-body font-medium">Задайте вопрос по уходу за растениями</p>
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Например: почему желтеют листья у фикуса?"
          className="min-h-28 w-full rounded-ios-button border border-ios-border/70 bg-white/70 p-3 text-ios-body outline-none backdrop-blur-ios dark:bg-zinc-900/60"
        />
        <Button
          className="w-full"
          disabled={question.trim().length < 3 || askMutation.isPending}
          onClick={() => askMutation.mutate(question.trim())}
        >
          <SendHorizonal className="mr-2 h-4 w-4" />
          {askMutation.isPending ? 'Отправляем...' : 'Спросить AI'}
        </Button>
      </div>

      {answer ? (
        <div className="ios-blur-card p-4">
          <p className="whitespace-pre-wrap text-ios-body">{answer}</p>
          {answerModel ? <p className="mt-2 text-[11px] text-ios-subtext">Модель: {answerModel}</p> : null}
        </div>
      ) : null}

      <div className="ios-blur-card p-4">
        <p className="mb-2 text-ios-body font-medium">Последние 10 ответов</p>
        {historyQuery.isLoading ? <p className="text-ios-caption text-ios-subtext">Загружаем историю...</p> : null}
        <div className="space-y-2">
          {(historyQuery.data ?? []).map((item) => (
            <div key={item.id} className="rounded-ios-button border border-ios-border/70 bg-white/60 p-3 dark:bg-zinc-900/50">
              <p className="text-[13px] font-semibold">Вопрос: {item.question}</p>
              <p className="mt-1 whitespace-pre-wrap text-[13px] text-ios-subtext">{item.answer}</p>
              {item.model ? <p className="mt-1 text-[11px] text-ios-subtext">Модель: {item.model}</p> : null}
            </div>
          ))}
          {!historyQuery.isLoading && !(historyQuery.data ?? []).length ? (
            <p className="text-ios-caption text-ios-subtext">История пока пустая.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
