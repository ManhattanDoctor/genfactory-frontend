import type { ReactElement } from 'react';
import './media-loading.css';
export function Skeleton({ className = '' }: { className?: string }): ReactElement {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}
export function SkeletonCards({
  label,
  className = '',
}: {
  label: string;
  className?: string;
}): ReactElement {
  return (
    <div className={`skeleton-cards ${className}`} role="status" aria-label={label}>
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="skeleton-card" />
      ))}
    </div>
  );
}
