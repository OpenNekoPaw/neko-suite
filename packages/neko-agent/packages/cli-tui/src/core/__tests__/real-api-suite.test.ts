import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IService } from '@neko/shared';
import {
  createDefaultTuiRealApiSuiteManifest,
  evaluateTuiRealApiCase,
  formatTuiRealApiSuiteReport,
  parseTuiRealApiSuiteManifest,
  runTuiRealApiSuite,
  type TuiRealApiCaseExecution,
  type TuiRealApiSuiteManifest,
} from '../real-api-suite';

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

describe('TUI real API suite manifest', () => {
  it('parses default manifests and rejects unsupported checks', () => {
    const manifest = createDefaultTuiRealApiSuiteManifest({
      workDir: '/workspace',
      provider: 'gateway',
      model: 'gpt-4.1',
    });

    expect(manifest.schema).toBe('neko.tui-real-api-suite.v1');
    expect(manifest.cases.some((testCase) => testCase.id === 'epub-vision')).toBe(true);

    expect(() =>
      parseTuiRealApiSuiteManifest({
        schema: 'neko.tui-real-api-suite.v1',
        name: 'bad',
        cases: [{ id: 'bad', prompt: 'x', checks: [{ kind: 'unknown' }] }],
      }),
    ).toThrow('unsupported');
  });
});

describe('TUI real API deterministic evaluator', () => {
  it('does not pass failed cases merely because partial output exists', () => {
    const execution = makeExecution({
      exitCode: 1,
      output: 'partial response',
      error: 'Agent execution timed out after 1ms',
      timedOut: true,
    });

    const checks = evaluateTuiRealApiCase(
      {
        id: 'timeout',
        prompt: 'slow',
        checks: [
          { kind: 'non-empty-output' },
          { kind: 'exit-code', equals: 0 },
          { kind: 'timeout', expected: false },
        ],
      },
      execution,
    );

    expect(checks.map((check) => check.passed)).toEqual([true, false, false]);
  });

  it('checks model capabilities and content evidence explicitly', () => {
    const execution = makeExecution({
      modelCapabilities: ['chat'],
      stdout: '[tool] ReadImage',
    });

    const checks = evaluateTuiRealApiCase(
      {
        id: 'vision',
        prompt: 'image',
        requiredCapabilities: ['vision'],
        checks: [{ kind: 'content-evidence', text: 'ReadImage' }],
      },
      execution,
    );

    expect(checks).toEqual([
      expect.objectContaining({ kind: 'model-capability', passed: false }),
      expect.objectContaining({ kind: 'content-evidence', passed: true }),
    ]);
  });
});

