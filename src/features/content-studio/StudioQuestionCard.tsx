import { useId, useRef, useState, type ReactElement } from 'react';
import type { StudioQuestion } from './studioAgent';
import { modelTitle } from '../catalog/presentation';
import './studio-question.css';

const automaticAnswer = 'Выбери сам творческое решение. Не выдумывай факты.';

export function StudioQuestionCard({
  question,
  disabled,
  previousAnswer,
  onAnswer,
}: {
  question: StudioQuestion;
  disabled: boolean;
  previousAnswer?: string;
  onAnswer: (answer: string) => Promise<boolean>;
}): ReactElement {
  const name = useId();
  const lock = useRef(false);
  const [sending, setSending] = useState(false);
  const choices = question.choices.map((text) => ({ text, value: text }));
  if (question.allowAuto && !question.choices.includes('Выбери сам'))
    choices.push({ text: 'Выбери сам', value: automaticAnswer });
  const [selected, setSelected] = useState<string | null>(choices[0].value);
  const [custom, setCustom] = useState('');
  const [accepted, setAccepted] = useState<string>();
  const resolved = previousAnswer ?? accepted;
  const choice =
    resolved === undefined ? selected : (choices.find((item) => item.value === resolved)?.value ?? null);
  const customText = resolved !== undefined && choice === null ? resolved : custom;
  const answer = choice ?? customText.trim();
  const inactive = disabled || sending || resolved !== undefined;
  return (
    <div className="studio-question" role="group" aria-label={question.question}>
      <div className="studio-question-heading">
        <small>
          {modelTitle({
            reference: question.context.settings.model,
            name: question.context.settings.model.model,
          })}
        </small>
        <p>{question.question}</p>
      </div>
      <form
        className={'msg-choices' + (resolved !== undefined ? ' is-resolved' : '')}
        onSubmit={async (event) => {
          event.preventDefault();
          if (inactive || lock.current || !answer) return;
          lock.current = true;
          setSending(true);
          try {
            if (await onAnswer(answer)) setAccepted(answer);
          } finally {
            lock.current = false;
            setSending(false);
          }
        }}
      >
        {choices.map(({ text, value }) => (
          <label key={value} className={'msg-choice' + (choice === value ? ' is-selected' : '')}>
            <input
              type="radio"
              name={name}
              checked={choice === value}
              disabled={inactive}
              onChange={() => setSelected(value)}
            />
            <span className="msg-choice-title">{text}</span>
          </label>
        ))}
        <div className={'msg-choice' + (choice === null ? ' is-selected' : '')}>
          <input
            type="radio"
            id={name + '-custom'}
            name={name}
            checked={choice === null}
            disabled={inactive}
            onChange={() => setSelected(null)}
          />
          <div className="msg-choice-copy">
            <label htmlFor={name + '-custom'} className="msg-choice-title">
              Свой вариант
            </label>
            <span className="msg-choice-body">Кратко опишите, как сделать кадр или ролик</span>
            <textarea
              className="msg-choice-custom-input"
              aria-label="Свой ответ"
              placeholder="Например: чашка слева, за окном закат, без текста на этикетке"
              value={customText}
              maxLength={2000}
              rows={3}
              disabled={inactive || choice !== null}
              onChange={(event) => setCustom(event.target.value)}
            />
          </div>
        </div>
        {resolved !== undefined ? (
          <p className="msg-choice-hint">Вариант выбран</p>
        ) : (
          !disabled && (
            <div className="msg-choice-actions">
              <button className="msg-choice-submit" type="submit" disabled={sending || !answer}>
                Выбрать этот вариант
              </button>
              <p className="msg-choice-hint">После выбора соберём результат по вашему описанию</p>
            </div>
          )
        )}
      </form>
    </div>
  );
}
