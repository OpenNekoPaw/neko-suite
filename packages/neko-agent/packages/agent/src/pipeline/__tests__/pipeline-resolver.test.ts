import { describe, it, expect } from 'vitest';
import { PipelineResolver } from '../pipeline-resolver';
import { PipelineRegistry } from '../pipeline-registry';
import { PipelineExecutor } from '../pipeline-executor';
import type { Skill } from '@neko/shared';
import type { IPipelineStage, PipelineContext } from '../types';

function mockStage(name: string): IPipelineStage {
  return {
    name,
    type: 'linear',
    gate: 'auto',
    execute: async (ctx: PipelineContext) => ({ ...ctx, [`${name}_done`]: true }),
  };
}

function createSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'test-skill',
    description: 'Test skill',
    content: 'Test content',
    source: 'builtin',
    enabled: true,
    ...overrides,
  };
}

function createWiredRegistry(): PipelineRegistry {
  const registry = new PipelineRegistry();
  registry.registerStage(mockStage('readDocument'));
  registry.registerStage(mockStage('parseStoryboard'));
  registry.registerStage(mockStage('generatePrompts'));
  registry.registerStage(mockStage('batchGenerate'));
  registry.registerStage(mockStage('arrangeOnTimeline'));
  return registry;
}

describe('PipelineResolver', () => {
  describe('hasPipeline', () => {
    it('should return true for skill with pipelineFlowId', () => {
      const resolver = new PipelineResolver(new PipelineRegistry(), new PipelineExecutor());
      const skill = createSkill({ pipelineFlowId: 'flowF' });
      expect(resolver.hasPipeline(skill)).toBe(true);
    });

    it('should return false for skill without pipelineFlowId', () => {
      const resolver = new PipelineResolver(new PipelineRegistry(), new PipelineExecutor());
      const skill = createSkill();
      expect(resolver.hasPipeline(skill)).toBe(false);
    });
  });

  describe('resolve', () => {
    it('should resolve PipelineConfig from skill metadata', () => {
      const resolver = new PipelineResolver(new PipelineRegistry(), new PipelineExecutor());
      const skill = createSkill({
        pipelineFlowId: 'flowF',
        pipelineSkipStages: ['generatePrompts'],
        pipelineParams: { batchGenerate: { style: 'anime' } },
      });

      const config = resolver.resolve(skill);

      expect(config).not.toBeNull();
      expect(config!.flowId).toBe('flowF');
      expect(config!.skipStages).toEqual(['generatePrompts']);
      expect(config!.stageParams).toEqual({ batchGenerate: { style: 'anime' } });
    });

    it('should return null for skill without pipeline config', () => {
      const resolver = new PipelineResolver(new PipelineRegistry(), new PipelineExecutor());
      const skill = createSkill();
      expect(resolver.resolve(skill)).toBeNull();
    });

    it('should return null for invalid flow ID', () => {
      const resolver = new PipelineResolver(new PipelineRegistry(), new PipelineExecutor());
      const skill = createSkill({ pipelineFlowId: 'invalidFlow' });
      expect(resolver.resolve(skill)).toBeNull();
    });

    it('should accept all valid flow IDs', () => {
      const resolver = new PipelineResolver(new PipelineRegistry(), new PipelineExecutor());
      for (const flowId of ['flowA', 'flowB', 'flowC', 'flowD', 'flowE', 'flowF']) {
        const skill = createSkill({ pipelineFlowId: flowId });
        const config = resolver.resolve(skill);
        expect(config).not.toBeNull();
        expect(config!.flowId).toBe(flowId);
      }
    });
  });

  describe('startPipeline', () => {
    it('should start pipeline from skill config', async () => {
      const registry = createWiredRegistry();
      const executor = new PipelineExecutor();
      const resolver = new PipelineResolver(registry, executor);

      const skill = createSkill({ pipelineFlowId: 'flowD' }); // parseStoryboard → arrange
      const handle = resolver.startPipeline(skill, { source: 'test' });

      expect(handle.id).toBeTruthy();
      expect(handle.flowId).toBe('flowD');

      const result = await handle.result;
      expect(result['parseStoryboard_done']).toBe(true);
      expect(result['arrangeOnTimeline_done']).toBe(true);
    });

    it('should merge overrides with skill config', async () => {
      const registry = createWiredRegistry();
      const executor = new PipelineExecutor();
      const resolver = new PipelineResolver(registry, executor);

      const skill = createSkill({
        pipelineFlowId: 'flowD',
        pipelineSkipStages: ['parseStoryboard'],
      });

      const handle = resolver.startPipeline(
        skill,
        {},
        {
          skipStages: ['arrangeOnTimeline'],
        },
      );

      const result = await handle.result;
      // Both skill-level and override-level skip should apply
      expect(result['parseStoryboard_done']).toBeUndefined();
      expect(result['arrangeOnTimeline_done']).toBeUndefined();
    });

    it('should throw for skill without pipeline config', () => {
      const resolver = new PipelineResolver(new PipelineRegistry(), new PipelineExecutor());
      const skill = createSkill();
      expect(() => resolver.startPipeline(skill, {})).toThrow('no pipeline configuration');
    });
  });

  describe('startFlow', () => {
    it('should start flow directly by ID', async () => {
      const registry = createWiredRegistry();
      const executor = new PipelineExecutor();
      const resolver = new PipelineResolver(registry, executor);

      const handle = resolver.startFlow('flowD', { source: 'test' });

      expect(handle.flowId).toBe('flowD');
      const result = await handle.result;
      expect(result['parseStoryboard_done']).toBe(true);
      expect(result['arrangeOnTimeline_done']).toBe(true);
    });

    it('should apply config overrides', async () => {
      const registry = createWiredRegistry();
      const executor = new PipelineExecutor();
      const resolver = new PipelineResolver(registry, executor);

      const handle = resolver.startFlow(
        'flowD',
        {},
        {
          skipStages: ['parseStoryboard'],
          globalStyle: 'cinematic',
        },
      );

      const result = await handle.result;
      expect(result['parseStoryboard_done']).toBeUndefined();
      expect(result['globalStyle']).toBe('cinematic');
    });
  });
});
