#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

import { parseJsonFromStdout, repoRoot, resolveEngineBinary } from './smoke-engine-utils.mjs';

const binary = resolveEngineBinary();
const result = spawnSync(binary, ['nodes', 'health', '-f', 'json'], {
  cwd: repoRoot,
  encoding: 'utf8',
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.stderr.write(result.stderr ?? '');
  process.stdout.write(result.stdout ?? '');
  process.exit(result.status ?? 1);
}

const response = parseJsonFromStdout(result.stdout ?? '');

if (response.status !== 'ok') {
  throw new Error(`Expected CLI health status "ok", received ${JSON.stringify(response)}`);
}

console.log(`[smoke] engine CLI health ok: ${binary}`);
