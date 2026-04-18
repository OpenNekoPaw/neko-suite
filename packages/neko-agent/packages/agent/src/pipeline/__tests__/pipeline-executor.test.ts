import { describe, it, expect } from 'vitest';
import { PipelineExecutor } from '../pipeline-executor';
import type { IPipelineStage, IParallelStage, PipelineConfig, PipelineContext } from '../types';

// Helper: create a linear stage
function linearStage(
  name: string,
  gate: 'auto' | 'confirm' = 'auto',
  executeFn?: (ctx: PipelineContext) => Promise<PipelineContext>,
): IPipelineStage {
  return {
    name,
    type: 'linear',
    gate,
    execute: executeFn ?? (async (ctx) => ({ ...ctx, [`${name}_done`]: true })),
  };
}

// Helper: create a parallel stage
function parallelStage(name: string, taskCount: number): IParallelStage {
  return {
    name,
    type: 'parallel',
    gate: 'auto',
    execute: async (ctx) => ctx,
    tasks: () =>
      Array.from({ length: taskCount }, (_, i) => ({
        id: `task-${i}`,
        name: `Task ${i}`,
        execute: async () => ({ id: `task-${i}`, success: true, data: { path: `/out/${i}.mp4` } }),
      })),
    merge: (ctx, results) => ({
      ...ctx,
      generatedPaths: results.map((r) => (r.data as { path: string })?.path ?? ''),
    }),
  };
}

function defaultConfig(overrides?: Partial<PipelineConfig>): PipelineConfig {
  return { flowId: 'flowF', ...overrides };
}

