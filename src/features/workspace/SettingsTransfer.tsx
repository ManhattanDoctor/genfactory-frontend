import { useRef, useState } from 'react';
import { usePreferences } from './preferences';
import { exportSettings, parseSettings, type PortableSettings } from './portable';
import { useAuth } from '../auth/AuthProvider';
import { getSession } from '../../lib/api';
export function SettingsTransfer({ onImported }: { onImported: (brand: string) => void }) {
  const prefs = usePreferences();
  const auth = useAuth();
  const [pending, setPending] = useState<PortableSettings>();
  const [notice, setNotice] = useState('');
  const request = useRef(0);
  return (
    <section className="account-card settings-transfer">
      <h2>Перенос настроек</h2>
      <p className="muted">
        Личные шаблоны, правила бренда и избранные модели в JSON. Беседы, файлы и данные входа в экспорт не
        включаются.
      </p>
      <div className="workspace-actions">
        <button
          className="button"
          disabled={!auth.user}
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(exportSettings(prefs.value), null, 2)], { type: 'application/json' }),
            );
            const a = document.createElement('a');
            a.href = url;
            a.download = 'genfactory-settings.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Экспорт настроек
        </button>
        <label className="button">
          Импорт настроек
          <input
            type="file"
            hidden
            disabled={!auth.user}
            accept="application/json,.json"
            aria-label="Импорт настроек JSON"
            onChange={async (e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (!file) return;
              const sid = auth.session;
              const seq = ++request.current;
              setPending(undefined);
              try {
                if (file.size > 500_000) throw new Error('Файл должен быть меньше 500 КБ.');
                const parsed = parseSettings(await file.text());
                if (seq === request.current && getSession() === sid) {
                  setPending(parsed);
                  setNotice('Проверьте состав импорта. Текущие шаблоны, правила и избранное будут заменены.');
                }
              } catch (error) {
                if (seq === request.current && getSession() === sid)
                  setNotice(error instanceof Error ? error.message : 'Не удалось прочитать файл.');
              }
            }}
          />
        </label>
      </div>
      {notice && <p role="status">{notice}</p>}
      {pending && (
        <div className="import-review">
          <p>
            Шаблонов: {pending.presets.length}. Правила бренда: {pending.brand.length} знаков. Избранных
            моделей: {pending.favoriteModels.length}.
          </p>
          <details>
            <summary>Просмотреть содержимое</summary>
            <pre>{JSON.stringify(pending, null, 2)}</pre>
          </details>
          <div className="workspace-actions">
            <button
              className="button primary"
              onClick={() => {
                if (
                  prefs.update((p) => ({
                    ...p,
                    presets: pending.presets,
                    brand: pending.brand,
                    favoriteModels: pending.favoriteModels,
                    favoriteTemplates: pending.favoriteTemplates,
                    versions: [{ at: new Date().toISOString(), text: p.brand }, ...p.versions].slice(0, 10),
                  }))
                ) {
                  onImported(pending.brand);
                  setPending(undefined);
                  setNotice('Настройки импортированы.');
                }
              }}
            >
              Применить импорт
            </button>
            <button className="button" onClick={() => setPending(undefined)}>
              Отмена
            </button>
          </div>
        </div>
      )}
      {prefs.error && <p role="alert">{prefs.error}</p>}
    </section>
  );
}
