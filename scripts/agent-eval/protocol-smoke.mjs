#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';

const EXIT_CASE_FAIL = 1;
const EXIT_INFRASTRUCTURE_FAIL = 2;
const EXIT_CONFIG_INVALID = 3;
const REQUEST_SCHEMA = 'neko.tui-debug-automation.request.v1';

let args;
try {
  args = await resolveArgs(process.argv.slice(2));
  if (!args.cwd || !args.prompt) {
    printUsage();
    process.exit(EXIT_CONFIG_INVALID);
  }
  if (args.dryRun) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          dryRun: true,
          caseId: args.caseId,
          cwd: args.cwd,
          prompt: args.prompt,
          expectations: args.expectations ?? [],
        },
        null,
        2,
      )}\n`,
    );
    process.exit(0);
  }
} catch (error) {
  process.stderr.write(`manifest/config invalid: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(EXIT_CONFIG_INVALID);
}

const command = process.env.NEKO_DEBUG_COMMAND ?? './packages/neko-agent/neko';
const child = spawn(command, ['debug', 'automation', '--stdio', '-C', args.cwd], {
  cwd: process.cwd(),
  shell: true,
  stdio: ['pipe', 'pipe', 'inherit'],
});

const responses = createResponseReader(child.stdout);

try {
  const created = await sendRequest(child, responses, {
    id: 'create',
    method: 'session.create',
    params: {},
  });
  const sessionId = readString(created, 'sessionId');

  await sendRequest(child, responses, {
    id: 'submit',
    method: 'message.submit',
    params: { sessionId, prompt: args.prompt },
  });

  await sendRequest(child, responses, {
    id: 'idle',
    method: 'session.waitForIdle',
    params: {
      sessionId,
      timeoutMs: args.timeoutMs ?? 120_000,
    },
  });

  const facts = await sendRequest(child, responses, {
    id: 'facts',
    method: 'session.facts',
    params: {
      sessionId,
      includeHistory: true,
    },
  });

  await sendRequest(child, responses, {
    id: 'dispose',
    method: 'session.dispose',
    params: { sessionId },
  });

  child.stdin.end();
  child.kill();
  process.stdout.write(`${JSON.stringify({ ok: true, facts }, null, 2)}\n`);
} catch (error) {
  child.kill();
  const classification = classifyError(error);
  process.stderr.write(`${classification.label}: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(classification.exitCode);
}

async function sendRequest(childProcess, reader, input) {
  const request = {
    schema: REQUEST_SCHEMA,
    ...input,
  };
  childProcess.stdin.write(`${JSON.stringify(request)}\n`);
  const response = await reader.next();
  if (response.done) {
    throw new Error('debug automation process ended before responding');
  }
  if (!response.value.ok) {
    const error = new Error(response.value.error?.message ?? 'debug automation request failed');
    error.code = response.value.error?.code;
    throw error;
  }
  return response.value.result;
}

async function* createResponseReader(output) {
  const lines = createInterface({ input: output });
  for await (const line of lines) {
    if (!line.trim()) continue;
    yield JSON.parse(line);
  }
  await once(output, 'close').catch(() => undefined);
}

function readString(value, key) {
  if (!value || typeof value[key] !== 'string' || value[key].length === 0) {
    throw new Error(`debug automation response missing string field: ${key}`);
  }
  return value[key];
}

function classifyError(error) {
  const code = error && typeof error === 'object' ? error.code : undefined;
  if (code === 'invalid-request' || code === 'invalid-schema' || code === 'invalid-json') {
    return { label: 'manifest/config invalid', exitCode: EXIT_CONFIG_INVALID };
  }
  if (code === 'session-timeout' || code === 'internal-error' || code === 'session-not-ready') {
    return { label: 'infrastructure fail', exitCode: EXIT_INFRASTRUCTURE_FAIL };
  }
  return { label: 'case fail', exitCode: EXIT_CASE_FAIL };
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--cwd') {
      parsed.cwd = argv[++index];
    } else if (arg === '--prompt') {
      parsed.prompt = argv[++index];
    } else if (arg === '--manifest') {
      parsed.manifest = argv[++index];
    } else if (arg === '--case') {
      parsed.caseId = argv[++index];
    } else if (arg === '--timeout-ms') {
      parsed.timeoutMs = Number.parseInt(argv[++index], 10);
    } else if (arg === '--dry-run') {
      parsed.dryRun = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

async function resolveArgs(argv) {
  const parsed = parseArgs(argv);
  if (!parsed.manifest) {
    return {
      ...parsed,
      cwd: parsed.cwd ? expandHome(parsed.cwd) : undefined,
    };
  }

  const manifestPath = expandHome(parsed.manifest);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.schema !== 'neko.agent-eval.scenarios.v1' || !Array.isArray(manifest.cases)) {
    throw new Error('scenario manifest schema must be neko.agent-eval.scenarios.v1');
  }
  if (!parsed.caseId) {
    throw new Error('--case is required when --manifest is provided');
  }
  const scenario = manifest.cases.find((item) => item && item.id === parsed.caseId);
  if (!scenario) {
    throw new Error(`scenario case not found: ${parsed.caseId}`);
  }
  if (typeof scenario.prompt !== 'string' || scenario.prompt.trim().length === 0) {
    throw new Error(`scenario ${parsed.caseId} must define a non-empty prompt`);
  }

  const cwd = parsed.cwd ?? scenario.cwd ?? manifest.defaultCwd;
  return {
    ...parsed,
    caseId: parsed.caseId,
    cwd: cwd ? expandHome(interpolateEnv(cwd)) : undefined,
    prompt: interpolateEnv(scenario.prompt),
    timeoutMs: parsed.timeoutMs ?? scenario.timeoutMs ?? manifest.defaultTimeoutMs,
    expectations: scenario.expectations,
  };
}

function interpolateEnv(value) {
  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_match, name) => {
    const replacement = process.env[name];
    if (!replacement) {
      throw new Error(`environment variable ${name} is required by scenario manifest`);
    }
    return replacement;
  });
}

function expandHome(value) {
  if (value === '~') {
    return os.homedir();
  }
  if (value.startsWith('~/')) {
    return `${os.homedir()}${value.slice(1)}`;
  }
  return value;
}

function printUsage() {
  process.stderr.write(
    'Usage: node scripts/agent-eval/protocol-smoke.mjs --cwd <dir> --prompt <prompt> [--timeout-ms <ms>]\n' +
      '   or: node scripts/agent-eval/protocol-smoke.mjs --manifest <file> --case <id> [--dry-run]\n',
  );
}
