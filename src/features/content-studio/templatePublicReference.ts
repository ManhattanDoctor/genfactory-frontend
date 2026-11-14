import type { ITemplateVideoReference } from './materials';
import templates from './templates.json';
import { FileReferenceType, type IFileReference, type IGnosisFile } from '../../lib/types';

export type TemplatePublicReference = Pick<IGnosisFile, 'name' | 'path' | 'type' | 'mime' | 'size'> & {
  isExternal: true;
};
/** Resolve only catalogue assets; localhost URLs are not reachable by the video provider. */
export function templatePublicReference(
  templateId: string,
  origin = window.location.origin,
): TemplatePublicReference | undefined {
  const item = templates.find((candidate) => candidate.id === templateId);
  if (!item || item.kind !== 'video' || !('referenceVideoSrc' in item) || !item.referenceVideoSrc) return;
  const base = new URL(origin);
  const publicOrigin =
    base.protocol === 'https:' &&
    !['localhost', '127.0.0.1', '[::1]', 'host.docker.internal'].includes(base.hostname)
      ? base.origin
      : 'https://genfactory.gnosisai.ru';
  return {
    isExternal: true,
    name: `${item.title} — референс.mp4`,
    path: new URL(item.referenceVideoSrc, publicOrigin).href,
    type: 'VIDEO',
    mime: 'video/mp4',
    size: 'referenceVideoSize' in item ? item.referenceVideoSize : undefined,
  };
}

/** Restore provider URLs without creating artificial library files. */
export function restoredPublicReference(references?: IFileReference[]): ITemplateVideoReference | undefined {
  const urls = references?.filter((item) => item.type === FileReferenceType.URL) || [];
  if (urls.length > 1)
    throw new Error(
      'В этом запуске несколько внешних референсов. Эта форма поддерживает один; повтор не отправлен.',
    );
  return urls[0] ? { source: 'public', reference: urls[0] } : undefined;
}

export function resolvePublicReference(value?: ITemplateVideoReference): TemplatePublicReference | undefined {
  if (value?.source !== 'public') return;
  if (value.templateId) return templatePublicReference(value.templateId);
  const reference = value.reference;
  if (reference?.type !== FileReferenceType.URL || !reference.url) return;
  const known = templates
    .map((item) => templatePublicReference(item.id))
    .find((item) => item?.path === reference.url);
  if (known) return known;
  const mime = reference.mime;
  if (!mime) throw new Error('В сохранённых параметрах отсутствует формат внешнего референса.');
  return {
    isExternal: true,
    name: new URL(reference.url).pathname.split('/').pop() || 'Референс',
    path: reference.url,
    mime,
    type: mime.startsWith('image/') ? 'IMAGE' : 'VIDEO',
    size: undefined,
  };
}
