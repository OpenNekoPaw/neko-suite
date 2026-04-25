import { describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '../../session/types';
import type { AgentSessionConfig } from '../../session/types';
import type { IExperimentSession, ISessionFactory } from '../experiment-runner';
import { ExperimentRunner } from '../experiment-runner';
import { BASELINE, NO_COMPRESSION } from '../presets';

function makeBaseConfig(): AgentSessionConfig {
  return {
    service: {} as AgentSessionConfig['service'],
    toolRegistry: {} as AgentSessionConfig['toolRegistry'],
    systemPrompt: 'test',
  };
}

async function* events(items: AgentEvent[]): AsyncIterable<AgentEvent> {
  for (const item of items) {
    yield item;
  }
}

function failingEvents(error: Error): AsyncIterable<AgentEvent> {
  return {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<AgentEvent>> {
          await Promise.resolve();
          throw error;
        },
      };
    },
  };
}

class MockSession implements IExperimentSession {
  readonly dispose = vi.fn();
  readonly execute = vi.fn(
    (input: string, context?: import('../../session/types').ExecutionContext) => {
      this.inputs.push(input);
      this.contexts.push(context);
      return this.eventSource();
    },
  );

  readonly inputs: string[] = [];
  readonly contexts: Array<import('../../session/types').ExecutionContext | undefined> = [];

  constructor(private readonly eventSource: () => AsyncIterable<AgentEvent>) {}
}

class MockFactory implements ISessionFactory {
  readonly sessions: MockSession[] = [];
  readonly configs: AgentSessionConfig[] = [];

  constructor(private readonly createSession: () => MockSession) {}

  create(config: AgentSessionConfig): IExperimentSession {
    this.configs.push(config);
    const session = this.createSession();
    this.sessions.push(session);
    return session;
  }
}

