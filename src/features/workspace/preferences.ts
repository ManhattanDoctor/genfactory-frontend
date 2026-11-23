import { useMemo, useState, useSyncExternalStore } from 'react';
import { useAuth } from '../auth/AuthProvider';
import type { MediaKind, IModelDescription } from '../../lib/types';
export interface IPreset {
  id: string;
  name: string;
  category: string;
  kind: MediaKind;
  prompt: string;
  modelMatch?: string;
  model?: IModelDescription['reference'];
  options?: Record<string, unknown>;
}
export interface IPreferences {
  favoriteTemplates: string[];
  favoriteModels: string[];
  presets: IPreset[];
  brand: string;
  versions: { at: string; text: string }[];
}
const empty: IPreferences = {
  favoriteTemplates: [],
  favoriteModels: [],
  presets: [],
  brand: '',
  versions: [],
};
const eventName = 'genfactory:preferences';
function subscribe(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener(eventName, listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener(eventName, listener);
  };
}
function read(key: string): IPreferences {
  try {
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    return {
      favoriteTemplates: Array.isArray(data.favoriteTemplates)
        ? data.favoriteTemplates.filter((x: unknown) => typeof x === 'string')
        : [],
      favoriteModels: Array.isArray(data.favoriteModels)
        ? data.favoriteModels.filter((x: unknown) => typeof x === 'string')
        : [],
      presets: Array.isArray(data.presets)
        ? data.presets
            .filter(
              (x: IPreset) =>
                x &&
                typeof x.id === 'string' &&
                typeof x.name === 'string' &&
                typeof x.prompt === 'string' &&
                ['image', 'video'].includes(x.kind),
            )
            .slice(0, 40)
        : [],
      brand: typeof data.brand === 'string' ? data.brand.slice(0, 6000) : '',
      versions: Array.isArray(data.versions)
        ? data.versions
            .filter(
              (x: { at: string; text: string }) =>
                x && typeof x.at === 'string' && typeof x.text === 'string',
            )
            .slice(0, 10)
        : [],
    };
  } catch {
    return empty;
  }
}
export function usePreferences() {
  const { user } = useAuth();
  const key = `genfactory.preferences.v1.${user?.id ?? 'guest'}`;
  const [error, setError] = useState('');
  const raw = useSyncExternalStore(subscribe, () => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  });
  const value = useMemo(() => read(key), [raw, key]);
  const save = (change: (current: IPreferences) => IPreferences) => {
    try {
      localStorage.setItem(key, JSON.stringify(change(read(key))));
      window.dispatchEvent(new Event(eventName));
      setError('');
      return true;
    } catch {
      setError('Не удалось сохранить настройки в браузере. Проверьте доступное место.');
      return false;
    }
  };
  const update = (change: (current: IPreferences) => IPreferences) => {
    if (user) return save(change);
    setError('Войдите, чтобы сохранить настройки.');
    return false;
  };
  const toggleFavoriteModel = (id: string) =>
    save((current) => ({ ...current, favoriteModels: toggleItem(current.favoriteModels, id) }));
  return { value, update, toggleFavoriteModel, error };
}
export const toggleItem = <T>(items: T[], item: T) =>
  items.includes(item) ? items.filter((x) => x !== item) : [...items, item];
