import { describe, expect, it } from 'vitest';
import { taskView, visibleTasks } from '../src/features/studio/activeTasks';
const task = (id: string, model = 'OPEN_ROUTER_IMAGE', parentTaskId?: string, session?: string) => ({
  id,
  model,
  parentTaskId,
  session,
  createdDate: '2026-11-10T12:00:00Z',
});
describe('active task presentation', () => {
  it('shows independent roots, hides active parents children and reveals orphaned children', () => {
    const parent = task('parent', 'OPEN_AI_CONVERSATION');
    const child = task('child', 'OPEN_ROUTER_IMAGE', 'parent');
    const direct = task('direct');
    expect(visibleTasks([parent, child, direct], [])).toEqual([direct]);
    expect(visibleTasks([child, direct], [])).toEqual([child, direct]);
  });
  it('does not count the same local request and server execution twice', () => {
    const first = task('first', undefined, undefined, 'session1');
    const second = task('second', undefined, undefined, 'session2');
    expect(visibleTasks([first, second], ['session1'])).toEqual([second]);
    expect(visibleTasks([first, second], [])).toEqual([first, second]);
  });
  it.each([
    ['OPEN_ROUTER_IMAGE', '/image', 'IMAGE'],
    ['OPEN_AI_IMAGE_GPT', '/image', 'IMAGE'],
    ['OPEN_ROUTER_VIDEO', '/video', 'VIDEO'],
    ['OPEN_AI_TTS', '/audio', 'AUDIO'],
    ['OPEN_ROUTER_STT', '/audio', 'DOCUMENT'],
    ['ANTHROPIC_TEXT', '/text', 'DOCUMENT'],
  ])('uses the library type for %s', (model, path, type) => {
    expect(taskView(task('task', model))).toMatchObject({ path, type });
  });
});
