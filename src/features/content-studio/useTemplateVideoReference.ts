import { useEffect, useRef, useState } from 'react';
import { api, getSession, type IUploadProgress } from '../../lib/api';
import type { IGnosisFile } from '../../lib/types';
import { useAuth } from '../auth/AuthProvider';
import { templateVideoFile, type ITemplate } from './materials';

/** Upload explicit template inputs through the same file API as user attachments. */
export function useTemplateVideoReference(scope: string | object, mode?: string) {
  const { user, session, signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<IUploadProgress>();
  const active = useRef<AbortController | undefined>(undefined);
  const currentIdentity = useRef({ scope, mode, session, userId: user?.id });
  currentIdentity.current = { scope, mode, session, userId: user?.id };
  useEffect(() => {
    setLoading(false);
    setProgress(undefined);
    return () => {
      active.current?.abort();
      active.current = undefined;
    };
  }, [scope, mode, session, user?.id]);

  const prepare = async (
    item: ITemplate,
    existing?: IGnosisFile,
  ): Promise<{ file?: IGnosisFile } | undefined> => {
    if (active.current) return;
    if (!item.referenceVideoSrc) return {};
    if (!user || !session) {
      void signIn();
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    const isCurrent = () =>
      !controller.signal.aborted &&
      currentIdentity.current.scope === scope &&
      currentIdentity.current.mode === mode &&
      currentIdentity.current.session === session &&
      currentIdentity.current.userId === user.id &&
      getSession() === session;
    setLoading(true);
    setProgress(undefined);
    try {
      let file: IGnosisFile;
      if (existing) file = await api.file(existing.id, session);
      else {
        const source = await templateVideoFile(item, controller.signal);
        if (!isCurrent()) return;
        file = await api.upload(source, session, undefined, (value) => {
          if (isCurrent()) setProgress(value);
        });
      }
      if (!isCurrent()) return;
      if (file.userId !== user.id || file.type !== 'VIDEO')
        throw new Error('Не удалось прикрепить видео шаблона к вашему аккаунту.');
      return { file };
    } catch (error) {
      if (isCurrent()) throw error;
    } finally {
      if (active.current === controller) {
        active.current = undefined;
        setLoading(false);
        setProgress(undefined);
      }
    }
  };
  return { prepare, loading, progress };
}
