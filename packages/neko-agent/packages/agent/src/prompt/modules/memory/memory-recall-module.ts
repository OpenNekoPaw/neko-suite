/**
 * MemoryRecallModule — projects per-turn memory recall results into the
 * ephemeral layer.
 *
 * Unlike the project memory module which is event-driven, recall is triggered
 * per turn by the AgentSession runtime. The caller performs the
 * relevance-scored lookup and passes the already-formatted content string to
 * `setContent(...)`.
 *
 * The module does no recall I/O itself — it is a pure projection. This keeps
 * the expensive memory-search pipeline in one place (the runtime caller) and
 * avoids duplicating it inside render.
 */
import type {
  PromptModule,
  PromptModuleManifest,
  PromptModuleSection,
} from '../../registry/module-manifest';

export class MemoryRecallModule implements PromptModule {
  readonly manifest: PromptModuleManifest = {
    id: 'memory.recall',
    layers: ['ephemeral'],
    requires: [],
    priority: 40,
    cost: 'cheap',
  };

  private _content: string | null = null;

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

  /** Sync variant — see MemoryProjectModule.renderSync. */
  renderSync(): readonly PromptModuleSection[] | null {
    if (!this._content) return null;
    return [
      {
        sectionId: 'memory:recall',
        layer: 'ephemeral',
        content: `## Recalled Memories\n\n${this._content}`,
        priority: 40,
      },
    ];
  }
}
