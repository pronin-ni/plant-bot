import { Button } from '@/components/ui/button';
import { impactLight, impactMedium, impactHeavy } from '@/lib/haptics';
import { useUiStore } from '@/lib/store';

export function AiDiagnosticsPanel() {
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  return (
    <div className="space-y-4">
      <p className="text-sm text-ios-text">Чат-ассистент, распознавание и диагностика фото находятся на отдельной вкладке.</p>
      <Button
        variant="secondary"
        onClick={() => {
          impactLight();
          setActiveTab('ai');
        }}
      >
        Перейти в AI
      </Button>
    </div>
  );
}
