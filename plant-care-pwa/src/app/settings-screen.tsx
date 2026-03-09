import { SettingsPage } from '@/app/Settings/SettingsPage';
import { ThemeSelector } from '@/components/settings/ThemeSelector';

export function SettingsScreen() {
  return (
    <div className="space-y-4">
      <ThemeSelector />
      <SettingsPage />
    </div>
  );
}
