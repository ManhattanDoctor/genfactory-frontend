import { useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import type { ReactElement } from 'react';
import { getSession } from '../lib/api';
import { downloadFile, resolveFile } from '../lib/files';
import type { IGnosisFile } from '../lib/types';

export function FileDownloadButton({ file, label }: { file: IGnosisFile; label: string }): ReactElement {
  const download = useMutation({
    mutationFn: async () => {
      const sid = getSession();
      if (!sid) throw new Error('Требуется авторизация.');
      const original = await resolveFile(file, sid);
      if (getSession() === sid) await downloadFile(original, sid);
    },
  });
  return (
    <>
      <button
        type="button"
        className="button"
        aria-label={label}
        disabled={download.isPending}
        onClick={() => download.mutate()}
      >
        <Download size={16} aria-hidden="true" />
      </button>
      {download.isError && <span role="alert">Не удалось скачать файл.</span>}
    </>
  );
}
