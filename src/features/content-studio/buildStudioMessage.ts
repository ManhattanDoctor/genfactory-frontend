import { FileReferenceType, type IFileReference } from '../../lib/types';
import type { TemplatePublicReference } from './templatePublicReference';
import type {
  IGnosisFile,
  IFileGeneration,
  IModelDescription,
  IMessageCreate,
  IToolConnection,
} from '../../lib/types';
import { templateInstructions, type ITemplate } from './materials';
import { sizeRatio } from './controls';
import { fields } from './studioConfig';
import type { IAttachment, StudioMode } from './studioTypes';
import type { useStudioModels } from './useStudioModels';
import { videoReferenceMode } from '../catalog/videoInputs';
import { mediaOptions } from './request';
import { modelKey } from '../catalog/presentation';
import { textInstruction } from '../workspace/prompt';
import { createMessageBody, toolSettings, withMessageContext } from '../studio/conversations';

interface StudioMessageOptions {
  mode: StudioMode;
  model: IModelDescription;
  controls: Pick<
    ReturnType<typeof useStudioModels>,
    | 'referenceRatio'
    | 'effectiveRatio'
    | 'ratioOptions'
    | 'effectiveQuality'
    | 'modelProperties'
    | 'audioValues'
    | 'effectiveSound'
  >;
  sourceDraft: string;
  sourceAttachments: IAttachment[];
  savedFiles: IGnosisFile[];
  publicReference?: TemplatePublicReference;
  preparingScript: boolean;
  picked: ITemplate[];
  settings: Record<string, string>;
  duration: number;
  shape: string;
  brandRules: string;
  restoredGeneration?: IFileGeneration;
  startsFresh: boolean;
  isCurrent: () => boolean;
}
export async function buildStudioMessage({
  mode,
  model,
  controls,
  sourceDraft,
  sourceAttachments,
  savedFiles,
  publicReference,
  preparingScript,
  picked,
  settings,
  duration,
  shape,
  brandRules,
  restoredGeneration,
  startsFresh,
  isCurrent,
}: StudioMessageOptions): Promise<{ body: IMessageCreate; tools: Array<IToolConnection> } | undefined> {
  const references: IFileReference[] = [
    ...(publicReference
      ? [{ type: FileReferenceType.URL, url: publicReference.path, mime: publicReference.mime }]
      : []),
    ...savedFiles.map((file) => ({ type: FileReferenceType.FILE, id: file.id })),
  ];
  const media = publicReference ? [publicReference, ...savedFiles] : savedFiles;
  const {
    referenceRatio,
    effectiveRatio,
    ratioOptions,
    effectiveQuality,
    modelProperties,
    audioValues,
    effectiveSound,
  } = controls;
  const creative = fields
    .filter((field) => field.id !== 'quality' && (mode === 'video' || !['camera', 'move'].includes(field.id)))
    .filter((field) => !['Авто', 'Нет', 'Не задано'].includes(settings[field.id]))
    .map((field) => `${field.label}: ${settings[field.id]}`);
  const context = [
    ...(preparingScript && mode === 'video'
      ? [
          `Сценарий для ролика длительностью ${duration} с, формат ${referenceRatio ? 'по исходному кадру' : effectiveRatio}. Не увеличивай длительность.`,
        ]
      : []),
    templateInstructions(picked),
    ...(creative.length
      ? [
          'Настройки съёмки обязательны для каждой сцены, включая последнюю. Если шаблон им противоречит, используй настройки текущего запуска.',
          ...creative,
        ]
      : []),
    ...(mode === 'video'
      ? [
          `Структура: ${shape}. Это настройка текущего запуска; она важнее структуры шаблона, готового сценария и предыдущих сообщений.`,
          shape === 'Один кадр'
            ? 'Адаптируй сюжет в один непрерывный план без склеек, монтажных переходов и смен сцен. Сохрани героев, предметы и основное действие; движение камеры допустимо. Если исходный текст разбит на несколько планов, не переноси это разбиение в сценарий и промпт инструмента VIDEO: опиши действие непрерывно.'
            : 'Построй последовательность сцен; монтажные переходы допустимы. Общая длительность всех сцен вместе должна соответствовать длительности текущего запуска, а не назначаться каждой сцене отдельно.',
        ]
      : []),
    ...(brandRules ? [`Правила бренда: ${brandRules}`] : []),
  ]
    .filter(Boolean)
    .join('\n\n');
  const prompt = withMessageContext(sourceDraft, context);
  let tools: IToolConnection[] = [];
  let body: IMessageCreate;
  if (preparingScript || mode === 'presentation') {
    body = {
      role: 'USER',
      references,
      settings: { tools: [], isToolsDisabled: true },
      text:
        mode === 'presentation'
          ? `[Genfactory:presentation]\nПодготовь текст по слайдам на основе задачи и истории проекта. Это текстовая структура, не готовый файл презентации. Используй только факты из брифа и истории. Не утверждай ничего о рынке, конкурентах, достижениях и цифрах без источника пользователя. Недостающие данные обозначай «Нужно уточнить». Предположения выделяй как гипотезы, а не факты.\n\nЗапрос пользователя:\n${prompt}`
          : textInstruction('script', prompt, {
              language: 'Русский',
              target: mode,
              aspects: [],
              brand: '',
            }),
    };
  } else {
    const replay =
      restoredGeneration &&
      modelKey(model) === `${restoredGeneration.model.provider}:${restoredGeneration.model.model}`
        ? restoredGeneration.options
        : undefined;
    const preservedSize = typeof replay?.size === 'string' && sizeRatio(replay.size) === effectiveRatio;
    const referenceMode =
      mode === 'video'
        ? restoredGeneration?.referenceMode ||
          videoReferenceMode(
            model,
            media.length,
            sourceAttachments.some((file) => !!file.slot),
          )
        : undefined;
    const options = mediaOptions(
      model,
      mode,
      prompt,
      media,
      {
        ...replay,
        ...(ratioOptions.length && !preservedSize ? { aspectRatio: effectiveRatio } : {}),
        ...(mode === 'image' && modelProperties.quality ? { quality: effectiveQuality } : {}),
        ...(mode === 'video'
          ? {
              ...(modelProperties.duration ? { duration } : {}),
              ...(modelProperties.resolution ? { resolution: effectiveQuality } : {}),
              ...(audioValues.length ? { generateAudio: effectiveSound === 'Со звуком' } : {}),
            }
          : {}),
      },
      referenceMode,
    );
    const tool = toolSettings(mode, model, options);
    tools = [tool];
    body = createMessageBody(
      prompt,
      mode,
      tool,
      savedFiles.map((file) => file.id),
      startsFresh,
      undefined,
      referenceMode,
      true,
    );
    body.references = references;
    if (publicReference)
      body.text += '\nИспользуй все вложения текущего сообщения, включая внешний видеореференс.';
    if (referenceMode) body.text += `\nРежим видеореференсов: ${referenceMode}.`;
    if (!isCurrent()) return;
  }
  return { body, tools };
}
