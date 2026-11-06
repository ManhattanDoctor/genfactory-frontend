import type {
  IConversation,
  IConversationCreate,
  MediaKind,
  IMessageCreate,
  IModelDescription,
  IToolConnection,
} from '../../lib/types';

const referencePolicy =
  'Только при явном выборе «Создать с нуля» не используй предыдущие изображения: IMAGE isDrawNew=true, VIDEO fileIds=[]. В остальных случаях учитывай контекст беседы; если исходное изображение неоднозначно, уточни выбор до вызова платного инструмента. ';
const legacyReferencePolicy =
  'Если референсы не указаны, создавай с нуля: IMAGE isDrawNew=true, VIDEO fileIds=[]. ';

export const toolFor = (kind: MediaKind) => (kind === 'image' ? 'IMAGE' : 'VIDEO');
export function connection(conversation: IConversation, kind: MediaKind): IToolConnection | undefined {
  const item = conversation.options.tools?.find((t) => (typeof t === 'string' ? t : t.uid) === toolFor(kind));
  return typeof item === 'string' ? { uid: item } : item;
}
export function toolSettings(
  kind: MediaKind,
  model: IModelDescription,
  options: Record<string, unknown>,
): IToolConnection {
  const values = Object.fromEntries(
    Object.entries(options).filter(
      ([key, value]) =>
        !['model', 'prompt', 'frameImages', 'tools', 'stream', 'partialImages'].includes(key) &&
        value !== undefined &&
        value !== '',
    ),
  );
  return { uid: toolFor(kind), settings: { model: model.reference, options: values, isLockSelection: true } };
}
export function createConversationBody(
  prompt: string,
  kind: MediaKind,
  agent: IModelDescription,
  tool: IToolConnection,
): IConversationCreate {
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
      referencePolicy +
      'Если указаны референсы, передай точные fileIds в их порядке. Отвечай кратко на языке пользователя.',
  };
}
export function createMessageBody(
  prompt: string,
  kind: MediaKind,
  tool: IToolConnection,
  fileIds: number[],
  fromScratch = false,
  modelLabel?: string,
): IMessageCreate {
  const instruction =
    kind === 'image' ? 'Создай изображение с помощью IMAGE.' : 'Создай видео с помощью VIDEO.';
  const references = fileIds.length
    ? `Референсы (fileIds, порядок важен): ${fileIds.join(', ')}.`
    : fromScratch
      ? 'Создай с нуля, без референсов из предыдущих сообщений.'
      : 'Продолжи беседу с учётом контекста. Если исходное изображение неоднозначно, уточни выбор до генерации.';
  const selectedModel =
    modelLabel && tool.settings?.model
      ? `[Genfactory:model]\n${JSON.stringify({ name: modelLabel, ...tool.settings.model })}\nНазвание в интерфейсе и технический идентификатор выше обозначают одну выбранную модель. Используй её и сохранённые настройки инструмента; не выбирай похожую модель по названию. Не уточняй выбор из-за различия этих двух названий.\n[/Genfactory:model]\n\n`
      : '';
  return {
    role: 'USER',
    text: `${instruction}\n${references}\n\n${selectedModel}${prompt.trim()}`,
    files: fileIds,
    settings: { tools: [{ ...tool, isRequired: true }] },
  };
}

// Keep the user's text separate from UI settings inside the existing text-only API.
export function withMessageContext(text: string, context: string): string {
  return `${text.trim()}\n\n[Genfactory:context]\n${JSON.stringify(context)}\n[/Genfactory:context]`;
}

