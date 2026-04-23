/**
 * MemoryGlobalModule — projects global (cross-project) memory content into
 * the environment layer.
 *
 * Structurally identical to MemoryProjectModule; the two are separate because
 * project and global memories have distinct sources (ProjectMemoryManager vs
 * GlobalMemoryManager) and distinct priorities (project overrides global when
 * both are present, matching the legacy 60 / 50 ordering).
 */
import type {
  PromptModule,
  PromptModuleManifest,
  PromptModuleSection,
} from '../../registry/module-manifest';

export class MemoryGlobalModule implements PromptModule {
  readonly manifest: PromptModuleManifest = {
    id: 'memory.global',
    layers: ['environment'],
    requires: [],
    priority: 50,
    cost: 'free',
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
        sectionId: 'memory:global',
        layer: 'environment',
        content: `## Global Memory\n\n${this._content}`,
        priority: 50,
      },
    ];
  }
}
