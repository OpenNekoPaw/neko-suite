#!/usr/bin/env node

import { spawn } from 'node:child_process';
import net from 'node:net';

import { repoRoot, resolveEngineBinary } from './smoke-engine-utils.mjs';

const binary = resolveEngineBinary();
const port = Number(process.env.NEKO_ENGINE_SMOKE_PORT || (await getFreePort()));
const baseUrl = `http://127.0.0.1:${port}`;

const child = spawn(binary, ['serve', '-p', String(port)], {
  cwd: repoRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let exited = false;
let output = '';

child.stdout.on('data', (chunk) => {
  output += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  output += chunk.toString();
});
child.on('exit', () => {
  exited = true;
});

try {
  await waitForHealth(`${baseUrl}/health`, 30_000);
  await assertDispatchHealth(`${baseUrl}/v1/dispatch`);
  console.log(`[smoke] engine serve health ok: ${baseUrl}`);
} finally {
  await stopChild();
}

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === 'object' && address?.port) {
          resolve(address.port);
          return;
        }
        reject(new Error('Could not allocate a free localhost port'));
      });
    });
  });
}

async function waitForHealth(url, timeoutMs) {
  const start = Date.now();
  let lastError;

  while (Date.now() - start < timeoutMs) {
    if (exited) {
      throw new Error(`neko-engine serve exited before health check passed:\n${output}`);
    }

    try {
      const response = await fetch(url);
      const body = await response.json();
      if (response.ok && body.status === 'ok' && body.service === 'neko-engine') {
        return;
      }
      lastError = new Error(
        `Unexpected health response ${response.status}: ${JSON.stringify(body)}`,
      );
    } catch (error) {
      lastError = error;
    }

    await delay(500);
  }

  throw new Error(
    `Timed out waiting for ${url}: ${lastError?.message ?? 'unknown error'}\n${output}`,
  );
}

async function assertDispatchHealth(url) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      group: 'nodes',
      action: 'health',
      options: {},
    }),
  });
  const body = await response.json();

  if (!response.ok || body.status !== 'ok') {
    throw new Error(
      `Expected dispatch health status "ok", received ${response.status}: ${JSON.stringify(body)}`,
    );
  }
}

async function stopChild() {
  if (exited) return;

  child.kill('SIGTERM');

  const stopped = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    delay(1_500).then(() => false),
  ]);

  if (!stopped && !exited) {
    child.kill('SIGKILL');
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