describe('ExperimentRunner', () => {
  it('runs variants, prepends metrics hooks, evaluates quality, and disposes sessions', async () => {
    const factory = new MockFactory(
      () =>
        new MockSession(() =>
          events([
            {
              type: 'done',
              content: 'ok',
              iteration: { current: 2, max: 5 },
              usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
            },
          ]),
        ),
    );
    const evaluator = {
      evaluate: vi.fn().mockResolvedValue({ score: 0.9, passed: true, reason: 'good' }),
    };

    const runner = new ExperimentRunner(
      {
        name: 'Eval Experiment',
        taskPrompt: 'do work',
        variants: [BASELINE, NO_COMPRESSION],
        baseSessionConfig: makeBaseConfig(),
        outputDir: '/tmp/ablation',
        evaluator,
      },
      factory,
    );

    const result = await runner.runAll();

    expect(factory.sessions).toHaveLength(2);
    expect(factory.sessions.every((session) => session.dispose.mock.calls.length === 1)).toBe(true);
    expect(
      factory.configs.every((config) => config.hooks?.[0]?.name === 'experiment-metrics'),
    ).toBe(true);
    expect(evaluator.evaluate).toHaveBeenCalledTimes(2);
    expect(evaluator.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, response: 'ok' }),
      expect.objectContaining({
        experimentName: 'Eval Experiment',
        variantName: 'baseline',
        repetitionIndex: 0,
        outputDir: '/tmp/ablation/Eval-Experiment/baseline/run-0',
        isolationMode: 'metadata-only',
      }),
    );
    expect(result.variants[0]?.runs[0]?.metrics.custom.evaluation).toEqual({
      score: 0.9,
      passed: true,
      reason: 'good',
    });
    expect(result.comparison).toHaveLength(2);
  });

  it('writes result JSON and comparison markdown when outputWriter is provided', async () => {
    const factory = new MockFactory(
      () => new MockSession(() => events([{ type: 'done', content: 'ok' }])),
    );
    const writes: Array<{ path: string; content: string }> = [];
    const outputWriter = {
      writeTextFile: vi.fn(async (path: string, content: string) => {
        writes.push({ path, content });
      }),
    };

    const runner = new ExperimentRunner(
      {
        name: 'Persist Results',
        taskPrompt: 'prompt',
        variants: [BASELINE],
        baseSessionConfig: makeBaseConfig(),
        outputDir: '/tmp/results',
        outputWriter,
      },
      factory,
    );

    const result = await runner.runAll();

    expect(outputWriter.writeTextFile).toHaveBeenCalledTimes(2);
    expect(result.outputFiles).toEqual([
      { kind: 'json', path: '/tmp/results/Persist-Results/result.json' },
      { kind: 'markdown', path: '/tmp/results/Persist-Results/comparison.md' },
    ]);
    expect(JSON.parse(writes[0]!.content)).toMatchObject({ name: 'Persist Results' });
    expect(writes[1]!.content).toContain('| Variant | Avg Tokens |');
  });

  it('adds per-run isolation metadata without overriding workspaceRoot by default', async () => {
    const factory = new MockFactory(
      () => new MockSession(() => events([{ type: 'done', content: 'ok' }])),
    );
    const runner = new ExperimentRunner(
      {
        name: 'Isolation',
        taskPrompt: 'prompt',
        variants: [{ ...BASELINE, repetitions: 2 }],
        baseSessionConfig: makeBaseConfig(),
        taskContext: { workspaceRoot: '/project', metadata: { keep: true } },
        outputDir: '/tmp/results',
      },
      factory,
    );

    await runner.runAll();

    expect(factory.sessions[0]?.contexts[0]).toEqual({
      workspaceRoot: '/project',
      metadata: {
        keep: true,
        experiment: {
          name: 'Isolation',
          variant: 'baseline',
          repetition: 0,
          outputDir: '/tmp/results/Isolation/baseline/run-0',
          isolationMode: 'metadata-only',
        },
      },
    });
    expect(factory.sessions[1]?.contexts[0]?.metadata?.experiment).toEqual({
      name: 'Isolation',
      variant: 'baseline',
      repetition: 1,
      outputDir: '/tmp/results/Isolation/baseline/run-1',
      isolationMode: 'metadata-only',
    });
  });

  it('can isolate by overriding workspaceRoot', async () => {
    const factory = new MockFactory(
      () => new MockSession(() => events([{ type: 'done', content: 'ok' }])),
    );
    const runner = new ExperimentRunner(
      {
        name: 'Workspace Isolation',
        taskPrompt: 'prompt',
        variants: [BASELINE],
        baseSessionConfig: makeBaseConfig(),
        taskContext: { workspaceRoot: '/project' },
        outputDir: '/tmp/results',
        isolation: 'workspace-root',
      },
      factory,
    );

    await runner.runAll();

    expect(factory.sessions[0]?.contexts[0]?.workspaceRoot).toBe(
      '/tmp/results/Workspace-Isolation/baseline/run-0',
    );
  });

  it('emits variant_error, preserves collected metrics, and disposes on execute failure', async () => {
    const factory = new MockFactory(() => new MockSession(() => failingEvents(new Error('boom'))));
    const runner = new ExperimentRunner(
      {
        name: 'Failure',
        taskPrompt: 'prompt',
        variants: [BASELINE],
        baseSessionConfig: makeBaseConfig(),
      },
      factory,
    );

    const emitted = [];
    for await (const event of runner.run()) {
      emitted.push(event);
    }

    expect(emitted.map((event) => event.type)).toEqual([
      'variant_start',
      'variant_error',
      'experiment_complete',
    ]);
    expect(factory.sessions[0]?.dispose).toHaveBeenCalledOnce();
    const final = emitted.at(-1);
    expect(final?.type).toBe('experiment_complete');
    if (final?.type === 'experiment_complete') {
      expect(final.result.variants[0]?.runs[0]?.error).toBe('boom');
    }
  });

  it('times out slow variants and disposes their sessions', async () => {
    vi.useFakeTimers();
    try {
      const factory = new MockFactory(
        () =>
          new MockSession(async function* () {
            await new Promise((resolve) => setTimeout(resolve, 10_000));
            yield { type: 'done', content: 'late' };
          }),
      );
      const runner = new ExperimentRunner(
        {
          name: 'Timeout',
          taskPrompt: 'prompt',
          variants: [BASELINE],
          baseSessionConfig: makeBaseConfig(),
          variantTimeoutMs: 50,
        },
        factory,
      );

      const runPromise = runner.runAll();
      await vi.advanceTimersByTimeAsync(51);
      const result = await runPromise;

      expect(result.variants[0]?.runs[0]?.success).toBe(false);
      expect(result.variants[0]?.runs[0]?.error).toBe('Variant timed out after 50ms');
      expect(factory.sessions[0]?.dispose).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
