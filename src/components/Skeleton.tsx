import type { ReactElement } from 'react';
import './media-loading.css';
import { HistoryCardBody } from './HistoryCardBody';
export function Skeleton({ className = '' }: { className?: string }): ReactElement {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}
export function AssetCardSkeleton({ history = false }: { history?: boolean }) {
  return (
    <div
      className={history ? 'generation-card history-card history-card-loading' : 'file-entry'}
      aria-hidden="true"
    >
      <Skeleton className={history ? 'history-cover' : 'library-media'} />
      <HistoryCardBody title=" " metadata=" " date=" " />
    </div>
  );
}
export function SkeletonCards({
  label,
  className = '',
  assets = false,
}: {
  label: string;
  className?: string;
  assets?: boolean;
}): ReactElement {
  return (
    <div className={`skeleton-cards ${className}`} role="status" aria-label={label}>
      {Array.from({ length: 8 }, (_, index) =>
        assets ? <AssetCardSkeleton key={index} /> : <Skeleton key={index} className="skeleton-card" />,
      )}
    </div>
  );
}

export function LoadingRows({ label }: { label: string }) {
  return (
    <div role="status" className="loading-rows">
      <span className="sr-only">{label}</span>
      <Skeleton />
      <Skeleton />
      <Skeleton />
    </div>
  );
}
