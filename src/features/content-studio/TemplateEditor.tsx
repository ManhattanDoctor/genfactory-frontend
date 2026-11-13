import { PromptTemplate } from './PromptTemplate';
import { PromptPreview, PromptSource, promptParts } from './PromptText';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { Modal, ModalFooter } from '../../components/Modal';
import type { ITemplate } from './materials';
import './template-editor.css';
import { templateVariableLabel, templateDuration, adaptTemplateDuration } from './templateRecipe';

export function TemplateEditor({
  item,
  duration,
  launchSettings,
  onClose,
  onApply,
}: {
  item: ITemplate;
  duration?: number;
  launchSettings: string;
  onClose: () => void;
  onApply: (prompt: string) => void;
}): ReactElement {
  const [text, setText] = useState(item.prompt);
  const [values, setValues] = useState<Record<string, string>>({});
  const [brief, setBrief] = useState('');
  const [error, setError] = useState('');
  let recipe: PromptTemplate | undefined;
  let variables: Array<string> = [];
  let filled = text;
  let syntaxError = '';
  try {
    recipe = new PromptTemplate(text);
    variables = recipe.variables;
    filled = recipe
      .parts(values)
      .map((part) => part.text)
      .join('');
  } catch {
    syntaxError = 'Проверьте синтаксис шаблона и значения полей. Для числительных введите число.';
  }
  const prompt =
    item.kind === 'presentation'
      ? `${filled}\n\nТема и факты пользователя:\n${brief.trim()}\n\nПодготовь только текст по слайдам. Не придумывай цифры, клиентов, достижения и контакты: неизвестные данные помечай «Нужно уточнить».`
      : filled;
  let preview = [{ text: prompt, highlighted: false }];
  if (!syntaxError) {
    try {
      preview = promptParts(text, item.prompt, values);
      if (item.kind === 'presentation')
        preview.push({ text: prompt.slice(filled.length), highlighted: !!brief.trim() });
    } catch {
      /* The source remains editable even if its original version is invalid. */
    }
  }
  const seconds = item.kind === 'video' ? templateDuration(text) : undefined;
  const conflict = seconds !== undefined && duration !== undefined && seconds !== duration;
  const apply = (): void => {
    if (syntaxError) {
      setError(syntaxError);
      return;
    }
    if (variables.some((key) => !values[key]?.trim())) {
      setError('Заполните все поля шаблона.');
      return;
    }
    if (conflict) {
      setError('Согласуйте длительность шаблона с настройками редактора.');
      return;
    }
    if (item.kind === 'presentation' && !brief.trim()) {
      setError('Укажите тему и исходные факты для презентации.');
      return;
    }
    if (!filled.trim()) {
      setError('Введите текст задания.');
      return;
    }
    onApply(prompt);
  };
  return (
    <>
      <Modal title={item.title} onClose={onClose} wide className="template-dialog">
        <div className="template-editor">
          <aside className="template-example">
            {item.kind === 'video' ? (
              <video src={item.src} controls playsInline preload="metadata" />
            ) : (
              <img src={item.src} alt={item.title} />
            )}
            <p className="template-caption">Пример приёма · не используется как референс</p>
            <section className="template-settings" aria-label="Настройки после применения">
              <h3>Настройки после применения</h3>
              <p>{launchSettings}</p>
              {item.kind === 'presentation' && <p>Текст по слайдам</p>}
            </section>
          </aside>
          <div className="template-fields">
            <div className="template-inputs">
              {item.kind === 'presentation' && (
                <>
                  <p>Результат — текст по слайдам, не готовый файл PPTX/PDF.</p>
                  <label>
                    Тема и исходные факты
                    <textarea rows={4} value={brief} onChange={(e) => setBrief(e.target.value)} />
                  </label>
                </>
              )}
              <div className="template-variables">
                {variables.map((key) => (
                  <label key={key}>
                    {templateVariableLabel(key)}
                    {recipe?.choices.has(key) ? (
                      <select
                        data-template-variable={key}
                        value={values[key] || ''}
                        onChange={(e) => {
                          setValues({ ...values, [key]: e.target.value });
                          setError('');
                        }}
                      >
                        <option value="" disabled>
                          Выберите вариант
                        </option>
                        {recipe.choices.get(key)!.map((choice) => (
                          <option key={choice} value={choice}>
                            {choice}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        data-template-variable={key}
                        type={recipe?.isNumeric(key) ? 'number' : 'text'}
                        step={recipe?.isNumeric(key) ? 'any' : undefined}
                        value={values[key] || ''}
                        onChange={(e) => {
                          setValues({ ...values, [key]: e.target.value });
                          setError('');
                        }}
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>
            {conflict && duration !== undefined && (
              <div className="template-duration" role="status">
                <p>
                  В шаблоне {seconds} с, в редакторе {duration} с.
                </p>
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setText(adaptTemplateDuration(text, duration));
                    setError('');
                  }}
                >
                  Адаптировать под {duration} с
                </button>
              </div>
            )}
            <section className="template-preview" aria-label="Готовый промт">
              <PromptPreview parts={preview} />
            </section>
            <details>
              <summary>Редактировать исходный шаблон</summary>
              <div>
                <PromptSource
                  value={text}
                  onChange={(value) => {
                    setText(value);
                    setError('');
                  }}
                />
              </div>
            </details>
          </div>
        </div>
        <ModalFooter className="template-footer">
          {(error || syntaxError) && (
            <p className="template-error" role="alert">
              {error || syntaxError}
            </p>
          )}
          <p className="template-caption">Применит текст. Генерация начнётся после отправки.</p>
          <button type="button" className="button primary" onClick={apply}>
            Использовать шаблон
          </button>
        </ModalFooter>
      </Modal>
    </>
  );
}
