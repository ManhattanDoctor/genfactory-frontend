import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { IFileOutputSettings, IConversation } from '../lib/types';
import { useAuth } from '../features/auth/AuthProvider';
import { FileBrowser } from './FileBrowser';
import { Modal } from './Modal';

export function useFileOutputSettings(scope: string, conversation?: IConversation) {
  const [draft, setDraft] = useState<{ scope: string; value: IFileOutputSettings }>();
  return {
    value: draft?.scope === scope ? draft.value : conversation?.fileOutput || {},
    changed: draft?.scope === scope,
    onChange: (value: IFileOutputSettings) => setDraft({ scope, value }),
  };
}
export function FileOutputEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: IFileOutputSettings;
  onChange: (value: IFileOutputSettings) => void;
  disabled?: boolean;
}) {
  const { user } = useAuth();
  const [picker, setPicker] = useState(false);
  const [directory, setDirectory] = useState<string | null>(null);
  const folder = useQuery({
    queryKey: ['files', user?.id, 'directory-name', value.directory],
    queryFn: () => api.directory(value.directory!),
    enabled: !!user && !!value.directory,
  });
  return (
    <details className="workspace-details">
      <summary>Куда сохранять результаты</summary>
      <div className="details-content file-form">
        <p className="small muted">
          Папка и теги сохранятся в настройках беседы при запуске. Применяются только к новым результатам.
        </p>
        <label className="setting-field">
          <span>Папка результатов</span>
          <button
            type="button"
            className="button"
            disabled={disabled}
            onClick={() => {
              setDirectory(null);
              setPicker(true);
            }}
          >
            {value.directory
              ? folder.data?.name || (folder.isPending ? 'Загружаем папку…' : 'Выбранная папка недоступна')
              : 'Корень библиотеки'}
          </button>
        </label>
        <label className="setting-field">
          <span>Теги результатов через запятую</span>
          <input
            disabled={disabled}
            value={value.tags?.join(',') || ''}
            maxLength={2080}
            placeholder="товар, каталог"
            onChange={(e) => onChange({ ...value, tags: e.target.value.split(',') })}
          />
        </label>
        {picker && (
          <Modal title="Папка результатов" onClose={() => setPicker(false)} wide>
            <div className="file-form">
              <FileBrowser foldersOnly onDirectory={setDirectory} />
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  onChange({ ...value, directory });
                  setPicker(false);
                }}
              >
                Сохранять в эту папку
              </button>
            </div>
          </Modal>
        )}
      </div>
    </details>
  );
}
