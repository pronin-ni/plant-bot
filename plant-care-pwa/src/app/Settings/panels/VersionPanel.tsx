import { APP_VERSION } from './panel-shared';
import { StatusLine } from './StatusLine';

export function VersionPanel() {
  return (
    <div className="space-y-3 text-sm text-ios-subtext">
      <StatusLine label="Plant Bot" value="PWA" />
      <StatusLine label="Версия" value={APP_VERSION} />
      <StatusLine label="Дата" value={new Date().toLocaleDateString('ru-RU')} />
    </div>
  );
}