describe('TUI real API suite runner', () => {
  it('writes raw artifacts, structured results, manifest, and report', async () => {
    const outputDir = await createTempRoot();
    const manifest: TuiRealApiSuiteManifest = {
      schema: 'neko.tui-real-api-suite.v1',
      name: 'suite',
      defaults: { workDir: '/workspace', maxIterations: 1 },
      cases: [
        {
          id: 'pass-case',
          prompt: 'hello',
          checks: [
            { kind: 'exit-code', equals: 0 },
            { kind: 'non-empty-output' },
          ],
        },
        {
          id: 'disabled-case',
          prompt: 'skip',
          enabled: false,
          skipReason: 'fixture missing',
          checks: [{ kind: 'non-empty-output' }],
        },
      ],
    };

    const result = await runTuiRealApiSuite({
      manifest,
      outputDir,
      now: new Date('2026-07-08T00:00:00.000Z'),
      executeCase: async (input) =>
        makeExecution({
          caseId: input.case.id,
          workDir: input.workDir,
          output: 'hello TUI',
        }),
    });

    expect(result.passed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(await exists(result.reportPath)).toBe(true);
    expect(await exists(result.manifestPath)).toBe(true);
    const caseResult = result.caseResults[0];
    expect(caseResult?.stdoutPath ? await exists(caseResult.stdoutPath) : false).toBe(true);
    expect(caseResult?.resultPath ? await exists(caseResult.resultPath) : false).toBe(true);
  });

  it('redacts config from persisted case result JSON', async () => {
    const outputDir = await createTempRoot();
    const manifest: TuiRealApiSuiteManifest = {
      schema: 'neko.tui-real-api-suite.v1',
      name: 'suite',
      defaults: { workDir: '/workspace', maxIterations: 1 },
      cases: [{ id: 'case', prompt: 'hello', checks: [{ kind: 'exit-code', equals: 0 }] }],
    };
    const result = await runTuiRealApiSuite({
      manifest,
      outputDir,
      executeCase: async () =>
        makeExecution({
          configApiKey: 'sk-should-not-appear',
        }),
    });

    const resultPath = result.caseResults[0]?.resultPath;
    if (!resultPath) throw new Error('Missing result path');
    const persisted = await fs.readFile(resultPath, 'utf8');
    expect(persisted).toContain('<redacted>');
    expect(persisted).not.toContain('sk-should-not-appear');
  });

  it('keeps AI summary as reviewer note without changing deterministic verdicts', async () => {
    const outputDir = await createTempRoot();
    const manifest: TuiRealApiSuiteManifest = {
      schema: 'neko.tui-real-api-suite.v1',
      name: 'suite',
      defaults: { workDir: '/workspace', maxIterations: 1 },
      cases: [{ id: 'case', prompt: 'hello', checks: [{ kind: 'exit-code', equals: 1 }] }],
    };
    const result = await runTuiRealApiSuite({
      manifest,
      outputDir,
      executeCase: async () => makeExecution({ exitCode: 0, output: 'successful-looking output' }),
      aiSummary: {
        service: createSummaryService('看起来可接受。'),
        providerId: 'gateway',
        modelId: 'gpt-4.1',
      },
    });

    expect(result.failed).toBe(1);
    expect(result.aiSummary).toBe('看起来可接受。');
    const report = await fs.readFile(result.reportPath, 'utf8');
    expect(report).toContain('看起来可接受。');
    expect(report).toContain('fail: exit-code');
  });
});

describe('TUI real API report', () => {
  it('states run-mode interactive coverage caveat when no PTY evidence exists', () => {
    const report = formatTuiRealApiSuiteReport({
      manifest: {
        schema: 'neko.tui-real-api-suite.v1',
        name: 'suite',
        cases: [],
      },
      outputDir: '/reports',
      caseResults: [],
      passed: 0,
      failed: 0,
      skipped: 0,
    });

    expect(report).toContain('not covered by run-mode suite');
    expect(report).toContain('Terminal input');
  });
});

function makeExecution(input: {
  readonly caseId?: string;
  readonly workDir?: string;
  readonly stdout?: string;
  readonly output?: string;
  readonly error?: string;
  readonly exitCode?: number;
  readonly timedOut?: boolean;
  readonly modelCapabilities?: readonly string[];
  readonly configApiKey?: string;
} = {}): TuiRealApiCaseExecution {
  const output = input.output ?? input.stdout ?? 'ok';
  const success = (input.exitCode ?? 0) === 0;
  return {
    caseId: input.caseId ?? 'case',
    command: ['neko', 'run', 'prompt'],
    workDir: input.workDir ?? '/workspace',
    provider: 'gateway',
    model: 'gpt-4.1',
    modelCapabilities: input.modelCapabilities ?? ['chat', 'vision'],
    stdout: input.stdout ?? output,
    stderr: input.error ?? '',
    exitCode: input.exitCode ?? 0,
    durationMs: 25,
    timedOut: input.timedOut ?? false,
    result: {
      success,
      output,
      ...(input.error ? { error: input.error } : {}),
      duration: 25,
    },
    config: {
      provider: 'gateway',
      providerType: 'openai',
      providerRequiresApiKey: true,
      model: 'gpt-4.1',
      chatModel: {
        providerId: 'gateway',
        modelId: 'gpt-4.1',
        capabilities: input.modelCapabilities ?? ['chat', 'vision'],
      },
      mediaModels: [],
      ...(input.configApiKey ? { apiKey: input.configApiKey } : {}),
      maxTokens: 1024,
      temperature: 0.2,
      verbose: false,
      workDir: input.workDir ?? '/workspace',
      mcpServers: [],
      outputFormat: 'text',
      thinkingBudget: 0,
    },
  };
}

function createSummaryService(content: string): IService {
  return {
    chat: vi.fn(async () => ({
      id: 'summary',
      model: 'gpt-4.1',
      message: { role: 'assistant' as const, content },
      finishReason: 'stop' as const,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    })),
    chatStream: vi.fn(),
    embed: vi.fn(async () => ({ embeddings: [] })),
  };
}

async function createTempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-real-api-suite-'));
  tempRoots.push(root);
  return root;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}
