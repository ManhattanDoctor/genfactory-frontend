import './composer-template.css';
import { SelectControl } from '../../components/SelectControl';
import { useState } from 'react';
import { PromptTemplate } from './PromptTemplate';
import { templateVariableLabel } from './templateRecipe';

const backgrounds = ['Студийный фон', 'Интерьер', 'Улица'];
const backgroundColors = ['Белый', 'Серый', 'Чёрный'];
export function ComposerTemplateFields({
  recipe,
  values,
  onChange,
  disabled,
}: {
  recipe: PromptTemplate;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  disabled: boolean;
}) {
  const [custom, setCustom] = useState<Record<string, boolean>>({});
  return (
    <div className="composer-template-fields" role="group" aria-label="Параметры шаблона">
      {recipe.variables.map((key) => {
        const background = /^(BG|BACKGROUND)(?:_COLOR|_SCENE)?$/.test(key) && !recipe.choices.has(key);
        const label = background ? 'Фон' : templateVariableLabel(key);
        const presets = key.endsWith('_COLOR') ? backgroundColors : backgrounds;
        const options = recipe.choices.get(key) || (background ? presets : undefined);
        const value = values[key] || '';
        const other = background && (custom[key] || (!!value && !presets.includes(value)));
        return (
          <div key={key}>
            <label>
              <span>{label}</span>
              {options ? (
                <SelectControl
                  data-template-variable={key}
                  aria-label={label}
                  disabled={disabled}
                  value={other ? '__other' : value}
                  onChange={(event) => {
                    const next = event.target.value;
                    setCustom((current) => ({ ...current, [key]: next === '__other' }));
                    onChange(key, next === '__other' ? '' : next);
                  }}
                >
                  <option value="" disabled>
                    Выберите вариант
                  </option>
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                  {background && <option value="__other">Другое</option>}
                </SelectControl>
              ) : (
                <input
                  data-template-variable={key}
                  disabled={disabled}
                  type={recipe.isNumeric(key) ? 'number' : 'text'}
                  step={recipe.isNumeric(key) ? 'any' : undefined}
                  value={value}
                  onChange={(event) => onChange(key, event.target.value)}
                />
              )}
            </label>
            {other && (
              <label>
                <span>Свой фон</span>
                <input
                  data-template-variable={key}
                  disabled={disabled}
                  value={value}
                  onChange={(event) => onChange(key, event.target.value)}
                />
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}
