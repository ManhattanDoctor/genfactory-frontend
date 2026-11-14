import { createRoot } from 'react-dom/client';
import { useRef, useState } from 'react';
import { Masonry } from '../../src/components/Masonry';
import { Media } from '../../src/components/MediaPreview';
function Gallery() {
  const scroll = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  (window as any).setGalleryCount = setCount;
  const columns = innerWidth < 600 ? 2 : 4;
  return (
    <div ref={scroll} id="gallery-scroll" style={{ height: 700, overflow: 'auto', width: '100%' }}>
      <Masonry columns={columns} scrollRoot={scroll}>
        {Array.from({ length: count }, (_, index) => (
          <button
            key={`file:${index}`}
            style={{ display: 'block', width: '100%', padding: 0, border: 0 }}
            aria-label={`File ${index}`}
          >
            <Media
              file={{
                name: `File ${index}`,
                type: 'IMAGE',
                mime: 'image/svg+xml',
                path: '/fixture-image.svg',
                preview: {
                  image: {
                    status: 'READY',
                    url: '/fixture-image.svg',
                    width: 400,
                    height: 300,
                    mime: 'image/svg+xml',
                    size: 100,
                  },
                },
              }}
            />
          </button>
        ))}
      </Masonry>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Gallery />);
