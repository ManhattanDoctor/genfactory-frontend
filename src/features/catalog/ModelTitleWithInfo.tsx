import { Info, type LucideIcon } from 'lucide-react';
import './model-title-with-info.css';

/** Keep the final word and its info control on the same text line in every picker. */
export function ModelTitleWithInfo({
  title,
  onInfo,
  infoClassName,
  icon: Icon = Info,
}: {
  title: string;
  onInfo?: () => void;
  infoClassName?: string;
  icon?: LucideIcon;
}) {
  const boundary = title.lastIndexOf(' ') + 1;
  return (
    <>
      {title.slice(0, boundary)}
      <span className="model-title-tail">
        {title.slice(boundary)}
        {onInfo && (
          <button
            type="button"
            className={infoClassName}
            aria-label={`О модели ${title}`}
            onClick={(event) => {
              event.stopPropagation();
              onInfo();
            }}
          >
            <Icon size={14} />
          </button>
        )}
      </span>
    </>
  );
}
