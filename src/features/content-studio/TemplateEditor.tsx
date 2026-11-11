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
      setError('Выберите исходное фото.');
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
                  <input
                    data-template-variable={key}
                    value={values[key] || ''}
                    onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
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
              <section className="template-reference" aria-label="Исходное фото">
                <h3>
                  Исходное фото <span>{policy === 'required' ? 'Обязательно' : 'По желанию'}</span>
                </h3>
                <p>{source?.name || 'Фото не выбрано'}</p>
                <div className="template-reference-actions">
                  {source && (
                    <button type="button" className="text-button" onClick={() => setSource(undefined)}>
                      Убрать фото
                    </button>
                  )}
                  {user && (
                    <button type="button" className="button" onClick={() => setLibrary(true)}>
                      Из библиотеки
                    </button>
                  )}
                </div>
                {!user && (
                  <p>Войдите в аккаунт студии, чтобы выбрать или загрузить изображение в библиотеке.</p>
                )}
              </section>
            )}
            {conflict && (
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
            <details className="template-preview">
              <summary>Посмотреть задание</summary>{' '}
              <label>
                Готовый текст для редактора
                <textarea rows={7} value={prompt} readOnly />
              </label>
            </details>
          </div>
        </div>
        <footer className="template-footer">
          {error && (
            <p className="template-error" role="alert">
              {error}
            </p>
          )}
          <p className="template-caption">
            Заменит текст и вложения редактора. Настройки сохранятся. Генерация начнётся после отправки.
          </p>
          <button type="button" className="button primary" onClick={apply}>
            Использовать шаблон
          </button>
        </footer>
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
