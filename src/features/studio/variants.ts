import type { ConversationMessage, GnosisFile, MediaKind, ModelDescription } from '../../lib/types';
import { displayMessageText } from './conversations';
export interface GenerationRecipe {
  kind: MediaKind;
  prompt: string;
  model: ModelDescription['reference'];
  options: Record<string, unknown>;
  references: GnosisFile[];
}
const event = 'genfactory:recipes';
interface StoredRecipe {
  conversationId: number;
  messageId: number;
  recipe: GenerationRecipe;
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function validRow(value: unknown): value is StoredRecipe {
  if (
    !record(value) ||
    !Number.isSafeInteger(value.conversationId) ||
    !Number.isSafeInteger(value.messageId) ||
    !record(value.recipe)
  )
    return false;
  const r = value.recipe;
  return (
    (r.kind === 'image' || r.kind === 'video') &&
    typeof r.prompt === 'string' &&
    record(r.model) &&
    typeof r.model.provider === 'string' &&
    typeof r.model.model === 'string' &&
    Array.isArray(r.references) &&
    record(r.options)
  );
}
function readRows(userId: number): StoredRecipe[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`genfactory.recipes.v1.${userId}`) || '[]');
    return Array.isArray(value) ? value.filter(validRow) : [];
  } catch {
    return [];
  }
}
export function readRecipes(userId: number, conversationId: number): Record<string, GenerationRecipe> {
  return Object.fromEntries(
    readRows(userId)
      .filter((r) => r.conversationId === conversationId)
      .map((r) => [r.messageId, r.recipe]),
  );
}
export function saveRecipe(
  userId: number,
  conversationId: number,
  messageId: number,
  recipe: GenerationRecipe,
) {
  try {
    const rows = readRows(userId).filter(
      (r) => !(r.conversationId === conversationId && r.messageId === messageId),
    );
    localStorage.setItem(
      `genfactory.recipes.v1.${userId}`,
      JSON.stringify([...rows, { conversationId, messageId, recipe }].slice(-200)),
    );
    window.dispatchEvent(new Event(event));
    return true;
  } catch {
    return false;
  }
}
export function subscribeRecipes(fn: () => void) {
  window.addEventListener(event, fn);
  window.addEventListener('storage', fn);
  return () => {
    window.removeEventListener(event, fn);
    window.removeEventListener('storage', fn);
  };
}
export function requestKind(text?: string): MediaKind | undefined {
  return text?.startsWith('Создай изображение с помощью IMAGE.\n')
    ? 'image'
    : text?.startsWith('Создай видео с помощью VIDEO.\n')
      ? 'video'
      : undefined;
}
export function variantGroups(chronological: ConversationMessage[], userId: number) {
  const groups: {
    request: ConversationMessage;
    responses: ConversationMessage[];
    inputs: GnosisFile[];
    outputs: GnosisFile[];
    kind: MediaKind;
  }[] = [];
  let current: (typeof groups)[number] | undefined;
  for (const m of chronological) {
    if (m.role === 'USER') {
      const kind = requestKind(m.text);
      current = kind
        ? {
            request: m,
            responses: [],
            inputs: (m.files || []).filter((f) => f.userId === userId),
            outputs: [],
            kind,
          }
        : undefined;
      if (current) groups.push(current);
    } else if (current && m.role === 'ASSISTANT') {
      current.responses.push(m);
      current.outputs.push(
        ...(m.files || []).filter(
          (f) =>
            f.userId === userId &&
            ['IMAGE', 'VIDEO'].includes(f.type) &&
            !current!.outputs.some((p) => p.id === f.id),
        ),
      );
    }
  }
  return groups;
}
export function fallbackRecipe(request: ConversationMessage, kind: MediaKind) {
  return { kind, prompt: displayMessageText(request.text || ''), references: request.files || [] };
}
