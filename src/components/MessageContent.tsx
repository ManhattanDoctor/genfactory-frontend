import Markdown, { type Components } from 'react-markdown';
import { createContext, memo, useContext, useMemo } from 'react';
import type { IGnosisFile } from '../lib/types';
import { safeMediaUrl } from '../lib/api';

interface IMessageFiles {
  files: Map<string, IGnosisFile>;
  onOpen?: (file: IGnosisFile) => void;
}
const MessageFiles = createContext<IMessageFiles>({ files: new Map() });
const emptyFiles: IGnosisFile[] = [];
const components: Components = {
  img: function MessageImage({ src, alt }) {
    const { files } = useContext(MessageFiles);
    const href = typeof src === 'string' ? safeMediaUrl(src) : undefined;
    if (!href || files.has(href)) return null;
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {alt || 'Изображение'}
      </a>
    );
  },
  a: function MessageLink({ href, children }) {
    const { files, onOpen } = useContext(MessageFiles);
    const url = safeMediaUrl(href);
    const file = url ? files.get(url) : undefined;
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
};
const MessageMarkdown = memo(function MessageMarkdown({ text }: { text: string }) {
  return (
    <Markdown skipHtml components={components}>
      {text}
    </Markdown>
  );
});
export function MessageContent({
  text,
  files = emptyFiles,
  onOpen,
}: {
  text: string;
  files?: IGnosisFile[];
  onOpen?: (file: IGnosisFile) => void;
}) {
  const attached = useMemo(() => {
    const result = new Map<string, IGnosisFile>();
    for (const file of files) {
      const url = safeMediaUrl(file.path);
      if (url && !result.has(url)) result.set(url, file);
    }
    return result;
  }, [files]);
  const context = useMemo(() => ({ files: attached, onOpen }), [attached, onOpen]);
  return (
    <MessageFiles.Provider value={context}>
      <div className="message-content">
        <MessageMarkdown text={text} />
      </div>
    </MessageFiles.Provider>
  );
}
