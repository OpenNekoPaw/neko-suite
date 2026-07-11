#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyScenarioSetup,
  evaluateScenario,
  validateAndNormalizeScenarioRuntime,
} from './scenario-runtime.mjs';

export const EXIT_CASE_FAIL = 1;
export const EXIT_INFRASTRUCTURE_FAIL = 2;
export const EXIT_CONFIG_INVALID = 3;
export const REQUEST_SCHEMA = 'neko.tui-debug-automation.request.v1';
const TERMINAL_RESIZE_SETTLE_MS = 50;
export const SUPPORTED_CASE_KINDS = new Set([
  undefined,
  'single-prompt',
  'async-task',
  'explicit-skill',
  'triggered-skill',
  'model-binding',
]);

const scriptPath = fileURLToPath(import.meta.url);

export async function main(argv = process.argv.slice(2), io = defaultIo()) {
  let args;
  try {
    args = await resolveArgs(argv, { env: io.env });
    if (!args.cwd || !args.prompt) {
      printUsage(io.stderr);
      return EXIT_CONFIG_INVALID;
    }
    if (args.dryRun) {
      io.stdout.write(`${JSON.stringify(createDryRunResult(args), null, 2)}\n`);
      return 0;
    }
  } catch (error) {
    io.stderr.write(`manifest/config invalid: ${formatErrorMessage(error)}\n`);
    return EXIT_CONFIG_INVALID;
  }

  let setupEvidence;
  try {
    setupEvidence = await applyScenarioSetup(args);
  } catch (error) {
    io.stderr.write(`infrastructure fail: scenario setup failed: ${formatErrorMessage(error)}\n`);
    return EXIT_INFRASTRUCTURE_FAIL;
  }

  const command = io.env.NEKO_DEBUG_COMMAND ?? './packages/neko-agent/neko';
  const child = io.spawn(command, ['debug', 'automation', '--stdio', '-C', args.cwd], {
    cwd: io.cwd(),
    shell: true,
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  const responses = createResponseReader(child.stdout);

  try {
    const facts = await runSinglePromptProtocol(child, responses, args);
    assertSuccessfulFacts(facts);
    const evaluation = await evaluateScenario(args, facts);
    io.stdout.write(
      `${JSON.stringify({ ok: true, setup: setupEvidence, evaluation, facts }, null, 2)}\n`,
    );
    return 0;
  } catch (error) {
    child.kill();
    const classification = classifyError(error);
    io.stderr.write(`${classification.label}: ${formatErrorMessage(error)}\n`);
    return classification.exitCode;
  }
}

export function assertSuccessfulFacts(facts) {
  const runtimeErrors = Array.isArray(facts?.runtimeErrors) ? facts.runtimeErrors : [];
  if (runtimeErrors.length > 0) {
    throw new Error(`debug automation completed with runtime errors: ${runtimeErrors.join('; ')}`);
  }

  const turns = Array.isArray(facts?.turns) ? facts.turns : [];
  const errorTurns = turns.filter((turn) => turn?.isError);
  if (errorTurns.length > 0) {
    throw new Error(
      `debug automation completed with error turns: ${errorTurns
        .map((turn) => turn.content)
        .filter(Boolean)
        .join('; ')}`,
    );
  }

  const internalContinuationUserTurns = turns.filter(
    (turn) =>
      turn?.role === 'user' &&
      typeof turn.content === 'string' &&
      /Continue from the completed async task result\.|completed async task result|completed subagent result/i.test(
        turn.content,
      ),
  );
  if (internalContinuationUserTurns.length > 0) {
    throw new Error(
      'debug automation projected internal continuation prompts as user-authored messages',
    );
  }

  const assistantTurns = turns.filter((turn) => turn?.role === 'assistant');
  const finalAssistant = assistantTurns.at(-1);
  if (
    !finalAssistant ||
    typeof finalAssistant.content !== 'string' ||
    finalAssistant.content.trim().length === 0
  ) {
    throw new Error('debug automation completed without a non-empty assistant response');
  }
}

export async function runSinglePromptProtocol(child, responses, args) {
  const created = await sendRequest(child, responses, {
    id: 'create',
    method: 'session.create',
    params: createSessionParams(args),
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

  for (const [index, resize] of (args.terminalResizes ?? []).entries()) {
    await sendRequest(child, responses, {
      id: `resize-${index + 1}`,
      method: 'terminal.resize',
      params: { sessionId, columns: resize.columns, rows: resize.rows },
    });
    await new Promise((resolve) => setTimeout(resolve, TERMINAL_RESIZE_SETTLE_MS));
  }

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
  return facts;
}

export async function sendRequest(childProcess, reader, input) {
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

export async function* createResponseReader(output) {
  const lines = createInterface({ input: output });
  for await (const line of lines) {
    if (!line.trim()) continue;
    yield JSON.parse(line);
  }
  await once(output, 'close').catch(() => undefined);
}

export function readString(value, key) {
  if (!value || typeof value[key] !== 'string' || value[key].length === 0) {
    throw new Error(`debug automation response missing string field: ${key}`);
  }
  return value[key];
}

export function classifyError(error) {
  const code = error && typeof error === 'object' ? error.code : undefined;
  if (code === 'invalid-request' || code === 'invalid-schema' || code === 'invalid-json') {
    return { label: 'manifest/config invalid', exitCode: EXIT_CONFIG_INVALID };
  }
  if (code === 'session-timeout' || code === 'internal-error' || code === 'session-not-ready') {
    return { label: 'infrastructure fail', exitCode: EXIT_INFRASTRUCTURE_FAIL };
  }
  return { label: 'case fail', exitCode: EXIT_CASE_FAIL };
}

export function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--cwd') {
      parsed.cwd = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--prompt') {
      parsed.prompt = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--manifest') {
      parsed.manifest = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--case') {
      parsed.caseId = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--timeout-ms') {
      parsed.timeoutMs = parseTimeoutMs(readOptionValue(argv, index, arg));
      index += 1;
    } else if (arg === '--dry-run') {
      parsed.dryRun = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

export async function resolveArgs(argv, options = {}) {
  const parsed = parseArgs(argv);
  if (!parsed.manifest) {
    return {
      ...parsed,
      cwd: parsed.cwd ? expandHome(parsed.cwd) : undefined,
    };
  }

  const manifestPath = expandHome(parsed.manifest);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  return resolveManifestCase(parsed, manifest, options);
}

export function resolveManifestCase(parsed, manifest, options = {}) {
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
  assertSupportedScenario(scenario);
  if (typeof scenario.prompt !== 'string' || scenario.prompt.trim().length === 0) {
    throw new Error(`scenario ${parsed.caseId} must define a non-empty prompt`);
  }

  const env = options.env ?? process.env;
  const runtime = validateAndNormalizeScenarioRuntime(scenario, { env });
  const cwd = parsed.cwd ?? scenario.cwd ?? manifest.defaultCwd;
  return {
    ...parsed,
    caseId: parsed.caseId,
    kind: scenario.kind,
    cwd: cwd ? expandHome(interpolateEnv(cwd, env)) : undefined,
    prompt: scenario.prompt,
    timeoutMs: parsed.timeoutMs ?? scenario.timeoutMs ?? manifest.defaultTimeoutMs,
    expectations: scenario.expectations,
    assertions: runtime.assertions,
    setup: runtime.setup,
    postChecks: runtime.postChecks,
    terminalResizes: runtime.terminalResizes,
    skills: scenario.skills,
    model: scenario.model,
    provider: scenario.provider,
  };
}

export function assertSupportedScenario(scenario) {
  if (!SUPPORTED_CASE_KINDS.has(scenario.kind)) {
    const kind = scenario.kind ?? '(missing)';
    throw new Error(
      `scenario ${scenario.id ?? '(unknown)'} kind ${kind} is documented but not supported by protocol-smoke yet`,
    );
  }
}

export function createSessionParams(args) {
  const params = {};
  const chat = args.model?.chat;
  const provider = args.provider ?? chat?.providerId;
  const model = chat?.modelId;
  if (provider) params.provider = provider;
  if (model) params.model = model;
  if (args.apiKey) params.apiKey = args.apiKey;
  return params;
}

export function createDryRunResult(args) {
  return {
    ok: true,
    dryRun: true,
    caseId: args.caseId,
    kind: args.kind ?? 'single-prompt',
    cwd: args.cwd,
    prompt: args.prompt,
    timeoutMs: args.timeoutMs,
    expectations: args.expectations ?? [],
    assertions: args.assertions ?? [],
    setup: args.setup ?? [],
    postChecks: args.postChecks ?? [],
    terminalResizes: args.terminalResizes ?? [],
    skills: args.skills ?? [],
    ...(args.model ? { model: args.model } : {}),
    ...(args.provider ? { provider: args.provider } : {}),
  };
}

export function interpolateEnv(value, env = process.env) {
  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_match, name) => {
    const replacement = env[name];
    if (!replacement) {
      throw new Error(`environment variable ${name} is required by scenario manifest`);
    }
    return replacement;
  });
}

export function expandHome(value) {
  if (value === '~') {
    return os.homedir();
  }
  if (value.startsWith('~/')) {
    return `${os.homedir()}${value.slice(1)}`;
  }
  return value;
}

function readOptionValue(argv, index, arg) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${arg} requires a value`);
  }
  return value;
}

function parseTimeoutMs(value) {
  const timeoutMs = Number.parseInt(value, 10);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`--timeout-ms must be a positive integer: ${value}`);
  }
  return timeoutMs;
}

function printUsage(stderr = process.stderr) {
  stderr.write(
    'Usage: node scripts/agent-eval/protocol-smoke.mjs --cwd <dir> --prompt <prompt> [--timeout-ms <ms>]\n' +
      '   or: node scripts/agent-eval/protocol-smoke.mjs --manifest <file> --case <id> [--dry-run]\n',
  );
}

function formatErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function defaultIo() {
  return {
    stdout: process.stdout,
    stderr: process.stderr,
    env: process.env,
    cwd: () => process.cwd(),
    spawn,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  process.exitCode = await main();
}
