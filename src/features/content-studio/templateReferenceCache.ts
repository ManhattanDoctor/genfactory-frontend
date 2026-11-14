import type { ITemplate } from './materials';

interface IReferenceEntry {
  key: string;
  fileId: number;
}
const storageKey = (userId: number): string => `genfactory.template-references.${userId}`;
const referenceKey = (item: ITemplate): string =>
  JSON.stringify([item.id, item.addedAt, item.referenceVideoSrc]);

// Persist IDs only, never signed URLs or file bodies. Revalidate access before reuse.
function entries(userId: number): IReferenceEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(userId)) || '[]');
    return Array.isArray(value)
      ? value
          .filter(
            (entry): entry is IReferenceEntry =>
              !!entry &&
              typeof entry.key === 'string' &&
              Number.isSafeInteger(entry.fileId) &&
              entry.fileId > 0,
          )
          .slice(-64)
      : [];
  } catch {
    return [];
  }
}
export function templateReferenceId(userId: number, item: ITemplate): number | undefined {
  return entries(userId).find((entry) => entry.key === referenceKey(item))?.fileId;
}
export function saveTemplateReference(userId: number, item: ITemplate, fileId?: number): void {
  const key = referenceKey(item);
  const value = entries(userId).filter((entry) => entry.key !== key);
  if (fileId !== undefined) value.push({ key, fileId });
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(value.slice(-64)));
  } catch {
    // Storage can be unavailable or full; attaching the file must still work.
  }
}
