import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { IGnosisFile } from '../../lib/types';
import { useAuth } from '../auth/AuthProvider';
import { FileBrowser } from '../../components/FileBrowser';
import { MediaPreview } from '../../components/MediaPreview';
export function Library() {
  const auth = useAuth();
  const [gallery, setGallery] = useState<IGnosisFile[]>([]);
  const [preview, setPreview] = useState<IGnosisFile>();
  const navigate = useNavigate();
  useEffect(() => {
    setPreview(undefined);
  }, [auth.user?.id]);
  return (
    <div className="page-content page-enter library-page">
      <h1 className="sr-only">Библиотека</h1>
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
          <p>Войдите, чтобы открыть библиотеку.</p>
          <button className="button primary" onClick={() => void auth.signIn()}>
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
    </div>
  );
}
