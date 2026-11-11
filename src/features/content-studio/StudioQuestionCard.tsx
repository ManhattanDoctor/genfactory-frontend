import { modelTitle } from '../catalog/presentation';
import { useRef, useState } from 'react';
import type { StudioQuestion } from './studioAgent';
import './studio-question.css';

export function StudioQuestionCard({
  question,
  disabled,
  onAnswer,
}: {
  question: StudioQuestion;
  disabled: boolean;
  onAnswer: (answer: string) => Promise<boolean>;
}) {
  const [custom, setCustom] = useState('');
  const [sending, setSending] = useState(false);
  const lock = useRef(false);
  async function answer(text: string) {
    if (disabled || lock.current || !text.trim()) return;
    lock.current = true;
    setSending(true);
    try {
      if (await onAnswer(text.trim())) setCustom('');
    } finally {
      lock.current = false;
      setSending(false);
    }
  }
  return (
    <div className="studio-question" role="group" aria-label={question.question}>
      <p className="studio-question-context">
        {modelTitle({
          reference: question.context.settings.model,
          name: question.context.settings.model.model,
        })}
      </p>
      <p className="studio-question-title">{question.question}</p>
      <div className="studio-question-choices">
        {question.choices.map((choice) => (
          <button
            key={choice}
            type="button"
            disabled={disabled || sending}
            onClick={() => void answer(choice)}
          >
            {choice}
          </button>
        ))}
        {question.allowAuto && !question.choices.includes('Выбери сам') && (
          <button
            type="button"
            disabled={disabled || sending}
            onClick={() => void answer('Выбери сам творческое решение. Не выдумывай факты.')}
          >
            Выбери сам
          </button>
        )}
      </div>
      {!disabled && (
        <form
          className="studio-question-custom"
          onSubmit={(event) => {
            event.preventDefault();
            void answer(custom);
          }}
        >
          <input
            aria-label="Свой ответ"
            placeholder="Свой ответ"
            value={custom}
            maxLength={2000}
            disabled={sending}
            onChange={(event) => setCustom(event.target.value)}
          />
          <button type="submit" disabled={sending || !custom.trim()}>
            {sending ? 'Отправка…' : 'Ответить'}
          </button>
        </form>
      )}
    </div>
  );
}
