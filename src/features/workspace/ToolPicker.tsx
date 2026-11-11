import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { isAllowedProvider } from '../../lib/modelPolicy';
export const toolNames: Record<string, string> = {
  IMAGE: 'Создание изображений',
  VIDEO: 'Создание видео',
  IMAGE_RECOGNITION: 'Анализ изображений',
  VIDEO_RECOGNITION: 'Анализ видео',
  YANDEX: 'Поиск в Яндексе',
  WIKIPEDIA: 'Википедия',
  WOLFRAM_ALPHA: 'Вычисления',
  TTS: 'Озвучка текста',
  STT: 'Расшифровка аудио',
  MEDIA_CONVERT: 'Конвертация медиа',
  IMAGE_RESIZE: 'Изменение размера изображения',
  DOCUMENT_SEARCH: 'Поиск по документам',
  DOCUMENT_READ: 'Чтение документов',
  DOCUMENT_DIFF: 'Сравнение документов',
  TABLE_QUERY: 'Работа с таблицами',
  DOCUMENT_WRITE: 'Создание документов',
};
export function ToolPicker({
  provider,
  value,
  onChange,
  disabled = false,
}: {
  provider: string;
  value: string[];
  onChange: (uids: string[]) => void;
  disabled?: boolean;
}) {
  const { user } = useAuth();
  const catalog = useQuery({
    queryKey: ['tools', user?.id, provider],
    queryFn: ({ signal }) => api.details(provider, signal),
    enabled: !!user && !!provider,
    staleTime: 300000,
  });
  const tools =
    catalog.data?.tools?.filter(
      (t) => !t.isDeprecated && (!t.providers?.length || t.providers.some(isAllowedProvider)),
    ) || [];
  return (
    <details className="workspace-details">
      <summary>Инструменты · {value.length}</summary>
      <div className="details-content">
        <p className="small muted">
          Ассистент сможет использовать выбранные инструменты при отправке запроса. Их работа может
          оплачиваться отдельно.
        </p>
        {catalog.isPending && <p>Загружаем инструменты…</p>}
        {catalog.error && (
          <p role="alert">
            Не удалось загрузить инструменты.
            <button className="text-button" onClick={() => void catalog.refetch()}>
              Повторить
            </button>
          </p>
        )}
        <div className="tool-choices">
          {tools.map((t) => (
            <label key={t.uid}>
              <input
                type="checkbox"
                disabled={disabled}
                checked={value.includes(t.uid)}
                onChange={() =>
                  onChange(value.includes(t.uid) ? value.filter((x) => x !== t.uid) : [...value, t.uid])
                }
              />
              <span>{toolNames[t.uid] || t.name || t.uid}</span>
            </label>
          ))}
        </div>
        {value
          .filter((uid) => !tools.some((t) => t.uid === uid))
          .map((uid) => (
            <label className="option-check" key={uid}>
              <input
                type="checkbox"
                disabled={disabled}
                checked
                onChange={() => onChange(value.filter((x) => x !== uid))}
              />
              {toolNames[uid] || uid} · существующее подключение
            </label>
          ))}
      </div>
    </details>
  );
}