describe('PipelineExecutor', () => {
  it('should execute linear stages sequentially', async () => {
    const executor = new PipelineExecutor();
    const stages = [linearStage('a'), linearStage('b'), linearStage('c')];

    const handle = executor.execute(stages, defaultConfig(), {});
    const result = await handle.result;

    expect(result['a_done']).toBe(true);
    expect(result['b_done']).toBe(true);
    expect(result['c_done']).toBe(true);
  });

  it('should skip stages in skipStages', async () => {
    const executor = new PipelineExecutor();
    const stages = [linearStage('a'), linearStage('b'), linearStage('c')];

    const handle = executor.execute(stages, defaultConfig({ skipStages: ['b'] }), {});
    const result = await handle.result;

    expect(result['a_done']).toBe(true);
    expect(result['b_done']).toBeUndefined();
    expect(result['c_done']).toBe(true);
  });

  it('should emit pipeline_start and pipeline_complete events', async () => {
    const executor = new PipelineExecutor();
    const stages = [linearStage('a')];

    const handle = executor.execute(stages, defaultConfig(), {});
    const events = [];
    for await (const event of handle.events) {
      events.push(event);
    }

    expect(events[0]?.type).toBe('pipeline_start');
    expect(events[events.length - 1]?.type).toBe('pipeline_complete');
  });

  it('should emit stage_skipped for skipped stages', async () => {
    const executor = new PipelineExecutor();
    const stages = [linearStage('a'), linearStage('b')];

    const handle = executor.execute(stages, defaultConfig({ skipStages: ['a'] }), {});
    const events = [];
    for await (const event of handle.events) {
      events.push(event);
    }

    const skipped = events.find((e) => e.type === 'stage_skipped');
    expect(skipped).toBeDefined();
    expect((skipped as { stage: string }).stage).toBe('a');
  });

  it('should pause at confirm gate and resume on confirm', async () => {
    const executor = new PipelineExecutor();
    const stages = [linearStage('pre'), linearStage('gated', 'confirm'), linearStage('post')];

    const handle = executor.execute(stages, defaultConfig(), {});

    // Consume events until gate_waiting
    const events = [];
    for await (const event of handle.events) {
      events.push(event);
      if (event.type === 'gate_waiting') {
        // Confirm the gate
        handle.confirmGate({ extraData: 'injected' });
      }
      if (event.type === 'pipeline_complete') break;
    }

    const result = await handle.result;
    expect(result['pre_done']).toBe(true);
    expect(result['gated_done']).toBe(true);
    expect(result['post_done']).toBe(true);
    expect(result['extraData']).toBe('injected');
  });

  it('should cancel pipeline at gate when cancelGate is called', async () => {
    const executor = new PipelineExecutor();
    const stages = [linearStage('pre'), linearStage('gated', 'confirm'), linearStage('post')];

    const handle = executor.execute(stages, defaultConfig(), {});

    // Wait for gate then cancel
    for await (const event of handle.events) {
      if (event.type === 'gate_waiting') {
        handle.cancelGate();
        break;
      }
    }

    await expect(handle.result).rejects.toThrow('cancelled at gate');
  });

  it('should execute parallel stages and merge results', async () => {
    const executor = new PipelineExecutor();
    const stages = [parallelStage('batch', 3)];

    const handle = executor.execute(stages, defaultConfig(), {});
    const result = await handle.result;

    expect(result['generatedPaths']).toHaveLength(3);
    expect(result['generatedPaths']).toEqual(['/out/0.mp4', '/out/1.mp4', '/out/2.mp4']);
  });

  it('should apply globalStyle from config', async () => {
    const executor = new PipelineExecutor();
    const stages = [
      linearStage('check', 'auto', async (ctx) => {
        expect(ctx.globalStyle).toBe('anime');
        return ctx;
      }),
    ];

    const handle = executor.execute(stages, defaultConfig({ globalStyle: 'anime' }), {});
    await handle.result;
  });

  it('should apply stageParams from config', async () => {
    const executor = new PipelineExecutor();
    const stages = [
      linearStage('check', 'auto', async (ctx) => {
        expect(ctx.stageParams?.['myStage']?.['key']).toBe('value');
        return ctx;
      }),
    ];

    const handle = executor.execute(
      stages,
      defaultConfig({ stageParams: { myStage: { key: 'value' } } }),
      {},
    );
    await handle.result;
  });

  it('should throw for reactive stages (not implemented)', async () => {
    const executor = new PipelineExecutor();
    const reactiveStage: IPipelineStage = {
      name: 'reactive',
      type: 'reactive',
      gate: 'auto',
      execute: async (ctx) => ctx,
    };

    const handle = executor.execute([reactiveStage], defaultConfig(), {});
    await expect(handle.result).rejects.toThrow('ReactiveStage not implemented');
  });

  it('should handle stage execution errors', async () => {
    const executor = new PipelineExecutor();
    const stages = [
      linearStage('fail', 'auto', async () => {
        throw new Error('Stage failed');
      }),
    ];

    const handle = executor.execute(stages, defaultConfig(), {});
    await expect(handle.result).rejects.toThrow('Stage failed');
  });

  it('should pause at a userCheckpoint even when the stage gate is auto', async () => {
    const executor = new PipelineExecutor();
    const stages = [linearStage('pre'), linearStage('gated', 'auto'), linearStage('post')];

    const handle = executor.execute(stages, defaultConfig({ userCheckpoints: ['gated'] }), {});

    let paused = false;
    for await (const event of handle.events) {
      if (event.type === 'gate_waiting') {
        paused = true;
        expect(event.stage).toBe('gated');
        handle.confirmGate();
      }
      if (event.type === 'pipeline_complete') break;
    }

    expect(paused).toBe(true);
    const result = await handle.result;
    expect(result['post_done']).toBe(true);
  });

  it('should not pause when userCheckpoint stage was skipped', async () => {
    const executor = new PipelineExecutor();
    const stages = [linearStage('a'), linearStage('b')];

    const handle = executor.execute(
      stages,
      defaultConfig({ userCheckpoints: ['a'], skipStages: ['a'] }),
      {},
    );

    const result = await handle.result;
    expect(result['a_done']).toBeUndefined();
    expect(result['b_done']).toBe(true);
  });

  it('should cancel pipeline mid-execution', async () => {
    const executor = new PipelineExecutor();
    const stages = [
      linearStage('a'),
      linearStage('slow', 'auto', async (ctx) => {
        await new Promise((r) => setTimeout(r, 100));
        return ctx;
      }),
      linearStage('b'),
    ];

    const handle = executor.execute(stages, defaultConfig(), {});

    // Cancel after first stage
    setTimeout(() => handle.cancel(), 10);

    await expect(handle.result).rejects.toThrow('cancelled');
  });
});
