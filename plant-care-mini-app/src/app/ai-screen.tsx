import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { SendHorizonal } from 'lucide-react';

import { askAssistant } from '@/lib/api';
import { hapticImpact, hapticNotify } from '@/lib/telegram';
import { Button } from '@/components/ui/button';

export function AiScreen() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);

  const askMutation = useMutation({
    mutationFn: askAssistant,
    onMutate: () => hapticImpact('light'),
    onSuccess: (res) => {
      setAnswer(res.answer);
      hapticNotify(res.ok ? 'success' : 'warning');
    },
    onError: () => {
      setAnswer('Не удалось получить ответ. Проверьте OpenRouter ключ/модель/лимиты.');
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
        </div>
      ) : null}
    </section>
  );
}
