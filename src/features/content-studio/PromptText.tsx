import { useRef, type ReactElement } from 'react';
import { diffWordsWithSpace } from 'diff';
import { PromptTemplate, type IPromptPart } from './PromptTemplate';

export function promptParts(
  source: string,
  original: string,
  values: Record<string, string>,
): Array<IPromptPart> {
  const parts = new PromptTemplate(source).parts(values);
  const rendered = parts.map((part) => part.text).join('');
  const highlighted = new Set<number>();
  let offset = 0;
  for (const part of parts) {
    if (part.highlighted) for (let i = offset; i < offset + part.text.length; i++) highlighted.add(i);
    offset += part.text.length;
  }
  offset = 0;
  for (const change of diffWordsWithSpace(new PromptTemplate(original).fill(values), rendered)) {
    if (change.removed) continue;
    if (change.added) for (let i = offset; i < offset + change.value.length; i++) highlighted.add(i);
    offset += change.value.length;
  }
  const result: Array<IPromptPart> = [];
  for (let i = 0; i < rendered.length; i++) {
    const active = highlighted.has(i);
    const previous = result[result.length - 1];
    if (previous && previous.highlighted === active) previous.text += rendered[i];
    else result.push({ text: rendered[i], highlighted: active });
  }
  return result;
}

function Parts({ parts }: { parts: Array<IPromptPart> }): ReactElement {
  return (
    <>
      {parts.map((part, i) =>
        part.highlighted ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>,
      )}
    </>
  );
}

export function PromptPreview({ parts }: { parts: Array<IPromptPart> }): ReactElement {
  return (
    <div
      className="template-prompt template-output"
      role="textbox"
      aria-label="Готовый текст для редактора"
      aria-readonly="true"
      tabIndex={0}
    >
      <Parts parts={parts} />
    </div>
  );
}

/** A native textarea keeps keyboard, selection and undo behavior; the backdrop only adds color. */
export function PromptSource({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  const backdrop = useRef<HTMLPreElement>(null);
  let parts: Array<IPromptPart> = [{ text: value, highlighted: false }];
  try {
    parts = new PromptTemplate(value).sourceParts();
  } catch {
    /* Keep malformed source editable. */
  }
  return (
    <div className="template-source">
      <pre aria-hidden="true" ref={backdrop}>
        <Parts parts={parts} />
        {'\n'}
      </pre>
      <textarea
        rows={7}
        aria-label="Текст шаблона"
        value={value}
        spellCheck={false}
        onScroll={(event) => {
          if (backdrop.current) {
            backdrop.current.scrollTop = event.currentTarget.scrollTop;
            backdrop.current.scrollLeft = event.currentTarget.scrollLeft;
          }
        }}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
