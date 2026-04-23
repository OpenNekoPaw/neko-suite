/**
 * SkillInjectionModule — reference PromptModule implementation wrapping the
 * prompt-section responsibility currently held by SkillInjectionCoordinator
 * (Track A). This is the first concrete Module and proves the interface shape
 * against a real writer.
 *
 * PR1 scope: the module exists as a reference implementation with unit tests
 * that confirm its output byte-for-byte matches the legacy `composer.setSection`
 * call in SkillInjectionCoordinator. It is NOT yet wired into the coordinator's
 * runtime path — that migration happens in PR2 together with the other five
 * setSection writers so that the whole prompt layer switches over atomically.
 *
 * Why not async I/O: the module's render() is a pure projection of the stored
 * SkillInjection + ctx; it performs no I/O. The PromptModule interface marks
 * render as async for future-proofing, but implementations may return sync.
 */
import type { SkillInjection } from '@neko/shared';
import type { PromptContext } from '../../context';
import type {
  PromptModule,
  PromptModuleManifest,
  PromptModuleSection,
} from '../../registry/module-manifest';

/**
 * Public state the coordinator will mutate: the currently-active injection, or
 * null when no skill is active.
 */
export class SkillInjectionModule implements PromptModule {
  /** Static manifest — priority mirrors the legacy `priority: 50` in the coordinator. */
  readonly manifest: PromptModuleManifest = {
    id: 'skill.injection',
    layers: ['skill'],
    requires: ['activeSkillName'],
    priority: 50,
    cost: 'free',
    // Cache key follows skill name: when the same skill stays active we reuse
    // the previously-rendered sections, avoiding repeated projection work.
    cacheKey: (ctx) => ctx.activeSkillName,
  };

  private _injection: SkillInjection | null = null;

  /**
   * Update the active injection the module will project. The coordinator calls
   * this whenever it changes active skill (apply / remove / clearActive).
   *
   * Passing null clears any held injection; a subsequent render() will return null.
   */
  setInjection(injection: SkillInjection | null): void {
    this._injection = injection;
  }

  /**
   * Current injection snapshot, primarily for tests.
   */
  getInjection(): SkillInjection | null {
    return this._injection;
  }

  /**
   * Project the stored injection into a section list, or return null when:
   * - no injection is set
   * - ctx.activeSkillName does not match the injection's name (stale ctx)
   *
   * The sectionId preserves the existing `skill:${name}` format used by
   * SkillInjectionCoordinator so a future migration produces byte-identical
   * composer output.
   */
  async render(ctx: PromptContext): Promise<readonly PromptModuleSection[] | null> {
    return this.renderSync(ctx);
  }

  /**
   * Sync variant for callers that can avoid the microtask. Used by the
   * coordinator's dual-path (PR2) so that apply() can remain synchronous.
   */
  renderSync(ctx: PromptContext): readonly PromptModuleSection[] | null {
    if (!this._injection) return null;
    if (ctx.activeSkillName !== this._injection.name) return null;
    return [
      {
        sectionId: `skill:${this._injection.name}`,
        layer: 'skill',
        content: this._injection.systemPrompt,
        priority: 50,
      },
    ];
  }
}
