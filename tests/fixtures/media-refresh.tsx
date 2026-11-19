import { createRoot } from 'react-dom/client';
import { Media, type MediaFile } from '../../src/components/MediaPreview';
const root = createRoot(document.getElementById('root')!);
type MediaOptions = { showLoadingState?: boolean; autoPlay?: boolean; isPlaybackDisabled?: boolean };
(
  window as unknown as { renderMedia: (file: MediaFile, controls?: boolean, options?: MediaOptions) => void }
).renderMedia = (file, controls = false, options = {}) => {
  root.render(
    <div style={{ width: 300 }}>
      <Media file={file} controls={controls} {...options} />
    </div>,
  );
};

import { MessageContent } from '../../src/components/MessageContent';
import type { IGnosisFile } from '../../src/lib/types';
(window as any).renderMessage = (name: string) => {
  const file = { id: 12, path: 'https://example.test/file.png', name } as IGnosisFile;
  root.render(
    <MessageContent
      text="[Файл](https://example.test/file.png)"
      files={[file]}
      onOpen={(current) => {
        (window as any).openedName = current.name;
      }}
    />,
  );
};
