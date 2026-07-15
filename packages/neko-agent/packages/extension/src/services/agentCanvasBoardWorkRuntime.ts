import type { GeneratedAsset, ImmutableCanvasWriteTarget, ResourceRef } from '@neko/shared';
import type { AgentCanvasBoardCoordinator } from './agentCanvasBoardCoordinator';
import {
  classifyAgentCanvasDelivery,
  type AgentCanvasDeliveryCandidate,
} from './agentCanvasDeliveryClassifier';

export type AgentCanvasBoardWorkKind = 'markdown' | 'media';

export interface AgentCanvasBoardWorkIntent {
  readonly kinds: ReadonlySet<AgentCanvasBoardWorkKind>;
  readonly suggestedTitle: string;
}

export interface AgentCanvasBoardWorkDiagnostic {
  readonly phase: 'resolution' | 'delivery';
  readonly conversationId: string;
  readonly message: string;
}

export interface BeginAgentCanvasBoardWorkInput {
  readonly conversationId: string;
  readonly turnId: string;
  readonly runId: string;
  readonly message: string;
  readonly activeSkillId?: string;
  readonly forceMedia?: boolean;
  readonly onDiagnostic?: (diagnostic: AgentCanvasBoardWorkDiagnostic) => void;
}

export interface AgentCanvasBoardWorkRuntimeOptions {
  readonly coordinator: Pick<AgentCanvasBoardCoordinator, 'resolveForWork' | 'deliver'>;
  readonly onDiagnostic?: (diagnostic: AgentCanvasBoardWorkDiagnostic) => void;
}

interface AgentCanvasBoardRunState {
  target: ImmutableCanvasWriteTarget;
  delivery: Promise<void>;
}

export class AgentCanvasBoardWorkSession {
  constructor(
    private readonly options: AgentCanvasBoardWorkRuntimeOptions,
    private readonly state: AgentCanvasBoardRunState,
    private readonly intent: AgentCanvasBoardWorkIntent,
    private readonly taskId?: string,
  ) {}

  forTask(taskId: string): AgentCanvasBoardWorkSession {
    if (!taskId.trim()) {
      throw new Error('Canvas Board task binding requires a non-empty taskId.');
    }
    return new AgentCanvasBoardWorkSession(this.options, this.state, this.intent, taskId);
  }

  supports(kind: AgentCanvasBoardWorkKind): boolean {
    return this.intent.kinds.has(kind);
  }

  async deliverMarkdown(input: {
    readonly messageId: string;
    readonly markdown: string;
    readonly title?: string;
  }): Promise<void> {
    if (!this.supports('markdown')) return;
    await this.deliverCandidate(
      {
        kind: 'markdown',
        artifactId: input.messageId,
        title: input.title ?? this.intent.suggestedTitle,
        markdown: input.markdown,
        creatorUseful: true,
      },
      input.messageId,
    );
  }

  async deliverGeneratedAssets(taskId: string, assets: readonly GeneratedAsset[]): Promise<void> {
    if (!this.supports('media') || assets.length === 0) return;
    const taskSession = this.forTask(taskId);
    for (const asset of assets) {
      const mediaKind = toCanvasMediaKind(asset.type);
      const resourceRef = asset.lifecycle?.resourceRef;
      await taskSession.deliverCandidate(
        {
          kind: 'generated-output',
          artifactId: `${asset.id}:${asset.lifecycle?.revision ?? 'missing-revision'}`,
          title: asset.prompt?.trim() || generatedAssetTitle(mediaKind),
          mediaKind,
          reviewable: true,
          ...(resourceRef ? { resourceRef } : {}),
        },
        taskId,
      );
    }
  }

  async deliverSelectedReferences(
    references: readonly {
      readonly id: string;
      readonly title: string;
      readonly resourceRef: ResourceRef;
    }[],
  ): Promise<void> {
    for (const reference of references) {
      await this.deliverCandidate(
        {
          kind: 'selected-reference',
          artifactId: reference.id,
          title: reference.title,
          selected: true,
          resourceRef: reference.resourceRef,
        },
        reference.id,
      );
    }
  }

