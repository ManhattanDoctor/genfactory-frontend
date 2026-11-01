import type {
  Conversation,
  ConversationCreate,
  MediaKind,
  MessageCreate,
  ModelDescription,
  ToolConnection,
} from '../../lib/types';

export const toolFor = (kind: MediaKind) => (kind === 'image' ? 'IMAGE' : 'VIDEO');
export function connection(conversation: Conversation, kind: MediaKind): ToolConnection | undefined {
  const item = conversation.options.tools?.find((t) => (typeof t === 'string' ? t : t.uid) === toolFor(kind));
  return typeof item === 'string' ? { uid: item } : item;
}
export function toolSettings(
  kind: MediaKind,
  model: ModelDescription,
  options: Record<string, unknown>,
): ToolConnection {
  const values = Object.fromEntries(
    Object.entries(options).filter(
      ([key, value]) =>
        !['model', 'prompt', 'frameImages', 'tools', 'stream', 'partialImages'].includes(key) &&
        value !== undefined &&
        value !== '',
    ),
  );
  return { uid: toolFor(kind), settings: { model: model.reference, options: values } };
}
export function createConversationBody(
  prompt: string,
  kind: MediaKind,
  agent: ModelDescription,
  tool: ToolConnection,
): ConversationCreate {
  return {
    name: prompt.trim().length < 2 ? `Идея ${prompt.trim()}` : prompt.trim().slice(0, 64),
    model: agent.reference.provider,
    options: { model: agent.reference.model, tools: [tool, { uid: kind === 'image' ? 'VIDEO' : 'IMAGE' }] },
    tags: ['genfactory', kind],
    history: 32,
    isConsiderHistory: true,
    system:
      'Ты — творческий ассистент Genfactory. Выполняй запросы пользователя с помощью IMAGE и VIDEO. ' +
      'Последнее сообщение задаёт вид результата и референсы. Сохраняй выбранную в настройках инструмента модель и параметры: ' +
      'не переопределяй их аргументами вызова, если пользователь явно не просит. По умолчанию создавай один результат. ' +
      'Не запускай повторную платную генерацию автоматически после ошибки. Не выдумывай готовые файлы. ' +
      'Если референсы не указаны, создавай с нуля: IMAGE isDrawNew=true, VIDEO fileIds=[]. ' +
      'Если указаны референсы, передай точные fileIds в их порядке. Отвечай кратко на языке пользователя.',
  };
}
export function createMessageBody(
  prompt: string,
  kind: MediaKind,
  tool: ToolConnection,
  fileIds: number[],
): MessageCreate {
  const instruction =
    kind === 'image' ? 'Создай изображение с помощью IMAGE.' : 'Создай видео с помощью VIDEO.';
  const references = fileIds.length
    ? `Референсы (fileIds, порядок важен): ${fileIds.join(', ')}.`
    : 'Создай с нуля, без референсов из предыдущих сообщений.';
  return {
    role: 'USER',
    text: `${instruction}\n${references}\n\n${prompt.trim()}`,
    files: fileIds,
    settings: { tools: [tool] },
  };
}

// Only our exact envelope is hidden; messages from other clients remain untouched.
export function displayMessageText(text: string): string {
  const prefix =
    /^(Создай изображение с помощью IMAGE\.|Создай видео с помощью VIDEO\.)\n(Референсы \(fileIds, порядок важен\): [\d, ]+\.|Создай с нуля, без референсов из предыдущих сообщений\.)\n\n/;
  return text.replace(prefix, '');
}
