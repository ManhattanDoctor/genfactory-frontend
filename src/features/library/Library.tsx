import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, FolderOpen, RefreshCw, Search } from 'lucide-react';
import { api } from '../../lib/api';
import type { GnosisFile } from '../../lib/types';
import { useAuth } from '../auth/AuthProvider';
import { Media, MediaPreview } from '../../components/MediaPreview';
import { LoginDialog } from '../../components/LoginDialog';
export function Library() {
  const auth = useAuth();
  const [login, setLogin] = useState(false);
  const [type, setType] = useState('IMAGE');
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<GnosisFile>();
  const navigate = useNavigate();
  useEffect(() => {
    setPreview(undefined);
    setPage(0);
    setSearch('');
  }, [auth.user?.id]);
  const files = useQuery({
    queryKey: ['files', auth.user?.id, type, page],
    queryFn: () => api.files(page, type),
    enabled: !!auth.user,
    retry: 1,
  });
  return (
    <div className="page-content page-enter">
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">ВАШИ ИДЕИ, УЖЕ В ФОРМЕ</span>
          <h1>Библиотека</h1>
          <p>Изображения и видео вашего аккаунта gnosis.</p>
        </div>
        {auth.user && (
          <button className="button" onClick={() => void files.refetch()}>
            <RefreshCw size={16} /> Обновить
          </button>
        )}
      </div>
      <div className="library-toolbar">
        <div className="chips">
          <button
            className={`chip ${type === 'IMAGE' ? 'active' : ''}`}
            onClick={() => {
              setType('IMAGE');
              setPage(0);
            }}
          >
            Изображения
          </button>
          <button
            className={`chip ${type === 'VIDEO' ? 'active' : ''}`}
            onClick={() => {
              setType('VIDEO');
              setPage(0);
            }}
          >
            Видео
          </button>
          {(
            [
              ['DOCUMENT', 'Документы'],
              ['AUDIO', 'Аудио'],
            ] as const
          ).map(([id, label]) => (
            <button
              className={`chip ${type === id ? 'active' : ''}`}
              key={id}
              onClick={() => {
                setType(id);
                setPage(0);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="Поиск файлов на странице"
            placeholder="Поиск на странице"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {!auth.user ? (
        <div className="empty-state">
          <FolderOpen size={38} />
          <h2>Всё созданное — в одном месте</h2>
          <p>Войдите, чтобы открыть свои файлы.</p>
          <button className="button primary" onClick={() => setLogin(true)}>
            Войти в аккаунт
          </button>
        </div>
      ) : files.isPending ? (
        <div className="skeleton-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div className="skeleton" key={i} />
          ))}
        </div>
      ) : files.error ? (
        <div className="empty-state">
          <h2>Не удалось загрузить библиотеку</h2>
          <p>{files.error.message}</p>
          <button className="button" onClick={() => void files.refetch()}>
            Попробовать снова
          </button>
        </div>
      ) : (
        <>
          <div className="library-grid">
            {files.data?.items
              .filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
              .map((file) => (
                <button className="library-card" key={file.id} onClick={() => setPreview(file)}>
                  <div className="library-media">
                    <Media file={file} />
                  </div>
                  <div>
                    <b>{file.name}</b>
                    <span>{new Date(file.createdDate).toLocaleDateString('ru-RU')}</span>
                  </div>
                </button>
              ))}
          </div>
          {!!files.data?.items.length &&
            !files.data.items.some((f) => f.name.toLowerCase().includes(search.toLowerCase())) && (
              <p className="empty-state" role="status">
                На этой странице ничего не найдено.
              </p>
            )}
          {!files.data?.items.length && (
            <div className="empty-state">
              <FolderOpen size={36} />
              <h2>Здесь начинается ваша коллекция</h2>
              <p>Первый результат появится после генерации.</p>
              <button
                className="button primary"
                onClick={() => navigate(type === 'IMAGE' ? '/image' : type === 'VIDEO' ? '/video' : '/chat')}
              >
                {type === 'IMAGE'
                  ? 'Создать изображение'
                  : type === 'VIDEO'
                    ? 'Создать видео'
                    : 'Открыть AI-студию'}
              </button>
            </div>
          )}
          {files.data && files.data.pages > 1 && (
            <div className="pagination">
              <button className="button" disabled={!page} onClick={() => setPage((p) => p - 1)}>
                <ArrowLeft size={16} /> Назад
              </button>
              <span>
                {page + 1} / {files.data.pages}
              </span>
              <button
                className="button"
                disabled={page + 1 >= files.data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Далее <ArrowRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
      {auth.user && preview && preview.userId === auth.user.id && (
        <MediaPreview
          file={preview}
          onClose={() => setPreview(undefined)}
          files={files.data?.items.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))}
          onAnalyze={(file) => navigate('/prompt', { state: { reference: file, userId: auth.user?.id } })}
          onUse={(file) => navigate('/image', { state: { reference: file, userId: auth.user?.id } })}
          onAnimate={(file) => navigate('/video', { state: { reference: file, userId: auth.user?.id } })}
        />
      )}{' '}
      {login && <LoginDialog onClose={() => setLogin(false)} />}
    </div>
  );
}