  private deliverCandidate(
    candidate: AgentCanvasDeliveryCandidate,
    sourceId: string,
  ): Promise<void> {
    const classification = classifyAgentCanvasDelivery(candidate);
    if (!classification.eligible) {
      if (
        candidate.kind === 'generated-output' &&
        classification.reason === 'missing-stable-reference'
      ) {
        this.options.onDiagnostic?.({
          phase: 'delivery',
          conversationId: this.state.target.conversationId,
          message: `Generated output ${candidate.artifactId} was retained by its media task but could not be added to the Board because its stable resource identity is missing.`,
        });
      }
      return Promise.resolve();
    }

    const operation = this.state.delivery.then(async () => {
      const target: ImmutableCanvasWriteTarget = {
        ...this.state.target,
        ...(this.taskId ? { taskId: this.taskId } : {}),
      };
      let result;
      try {
        result = await this.options.coordinator.deliver({
          target,
          artifactId: classification.artifactId,
          artifact: classification.artifact,
          sourceId,
        });
      } catch (error) {
        this.options.onDiagnostic?.({
          phase: 'delivery',
          conversationId: target.conversationId,
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      if (result.status === 'blocked') {
        this.options.onDiagnostic?.({
          phase: 'delivery',
          conversationId: target.conversationId,
          message:
            result.diagnostics.map((diagnostic) => diagnostic.message).join('; ') ||
            'Canvas Board delivery was blocked.',
        });
        return;
      }
      if (result.revision) {
        this.state.target = { ...this.state.target, revision: result.revision };
      }
    });
    this.state.delivery = operation.catch(() => undefined);
    return operation;
  }
}

export class AgentCanvasBoardWorkRuntime {
  constructor(private readonly options: AgentCanvasBoardWorkRuntimeOptions) {}

  async begin(
    input: BeginAgentCanvasBoardWorkInput,
  ): Promise<AgentCanvasBoardWorkSession | undefined> {
    const intent = classifyAgentCanvasBoardWorkIntent(input);
    if (!intent) return undefined;

    const sessionOptions: AgentCanvasBoardWorkRuntimeOptions = {
      ...this.options,
      onDiagnostic: input.onDiagnostic ?? this.options.onDiagnostic,
    };
    let result;
    try {
      result = await this.options.coordinator.resolveForWork({
        conversationId: input.conversationId,
        turnId: input.turnId,
        runId: input.runId,
        suggestedTitle: intent.suggestedTitle,
      });
    } catch (error) {
      sessionOptions.onDiagnostic?.({
        phase: 'resolution',
        conversationId: input.conversationId,
        message: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
    if (result.status !== 'resolved' || !result.target) {
      sessionOptions.onDiagnostic?.({
        phase: 'resolution',
        conversationId: input.conversationId,
        message:
          result.diagnostics.map((diagnostic) => diagnostic.message).join('; ') ||
          'Canvas Board target resolution was blocked.',
      });
      return undefined;
    }

    return new AgentCanvasBoardWorkSession(
      sessionOptions,
      { target: result.target, delivery: Promise.resolve() },
      intent,
    );
  }
}

export function classifyAgentCanvasBoardWorkIntent(
  input: Pick<BeginAgentCanvasBoardWorkInput, 'message' | 'activeSkillId' | 'forceMedia'>,
): AgentCanvasBoardWorkIntent | undefined {
  const message = input.message.trim();
  const normalized = message.toLocaleLowerCase();
  const activeSkill = input.activeSkillId?.toLocaleLowerCase() ?? '';
  const kinds = new Set<AgentCanvasBoardWorkKind>();

  if (input.forceMedia || hasMediaCreationIntent(normalized)) {
    kinds.add('media');
  }
  if (
    hasMarkdownCreationIntent(normalized) ||
    /storyboard|分镜|剧本|脚本|文档|创作/.test(activeSkill)
  ) {
    kinds.add('markdown');
  }
  if (kinds.size === 0) return undefined;

  return {
    kinds,
    suggestedTitle: createSuggestedBoardTitle(message),
  };
}

function hasMediaCreationIntent(message: string): boolean {
  const action =
    /(?:生成|创作|制作|绘制|画|设计|合成|配音|谱曲|generate|create|make|draw|render|compose)/;
  const media =
    /(?:图片|图像|插画|海报|视频|动画|音频|音乐|歌曲|配音|image|illustration|poster|video|animation|audio|music|song|voice)/;
  return action.test(message) && media.test(message);
}

function hasMarkdownCreationIntent(message: string): boolean {
  const action =
    /(?:写|撰写|生成|创作|创建|制作|规划|策划|分析|整理|改写|扩写|write|draft|create|generate|plan|outline|analy[sz]e|rewrite)/;
  const document =
    /(?:分镜|故事板|剧本|脚本|文档|大纲|角色设定|人物设定|场景设定|创作方案|拍摄方案|storyboard|script|screenplay|document|outline|character\s*(?:profile|sheet)|scene\s*(?:plan|notes?))/;
  return action.test(message) && document.test(message);
}

function createSuggestedBoardTitle(message: string): string {
  const compact = message
    .replace(/\s+/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '-')
    .trim();
  return compact.slice(0, 48) || '创作画布';
}

function toCanvasMediaKind(type: GeneratedAsset['type']): 'image' | 'audio' | 'video' {
  if (type === 'generated-audio') return 'audio';
  if (type === 'generated-video') return 'video';
  return 'image';
}

function generatedAssetTitle(kind: 'image' | 'audio' | 'video'): string {
  if (kind === 'audio') return 'Generated Audio';
  if (kind === 'video') return 'Generated Video';
  return 'Generated Image';
}
