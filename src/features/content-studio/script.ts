import type { IConversationMessage } from '../../lib/types';

export function isReadyScript(text: string): boolean {
  text = text.replace(/[*_`]/gu, '');
  // Legacy answers have no structured status: require actual scene content, not merely a title.
  return (
    /(?:\d+\s*[–—-]\s*\d+\s*(?:с|сек)|длительность\s*[:：]?\s*\d+)/iu.test(text) &&
    /(?:действие|камера)\s*[:：]/iu.test(text)
  );
}

/** Latest user-supplied image set before the selected script, never generated results. */
export function scriptReferences(messages: Array<IConversationMessage>, before: number) {
  for (const message of [...messages].sort((a, b) => b.id - a.id)) {
    if (message.id >= before || message.role !== 'USER') continue;
    const files = (message.files || []).filter((file) => file.type === 'IMAGE');
    if (files.length)
      return files.filter((file, index) => files.findIndex((item) => item.id === file.id) === index);
  }
}
