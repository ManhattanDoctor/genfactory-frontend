import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { catalogQuery } from '../catalog/catalogQuery';
import { api } from '../../lib/api';
import type { IConversation, IModelDescription, ISchema } from '../../lib/types';
import { useRetainedModel } from '../catalog/useRetainedModel';
import { followsReferenceRatio } from '../catalog/schema';
import { defaultAssistant } from '../catalog/defaultAssistant';
import { modelKey } from '../catalog/presentation';
import { choices, ratioSizes, sizeRatio, suggestedRatios } from './controls';
import { fields } from './studioConfig';
import type { IAttachment, StudioMode } from './studioTypes';

// Keep catalogue subscription in its original position in the page lifecycle.
export function useStudioCatalog(
  mode: StudioMode,
  userId?: number,
): UseQueryResult<Array<IModelDescription>, Error> {
  const presentation = mode === 'presentation';
  const provider =
    mode === 'image'
      ? 'OPEN_ROUTER_IMAGE'
      : mode === 'video'
        ? 'OPEN_ROUTER_VIDEO'
        : 'OPEN_ROUTER_CONVERSATION';
  return useQuery({
    ...catalogQuery(userId, provider),
    ...(presentation
      ? {
          queryKey: ['conversation-models', userId],
          queryFn: ({ signal }: { signal: AbortSignal }) => api.conversationModels(signal),
        }
      : {}),
  });
}

export interface StudioModels {
  catalog: UseQueryResult<Array<IModelDescription>, Error>;
  retained: IModelDescription | undefined;
  model: IModelDescription | undefined;
  modelProperties: Record<string, ISchema>;
  ratioOptions: Array<string>;
  referenceRatio: boolean;
  defaults: { ratio: string; quality: string; duration: number; sound: string };
  effectiveRatio: string;
  qualityOptions: Array<string>;
  effectiveQuality: string;
  durations: Array<number>;
  audioValues: Array<boolean>;
  soundOptions: Array<string>;
  effectiveSound: string;
}

interface StudioModelOptions {
  catalog: ReturnType<typeof useStudioCatalog>;
  mode: StudioMode;
  userId?: number;
  selectedModel: string;
  savedTools?: IConversation['options']['tools'];
  attachments: IAttachment[];
  ratio: string;
  imageQuality: string;
  quality: string;
  sound: string;
}
function defaultChoice<T extends string | number | boolean>(
  values: T[],
  schemaDefault: unknown,
  fallback: T,
): T {
  return (
    values.find((value) => value === schemaDefault) ??
    (values.includes(fallback) ? fallback : (values[0] ?? fallback))
  );
}

export function useStudioModels({
  catalog,
  mode,
  userId,
  selectedModel,
  savedTools,
  attachments,
  ratio,
  imageQuality,
  quality,
  sound,
}: StudioModelOptions): StudioModels {
  const savedTool = savedTools?.find(
    (tool) =>
      typeof tool === 'object' &&
      (mode === 'image' ? ['IMAGE', 'IMAGE_OPEN_ROUTER'] : ['VIDEO', 'VIDEO_OPEN_ROUTER']).includes(tool.uid),
  );
  const savedReference = typeof savedTool === 'object' ? savedTool.settings?.model : undefined;
  const retained = useRetainedModel(savedReference, catalog.data, userId);
  const model =
    catalog.data?.find((item) => modelKey(item) === selectedModel || item.name === selectedModel) ||
    (retained &&
    (selectedModel === modelKey(retained) || selectedModel === retained.name || selectedModel === 'Auto')
      ? retained
      : undefined) ||
    (selectedModel === 'Auto' && !savedReference
      ? mode === 'presentation'
        ? defaultAssistant(catalog.data || [])
        : catalog.data?.[0]
      : undefined);
  const modelProperties = model?.schema.properties?.options?.properties || {};
  const sizes = ratioSizes(model);
  const ratioOptions = model
    ? modelProperties.aspectRatio
      ? choices(modelProperties.aspectRatio, suggestedRatios)
      : [...sizes.keys()]
    : suggestedRatios;
  const referenceRatio = followsReferenceRatio(
    model,
    attachments.length,
    attachments.some((file) => !!file.slot) ? 'frames' : undefined,
  );
  const defaultRatio = defaultChoice(
    ratioOptions,
    modelProperties.aspectRatio?.default ?? sizeRatio(String(modelProperties.size?.default ?? '')),
    mode === 'video' ? '9:16' : '1:1',
  );
  const effectiveRatio = ratio || defaultRatio;
  const qualityField = modelProperties[mode === 'image' ? 'quality' : 'resolution'];
  const qualityOptions = model
    ? choices(qualityField, mode === 'image' ? [] : ['480p', '720p', '1080p'])
    : fields.find((field) => field.id === 'quality')!.options;
  const defaultQuality = defaultChoice(
    qualityOptions,
    qualityField?.default,
    mode === 'image' ? qualityOptions[0] || '' : '720p',
  );
  const effectiveQuality = (mode === 'image' ? imageQuality : quality) || defaultQuality;
  const durations = model ? choices(modelProperties.duration, [4, 6, 8, 10, 15]) : [4, 6, 8, 10, 15];
  const audioValues = model ? choices(modelProperties.generateAudio, [false, true]) : [false, true];
  const soundOptions: string[] = audioValues.map((value) => (value ? 'Со звуком' : 'Без звука'));
  const defaultSound = defaultChoice(audioValues, modelProperties.generateAudio?.default, false)
    ? 'Со звуком'
    : 'Без звука';
  const effectiveSound = soundOptions.length === 1 ? soundOptions[0] : sound || defaultSound;
  return {
    catalog,
    retained,
    model,
    modelProperties,
    defaults: {
      ratio: defaultRatio,
      quality: defaultQuality,
      duration: defaultChoice(durations, modelProperties.duration?.default, 8),
      sound: defaultSound,
    },
    ratioOptions,
    referenceRatio,
    effectiveRatio,
    qualityOptions,
    effectiveQuality,
    durations,
    audioValues,
    soundOptions,
    effectiveSound,
  };
}
