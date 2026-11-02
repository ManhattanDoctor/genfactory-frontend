import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));
const image = 'ghcr.io/example/genfactory-frontend/genfactory-frontend@sha256:' + 'a'.repeat(64);
function deploy(failStart = false, digest = image, failHealth = false) {
  const directory = mkdtempSync(join(tmpdir(), 'genfactory-deploy-test-'));
  directories.push(directory);
  const statePath = join(directory, 'state.json');
  writeFileSync(
    statePath,
    JSON.stringify({
      containers: {
        'genfactory-frontend': { image: 'previous', running: true },
        'gnosisai-frontend': { image: 'gnosis', running: true },
      },
      calls: [],
    }),
  );
  writeFileSync(
    join(directory, 'docker'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const state = JSON.parse(fs.readFileSync(process.env.DOCKER_TEST_STATE, 'utf8'));
const args = process.argv.slice(2);
state.calls.push(args);
let code = 0;
const name = args.at(-1);
if (args[0] === 'container') code = state.containers[name] ? 0 : 1;
if (args[0] === 'rm') delete state.containers[name];
if (args[0] === 'create') state.containers[args[args.indexOf('--name') + 1]] = { image: name, running: false };
if (args[0] === 'stop') state.containers[name].running = false;
if (args[0] === 'rename') { state.containers[args[2]] = state.containers[args[1]]; delete state.containers[args[1]]; }
if (args[0] === 'start') {
  if (process.env.FAIL_START === '1' && state.containers[name].image !== 'previous') code = 1;
  else state.containers[name].running = true;
}
if (args[0] === 'inspect') console.log(process.env.FAIL_HEALTH === '1' ? 'unhealthy' : 'healthy');
fs.writeFileSync(process.env.DOCKER_TEST_STATE, JSON.stringify(state));
process.exit(code);
`,
    { mode: 0o755 },
  );
  writeFileSync(join(directory, 'sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const result = spawnSync(
    'bash',
    [resolve('scripts/deploy.sh'), digest, '8081', 'https://api.gnosisai.ru'],
    {
      env: {
        ...process.env,
        PATH: directory + ':' + process.env.PATH,
        DOCKER_TEST_STATE: statePath,
        FAIL_START: failStart ? '1' : '0',
        FAIL_HEALTH: failHealth ? '1' : '0',
      },
      encoding: 'utf8',
    },
  );
  return { result, state: JSON.parse(readFileSync(statePath, 'utf8')) };
}
describe('production container deployment', () => {
  it('starts the exact image, retains a rollback container and leaves gnosis untouched', () => {
    const { result, state } = deploy();
    expect(result.status, result.stderr).toBe(0);
    expect(state.containers['genfactory-frontend']).toEqual({ image, running: true });
    expect(state.containers['genfactory-frontend-previous']).toEqual({ image: 'previous', running: false });
    expect(state.containers['gnosisai-frontend']).toEqual({ image: 'gnosis', running: true });
    expect(state.calls.find((args: string[]) => args[0] === 'create')).toContain('127.0.0.1:8081:8080');
  });
  it('restores the old container when the replacement cannot start', () => {
    const { result, state } = deploy(true);
    expect(result.status).not.toBe(0);
    expect(state.containers['genfactory-frontend']).toEqual({ image: 'previous', running: true });
    expect(state.containers['genfactory-frontend-next']).toBeUndefined();
    expect(state.containers['gnosisai-frontend']).toEqual({ image: 'gnosis', running: true });
  });
  it('restores the previous container if the new health check never passes', () => {
    const { result, state } = deploy(false, image, true);
    expect(result.status).not.toBe(0);
    expect(state.containers['genfactory-frontend']).toEqual({ image: 'previous', running: true });
    expect(state.containers['genfactory-frontend-next']).toBeUndefined();
  });
  it('rejects an unpinned image before invoking Docker', () => {
    const { result, state } = deploy(false, 'ghcr.io/example/genfactory:latest');
    expect(result.status).not.toBe(0);
    expect(state.calls).toEqual([]);
  });
});
