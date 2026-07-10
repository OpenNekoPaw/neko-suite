import { describe, expect, it, vi } from 'vitest';
import {
  EXIT_CASE_FAIL,
  EXIT_CONFIG_INVALID,
  EXIT_INFRASTRUCTURE_FAIL,
  assertSuccessfulFacts,
  classifyError,
  createDryRunResult,
  createSessionParams,
  main,
  parseArgs,
  resolveManifestCase,
  runSinglePromptProtocol,
} from './protocol-smoke.mjs';

const BASE_MANIFEST = {
  schema: 'neko.agent-eval.scenarios.v1',
  defaultCwd: '/workspace',
  defaultTimeoutMs: 600_000,
  cases: [],
};

describe('agent eval protocol smoke case handling', () => {
  it('handles single prompt cases with expectations and assertions', () => {
    const args = resolveManifestCase(
      { caseId: 'single' },
      {
        ...BASE_MANIFEST,
        cases: [
          {
            id: 'single',
            kind: 'single-prompt',
            prompt: '生成 5 镜头分镜表',
            expectations: ['输出结构化分镜'],
            assertions: [{ kind: 'final-answer-contains', text: ['镜头'] }],
          },
        ],
      },
    );

    expect(args).toMatchObject({
      caseId: 'single',
      kind: 'single-prompt',
      cwd: '/workspace',
      prompt: '生成 5 镜头分镜表',
      timeoutMs: 600_000,
      expectations: ['输出结构化分镜'],
      assertions: [{ kind: 'final-answer-contains', text: ['镜头'] }],
    });
  });

  it('handles async task cases as single prompt runs with task assertions', () => {
    const args = resolveManifestCase(
      { caseId: 'async' },
      {
        ...BASE_MANIFEST,
        cases: [
          {
            id: 'async',
            kind: 'async-task',
            prompt: '生成图片并评审质量',
            assertions: [{ kind: 'task-terminal', type: 'image.generate', status: 'completed' }],
          },
        ],
      },
    );

    expect(args.kind).toBe('async-task');
    expect(args.assertions).toEqual([
      { kind: 'task-terminal', type: 'image.generate', status: 'completed' },
    ]);
  });

  it('handles explicit skill cases without embedding skill protocol in the runner', () => {
    const args = resolveManifestCase(
      { caseId: 'skill' },
      {
        ...BASE_MANIFEST,
        cases: [
          {
            id: 'skill',
            kind: 'explicit-skill',
            skills: [{ name: 'storyboard-director', slot: 'domainSkill' }],
            prompt: '/skill storyboard-director\n把剧情改成 8 镜头分镜',
          },
        ],
      },
    );

    expect(args.kind).toBe('explicit-skill');
    expect(args.skills).toEqual([{ name: 'storyboard-director', slot: 'domainSkill' }]);
    expect(args.prompt).toContain('/skill storyboard-director');
  });

  it('handles triggered skill cases as prompt-driven routing assertions', () => {
    const args = resolveManifestCase(
      { caseId: 'trigger' },
      {
        ...BASE_MANIFEST,
        cases: [
          {
            id: 'trigger',
            kind: 'triggered-skill',
            prompt: '分析漫画前 10 页，输出动画化分镜和镜头节奏',
            assertions: [{ kind: 'skill-triggered', name: 'comic-animation-indexing' }],
          },
        ],
      },
    );

    expect(args.kind).toBe('triggered-skill');
    expect(args.assertions).toEqual([
      { kind: 'skill-triggered', name: 'comic-animation-indexing' },
    ]);
  });

  it('handles model binding cases and projects chat model into session params', () => {
    const args = resolveManifestCase(
      { caseId: 'model' },
      {
        ...BASE_MANIFEST,
        cases: [
          {
            id: 'model',
            kind: 'model-binding',
            prompt: '用指定图片模型生成概念图并评审',
            model: {
              chat: {
                providerId: 'openai',
                modelId: 'gpt-4.1',
                providerExpressionProfileId: 'creative-review',
              },
              media: {
                image: { providerId: 'fal', modelId: 'imagen4' },
              },
            },
          },
        ],
      },
    );

    expect(args.model.chat.providerExpressionProfileId).toBe('creative-review');
    expect(createSessionParams(args)).toEqual({ provider: 'openai', model: 'gpt-4.1' });
  });

  it('rejects documented multi-step case kinds until the runner implements them', () => {
    const unsupportedKinds = [
      'message-queue',
      'closed-loop',
      'concurrent-tasks',
      'iterative-tasks',
    ];

    for (const kind of unsupportedKinds) {
      expect(() =>
        resolveManifestCase(
          { caseId: kind },
          {
            ...BASE_MANIFEST,
            cases: [{ id: kind, kind, prompt: 'should not be silently accepted' }],
          },
        ),
      ).toThrow(`kind ${kind} is documented but not supported by protocol-smoke yet`);
    }
  });

  it('interpolates environment variables in cwd but preserves prompt asset variables', () => {
    const args = resolveManifestCase(
      { caseId: 'env' },
      {
        ...BASE_MANIFEST,
        defaultCwd: '${A}/project',
        cases: [{ id: 'env', kind: 'single-prompt', prompt: '@${A}/comic.epub 生成分镜' }],
      },
      { env: { A: '/assets' } },
    );

    expect(args.cwd).toBe('/assets/project');
    expect(args.prompt).toBe('@${A}/comic.epub 生成分镜');
  });

  it('preserves case post checks for external artifact validation', () => {
    const args = resolveManifestCase(
      { caseId: 'canvas' },
      {
        ...BASE_MANIFEST,
        cases: [
          {
            id: 'canvas',
            prompt: '生成分镜表并发送到 canvas',
            postChecks: [{ kind: 'canvas-json', expect: ['storyboard', 'nodes'] }],
          },
        ],
      },
    );

    expect(args.postChecks).toEqual([{ kind: 'canvas-json', expect: ['storyboard', 'nodes'] }]);
  });
});

