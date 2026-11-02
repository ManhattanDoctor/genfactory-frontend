import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { IGnosisFile } from '../lib/types';
import { useAuth } from '../features/auth/AuthProvider';
import { Modal } from './Modal';
import { Media } from './MediaPreview';
export function LibraryPicker({
  onPick,
  onClose,
  selected = [],
  imagesOnly = true,
}: {
  onPick: (file: IGnosisFile) => void;
  onClose: () => void;
  selected?: number[];
  imagesOnly?: boolean;
}) {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const files = useQuery({
    queryKey: ['files', user?.id, imagesOnly ? 'IMAGE' : 'all', page],
    queryFn: () => api.files(page, imagesOnly ? 'IMAGE' : undefined),
    enabled: !!user,
  });
  return (
    <Modal title={imagesOnly ? 'Выбрать референс' : 'Выбрать материал'} onClose={onClose} wide>
      <input
        aria-label="Поиск референса на странице"
        placeholder="Название файла на этой странице"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {files.isPending && <p>Загружаем изображения…</p>}
      {files.error && (
        <p role="alert">
          {files.error.message}
          <button className="text-button" onClick={() => void files.refetch()}>
            Повторить
          </button>
        </p>
      )}
      <div className="picker-grid">
        {files.data?.items
          .filter(
            (f) =>
              f.userId === user?.id &&
              (imagesOnly ? f.type === 'IMAGE' : ['IMAGE', 'DOCUMENT', 'AUDIO'].includes(f.type)) &&
              f.name.toLowerCase().includes(search.toLowerCase()),
          )
          .map((f) => (
            <button
              className="library-card"
              disabled={selected.includes(f.id)}
              key={f.id}
              onClick={() => {
                onPick(f);
                onClose();
              }}
            >
              <div className="library-media">
                <Media file={f} />
              </div>
              <b>{f.name}</b>
              {selected.includes(f.id) && <span>Уже добавлен</span>}
            </button>
          ))}
      </div>
      {files.data && !files.data.items.some((f) => f.name.toLowerCase().includes(search.toLowerCase())) && (
        <p>Изображения не найдены.</p>
      )}
      {files.data && files.data.pages > 1 && (
        <div className="pagination">
          <button className="button" disabled={!page} onClick={() => setPage((p) => p - 1)}>
            Назад
          </button>
          <span>
            {page + 1} / {files.data.pages}
          </span>
          <button
            className="button"
            disabled={page + 1 >= files.data.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Далее
          </button>
        </div>
      )}
    </Modal>
  );
}
