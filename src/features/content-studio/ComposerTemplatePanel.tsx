import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import './composer-template.css';

export function ComposerTemplatePanel({
  title,
  disabled,
  onReset,
  children,
}: {
  title: string;
  disabled: boolean;
  onReset: () => void;
  children: ReactNode;
}) {
  return (
    <div className="composer-template-options" aria-label="Параметры шаблона" role="group">
      <div className="composer-template-heading">
        <span data-tooltip={title}>{title}</span>
        <button
          type="button"
          className="icon-button"
          disabled={disabled}
          onClick={onReset}
          aria-label="Сбросить шаблон"
          data-tooltip="Убрать шаблон и очистить текст запроса"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      {children}
    </div>
  );
}
