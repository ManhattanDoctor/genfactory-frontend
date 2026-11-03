import type { ISchema } from '../../lib/types';
import { SelectControl } from '../../components/SelectControl';
import { fieldNames } from './schema';
export function ModelField({
  name,
  schema,
  value,
  onChange,
}: {
  name: string;
  schema: ISchema;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = fieldNames[name] || name;
  if (schema.type === 'boolean')
    return (
      <label className="toggle-field">
        <span>{label}</span>
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        <span className="toggle-track" />
      </label>
    );
  return (
    <label className="setting-field">
      <span>{label}</span>
      {schema.enum ? (
        <SelectControl
          aria-label={label}
          value={value === undefined ? '' : JSON.stringify(value)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : JSON.parse(e.target.value))}
        >
          <option value="">По умолчанию</option>
          {schema.enum.map((item) => (
            <option key={JSON.stringify(item)} value={JSON.stringify(item)}>
              {String(item)}
            </option>
          ))}
        </SelectControl>
      ) : (
        <input
          value={value === undefined ? '' : String(value)}
          type={['number', 'integer'].includes(schema.type || '') ? 'number' : 'text'}
          min={schema.minimum}
          max={schema.maximum}
          step={schema.type === 'integer' ? 1 : 'any'}
          maxLength={schema.maxLength}
          placeholder="По умолчанию"
          onChange={(e) =>
            onChange(
              e.target.value === ''
                ? undefined
                : ['number', 'integer'].includes(schema.type || '')
                  ? Number(e.target.value)
                  : e.target.value,
            )
          }
        />
      )}
    </label>
  );
}
