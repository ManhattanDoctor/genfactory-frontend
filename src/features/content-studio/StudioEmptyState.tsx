/** Original handwritten hints from the Studio prototype. */
export function StudioEmptyState() {
  return (
    <div className="ms-block" aria-label="Подсказки студии">
      <div className="ms-hint ms-hint-right">
        <p>
          Шаблоны справа. Возьмите <em>готовый приём</em>.
        </p>
        <svg viewBox="0 0 140 48" aria-hidden="true">
          <path
            d="M6 28c18-16 34 14 52-2s28 8 48-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            d="M92 8c8 6 16 10 28 12-10 2-16 8-20 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="ms-hint ms-hint-down">
        <p>
          Поле внизу. <em>Опишите сцену</em> и отправьте.
        </p>
        <svg viewBox="0 0 48 96" aria-hidden="true">
          <path
            d="M26 6c-10 18 12 28-4 46s10 22 2 34"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            d="M8 70c8 8 12 14 16 22 4-10 10-14 18-16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
