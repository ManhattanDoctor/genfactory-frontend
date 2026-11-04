import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { LibraryPicker } from '../../components/LibraryPicker';
import { useAuth } from '../auth/AuthProvider';
import type { IGnosisFile } from '../../lib/types';
import type { ITemplate } from './materials';
import './template-editor.css';
import {
  templateVariables,
  templateVariableLabel,
  fillTemplate,
  templateReference,
  templateDuration,
  adaptTemplateDuration,
} from './templateRecipe';

export interface ITemplateReference {
  saved?: IGnosisFile;
  file?: File;
  name: string;
}
export function TemplateEditor({
  item,
  duration,
  reference,
  referenceAllowed,
  launchSettings,
  onClose,
  onApply,
}: {
  item: ITemplate;
  duration: number;
  reference?: ITemplateReference;
  referenceAllowed: boolean;
  launchSettings: string;
  onClose: () => void;
  onApply: (prompt: string, reference?: ITemplateReference) => void;
}) {
  const { user } = useAuth();
  const [text, setText] = useState(item.prompt);
  const [values, setValues] = useState<Record<string, string>>({});
  const policy = templateReference(item);
  const [source, setSource] = useState(policy === 'none' ? undefined : reference);
  const [brief, setBrief] = useState('');
  const [library, setLibrary] = useState(false);
  const [error, setError] = useState('');
  const variables = templateVariables(text);
  const filled = fillTemplate(text, values);
  const prompt =
    item.kind === 'presentation'
      ? `${filled}\n\nТема и факты пользователя:\n${brief.trim()}\n\nПодготовь только текст по слайдам. Не придумывай цифры, клиентов, достижения и контакты: неизвестные данные помечай «Нужно уточнить».`
      : filled;
  const seconds = item.kind === 'video' ? templateDuration(text) : undefined;
  const conflict = seconds !== undefined && seconds !== duration;
  const apply = () => {
    if (source && !referenceAllowed) {
      setError('Выбранная модель не поддерживает референсы. Закройте шаблон и выберите другую модель.');
      return;
    }
    if (templateVariables(prompt).length) {
      setError('Заполните все поля шаблона.');
      return;
    }
    if (policy === 'required' && !source) {
      setError('Выберите изображение-референс.');
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
    onApply(prompt, source);
  };
  return (
    <>
      <Modal title={item.title} onClose={onClose} wide>
        <div className="template-editor">
          {item.kind === 'video' ? (
            <video src={item.src} controls playsInline preload="metadata" />
          ) : (
            <img src={item.src} alt={item.title} />
          )}
          <p className="muted">Пример приёма. Превью не передаётся генератору как референс.</p>
          {item.kind === 'presentation' && (
            <>
              <p>Результат — текст по слайдам, не готовый файл PPTX/PDF.</p>
              <label>
                Тема и исходные факты
                <textarea rows={4} value={brief} onChange={(e) => setBrief(e.target.value)} />
              </label>
            </>
          )}
          {variables.map((key) => (
            <label key={key}>
              {templateVariableLabel(key)}
              <input
                data-template-variable={key}
                value={values[key] || ''}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              />
            </label>
          ))}
          <details>
            <summary>Редактировать исходный шаблон</summary>
            <label>
              Текст шаблона
              <textarea
                rows={7}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setError('');
                }}
              />
            </label>
          </details>
          {policy !== 'none' && (
            <fieldset>
              <legend>Изображение-референс — {policy === 'required' ? 'обязательно' : 'по желанию'}</legend>
              <p>{source?.name || 'Референс не выбран'}</p>
              {source && (
                <button type="button" className="text-button" onClick={() => setSource(undefined)}>
                  Убрать референс
                </button>
              )}
              {user && (
                <button type="button" className="button" onClick={() => setLibrary(true)}>
                  Из библиотеки
                </button>
              )}

              {!user && (
                <p>Войдите в аккаунт студии, чтобы выбрать или загрузить изображение в библиотеке.</p>
              )}
            </fieldset>
          )}
          {conflict && (
            <div role="status">
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
          <label>
            Готовый текст для редактора
            <textarea rows={7} value={prompt} readOnly />
          </label>
          <section aria-label="Настройки после применения">
            <h3>Настройки после применения</h3>
            <p>{launchSettings}</p>
            <p>
              {item.kind === 'presentation' ? 'Текст по слайдам.' : 'Сценарист: выключен.'} Референс:{' '}
              {source?.name || 'без референса'}.
            </p>
          </section>
          <p className="muted small">
            Задание заменит текст редактора. Вложения будут заменены выбранным референсом или очищены. Модель
            и настройки редактора сохранятся; проверьте соответствие текста этим настройкам перед отправкой.
          </p>
          {error && <p role="alert">{error}</p>}
          <button type="button" className="button primary" onClick={apply}>
            Использовать шаблон
          </button>
        </div>
      </Modal>
      {library && (
        <LibraryPicker
          onClose={() => setLibrary(false)}
          onPick={(file) => {
            if (
              file.userId !== user?.id ||
              file.type !== 'IMAGE' ||
              !/^image\/(jpeg|png|webp)$/.test(file.mime)
            ) {
              setError('Выберите собственное изображение JPEG, PNG или WebP.');
              return;
            }
            setSource({ saved: file, name: file.name });
            setError('');
          }}
        />
      )}
    </>
  );
}
