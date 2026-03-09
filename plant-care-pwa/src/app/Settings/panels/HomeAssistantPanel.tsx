import { HomeAssistantSetup } from '@/app/Settings/HomeAssistantSetup';

export function HomeAssistantPanel() {
  return (
    <div className="space-y-4">
      <p className="text-xs text-ios-subtext">Подключение вынесено в отдельный поток, чтобы основной экран настроек оставался коротким.</p>
      <HomeAssistantSetup />
    </div>
  );
}