describe('agent eval protocol smoke CLI handling', () => {
  it('parses direct single prompt CLI args', () => {
    expect(
      parseArgs(['--cwd', '/tmp/project', '--prompt', 'hello', '--timeout-ms', '1000']),
    ).toEqual({
      cwd: '/tmp/project',
      prompt: 'hello',
      timeoutMs: 1000,
    });
  });

  it('rejects missing option values and invalid timeouts', () => {
    expect(() => parseArgs(['--prompt'])).toThrow('--prompt requires a value');
    expect(() => parseArgs(['--timeout-ms', '0'])).toThrow(
      '--timeout-ms must be a positive integer',
    );
  });

  it('dry-runs manifest cases without spawning the TUI process', async () => {
    const stdout = createWritableCapture();
    const stderr = createWritableCapture();
    const spawn = vi.fn();
    const code = await main(
      [
        '--manifest',
        'scripts/agent-eval/scenarios/creative-workflows.scenarios.json',
        '--case',
        'cat-play-image-analysis',
        '--dry-run',
      ],
      {
        stdout,
        stderr,
        env: {},
        cwd: () => '/repo',
        spawn,
      },
    );

    expect(code).toBe(0);
    expect(spawn).not.toHaveBeenCalled();
    expect(stderr.text()).toBe('');
    expect(JSON.parse(stdout.text())).toMatchObject({
      ok: true,
      dryRun: true,
      kind: 'async-task',
      caseId: 'cat-play-image-analysis',
    });
  });

  it('returns config invalid for unsupported target case kinds before spawning', async () => {
    const stdout = createWritableCapture();
    const stderr = createWritableCapture();
    const spawn = vi.fn();

    const code = await main(
      [
        '--manifest',
        'scripts/agent-eval/protocol-smoke.test-fixture.unsupported.json',
        '--case',
        'queue',
      ],
      {
        stdout,
        stderr,
        env: {},
        cwd: () => '/repo',
        spawn,
      },
    );

    expect(code).toBe(EXIT_CONFIG_INVALID);
    expect(spawn).not.toHaveBeenCalled();
    expect(stderr.text()).toContain('manifest/config invalid:');
  });
});

