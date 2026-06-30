/**
 * Integration tests for the ArtifactSchemaModule runtime activation pattern
 * used by AgentSession._syncSystemPrompt (PR3d).
 *
 * These tests don't spin up a full AgentSession — instead they mirror the
 * exact sync pattern the session uses (removeSection → renderSync → write
 * new section) so we can verify the "run active / no run / transition /
 * idempotence" semantics in isolation.
 */
import { describe, it, expect } from 'vitest';
import { SystemPromptComposer } from '../system-prompt-composer';
import { ArtifactSchemaModule } from '../modules/schema/artifact-schema-module';
import { freezePromptContext, type PromptContext } from '../context';

function makeCtx(runId: string | null): PromptContext {
  return freezePromptContext({
    runId,
    stage: null,
    locale: 'en',
    projectPath: '',
    activeSkillName: null,
    activeTools: [],
  });
}

/**
 * Mirror the block AgentSession._syncSystemPrompt runs for the schema
 * module: clear the old section, renderSync with current ctx, write any
 * resulting sections back into the composer.
 */
function syncSchema(
  composer: SystemPromptComposer,
  mod: ArtifactSchemaModule,
  ctx: PromptContext,
): void {
  composer.removeSection('artifact-schema');
  const sections = mod.renderSync(ctx);
  if (!sections) return;
  for (const s of sections) {
    composer.setSection({
      id: s.sectionId,
      layer: s.layer,
      content: s.content,
      priority: s.priority ?? 50,
      ...(s.cacheControl && { cacheControl: s.cacheControl }),
    });
  }
}

describe('ArtifactSchemaModule runtime activation pattern', () => {
  it('writes the schema section into the composer when ctx has runId', () => {
    const composer = new SystemPromptComposer();
    const mod = new ArtifactSchemaModule();
    syncSchema(composer, mod, makeCtx('tiktok-001'));
    expect(composer.hasSection('artifact-schema')).toBe(true);
    const section = composer.getSection('artifact-schema');
    expect(section?.layer).toBe('schema');
    expect(section?.content).toContain('Creation document contract');
    expect(section?.content).toContain('`tiktok-001`');
    expect(section?.content).toContain('neko/creations/<creation-id>/brief.md');
    expect(section?.content).not.toContain('.neko/drafts');
  });

  it('leaves the composer untouched when ctx has no runId', () => {
    const composer = new SystemPromptComposer();
    const mod = new ArtifactSchemaModule();
    syncSchema(composer, mod, makeCtx(null));
    expect(composer.hasSection('artifact-schema')).toBe(false);
  });

  it('swaps section content when runId transitions', () => {
    const composer = new SystemPromptComposer();
    const mod = new ArtifactSchemaModule();

    syncSchema(composer, mod, makeCtx('run-A'));
    expect(composer.getSection('artifact-schema')?.content).toContain('`run-A`');

    syncSchema(composer, mod, makeCtx('run-B'));
    const swapped = composer.getSection('artifact-schema')?.content ?? '';
    expect(swapped).toContain('`run-B`');
    expect(swapped).not.toContain('`run-A`');
  });

  it('removes the section when transitioning from active run to no run', () => {
    const composer = new SystemPromptComposer();
    const mod = new ArtifactSchemaModule();

    syncSchema(composer, mod, makeCtx('run-A'));
    expect(composer.hasSection('artifact-schema')).toBe(true);

    syncSchema(composer, mod, makeCtx(null));
    expect(composer.hasSection('artifact-schema')).toBe(false);
  });

  it('repeated syncs with the same runId are idempotent', () => {
    const composer = new SystemPromptComposer();
    const mod = new ArtifactSchemaModule();
    const ctx = makeCtx('r1');

    syncSchema(composer, mod, ctx);
    const first = composer.compose();
    syncSchema(composer, mod, ctx);
    const second = composer.compose();
    expect(second).toBe(first);
  });
});
