import type { ReactElement } from 'react';
export function Toggle({
  label,
  description,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}): ReactElement {
  return (
    <div className="cw-switch-row">
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <button
        className={`cw-switch ${value ? 'is-on' : ''}`}
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={value}
        aria-pressed={value}
        disabled={disabled}
        onClick={() => onChange(!value)}
      >
        <i />
      </button>
    </div>
  );
}
