import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));

export const repoRoot = resolve(scriptDir, '..');

const executableName = process.platform === 'win32' ? 'neko-engine.exe' : 'neko-engine';

export function engineBinaryCandidates() {
  const candidates = [
    resolve(repoRoot, 'packages/neko-engine/target/debug', executableName),
    resolve(repoRoot, 'packages/neko-engine/target/release', executableName),
  ];

  const configured = process.env.NEKO_ENGINE_BIN;
  return configured ? [resolve(repoRoot, configured), ...candidates] : candidates;
}

export function resolveEngineBinary() {
  for (const candidate of engineBinaryCandidates()) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const searched = engineBinaryCandidates()
    .map((candidate) => `  - ${candidate}`)
    .join('\n');
  throw new Error(
    [
      'Could not find neko-engine binary.',
      'Run `pnpm --filter @neko-engine/host-cli run build:debug` first, or set NEKO_ENGINE_BIN.',
      'Searched:',
      searched,
    ].join('\n'),
  );
}

export function parseJsonFromStdout(stdout) {
  const line = stdout
    .trim()
    .split(/\r?\n/)
    .reverse()
    .find((candidate) => candidate.trim().startsWith('{'));

  if (!line) {
    throw new Error(`No JSON object found in stdout:\n${stdout}`);
  }

  return JSON.parse(line);
}
