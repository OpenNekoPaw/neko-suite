/**
 * Tests for SkillInjectionModule — the reference PromptModule implementation.
 *
 * Critical invariant: the module's output must be byte-for-byte identical to
 * what SkillInjectionCoordinator's legacy composer.setSection call produces.
 * When PR2 migrates the coordinator, this equivalence guarantees zero diff in
 * the composed system prompt.
 */
import { describe, it, expect } from 'vitest';
import { SkillInjectionModule } from '../modules/skill/skill-injection-module';
import { SystemPromptComposer } from '../system-prompt-composer';
import type { PromptContext } from '../context';
import type { SkillInjection } from '@neko/shared';

function makeCtx(overrides: Partial<PromptContext> = {}): PromptContext {
  return {
    runId: null,
    stage: null,
    locale: 'en',
    projectPath: '/tmp/p',
    activeSkillName: null,
    activeTools: [],
    ...overrides,
  };
}

function makeInjection(overrides: Partial<SkillInjection> = {}): SkillInjection {
  return {
    name: 'test-skill',
    systemPrompt: 'SKILL_PROMPT_CONTENT',
    allowedTools: undefined,
    ...overrides,
  };
}

describe('SkillInjectionModule', () => {
  it('returns null when no injection is set', async () => {
    const mod = new SkillInjectionModule();
    expect(await mod.render(makeCtx())).toBeNull();
    expect(mod.renderSync(makeCtx())).toBeNull();
  });

  it('returns null when ctx.activeSkillName does not match', async () => {
    const mod = new SkillInjectionModule();
    mod.setInjection(makeInjection({ name: 'a' }));
    const result = await mod.render(makeCtx({ activeSkillName: 'b' }));
    expect(result).toBeNull();
  });

  it('renders a single section matching the legacy coordinator format', async () => {
    const mod = new SkillInjectionModule();
    mod.setInjection(makeInjection({ name: 'commit-helper', systemPrompt: 'HELP' }));
    const sections = await mod.render(makeCtx({ activeSkillName: 'commit-helper' }));
    expect(sections).toEqual([
      {
        sectionId: 'skill:commit-helper',
        layer: 'skill',
        content: 'HELP',
        priority: 50,
      },
    ]);
  });

  it('setting null clears the injection', async () => {
    const mod = new SkillInjectionModule();
    mod.setInjection(makeInjection());
    mod.setInjection(null);
    expect(await mod.render(makeCtx({ activeSkillName: 'test-skill' }))).toBeNull();
  });

  it('getInjection reflects current state', () => {
    const mod = new SkillInjectionModule();
    expect(mod.getInjection()).toBeNull();
    const inj = makeInjection({ name: 'foo' });
    mod.setInjection(inj);
    expect(mod.getInjection()).toBe(inj);
  });

  it('manifest declares the skill layer and requires activeSkillName', () => {
    const mod = new SkillInjectionModule();
    expect(mod.manifest.id).toBe('skill.injection');
    expect(mod.manifest.layers).toEqual(['skill']);
    expect(mod.manifest.requires).toEqual(['activeSkillName']);
  });

  it('cacheKey follows activeSkillName', () => {
    const mod = new SkillInjectionModule();
    const cacheKey = mod.manifest.cacheKey;
    expect(cacheKey).toBeDefined();
    expect(cacheKey!(makeCtx({ activeSkillName: 'abc' }))).toBe('abc');
    expect(cacheKey!(makeCtx())).toBeNull();
  });

  it('module output, when written to composer, matches legacy setSection output', () => {
    const injection = makeInjection({
      name: 'commit-helper',
      systemPrompt: 'You are a commit message helper.',
    });

    // Path A: legacy direct setSection (mirrors current SkillInjectionCoordinator).
    const legacy = new SystemPromptComposer();
    legacy.setBase('BASE_CONTENT');
    legacy.setSection({
      id: `skill:${injection.name}`,
      layer: 'skill',
      content: injection.systemPrompt,
      priority: 50,
    });

    // Path B: Module-produced section, written via same setSection API.
    const viaModule = new SystemPromptComposer();
    viaModule.setBase('BASE_CONTENT');
    const mod = new SkillInjectionModule();
    mod.setInjection(injection);
    const sections = mod.renderSync(makeCtx({ activeSkillName: injection.name })) ?? [];
    for (const s of sections) {
      viaModule.setSection({
        id: s.sectionId,
        layer: s.layer,
        content: s.content,
        priority: s.priority ?? 50,
      });
    }

    expect(viaModule.compose()).toBe(legacy.compose());
  });
});
