import { createRoot } from 'react-dom/client';
import { Media, type MediaFile } from '../../src/components/MediaPreview';
const root = createRoot(document.getElementById('root')!);
(window as unknown as { renderMedia: (file: MediaFile) => void }).renderMedia = (file) => {
  root.render(
    <div style={{ width: 300 }}>
      <Media file={file} />
    </div>,
  );
};