describe('agent eval protocol smoke request sequencing', () => {
  it('runs the supported single prompt protocol in order', async () => {
    const child = createFakeChild();
    const facts = { turns: [{ role: 'assistant', content: 'done' }] };

    await expect(
      runSinglePromptProtocol(
        child,
        responseReader([
          { ok: true, result: { sessionId: 's1' } },
          { ok: true, result: { submitted: true } },
          { ok: true, result: { fullyIdle: true } },
          { ok: true, result: facts },
          { ok: true, result: { disposed: true } },
        ]),
        {
          prompt: 'hello',
          timeoutMs: 1234,
          model: { chat: { providerId: 'openai', modelId: 'gpt-4.1' } },
        },
      ),
    ).resolves.toBe(facts);

    expect(child.requests.map((request) => request.method)).toEqual([
      'session.create',
      'message.submit',
      'session.waitForIdle',
      'session.facts',
      'session.dispose',
    ]);
    expect(child.requests[0].params).toEqual({ provider: 'openai', model: 'gpt-4.1' });
    expect(child.requests[1].params).toEqual({ sessionId: 's1', prompt: 'hello' });
    expect(child.requests[2].params).toEqual({ sessionId: 's1', timeoutMs: 1234 });
    expect(child.stdin.end).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it('classifies protocol and runtime failures', () => {
    expect(classifyError(errorWithCode('invalid-request'))).toEqual({
      label: 'manifest/config invalid',
      exitCode: EXIT_CONFIG_INVALID,
    });
    expect(classifyError(errorWithCode('session-timeout'))).toEqual({
      label: 'infrastructure fail',
      exitCode: EXIT_INFRASTRUCTURE_FAIL,
    });
    expect(classifyError(new Error('bad output'))).toEqual({
      label: 'case fail',
      exitCode: EXIT_CASE_FAIL,
    });
  });

  it('creates complete dry-run evidence for supported cases', () => {
    expect(
      createDryRunResult({
        caseId: 'dry',
        kind: 'model-binding',
        cwd: '/workspace',
        prompt: 'hello',
        timeoutMs: 100,
        expectations: ['ok'],
        assertions: [{ kind: 'runtime-errors-empty' }],
        postChecks: [{ kind: 'canvas-json' }],
        skills: [{ name: 'storyboard-director' }],
        model: { chat: { providerId: 'openai', modelId: 'gpt-4.1' } },
      }),
    ).toMatchObject({
      ok: true,
      dryRun: true,
      kind: 'model-binding',
      expectations: ['ok'],
      assertions: [{ kind: 'runtime-errors-empty' }],
      postChecks: [{ kind: 'canvas-json' }],
      skills: [{ name: 'storyboard-director' }],
      model: { chat: { providerId: 'openai', modelId: 'gpt-4.1' } },
    });
  });

  it('fails completed runs that contain runtime errors or no assistant answer', () => {
    expect(() =>
      assertSuccessfulFacts({
        runtimeErrors: ['Dynamic require of "crypto" is not supported'],
        turns: [],
      }),
    ).toThrow('debug automation completed with runtime errors');

    expect(() =>
      assertSuccessfulFacts({
        runtimeErrors: [],
        turns: [{ role: 'system', isError: true, content: 'Error: bad runtime' }],
      }),
    ).toThrow('debug automation completed with error turns');

    expect(() => assertSuccessfulFacts({ runtimeErrors: [], turns: [] })).toThrow(
      'debug automation completed without a non-empty assistant response',
    );

    expect(() =>
      assertSuccessfulFacts({
        runtimeErrors: [],
        turns: [
          { role: 'user', content: 'Continue from the completed async task result.' },
          { role: 'assistant', content: 'ok' },
        ],
      }),
    ).toThrow('internal continuation prompts as user-authored messages');
  });

  it('accepts completed runs with a non-empty assistant answer and no runtime errors', () => {
    expect(() =>
      assertSuccessfulFacts({
        runtimeErrors: [],
        turns: [{ role: 'assistant', content: 'ok' }],
      }),
    ).not.toThrow();
  });
});

function createWritableCapture() {
  let output = '';
  return {
    write(value) {
      output += value;
    },
    text() {
      return output;
    },
  };
}

function createFakeChild() {
  const requests = [];
  return {
    requests,
    stdin: {
      write: vi.fn((line) => {
        requests.push(JSON.parse(line));
      }),
      end: vi.fn(),
    },
    kill: vi.fn(),
  };
}

async function* responseReader(responses) {
  for (const response of responses) {
    yield response;
  }
}

function errorWithCode(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
