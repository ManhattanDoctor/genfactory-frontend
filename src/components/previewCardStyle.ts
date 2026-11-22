import type { CSSProperties } from 'react';
import type { IPreview } from '../lib/types';
export function previewCardStyle(preview?: IPreview): CSSProperties | undefined {
  const media = preview?.image?.width ? preview.image : preview?.video;
  return media?.width && media.height
    ? ({ '--media-ratio': media.width / media.height } as CSSProperties)
    : undefined;
}
