import type { IModelDescription } from '../../lib/types';
import { defaults } from '../catalog/schema';
import { choices } from '../content-studio/controls';
export function videoDefaults(model?: IModelDescription): Record<string, unknown> {
  const schema = model?.schema.properties?.options;
  const fields = schema?.properties || {};
  const result = defaults(schema);
  const ratios = choices(fields.aspectRatio, ['9:16', '16:9', '1:1', '4:5', '3:4']);
  const durations = choices(fields.duration, [4, 6, 8, 10, 15]);
  if (result.aspectRatio === undefined && ratios.length)
    result.aspectRatio = ratios.includes('9:16') ? '9:16' : ratios[0];
  if (result.duration === undefined && durations.length)
    result.duration = durations.includes(8) ? 8 : durations[0];
  if (result.generateAudio === undefined && fields.generateAudio)
    result.generateAudio = choices(fields.generateAudio, [false, true])[0];
  // Seedance's provider default is a larger render; the studio starts at the
  // supported economical tier unless the catalog explicitly specifies another default.
  if (
    model?.reference.model.includes('seedance') &&
    result.resolution === undefined &&
    fields.resolution?.enum?.includes('480p')
  )
    result.resolution = '480p';
  return result;
}
