export function VideoDuration({
  values,
  value,
  disabled,
  mobile,
  onChange,
  label,
}: {
  values: number[];
  value: number;
  disabled: boolean;
  mobile: boolean;
  label: string;
  onChange: (value: number) => void;
}) {
  const durations = [...values].sort((a, b) => a - b);
  if (!durations.length) return null;
  const selected = value || durations[0];
  const shorter = durations.filter((seconds) => seconds < selected).at(-1);
  const longer = durations.find((seconds) => seconds > selected);
  const stepper = (
    <div className="duration-stepper cw-stepper" role="group" aria-label={label} aria-disabled={disabled}>
      <button
        type="button"
        className="duration-step"
        aria-label="Короче"
        disabled={disabled || shorter === undefined}
        onClick={() => shorter !== undefined && onChange(shorter)}
      >
        −
      </button>
      <span className="duration-value">{selected} с</span>
      <button
        type="button"
        className="duration-step"
        aria-label="Длиннее"
        disabled={disabled || longer === undefined}
        onClick={() => longer !== undefined && onChange(longer)}
      >
        +
      </button>
    </div>
  );
  return mobile ? <div className="video-duration-control">{stepper}</div> : stepper;
}
