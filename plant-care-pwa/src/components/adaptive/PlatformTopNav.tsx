import type { AppTabKey } from '@/types/navigation';

const TITLES: Record<AppTabKey, { title: string; subtitle: string }> = {
  home: { title: 'Мои Растения', subtitle: 'Коллекция, полив и быстрый уход.' },
  calendar: { title: 'Календарь', subtitle: 'Ближайшие задачи ухода по датам.' },
  add: { title: 'Добавить', subtitle: 'Новый мастер для добавления растения.' },
  ai: { title: 'AI-ассистент', subtitle: '' },
  settings: { title: 'Настройки', subtitle: 'Темы, уведомления и интеграции.' },
  admin: { title: 'Админ-панель', subtitle: 'Управление пользователями, кэшем и backup базы.' }
};

export function PlatformTopNav({ tab }: { tab: AppTabKey }) {
  const t = TITLES[tab];
  const compact = tab === 'ai';

  return (
    <header className={`platform-top-nav mt-1 ${compact ? 'mb-3' : 'mb-5'}`}>
      <h1 className="platform-top-title">{t.title}</h1>
      {t.subtitle ? <p className="platform-top-subtitle">{t.subtitle}</p> : null}
    </header>
  );
}
