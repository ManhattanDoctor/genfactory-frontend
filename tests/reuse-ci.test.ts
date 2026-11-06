import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
const reuseCi = createRequire(import.meta.url)('../scripts/reuse-ci.cjs');

function setup(runs: Array<Array<Record<string, unknown>>>) {
  const listWorkflowRuns = vi.fn();
  for (const workflow_runs of runs) listWorkflowRuns.mockResolvedValueOnce({ data: { workflow_runs } });
  return {
    github: { rest: { actions: { listWorkflowRuns } } },
    context: { repo: { owner: 'owner', repo: 'frontend' }, sha: 'commit' },
    core: { setOutput: vi.fn(), info: vi.fn() },
    sleep: vi.fn(),
    attempts: runs.length,
  };
}
const success = { id: 1, event: 'push', head_sha: 'commit', status: 'completed', conclusion: 'success' };

describe('release check reuse', () => {
  it('reuses success for the exact commit and workflow', async () => {
    const input = setup([[success]]);
    await reuseCi(input);
    expect(input.core.setOutput).toHaveBeenCalledWith('verified', 'true');
    expect(input.github.rest.actions.listWorkflowRuns).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'frontend',
      workflow_id: 'ci.yml',
      event: 'push',
      head_sha: 'commit',
      per_page: 100,
    });
  });
  it('runs complete checks when only a different commit or PR was checked', async () => {
    const input = setup([
      [
        { ...success, head_sha: 'other' },
        { ...success, event: 'pull_request' },
      ],
    ]);
    await reuseCi(input);
    expect(input.core.setOutput).toHaveBeenCalledWith('verified', 'false');
  });
  it('waits for an existing run instead of starting duplicate checks', async () => {
    const input = setup([[{ ...success, status: 'in_progress', conclusion: null }], [success]]);
    await reuseCi(input);
    expect(input.sleep).toHaveBeenCalledWith(20_000);
    expect(input.core.setOutput).toHaveBeenCalledExactlyOnceWith('verified', 'true');
  });
  it.each(['failure', 'cancelled', 'timed_out', 'skipped'])(
    'blocks publication after %s',
    async (conclusion) => {
      const input = setup([[{ ...success, conclusion }]]);
      await expect(reuseCi(input)).rejects.toThrow(conclusion);
      expect(input.core.setOutput).not.toHaveBeenCalled();
    },
  );
  it('uses the newest run, not an older success', async () => {
    const input = setup([[success, { ...success, id: 2, conclusion: 'failure' }]]);
    await expect(reuseCi(input)).rejects.toThrow('failure');
  });
  it('blocks publication on timeout', async () => {
    const input = setup([[{ ...success, status: 'queued' }]]);
    await expect(reuseCi(input)).rejects.toThrow('Timed out');
    expect(input.core.setOutput).not.toHaveBeenCalled();
  });
  it('blocks publication if GitHub cannot confirm the checks', async () => {
    const input = setup([]);
    input.attempts = 1;
    input.github.rest.actions.listWorkflowRuns.mockRejectedValue(new Error('API unavailable'));
    await expect(reuseCi(input)).rejects.toThrow('API unavailable');
    expect(input.core.setOutput).not.toHaveBeenCalled();
  });
});
