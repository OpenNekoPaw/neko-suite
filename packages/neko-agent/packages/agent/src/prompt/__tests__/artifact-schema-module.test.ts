/**
 * Tests for ArtifactSchemaModule — the L1 schema-layer module extracted
 * from creation-persona.ts in PR3c.
 */
import { describe, it, expect } from 'vitest';
import { ArtifactSchemaModule } from '../modules/schema/artifact-schema-module';
import { freezePromptContext, type PromptContext } from '../context';

function makeCtx(overrides: Partial<PromptContext> = {}): PromptContext {
  return freezePromptContext({
    runId: null,
    stage: null,
    locale: 'en',
    projectPath: '',
    activeSkillName: null,
    activeTools: [],
    ...overrides,
  });
}

describe('ArtifactSchemaModule', () => {
  it('returns null when no runId is set', async () => {
    const mod = new ArtifactSchemaModule();
    expect(await mod.render(makeCtx())).toBeNull();
    expect(mod.renderSync(makeCtx())).toBeNull();
  });

  it('projects a single schema-layer section when runId is present', () => {
    const mod = new ArtifactSchemaModule();
    const sections = mod.renderSync(makeCtx({ runId: 'tiktok-001' }));
    expect(sections).toHaveLength(1);
    const section = sections![0]!;
    expect(section.sectionId).toBe('artifact-schema');
    expect(section.layer).toBe('schema');
    expect(section.priority).toBe(50);
  });

  it('substitutes {runId} into all three artifact paths', () => {
    const mod = new ArtifactSchemaModule();
    const sections = mod.renderSync(makeCtx({ runId: 'abc-123' }));
    const content = sections![0]!.content;
    expect(content).toContain('.neko/drafts/draft-abc-123.md');
    expect(content).toContain('.neko/plans/plan-abc-123.md');
    expect(content).toContain('.neko/tasks/task-abc-123.md');
    expect(content).not.toContain('{runId}');
  });

  it('keeps the literal `{runId}` in the UX fallback paragraph', () => {
    // The template mentions "{runId} as a literal" as guidance for the
    // agent — but after regex replacement the runId is interpolated, so
    // that guidance should NOT contain an unsubstituted placeholder
    // either. The sentence itself is preserved verbatim.
    const mod = new ArtifactSchemaModule();
    const content = mod.renderSync(makeCtx({ runId: 'r1' }))![0]!.content;
    expect(content).toContain('If you still');
    expect(content).toContain('as a literal');
  });

  it('different runIds produce different content', () => {
    const mod = new ArtifactSchemaModule();
    const s1 = mod.renderSync(makeCtx({ runId: 'foo' }))![0]!.content;
    const s2 = mod.renderSync(makeCtx({ runId: 'bar' }))![0]!.content;
    expect(s1).not.toBe(s2);
    expect(s1).toContain('draft-foo.md');
    expect(s2).toContain('draft-bar.md');
  });

  it('manifest declares schema layer + runId requirement', () => {
    const mod = new ArtifactSchemaModule();
    expect(mod.manifest.id).toBe('artifact.schema');
    expect(mod.manifest.layers).toEqual(['schema']);
    expect(mod.manifest.requires).toEqual(['runId']);
    expect(mod.manifest.priority).toBe(50);
    expect(mod.manifest.cost).toBe('free');
  });

  it('cacheKey follows runId', () => {
    const mod = new ArtifactSchemaModule();
    const cacheKey = mod.manifest.cacheKey;
    expect(cacheKey).toBeDefined();
    expect(cacheKey!(makeCtx({ runId: 'x' }))).toBe('x');
    expect(cacheKey!(makeCtx())).toBeNull();
  });

  it('render() and renderSync() produce the same sections', async () => {
    const mod = new ArtifactSchemaModule();
    const ctx = makeCtx({ runId: 'same' });
    const fromSync = mod.renderSync(ctx);
    const fromAsync = await mod.render(ctx);
    expect(fromAsync).toEqual(fromSync);
  });
});
