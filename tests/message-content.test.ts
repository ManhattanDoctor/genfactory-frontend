import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { MessageContent } from '../src/components/MessageContent';
import type { IGnosisFile } from '../src/lib/types';
it('renders readable markdown without duplicating attached generated images', () => {
  const file = { path: 'https://media.example.test/image.png' } as IGnosisFile;
  const html = renderToStaticMarkup(
    createElement(MessageContent, {
      text: '**Готово**\n\n![Результат](https://media.example.test/image.png)',
      files: [file],
    }),
  );
  expect(html).toContain('<strong>Готово</strong>');
  expect(html).not.toContain('<img');
  expect(html).not.toContain('media.example.test');
});
it('never executes raw HTML or javascript links from assistant messages', () => {
  const html = renderToStaticMarkup(
    createElement(MessageContent, { text: '<script>alert(1)</script>\n\n[Ссылка](javascript:alert(1))' }),
  );
  expect(html).not.toContain('<script');
  expect(html).not.toContain('href="javascript:');
});
