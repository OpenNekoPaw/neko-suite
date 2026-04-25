/**
 * MemoryProjectModule — projects project-level memory content into the
 * environment layer as a single section.
 *
 * Wiring: the initializer subscribes to ProjectMemoryManager.on('change')
 * and calls `setContent(...)` with the latest project memory, then triggers
 * `orchestrator.applyOne(...)`. The module itself is a pure projection —
 * it does no I/O and is event-driven.
 *
 * Equivalence with legacy path: the produced section matches the format
 * previously written directly via `composer.setSection` in
 * agent-session-initializer.ts (id `memory:project`, layer `environment`,
 * priority 60, heading `## Project Memory`).
 */
import type {
  PromptModule,
  PromptModuleManifest,
  PromptModuleSection,
} from '../../registry/module-manifest';

export class MemoryProjectModule implements PromptModule {
  readonly manifest: PromptModuleManifest = {
    id: 'memory.project',
    layers: ['environment'],
    requires: [],
    priority: 60,
    cost: 'free',
    dependsOn: ['subpackage.fragments'],
  };

  private _content: string | null = null;

  /**
   * Update the project memory content. Pass null (or whitespace-only) to
   * clear the section on next render.
   */
  setContent(content: string | null): void {
    const trimmed = content?.trim();
    this._content = trimmed ? trimmed : null;
  }

  getContent(): string | null {
    return this._content;
  }

  async render(): Promise<readonly PromptModuleSection[] | null> {
    return this.renderSync();
  }

  /**
   * Sync variant for sync-only callers (event handlers that must finish before
   * the next composer read). Identical output to render().
   */
  renderSync(): readonly PromptModuleSection[] | null {
    if (!this._content) return null;
    return [
      {
        sectionId: 'memory:project',
        layer: 'environment',
        content: `## Project Memory\n\n${this._content}`,
        priority: 60,
      },
    ];
  }
}
