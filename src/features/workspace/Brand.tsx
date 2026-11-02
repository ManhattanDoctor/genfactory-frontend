import { SettingsTransfer } from './SettingsTransfer';
import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { usePreferences } from './preferences';
export function Brand() {
  const { user } = useAuth();
  return <BrandEditor key={user?.id ?? 'guest'} />;
}
function BrandEditor() {
  const { user } = useAuth();
  const prefs = usePreferences();
  const [draft, setDraft] = useState(prefs.value.brand);
  const [notice, setNotice] = useState('');
  return (
    <div className="page-content">
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">ВАШ ВИЗУАЛЬНЫЙ ЯЗЫК</span>
          <h1>Правила бренда</h1>
          <p>Цвета, тон, стиль и ограничения для ассистента и генераторов.</p>
        </div>
      </div>
      <section className="account-card brand-editor">
        <p className="muted">
          Хранятся в этом браузере для вашего аккаунта. Применяются только при включении «Использовать правила
          бренда» в редакторе.
        </p>
        {!user && <p>Войдите через кнопку в верхней панели, чтобы сохранить правила.</p>}
        <label className="setting-field">
          <span>Правила оформления</span>
          <textarea
            rows={12}
            maxLength={6000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Цвета, композиция, настроение, обязательные элементы, чего избегать…"
          />
        </label>
        <div className="workspace-actions">
          <button
            className="button primary"
            disabled={!user}
            onClick={() => {
              if (
                prefs.update((p) => ({
                  ...p,
                  brand: draft.trim(),
                  versions: [{ at: new Date().toISOString(), text: draft.trim() }, ...p.versions].slice(
                    0,
                    10,
                  ),
                }))
              )
                setNotice('Правила сохранены.');
            }}
          >
            Сохранить версию
          </button>
          <label className="button">
            Импорт TXT / Markdown
            <input
              type="file"
              hidden
              accept=".txt,.md,text/plain,text/markdown"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 100_000) {
                  setNotice('Выберите текстовый файл до 100 КБ.');
                  return;
                }
                try {
                  setDraft((await f.text()).slice(0, 6000));
                  setNotice('Текст загружен. Проверьте его и сохраните версию.');
                } catch {
                  setNotice('Не удалось прочитать файл.');
                }
                e.target.value = '';
              }}
            />
          </label>
        </div>
        {(notice || prefs.error) && <p role="status">{prefs.error || notice}</p>}
        {!!prefs.value.versions.length && (
          <>
            <h2>Предыдущие версии</h2>
            {prefs.value.versions.map((v, i) => (
              <div className="version-row" key={v.at + String(i)}>
                <span>
                  {new Date(v.at).toLocaleString('ru-RU')} · {v.text.length} знаков
                </span>
                <button
                  className="text-button"
                  onClick={() => {
                    setDraft(v.text);
                    setNotice('Версия открыта для редактирования. Сохраните её, чтобы применить.');
                  }}
                >
                  Открыть версию
                </button>
              </div>
            ))}
          </>
        )}
      </section>
      <SettingsTransfer onImported={setDraft} />
    </div>
  );
}
