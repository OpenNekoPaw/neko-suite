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

  it('projects the active run into the creation-document contract without legacy paths', () => {
    const mod = new ArtifactSchemaModule();
    const sections = mod.renderSync(makeCtx({ runId: 'abc-123' }));
    const content = sections![0]!.content;
    expect(content).toContain('The active IDC run id is `abc-123`');
    expect(content).toContain('neko/creations/<creation-id>/brief.md');
    expect(content).toContain('neko/creations/<creation-id>/plan.md');
    expect(content).toContain('neko/creations/<creation-id>/checklist.md');
    expect(content).not.toContain('{runId}');
    expect(content).not.toContain('.neko/drafts');
    expect(content).not.toContain('.neko/plans');
    expect(content).not.toContain('.neko/tasks');
    expect(content).not.toContain('generic `Write` tool');
  });

  it('renders the creation-document contract in Chinese for zh locale', () => {
    const mod = new ArtifactSchemaModule();
    const content = mod.renderSync(makeCtx({ runId: 'abc-123', locale: 'zh' }))![0]!.content;

    expect(content).toContain('当前 IDC run id 是 `abc-123`');
    expect(content).toContain('创作文档契约');
    expect(content).toContain('不要自行创建、读取或修复创作文档文件');
    expect(content).not.toContain('Creation document contract');
    expect(content).not.toContain('The active IDC run id is');
  });

  it('tells the agent that persistence is host-owned', () => {
    const mod = new ArtifactSchemaModule();
    const content = mod.renderSync(makeCtx({ runId: 'r1' }))![0]!.content;
    expect(content).toContain('host creation-document service owns storage');
    expect(content).toContain('Do not create, read, or repair creation document files yourself');
  });

  it('keeps creation-document frontmatter out of normal chat replies', () => {
    const mod = new ArtifactSchemaModule();
    const content = mod.renderSync(makeCtx({ runId: 'r1' }))![0]!.content;
    expect(content).toContain('write only the human-readable artifact');
    expect(content).toContain('body in chat');
    expect(content).toContain('Do not include YAML frontmatter');
    expect(content).toContain('normal assistant replies');
    expect(content).toContain('runtime-persisted creation documents only');
  });

  it('different runIds produce different content', () => {
    const mod = new ArtifactSchemaModule();
    const s1 = mod.renderSync(makeCtx({ runId: 'foo' }))![0]!.content;
    const s2 = mod.renderSync(makeCtx({ runId: 'bar' }))![0]!.content;
    expect(s1).not.toBe(s2);
    expect(s1).toContain('`foo`');
    expect(s2).toContain('`bar`');
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
