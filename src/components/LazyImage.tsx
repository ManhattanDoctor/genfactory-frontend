import { storefrontImage } from '../lib/storefrontImage';
import './media-loading.css';
import { useRef, useState, type ImgHTMLAttributes } from 'react';
import { useMediaVisibility } from './useMediaVisibility';

export function LazyImage({ src, srcSet, onLoad, onError, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const ref = useRef<HTMLImageElement>(null);
  const { seen } = useMediaVisibility(ref, true, srcSet || src, true);
  const source = srcSet || src;
  const [settled, setSettled] = useState<string>();
  return (
    <img
      {...props}
      ref={ref}
      src={seen ? storefrontImage(src, 640) : undefined}
      srcSet={seen ? srcSet : undefined}
      data-image-loading={source && settled !== source ? true : undefined}
      style={{
        ...(props.width && props.height ? { aspectRatio: `auto ${props.width} / ${props.height}` } : {}),
        ...props.style,
      }}
      onLoad={(event) => {
        setSettled(source);
        onLoad?.(event);
      }}
      onError={(event) => {
        setSettled(source);
        onError?.(event);
      }}
      decoding="async"
    />
  );
}
