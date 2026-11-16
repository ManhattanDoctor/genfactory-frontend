import { createRoot } from 'react-dom/client';
import { Media, type MediaFile } from '../../src/components/MediaPreview';
const root = createRoot(document.getElementById('root')!);
type MediaOptions = { showLoadingState?: boolean; autoPlay?: boolean };
(
  window as unknown as { renderMedia: (file: MediaFile, controls?: boolean, options?: MediaOptions) => void }
).renderMedia = (file, controls = false, options = {}) => {
  root.render(
    <div style={{ width: 300 }}>
      <Media file={file} controls={controls} {...options} />
    </div>,
  );
};
