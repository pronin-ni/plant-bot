import type { AppTabKey } from '@/types/navigation';

const TITLES: Record<AppTabKey, { title: string; subtitle: string }> = {
  home: { title: 'Мои Растения', subtitle: 'Главный экран с карточками растений и быстрым поливом.' },
  calendar: { title: 'Календарь', subtitle: 'План поливов и напоминания по датам.' },
  add: { title: 'Добавить', subtitle: 'Новый мастер добавления растений.' },
  ai: { title: 'AI-ассистент', subtitle: 'Вопросы по садоводству и уходу за растениями.' },
  settings: { title: 'Настройки', subtitle: 'Параметры приложения, города и уведомлений.' },
  admin: { title: 'Админ-панель', subtitle: 'Управление пользователями, кэшем и backup базы.' }
};

export function PlatformTopNav({ tab }: { tab: AppTabKey }) {
  const t = TITLES[tab];
  return (
    <header className="platform-top-nav mb-5 mt-1">
      <h1 className="platform-top-title">{t.title}</h1>
      <p className="platform-top-subtitle">{t.subtitle}</p>
    </header>
  );
}

