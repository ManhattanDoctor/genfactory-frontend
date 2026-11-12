import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import './generation-elapsed.css';

export function GenerationElapsed({ startedAt }: { startedAt?: string }): ReactElement | null {
  const start = startedAt ? Date.parse(startedAt) : NaN;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!Number.isFinite(start)) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [start]);
  if (!Number.isFinite(start)) return null;
  return (
    <span className="generation-elapsed" aria-label="Время генерации" aria-live="off">
      {Math.max(0, Math.floor((now - start) / 1000))} с
    </span>
  );
}
