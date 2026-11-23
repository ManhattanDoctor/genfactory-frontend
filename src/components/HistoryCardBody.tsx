import './asset-feed.css';
import type { ReactNode } from 'react';

export function HistoryCardBody({
  title,
  source,
  metadata,
  date,
}: {
  title: string;
  source?: string;
  metadata: ReactNode;
  date?: ReactNode;
}) {
  return (
    <div className="artifact-body">
      <h3 className="artifact-title" title={title}>
        {title}
      </h3>
      {source ? (
        <span className="artifact-source" title={source}>
          {source}
        </span>
      ) : (
        <div className="artifact-meta">{metadata}</div>
      )}
      {date && (
        <div className="artifact-date">
          {source && metadata && <>{metadata} - </>}
          {date}
        </div>
      )}
    </div>
  );
}
