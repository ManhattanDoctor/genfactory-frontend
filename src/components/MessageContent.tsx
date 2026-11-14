import Markdown from 'react-markdown';
import type { IGnosisFile } from '../lib/types';
import { safeMediaUrl } from '../lib/api';
export function MessageContent({
  text,
  files = [],
  onOpen,
}: {
  text: string;
  files?: IGnosisFile[];
  onOpen?: (file: IGnosisFile) => void;
}) {
  const attached = new Set(files.map((file) => safeMediaUrl(file.path)));
  return (
    <div className="message-content">
      <Markdown
        skipHtml
        components={{
          img: ({ src, alt }) => {
            const href = typeof src === 'string' ? safeMediaUrl(src) : undefined;
            if (!href || attached.has(href)) return null;
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {alt || 'Изображение'}
              </a>
            );
          },
          a: ({ href, children }) => {
            const url = safeMediaUrl(href);
            const file = url ? files.find((item) => safeMediaUrl(item.path) === url) : undefined;
            return (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={
                  file && onOpen
                    ? (event) => {
                        event.preventDefault();
                        onOpen(file);
                      }
                    : undefined
                }
              >
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
