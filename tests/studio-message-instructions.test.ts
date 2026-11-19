import { describe, expect, it } from 'vitest';
import { buildStudioMessage } from '../src/features/content-studio/buildStudioMessage';
import type { StudioMode } from '../src/features/content-studio/studioTypes';

describe('studio request instructions', () => {
  it.each([
    ['image', false],
    ['video', false],
    ['video', true],
    ['presentation', false],
  ] as [StudioMode, boolean][])(
    'keeps the user text clean in %s (script=%s)',
    async (mode, preparingScript) => {
      const result = await buildStudioMessage({
        mode,
        preparingScript,
        model: { name: 'Test', reference: { provider: 'OPEN_ROUTER_VIDEO', model: 'test' }, schema: {} },
        controls: {
          referenceRatio: false,
          effectiveRatio: '9:16',
          ratioOptions: [],
          effectiveQuality: '720p',
          modelProperties: {},
          audioValues: [],
          effectiveSound: 'Без звука',
        },
        sourceDraft: 'Сделай ещё',
        sourceAttachments: [],
        savedFiles: [],
        picked: [],
        settings: {},
        duration: 8,
        shape: 'Один кадр',
        brandRules: 'Только синий фон',
        startsFresh: false,
        isCurrent: () => true,
      });
      expect(result!.body.text).toBe('Сделай ещё');
      expect(result!.body.references).toEqual([]);
      expect(result!.body.settings.instructions).toContain('Правила бренда: Только синий фон');
      if (mode === 'video') expect(result!.body.settings.instructions).toContain('один непрерывный план');
      if (preparingScript || mode === 'presentation') {
        expect(result!.body.settings.isToolsDisabled).toBe(true);
        expect(result!.body.settings.tools).toEqual([]);
      } else {
        expect(result!.body.settings.tools[0].isRequired).toBeUndefined();
        expect(result!.body.settings.tools[0].settings?.isLockSelection).toBe(true);
      }
    },
  );
});
