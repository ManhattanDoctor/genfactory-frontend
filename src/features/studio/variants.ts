import type { ITemplateVideoReference } from '../content-studio/materials';
import type { IConversationMessage, IGnosisFile, MediaKind, IModelDescription } from '../../lib/types';
import { displayMessageText } from './conversations';
export interface IGenerationRecipe {
  kind: MediaKind;
  workspaceInput?: {
    idea: string;
    templateId: string;
    templateText: string;
    shape?: string;
    templateVideoReference?: ITemplateVideoReference;
    referenceFileIds?: number[];
  };
  imageInput?: { idea: string; templateId: string; templateText: string };
  prompt: string;
  model: IModelDescription['reference'];
  options: Record<string, unknown>;
  references: IGnosisFile[];
}
const event = 'genfactory:recipes';
export function readFileRecipe(userId: number, fileId: number): IGenerationRecipe | undefined {
  try {
    const rows: unknown = JSON.parse(localStorage.getItem(`genfactory.file-recipes.v1.${userId}`) || '{}');
    if (!record(rows)) return;
    const recipe = rows[String(fileId)];
    return validRow({ conversationId: 1, messageId: 1, recipe })
      ? (recipe as unknown as IGenerationRecipe)
      : undefined;
  } catch {
    return;
  }
}
export function saveFileRecipe(userId: number, fileId: number, recipe: IGenerationRecipe): boolean {
  try {
    const key = `genfactory.file-recipes.v1.${userId}`;
    const rows: unknown = JSON.parse(localStorage.getItem(key) || '{}');
    const entries = record(rows) ? Object.entries(rows).filter(([id]) => id !== String(fileId)) : [];
    localStorage.setItem(
      key,
      JSON.stringify(Object.fromEntries([...entries, [String(fileId), recipe]].slice(-200))),
    );
    window.dispatchEvent(new Event(event));
    return true;
  } catch {
    return false;
  }
}
interface IStoredRecipe {
  conversationId: number;
  messageId: number;
  recipe: IGenerationRecipe;
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function validRow(value: unknown): value is IStoredRecipe {
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
function readRows(userId: number): IStoredRecipe[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`genfactory.recipes.v1.${userId}`) || '[]');
    return Array.isArray(value) ? value.filter(validRow) : [];
  } catch {
    return [];
  }
}
export function readRecipes(userId: number, conversationId: number): Record<string, IGenerationRecipe> {
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
  recipe: IGenerationRecipe,
): boolean {
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
export function subscribeRecipes(fn: () => void): () => void {
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
export function variantGroups(
  chronological: IConversationMessage[],
  userId: number,
): {
  request: IConversationMessage;
  responses: IConversationMessage[];
  inputs: IGnosisFile[];
  outputs: IGnosisFile[];
  kind: MediaKind;
}[] {
  const groups: {
    request: IConversationMessage;
    responses: IConversationMessage[];
    inputs: IGnosisFile[];
    outputs: IGnosisFile[];
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
export function fallbackRecipe(
  request: IConversationMessage,
  kind: MediaKind,
): { kind: MediaKind; prompt: string; references: IGnosisFile[] } {
  return { kind, prompt: displayMessageText(request.text || ''), references: request.files || [] };
}
