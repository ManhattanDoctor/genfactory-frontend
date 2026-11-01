import type { ComponentProps, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
export function SelectControl({
  leading,
  className = '',
  children,
  ...props
}: ComponentProps<'select'> & { leading?: ReactNode }) {
  return (
    <div className={`select-control ${leading ? 'with-leading' : ''} ${className}`}>
      {leading && (
        <span className="select-leading" aria-hidden="true">
          {leading}
        </span>
      )}
      <select {...props}>{children}</select>
      <ChevronDown className="select-chevron" size={16} aria-hidden="true" />
    </div>
  );
}
