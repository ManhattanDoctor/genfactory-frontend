import type { IConversationMessage } from '../../lib/types';

// Only standalone commands count as approval; quoted requests, questions and negations do not.
export function scriptIntent(text: string): 'approve' | 'generate' | undefined {
  const command = text
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/u, '')
    .trim();
  if (
    /^(?:да[, ]+)?(?:подтверждаю|утверждаю|давай|приступай|следующий этап|сценарий подходит)$/u.test(command)
  )
    return 'approve';
  if (
    /^(?:да[, ]+)?(?:сделай|создай|сгенерируй|генерируй|запусти генерацию)(?: уже)? (?:видео|ролик)(?: пожалуйста)?$/u.test(
      command,
    )
  )
    return 'generate';
}

export function isReadyScript(text: string): boolean {
  text = text.replace(/[*_`]/gu, '');
  // Legacy answers have no structured status: require actual scene content, not merely a title.
  return (
    /(?:\d+\s*[–—-]\s*\d+\s*(?:с|сек)|длительность\s*[:：]?\s*\d+)/iu.test(text) &&
    /(?:действие|камера)\s*[:：]/iu.test(text)
  );
}

export function latestScript(messages: IConversationMessage[]) {
  const ordered = [...messages].sort((a, b) => a.id - b.id);
  let ask: IConversationMessage | undefined;
  let result: { text: string; files: NonNullable<IConversationMessage['files']> } | undefined;
  for (const message of ordered) {
    if (message.role === 'USER') {
      ask = message;
      const request = message.text?.split('Запрос пользователя:\n').at(-1) || '';
      // A new brief or correction must not silently reuse an older approved script.
      if (!scriptIntent(request)) result = undefined;
    }
    if (
      message.role === 'ASSISTANT' &&
      ask?.text?.startsWith('[Genfactory:script]\n') &&
      !message.files?.length &&
      isReadyScript(message.text || '')
    ) {
      result = { text: message.text!, files: ask.files?.length ? ask.files : result?.files || [] };
    }
  }
  return result;
}
