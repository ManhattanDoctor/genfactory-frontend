import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { IGnosisFile } from '../../lib/types';
import { useAuth } from '../auth/AuthProvider';
import { FileBrowser } from '../../components/FileBrowser';
import { MediaPreview } from '../../components/MediaPreview';
import { LoginDialog } from '../../components/LoginDialog';
export function Library() {
  const auth = useAuth();
  const [login, setLogin] = useState(false);
  const [gallery, setGallery] = useState<IGnosisFile[]>([]);
  const [preview, setPreview] = useState<IGnosisFile>();
  const navigate = useNavigate();
  useEffect(() => {
    setPreview(undefined);
  }, [auth.user?.id]);
  return (
    <div className="page-content page-enter">
      <div className="page-heading compact">
        <div>
          <span className="eyebrow">ВАШИ МАТЕРИАЛЫ И РЕЗУЛЬТАТЫ</span>
          <h1>Библиотека</h1>
          <p>Файлы, папки и ссылки вашего аккаунта gnosis.</p>
        </div>
      </div>
      {auth.user ? (
        <FileBrowser
          key={auth.user.id}
          onCreate={() => navigate('/image')}
          onOpen={(file, files) => {
            setPreview(file);
            setGallery(files);
          }}
        />
      ) : (
        <div className="empty-state">
          <h2>Все ваши файлы в одном месте</h2>
          <p>Войдите, чтобы открыть библиотеку.</p>
          <button className="button primary" onClick={() => setLogin(true)}>
            Войти в аккаунт
          </button>
        </div>
      )}
      {auth.user && preview && (
        <MediaPreview
          key={preview.id}
          file={preview}
          files={gallery}
          onClose={() => setPreview(undefined)}
          onAnalyze={(file) => navigate('/prompt', { state: { reference: file, userId: auth.user?.id } })}
          onUse={(file) => navigate('/image', { state: { reference: file, userId: auth.user?.id } })}
          onAnimate={(file) => navigate('/video', { state: { reference: file, userId: auth.user?.id } })}
        />
      )}
      {login && <LoginDialog onClose={() => setLogin(false)} />}
    </div>
  );
}
