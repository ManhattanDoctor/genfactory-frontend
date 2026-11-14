import type { StudioHistoryFile } from './studioHistory';
import {
  FileReferenceType,
  type IConversationMessage,
  type IFileReference,
  type IToolConnection,
} from '../../lib/types';

export const STUDIO_QUESTION_PREFIX = '[Genfactory:studio-question:v1]\n';
export interface StudioQuestion {
  kind: 'question';
  question: string;
  choices: string[];
  allowAuto: boolean;
  context: {
    uid: 'IMAGE' | 'VIDEO';
    settings: NonNullable<IToolConnection['settings']>;
    input: Record<string, unknown>;
    historyFiles?: StudioHistoryFile[];
  };
}
const CONTEXT_START = '[Genfactory:studio-context:v1]\n';
const CONTEXT_END = '\n[/Genfactory:studio-context]';
export function withStudioContext(text: string, context: StudioQuestion['context']): string {
  return `${text}\n\n${CONTEXT_START}${JSON.stringify(context)}${CONTEXT_END}`;
}
export function parseStudioContext(text?: string): StudioQuestion['context'] | undefined {
  if (!text) return;
  const start = text.lastIndexOf(CONTEXT_START);
  if (start < 0 || !text.endsWith(CONTEXT_END)) return;
  try {
    return JSON.parse(text.slice(start + CONTEXT_START.length, -CONTEXT_END.length));
  } catch {
    return;
  }
}
export function stripStudioContext(text: string): string {
  const start = text.lastIndexOf(CONTEXT_START);
  return start >= 0 && text.endsWith(CONTEXT_END) ? text.slice(0, start).trimEnd() : text;
}
export function parseStudioQuestion(
  text?: string,
  requestText?: string | IConversationMessage,
): StudioQuestion | undefined {
  if (!text?.startsWith(STUDIO_QUESTION_PREFIX) || text.length > 20000) return;
  try {
    const value = JSON.parse(text.slice(STUDIO_QUESTION_PREFIX.length));
    if (
      value.kind !== 'question' ||
      typeof value.question !== 'string' ||
      !value.question.trim() ||
      value.question.length > 200 ||
      typeof value.allowAuto !== 'boolean'
    )
      return;
    if (
      !Array.isArray(value.choices) ||
      value.choices.length < 2 ||
      value.choices.length > 4 ||
      value.choices.some((s: unknown) => typeof s !== 'string' || !s.trim() || s.length > 80) ||
      new Set(value.choices).size !== value.choices.length
    )
      return;
    const message = typeof requestText === 'object' ? requestText : undefined;
    const connection = message?.settings?.tools?.find((tool) => ['IMAGE', 'VIDEO'].includes(tool.uid));
    const references =
      message?.references ?? message?.files?.map((file) => ({ type: FileReferenceType.FILE, id: file.id }));
    const context =
      connection && references
        ? {
            uid: connection.uid,
            settings: connection.settings,
            input: { references },
          }
        : parseStudioContext(typeof requestText === 'string' ? requestText : message?.text) || value.context;
    if (
      !['IMAGE', 'VIDEO'].includes(context?.uid) ||
      context?.settings?.isLockSelection !== true ||
      typeof context.settings.model?.provider !== 'string' ||
      typeof context.settings.model?.model !== 'string' ||
      !context.input ||
      typeof context.input !== 'object'
    )
      return;
    const toolReferences: IFileReference[] | undefined = context.input.references;
    if (
      toolReferences &&
      (!Array.isArray(toolReferences) ||
        toolReferences.some((item) =>
          item.type === FileReferenceType.FILE
            ? !Number.isSafeInteger(item.id) || item.id! <= 0
            : context.uid !== 'VIDEO' ||
              item.type !== FileReferenceType.URL ||
              typeof item.url !== 'string' ||
              !/^https?:\/\//.test(item.url),
        ))
    )
      return;
    const ids = toolReferences
      ? toolReferences.filter((item) => item.type === FileReferenceType.FILE).map((item) => item.id)
      : context.uid === 'IMAGE'
        ? context.input.request?.task?.fileIds
        : context.input.fileIds;
    if (
      !Array.isArray(ids) ||
      ids.some((id: unknown) => !Number.isSafeInteger(id) || Number(id) <= 0) ||
      new Set(ids).size !== ids.length
    )
      return;
    return { ...value, context };
  } catch {
    return;
  }
}

/** Malformed choices never become executable UI actions. Keep the readable question. */
export function studioReplyText(text: string): string {
  if (!text.startsWith(STUDIO_QUESTION_PREFIX)) return text;
  try {
    const value = JSON.parse(text.slice(STUDIO_QUESTION_PREFIX.length));
    if (typeof value.question === 'string' && value.question.trim()) return value.question;
  } catch {
    /* Free text remains a normal response. */
  }
  return text.slice(STUDIO_QUESTION_PREFIX.length).trim();
}