// Only our exact envelope is hidden; messages from other clients remain untouched.
export function displayMessageText(text: string): string {
  const prefix =
    /^(Создай изображение с помощью IMAGE\.|Создай видео с помощью VIDEO\.)\n(Референсы \(fileIds, порядок важен\): [\d, ]+\.|Создай с нуля, без референсов из предыдущих сообщений\.|Продолжи беседу с учётом контекста\. Если исходное изображение неоднозначно, уточни выбор до генерации\.)\n\n/;
  const generated = prefix.test(text) || /^\[Genfactory:(?:chat|prompt|script|presentation)\]\n/.test(text);
  let value = text
    .replace(prefix, '')
    .replace(/^\[Genfactory:model\]\n[^\n]*\n[^\n]*\n\[\/Genfactory:model\]\n\n/, '')
    .replace(/^\[Genfactory:(?:image|video)\]\n[\s\S]*?\n\nИдея:\n/, 'Идея:\n')
    .replace(
      /^\[Genfactory:tts\]\nОзвучь с помощью TTS следующий текст дословно, без вступления и дополнений\.\n\nТекст для озвучки:\n/,
      '',
    )
    .replace(
      /^\[Genfactory:(chat|prompt|script|presentation)\]\n(?:[\s\S]*?\n\n)?Запрос пользователя:\n/,
      '',
    );
  if (!generated) return value;
  const start = '\n\n[Genfactory:context]\n';
  const end = '\n[/Genfactory:context]';
  const index = value.lastIndexOf(start);
  if (index >= 0 && value.endsWith(end)) {
    try {
      const context = JSON.parse(value.slice(index + start.length, -end.length));
      if (typeof context === 'string') return value.slice(0, index);
    } catch {
      // Keep unfamiliar or malformed content visible.
    }
  }
  // Older studio messages (including conversation 121) have an unmarked standard footer.
  if (text.startsWith('[Genfactory:script]\n'))
    value = value.replace(
      /\n\nСценарий для ролика длительностью \d+ с, формат \d+:\d+\. Не увеличивай длительность\.\n\nСтруктура: (?:Один кадр|Набор сцен)$/u,
      '',
    );
  return value;
}

// Upgrade only the obsolete Genfactory instruction, preserving custom system text.
export function migratedReferenceSystem(conversation: IConversation): string | undefined {
  if (!conversation.tags?.includes('genfactory') || !conversation.system?.includes(legacyReferencePolicy))
    return;
  return conversation.system.replace(legacyReferencePolicy, referencePolicy);
}

// Image-page preparation uses the existing assistant, not a server-side planner.
export function imageRequest(idea: string, template: string): string {
  return (
    '[Genfactory:image]\n' +
    'Подготовь задачу по идее, шаблону и приложенным референсам. ' +
    'Идея имеет приоритет над общими указаниями шаблона. ' +
    'Метки в квадратных скобках — места для данных, а не надписи для изображения. ' +
    'Используй доступные данные; не спрашивай необязательные декоративные детали. ' +
    'Если не хватает важной информации или необходимого исходного фото, задай краткий вопрос и НЕ вызывай IMAGE. ' +
    'Если задача понятна, вызови IMAGE один раз. Сохрани выбранную модель и настройки инструмента; ' +
    'при конфликте запроса с настройками сначала уточни выбор. Сохраняй язык пользовательских надписей.\n\n' +
    'Идея:\n' +
    (idea.trim() || '(не указана)') +
    (template.trim() ? '\n\nШаблон:\n' + template.trim() : '')
  );
}

export function videoRequest(idea: string, template: string, shape: string): string {
  return (
    '[Genfactory:video]\n' +
    'Подготовь один ролик по идее, шаблону и приложенному стартовому кадру. Пример ролика шаблона не является вложением. ' +
    'Если важных данных не хватает, уточни их до вызова VIDEO; не выдумывай продукт и надписи. ' +
    'Не спрашивай необязательные декоративные детали. Метки в квадратных скобках заполняй из доступных данных. ' +
    'Сохрани выбранную модель, длительность, пропорции и звук из настроек инструмента; они важнее общих указаний шаблона. ' +
    (shape === 'sequence'
      ? 'Несколько последовательных сцен внутри выбранной длительности, на выходе один файл. '
      : 'Один непрерывный кадр, одно действие, без склеек и смены сцен. ') +
    'Передай точные fileIds референсов в их порядке. Не повторяй платную генерацию автоматически после ошибки.\n\n' +
    'Идея:\n' +
    (idea.trim() || 'Собери ролик по шаблону и вложениям.') +
    (template.trim() ? '\n\nШаблон:\n' + template.trim() : '')
  );
}
