import type { IGnosisFile } from '../../lib/types';

export type StudioMode = 'image' | 'video' | 'presentation';
export interface IAttachment {
  id: string;
  name: string;
  url: string;
  type: string;
  slot?: 'start' | 'end';
  file?: File;
  saved?: IGnosisFile;
  restoreId?: number;
  isUnavailable?: boolean;
}
export interface IReferenceDraft {
  id?: number;
  userId?: number;
  name: string;
  slot?: 'start' | 'end';
}
