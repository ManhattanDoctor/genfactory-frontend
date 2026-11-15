import { useEffect, useRef, useState, type ReactElement } from 'react';
import { api, getSession, safeMediaUrl } from '../lib/api';
import type { PreviewFile } from './MediaPreview';

/** Loads the original only on demand; keeps it for retrying the native share dialog. */
export function FileShareButton({
  file,
  mode,
  onNotice,
  onShared,
}: {
  file: PreviewFile;
  mode: 'link' | 'file';
  onNotice: (message: string) => void;
  onShared: () => void;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const prepared = useRef<ShareData | undefined>(undefined);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      prepared.current = undefined;
    };
  }, []);

  async function share(): Promise<void> {
    const path = safeMediaUrl(file.path);
    if (!path || lock.current) return;
    const sid = getSession();
    const active = (): boolean => alive.current && getSession() === sid;
    lock.current = true;
    setBusy(true);
    onNotice('');
    try {
      const url = new URL(path, location.href).href;
      if (mode === 'link') {
        if (navigator.share) await navigator.share({ title: file.name, url });
        else {
          await navigator.clipboard.writeText(url);
          if (active()) onNotice('Ссылка на файл скопирована. Вставьте её в сообщение.');
        }
        if (active()) onShared();
        return;
      }
      if (!navigator.share || !navigator.canShare) {
        onNotice('Браузер не поддерживает отправку файлов. Скачайте файл и прикрепите его в мессенджере.');
        return;
      }
      let data = prepared.current;
      if (!data) {
        let blob: Blob;
        if (typeof file.id === 'number' && !file.isExternal) blob = await api.downloadFile(file.id, sid);
        else {
          const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(60_000) });
          if (!response.ok) throw new Error('Не удалось загрузить файл.');
          blob = await response.blob();
        }
        if (!active()) return;
        const type = file.mime || blob.type;
        const extension =
          (
            {
              'image/png': 'png',
              'image/jpeg': 'jpg',
              'image/webp': 'webp',
              'video/mp4': 'mp4',
              'audio/mpeg': 'mp3',
            } as Record<string, string>
          )[type] || new URL(url).pathname.match(/\.([a-z0-9]{1,10})$/i)?.[1];
        const name = file.name.replace(/[\\/:*?"<>|]/g, '_');
        const original = new File(
          [blob],
          /\.[a-z0-9]{1,10}$/i.test(name) || !extension ? name : `${name}.${extension}`,
          { type },
        );
        if (!navigator.canShare({ files: [original] })) {
          onNotice('Браузер не может отправить этот файл. Скачайте его и прикрепите в мессенджере.');
          return;
        }
        data = { files: [original], title: file.name };
        prepared.current = data;
      }
      // A slow download can outlive the browser's transient click activation.
      if (navigator.userActivation && !navigator.userActivation.isActive) {
        onNotice('Файл готов. Нажмите «Отправить файл» ещё раз.');
        return;
      }
      await navigator.share(data);
      if (active()) onShared();
    } catch (error) {
      if (active() && !(error instanceof DOMException && error.name === 'AbortError'))
        onNotice(
          mode === 'link'
            ? 'Не удалось поделиться ссылкой. Попробуйте ещё раз.'
            : 'Не удалось отправить файл. Попробуйте ещё раз или скачайте его для отправки.',
        );
    } finally {
      lock.current = false;
      if (active()) setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="preview-menu-item"
      disabled={busy}
      aria-busy={busy}
      onClick={() => void share()}
    >
      {busy
        ? mode === 'file'
          ? 'Загружаем файл для отправки…'
          : 'Открываем…'
        : mode === 'file'
          ? 'Отправить файл'
          : 'Поделиться ссылкой'}
    </button>
  );
}
