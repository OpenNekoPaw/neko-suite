import type {
  PromptModule,
  PromptModuleManifest,
  PromptModuleSection,
} from '../../registry/module-manifest';

/**
 * FeedbackGuidanceModule — projects control-plane guidance emitted by the
 * feedback arbiter into the next turn's ephemeral prompt layer.
 *
 * The content is intentionally short-lived: AgentSession keeps it around for
 * one turn after a feedback cycle, then clears it unless a newer cycle
 * replaces it. That gives us a concrete intent -> generate -> evaluate ->
 * decide -> next-turn-control loop without permanently polluting memory.
 */
export class FeedbackGuidanceModule implements PromptModule {
  readonly manifest: PromptModuleManifest = {
    id: 'feedback.guidance',
    layers: ['ephemeral'],
    requires: [],
    priority: 45,
    cost: 'free',
    dependsOn: ['artifact.schema'],
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

  renderSync(): readonly PromptModuleSection[] | null {
    if (!this._content) {
      return null;
    }

    return [
      {
        sectionId: 'feedback-guidance',
        layer: 'ephemeral',
        content: `## Feedback Guidance\n\n${this._content}`,
        priority: 45,
      },
    ];
  }
}
