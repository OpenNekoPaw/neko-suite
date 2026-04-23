/**
 * ModuleOrchestrator — bridges PromptModuleRegistry, PromptSectionCache, and
 * SystemPromptComposer.
 *
 * Responsibilities:
 * - Skip modules whose `manifest.requires` fields are null/undefined in ctx.
 * - Consult the section cache before invoking render; populate it on miss.
 * - Translate emitted PromptModuleSection[] into composer.setSection(...) calls.
 * - Track which section ids were last written by each module so that subsequent
 *   renders remove stale sections without touching other writers.
 *
 * The orchestrator does NOT auto-discover modules or infer when to apply — callers
 * invoke `applyAll(ctx)` or `applyOne(module, ctx)` at the moments they consider
 * prompt state to be potentially stale (skill switch, stage transition, etc.).
 *
 * Coexists with existing `composer.setSection(...)` callers: sections written by
 * modules use ids tracked in `_ownedByModule` and removed only by the orchestrator;
 * sections written directly by legacy callers are untouched.
 */
import type { ISystemPromptComposer } from '../system-prompt-composer-types';
import type { PromptContext } from '../context';
import type { PromptModule, PromptModuleSection } from '../registry/module-manifest';
import type { PromptModuleRegistry } from '../registry/module-registry';
import type { PromptSectionCache } from '../registry/section-cache';

export class ModuleOrchestrator {
  private readonly _registry: PromptModuleRegistry;
  private readonly _composer: ISystemPromptComposer;
  private readonly _cache: PromptSectionCache;

  /** Tracks which section ids each module last wrote, so we can clean them up. */
  private readonly _ownedByModule = new Map<string, Set<string>>();

  constructor(
    registry: PromptModuleRegistry,
    composer: ISystemPromptComposer,
    cache: PromptSectionCache,
  ) {
    this._registry = registry;
    this._composer = composer;
    this._cache = cache;
  }

  /**
   * Invoke applyOne for every registered module, serially.
   * Returns after all modules have either rendered or been skipped.
   */
  async applyAll(ctx: PromptContext): Promise<void> {
    for (const module of this._registry.all()) {
      await this.applyOne(module, ctx);
    }
  }

  /**
   * Render a single module and sync its sections into the composer.
   *
   * Flow:
   * 1. If any `manifest.requires` field is null/undefined in ctx → clear owned
   *    sections and return.
   * 2. Consult cache by `manifest.cacheKey?.(ctx)`. Cache hit → reuse sections.
   * 3. Cache miss → `module.render(ctx)`, populate cache if keyed.
   * 4. Remove any previously-owned sections, then write the new ones.
   */
  async applyOne(module: PromptModule, ctx: PromptContext): Promise<void> {
    const { manifest } = module;

    // 1. Requirements check.
    if (this._missesRequirements(manifest.requires, ctx)) {
      this._clearOwned(manifest.id);
      return;
    }

    // 2 + 3. Cache lookup or render.
    const key = manifest.cacheKey?.(ctx) ?? null;
    let sections: readonly PromptModuleSection[] | null = null;

    if (key !== null) {
      sections = this._cache.get(key) ?? null;
    }

    if (sections === null) {
      const result = await module.render(ctx);
      sections = result ?? null;
      if (key !== null && sections !== null) {
        this._cache.set(key, sections);
      }
    }

    // 4. Swap: remove old owned sections, write new ones.
    this._clearOwned(manifest.id);
    if (sections === null || sections.length === 0) return;

    const newlyOwned = new Set<string>();
    for (const section of sections) {
      // Ensure the emitted layer is actually declared by the manifest.
      if (!manifest.layers.includes(section.layer)) {
        throw new Error(
          `ModuleOrchestrator: module '${manifest.id}' emitted layer ` +
            `'${section.layer}' not declared in manifest.layers ` +
            `[${manifest.layers.join(', ')}]`,
        );
      }
      this._composer.setSection({
        id: section.sectionId,
        layer: section.layer,
        content: section.content,
        priority: section.priority ?? manifest.priority,
        ...(section.cacheControl && { cacheControl: section.cacheControl }),
      });
      newlyOwned.add(section.sectionId);
    }
    this._ownedByModule.set(manifest.id, newlyOwned);
  }

  /**
   * Explicitly clear all sections owned by a module (e.g. on module unregister).
   */
  clearModule(moduleId: string): void {
    this._clearOwned(moduleId);
  }

  /**
   * Drop all ownership tracking (e.g. on session reset). Sections already in the
   * composer are not touched — caller should also reset() the composer if needed.
   */
  reset(): void {
    this._ownedByModule.clear();
    this._cache.clear();
  }

  // --- Internal helpers ---

  private _missesRequirements(
    requires: readonly (keyof PromptContext)[],
    ctx: PromptContext,
  ): boolean {
    for (const key of requires) {
      const value = ctx[key];
      if (value === null || value === undefined) return true;
    }
    return false;
  }

  private _clearOwned(moduleId: string): void {
    const owned = this._ownedByModule.get(moduleId);
    if (!owned || owned.size === 0) return;
    for (const id of owned) {
      this._composer.removeSection(id);
    }
    this._ownedByModule.delete(moduleId);
  }
}
