import { useLayoutEffect, type RefObject, type TextareaHTMLAttributes } from 'react';

const maxRows = 8;

function fit(input: HTMLTextAreaElement) {
  if (!input.clientWidth) return;
  const css = getComputedStyle(input);
  const border = parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth);
  const padding = parseFloat(css.paddingTop) + parseFloat(css.paddingBottom);
  const limit = Math.round(maxRows * parseFloat(css.lineHeight) + padding + border);
  const previousScroll = input.scrollTop;
  input.style.height = 'auto';
  input.style.height = Math.min(limit, Math.ceil(input.scrollHeight + border)) + 'px';
  input.scrollTop = previousScroll;
}

export function ComposerTextarea({
  inputRef,
  value,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { inputRef: RefObject<HTMLTextAreaElement | null> }) {
  useLayoutEffect(() => {
    if (inputRef.current) fit(inputRef.current);
  }, [inputRef, value]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    let width = input.clientWidth;
    const observer = new ResizeObserver(() => {
      if (width === input.clientWidth) return;
      width = input.clientWidth;
      fit(input);
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, [inputRef]);

  return (
    <textarea
      {...props}
      ref={inputRef}
      value={value}
      style={{
        boxSizing: 'border-box',
        maxHeight: 'none',
        overflowY: 'auto',
        lineHeight: 'round(1.4em, 1px)',
      }}
    />
  );
}
