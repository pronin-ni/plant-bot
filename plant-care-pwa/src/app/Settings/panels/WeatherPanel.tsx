import { useEffect, useState } from 'react';

import { WeatherProviderSelector } from '@/components/WeatherProviderSelector';
import { Button } from '@/components/ui/button';
import {
  getWeatherCurrent,
  getWeatherForecast,
  getWeatherProviders,
  setWeatherProvider,
  updateCity,
  validateTelegramAuth
} from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { hapticImpact } from '@/lib/telegram';
import type { WeatherCurrentDto, WeatherForecastDto, WeatherProvidersResponse } from '@/types/api';

import { fetchOpenMeteoCities, SETTINGS_CITY_KEY } from './panel-shared';

export function WeatherPanel() {
  const setAuth = useAuthStore((s) => s.setAuth);

  const [providers, setProviders] = useState<WeatherProvidersResponse['providers']>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [city, setCity] = useState<string>(() => localStorage.getItem(SETTINGS_CITY_KEY) ?? '');
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [current, setCurrent] = useState<WeatherCurrentDto | null>(null);
  const [forecast, setForecast] = useState<WeatherForecastDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [status, setStatus] = useState<string>('');

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

  const loadProviders = async () => {
    try {
      const response = await getWeatherProviders();
      setProviders(response.providers ?? []);
      setSelectedProvider(response.selected ?? response.providers?.[0]?.id ?? null);
    } catch (error) {
      console.error(error);
      setStatus('Не удалось загрузить список провайдеров.');
    }
  };

  useEffect(() => {
    void loadProviders();
  }, []);

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

  const saveProvider = async () => {
    if (!selectedProvider) {
      setStatus('Сначала выберите провайдера.');
      return;
    }
    setSaving(true);
    try {
      await setWeatherProvider(selectedProvider);
      hapticImpact('light');
      setStatus('Провайдер сохранён.');
    } catch (error) {
      console.error(error);
      setStatus('Не удалось сохранить провайдера.');
    } finally {
      setSaving(false);
    }
  };

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
      setStatus('Город сохранён, погода обновлена.');
      hapticImpact('light');
    } catch (error) {
      console.error(error);
      setStatus('Не удалось сохранить город или загрузить погоду.');
    } finally {
      setLoadingPreview(false);
    }
  };

  return (
    <div className="space-y-4">
      <label className="space-y-1">
        <span className="text-[12px] text-ios-subtext">Город</span>
        <input
          value={city}
          onChange={(event) => setCity(event.target.value)}
          placeholder="Например: Санкт-Петербург"
          className="touch-target w-full rounded-ios-button border border-ios-border/60 bg-white/80 px-3 text-sm outline-none"
        />
      </label>

      {citySuggestions.length ? (
        <div className="flex flex-wrap gap-2">
          {citySuggestions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setCity(option)}
              className="touch-target rounded-full border border-ios-border/60 bg-white/80 px-3 text-xs text-ios-subtext"
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}

      <WeatherProviderSelector
        providers={providers}
        selected={selectedProvider}
        onChange={(id) => setSelectedProvider(id)}
        saving={saving}
        current={current}
        forecast={forecast}
        loadingPreview={loadingPreview}
      />

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={saveProvider} disabled={saving || !selectedProvider}>
          Сохранить провайдера
        </Button>
        <Button variant="secondary" onClick={preview} disabled={loadingPreview || !city.trim()}>
          Предпросмотр
        </Button>
      </div>

      {status ? <p className="text-xs text-ios-subtext">{status}</p> : null}
    </div>
  );
}
