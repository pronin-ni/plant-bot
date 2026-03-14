import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  getWeatherCurrent,
  getWeatherForecast,
  updateCity,
  validateTelegramAuth
} from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { hapticImpact } from '@/lib/telegram';
import type { WeatherCurrentDto, WeatherForecastDto } from '@/types/api';

import { fetchOpenMeteoCities, SETTINGS_CITY_KEY } from './panel-shared';

export function WeatherPanel() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const [city, setCity] = useState<string>(() => localStorage.getItem(SETTINGS_CITY_KEY) ?? '');
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [current, setCurrent] = useState<WeatherCurrentDto | null>(null);
  const [forecast, setForecast] = useState<WeatherForecastDto | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const syncAuthCity = (payload: { userId?: string; username?: string; firstName?: string; city?: string; isAdmin?: boolean; ok?: boolean }) => {
    const currentAuth = useAuthStore.getState();
    setAuth({
      telegramUserId: payload.userId ? Number(payload.userId) : currentAuth.telegramUserId,
      username: payload.username ?? currentAuth.username,
      firstName: payload.firstName ?? currentAuth.firstName,
      email: currentAuth.email,
      city: payload.city ?? currentAuth.city,
      isAdmin: payload.isAdmin ?? currentAuth.isAdmin,
      roles: currentAuth.roles,
      accessToken: currentAuth.accessToken,
      isAuthorized: payload.ok ?? currentAuth.isAuthorized
    });
  };

  useEffect(() => {
    const storedCity = localStorage.getItem(SETTINGS_CITY_KEY);
    if (storedCity) {
      setCity(storedCity);
      return;
    }
    const authCity = useAuthStore.getState().city;
    if (authCity) {
      setCity(authCity);
      localStorage.setItem(SETTINGS_CITY_KEY, authCity);
      return;
    }

    void validateTelegramAuth()
      .then((res) => {
        if (res?.city) {
          const normalized = res.city.trim();
          setCity(normalized);
          localStorage.setItem(SETTINGS_CITY_KEY, normalized);
          syncAuthCity(res);
        }
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (!city.trim()) {
      setCitySuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchOpenMeteoCities(city, controller.signal).then(setCitySuggestions);
    }, 260);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [city]);

  const preview = async () => {
    const normalizedCity = city.trim();
    if (!normalizedCity) {
      setStatus('Укажите город для предпросмотра.');
      return;
    }
    setLoadingPreview(true);
    setStatus('');
    try {
      const updated = await updateCity(normalizedCity);
      syncAuthCity(updated);
      localStorage.setItem(SETTINGS_CITY_KEY, normalizedCity);
      const [nextCurrent, nextForecast] = await Promise.all([getWeatherCurrent(normalizedCity), getWeatherForecast(normalizedCity)]);
      setCurrent(nextCurrent);
      setForecast(nextForecast);
      setLastUpdatedAt(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
      setStatus('Город сохранён, погода обновлена.');
      hapticImpact('light');
    } catch (error) {
      console.error(error);
      setStatus('Не удалось сохранить город или загрузить погоду.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const activityTone = current?.degraded ? 'text-amber-700' : 'text-emerald-700';
  const activityLabel = current?.degraded ? 'Погода доступна с ограничениями' : current ? 'Предпросмотр готов' : 'Источник будет выбран автоматически';
  const debugSource = current?.source ?? forecast?.source ?? 'ещё не определён';
  const debugFallback = current?.staleFallbackUsed
    ? 'stale cache'
    : current?.fallbackUsed
      ? 'provider fallback'
      : current
        ? 'primary source'
        : 'ещё не использовался';

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-ios-border/50 bg-white/80 p-4 shadow-[0_16px_50px_-28px_rgba(24,44,16,0.28)]">
        <div className="space-y-4">
          <div>
            <p className="text-base font-semibold text-ios-text">Погода и город</p>
            <p className="mt-1 text-xs leading-5 text-ios-subtext">
              Выберите город, а источник погоды приложение определит автоматически.
            </p>
          </div>

          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-ios-subtext">Город</span>
            <input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="Например: Санкт-Петербург"
              className="touch-target w-full rounded-ios-button border border-ios-border/60 bg-white/90 px-3 text-sm outline-none"
            />
          </label>

          {citySuggestions.length ? (
            <div className="flex flex-wrap gap-2">
              {citySuggestions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCity(option)}
                  className="touch-target rounded-full border border-ios-border/60 bg-ios-chip px-3 text-xs text-ios-subtext"
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}

          <div className="rounded-2xl border border-ios-border/40 bg-ios-chip px-4 py-3">
            <p className="text-[12px] font-medium text-ios-subtext">Источник погоды</p>
            <p className="mt-1 text-sm font-semibold text-ios-text">Определяется автоматически</p>
            <p className={`mt-2 text-xs ${activityTone}`}>{activityLabel}</p>
          </div>
        </div>

        {current ? (
          <div className="mt-4 rounded-2xl border border-ios-border/40 bg-ios-chip px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <p className="text-[13px] font-semibold text-ios-text">{current.city}</p>
                <p className="text-xs text-ios-subtext">
                  {current.description ?? 'Текущая погода доступна'} · {current.humidity}% влажность
                </p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-lg font-semibold text-ios-text">{current.tempC.toFixed(0)}°C</p>
                <p className="text-[11px] text-ios-subtext">{forecast?.days?.length ? `${forecast.days.length} дн. прогноза` : 'Прогноз готовится'}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ios-subtext">
              <span>{forecast?.days?.length ? `${forecast.days.length} дн. прогноза` : 'Прогноз готовится'}</span>
              <span>{lastUpdatedAt ? `Обновлено в ${lastUpdatedAt}` : 'Ещё не обновлялось'}</span>
            </div>
            {current.statusMessage ? <p className="mt-2 text-[11px] text-ios-subtext">{current.statusMessage}</p> : null}
          </div>
        ) : null}

        {isAdmin ? (
          <div className="mt-4 rounded-2xl border border-dashed border-ios-border/60 bg-white/70 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ios-subtext">Debug weather</p>
            <div className="mt-2 grid gap-2 text-xs text-ios-subtext sm:grid-cols-2">
              <div className="rounded-2xl border border-ios-border/40 bg-ios-chip px-3 py-2">
                <span className="font-medium text-ios-text">Текущий provider:</span> {debugSource}
              </div>
              <div className="rounded-2xl border border-ios-border/40 bg-ios-chip px-3 py-2">
                <span className="font-medium text-ios-text">Fallback:</span> {debugFallback}
              </div>
              <div className="rounded-2xl border border-ios-border/40 bg-ios-chip px-3 py-2">
                <span className="font-medium text-ios-text">Обновлено:</span> {lastUpdatedAt ? `сегодня в ${lastUpdatedAt}` : 'ещё не обновлялось'}
              </div>
              <div className="rounded-2xl border border-ios-border/40 bg-ios-chip px-3 py-2">
                <span className="font-medium text-ios-text">Degraded mode:</span> {current?.degraded ? 'да' : 'нет'}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={preview} disabled={loadingPreview || !city.trim()}>
          {loadingPreview ? 'Обновляем погоду...' : 'Предпросмотр погоды'}
        </Button>
      </div>

      {status ? <p className="text-xs text-ios-subtext">{status}</p> : null}
    </div>
  );
}
