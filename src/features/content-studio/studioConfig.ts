import designSettings from './designSettings.json';
import type { StudioMode } from './studioTypes';

// Temporarily hidden by user request. Remove the mode entirely later; see docs/IMPLEMENTATION-DIFFERENCES.md.
export const SCRIPT_WRITER_ENABLED = false;

export const modes: [StudioMode, string][] = [
  ['image', 'Изображение'],
  ['video', 'Видео'],
];
export const fields = designSettings.map((group) => ({
  ...group,
  options: group.options.map((option) => option.label),
}));
