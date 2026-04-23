/**
 * Tests for PromptContext freezing + lazy accessor behaviour.
 */
import { describe, it, expect } from 'vitest';
import {
  createPromptContextProvider,
  freezePromptContext,
  type PromptContext,
  type PromptContextSources,
} from '../context';

function makeMinimalCtx(overrides: Partial<PromptContext> = {}): PromptContext {
  const base: PromptContext = {
    runId: null,
    stage: null,
    locale: 'en',
    projectPath: '/tmp/proj',
    activeSkillName: null,
    activeTools: [],
  };
  return { ...base, ...overrides };
}

describe('freezePromptContext', () => {
  it('returns an object with the same values', () => {
    const ctx = freezePromptContext(makeMinimalCtx({ runId: 'r1', locale: 'zh' }));
    expect(ctx.runId).toBe('r1');
    expect(ctx.locale).toBe('zh');
  });

  it('freezes the returned object', () => {
    const ctx = freezePromptContext(makeMinimalCtx());
    expect(Object.isFrozen(ctx)).toBe(true);
  });

  it('mutation of a frozen context throws in strict mode', () => {
    const ctx = freezePromptContext(makeMinimalCtx());
    expect(() => {
      (ctx as unknown as { runId: string }).runId = 'mutated';
    }).toThrow();
  });

  it('lazy accessors are preserved on the frozen object', async () => {
    let calls = 0;
    const ctx = freezePromptContext(
      makeMinimalCtx({
        memoryRecall: async () => {
          calls += 1;
          return 'recalled';
        },
      }),
    );
    expect(calls).toBe(0);
    const recalled = await ctx.memoryRecall?.();
    expect(recalled).toBe('recalled');
    expect(calls).toBe(1);
  });
});

describe('createPromptContextProvider', () => {
  function makeSources(overrides: Partial<PromptContextSources> = {}): PromptContextSources {
    return {
      getRunId: () => null,
      getStage: () => null,
      getActiveSkillName: () => null,
      getActiveTools: () => [],
      getLocale: () => 'en',
      getProjectPath: () => '/tmp/p',
      ...overrides,
    };
  }

  it('returns a frozen snapshot on every call', () => {
    const provider = createPromptContextProvider(makeSources());
    const ctx = provider();
    expect(Object.isFrozen(ctx)).toBe(true);
  });

  it('pulls each required field from its accessor', () => {
    const provider = createPromptContextProvider({
      getRunId: () => 'run-1',
      getStage: () => 'draft',
      getActiveSkillName: () => 'creation-persona',
      getActiveTools: () => ['Read', 'Write'],
      getLocale: () => 'zh',
      getProjectPath: () => '/Users/me/proj',
    });
    const ctx = provider();
    expect(ctx.runId).toBe('run-1');
    expect(ctx.stage).toBe('draft');
    expect(ctx.activeSkillName).toBe('creation-persona');
    expect(ctx.activeTools).toEqual(['Read', 'Write']);
    expect(ctx.locale).toBe('zh');
    expect(ctx.projectPath).toBe('/Users/me/proj');
  });

  it('omits optional fields when their accessors are not provided', () => {
    const provider = createPromptContextProvider(makeSources());
    const ctx = provider();
    expect('mediaLibrary' in ctx).toBe(false);
    expect('memoryRecall' in ctx).toBe(false);
    expect('artifactIssues' in ctx).toBe(false);
  });

  it('includes optional fields only when their accessors return a value', () => {
    const provider = createPromptContextProvider(
      makeSources({
        getMediaLibrary: () => '/lib',
        getMemoryRecall: () => async () => 'recall',
      }),
    );
    const ctx = provider();
    expect(ctx.mediaLibrary).toBe('/lib');
    expect(ctx.memoryRecall).toBeDefined();
    expect('artifactIssues' in ctx).toBe(false);
  });

  it('re-reads accessors each call (supports live session state)', () => {
    let stage: 'draft' | 'plan' | 'apply' = 'draft';
    const provider = createPromptContextProvider(makeSources({ getStage: () => stage }));
    expect(provider().stage).toBe('draft');
    stage = 'plan';
    expect(provider().stage).toBe('plan');
    stage = 'apply';
    expect(provider().stage).toBe('apply');
  });

  it('mediaLibrary accessor returning undefined omits the key', () => {
    const provider = createPromptContextProvider(makeSources({ getMediaLibrary: () => undefined }));
    const ctx = provider();
    expect('mediaLibrary' in ctx).toBe(false);
  });
});
