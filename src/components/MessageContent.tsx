import Markdown from 'react-markdown';
import type { IGnosisFile } from '../lib/types';
import { safeMediaUrl } from '../lib/api';
export function MessageContent({ text, files = [] }: { text: string; files?: IGnosisFile[] }) {
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
          a: ({ href, children }) => (
            <a href={safeMediaUrl(href)} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
