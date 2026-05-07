import type { CodeDiff, ContentBlock, ToolCall } from '@/components/types';
import type { Plan } from '@neko-agent/types';
import {
  projectCompositeBlockRichContent,
  type CompositeRichContentProjection,
} from './composite-content-presenter';

export type ContentBlockRenderKind =
  | 'thinking'
  | 'markdown'
  | 'tool'
  | 'diff'
  | 'plan'
  | 'composite'
  | 'empty';

export type ContentBlockHeaderIconKind =
  | 'thinking'
  | 'response'
  | 'tool'
  | 'edit'
  | 'plan'
  | 'composite';

export type ContentBlockHeaderTone = 'purple' | 'green' | 'blue' | 'orange' | 'yellow';

export interface ContentBlockHeaderProjection {
  iconKind: ContentBlockHeaderIconKind;
  label: string;
  tone: ContentBlockHeaderTone;
  timestamp: number;
  timestampLabel: string;
  showStreamingBadge: boolean;
  streamingLabel: string;
}

export interface ContentBlockProjectionBase {
  id: string;
  block: ContentBlock;
  header: ContentBlockHeaderProjection;
  parentIsStreaming: boolean;
}

export interface ThinkingContentBlockProjection extends ContentBlockProjectionBase {
  renderKind: 'thinking';
  thinking: string;
  isThinkingComplete?: boolean;
}

export interface MarkdownContentBlockProjection extends ContentBlockProjectionBase {
  renderKind: 'markdown';
  content: string;
  renderStreaming: boolean;
}

export interface ToolContentBlockProjection extends ContentBlockProjectionBase {
  renderKind: 'tool';
  toolCall: ToolCall;
}

export interface DiffContentBlockProjection extends ContentBlockProjectionBase {
  renderKind: 'diff';
  codeDiff: CodeDiff;
}

export interface PlanContentBlockProjection extends ContentBlockProjectionBase {
  renderKind: 'plan';
  plan: Plan;
}

export interface CompositeContentBlockProjection extends ContentBlockProjectionBase {
  renderKind: 'composite';
  richContent: CompositeRichContentProjection;
}

export interface EmptyContentBlockProjection extends ContentBlockProjectionBase {
  renderKind: 'empty';
}

export type ContentBlockUiProjection =
  | ThinkingContentBlockProjection
  | MarkdownContentBlockProjection
  | ToolContentBlockProjection
  | DiffContentBlockProjection
  | PlanContentBlockProjection
  | CompositeContentBlockProjection
  | EmptyContentBlockProjection;

export interface ProjectContentBlockUiInput {
  block: ContentBlock;
  siblingBlocks?: readonly ContentBlock[];
  toolCalls?: readonly ToolCall[];
  parentIsStreaming?: boolean;
  formatTimestamp?: (timestamp: number) => string;
}

interface ContentBlockHeaderMetadata {
  iconKind: ContentBlockHeaderIconKind;
  label: string;
  tone: ContentBlockHeaderTone;
}

const CONTENT_BLOCK_HEADER_METADATA: Record<ContentBlock['type'], ContentBlockHeaderMetadata> = {
  thinking: {
    iconKind: 'thinking',
    label: 'Thinking',
    tone: 'purple',
  },
  text: {
    iconKind: 'response',
    label: 'Response',
    tone: 'green',
  },
  tool_call: {
    iconKind: 'tool',
    label: 'Tool',
    tone: 'blue',
  },
  code_diff: {
    iconKind: 'edit',
    label: 'Edit',
    tone: 'orange',
  },
  plan: {
    iconKind: 'plan',
    label: 'Plan',
    tone: 'yellow',
  },
  composite: {
    iconKind: 'composite',
    label: 'Composite',
    tone: 'blue',
  },
};

export function projectContentBlockUi(input: ProjectContentBlockUiInput): ContentBlockUiProjection {
  const parentIsStreaming = input.parentIsStreaming ?? false;
  const base = projectContentBlockBase(input.block, parentIsStreaming, input.formatTimestamp);

  switch (input.block.type) {
    case 'thinking':
      return {
        ...base,
        renderKind: 'thinking',
        thinking: input.block.thinking ?? '',
        isThinkingComplete: input.block.isThinkingComplete,
      };
    case 'text':
      if (!input.block.content) {
        return { ...base, renderKind: 'empty' };
      }
      return {
        ...base,
        renderKind: 'markdown',
        content: input.block.content,
        renderStreaming: input.block.isStreaming === true || parentIsStreaming,
      };
    case 'tool_call':
      if (!input.block.toolCall) {
        return { ...base, renderKind: 'empty' };
      }
      return {
        ...base,
        renderKind: 'tool',
        toolCall: input.block.toolCall,
      };
    case 'code_diff':
      if (!input.block.codeDiff) {
        return { ...base, renderKind: 'empty' };
      }
      return {
        ...base,
        renderKind: 'diff',
        codeDiff: input.block.codeDiff,
      };
    case 'plan':
      if (!input.block.plan) {
        return { ...base, renderKind: 'empty' };
      }
      return {
        ...base,
        renderKind: 'plan',
        plan: input.block.plan,
      };
    case 'composite':
      if (!input.block.composite) {
        return { ...base, renderKind: 'empty' };
      }
      return {
        ...base,
        renderKind: 'composite',
        richContent: projectCompositeBlockRichContent({
          composite: input.block.composite,
          siblingBlocks: input.siblingBlocks,
          toolCalls: input.toolCalls,
        }),
      };
  }
}

export function projectContentBlocksUi(
  blocks: readonly ContentBlock[] | undefined,
  parentIsStreaming = false,
  formatTimestamp?: (timestamp: number) => string,
  siblingBlocks: readonly ContentBlock[] | undefined = blocks,
  toolCalls?: readonly ToolCall[],
): ContentBlockUiProjection[] {
  return (
    blocks?.map((block) =>
      projectContentBlockUi({
        block,
        siblingBlocks,
        toolCalls,
        parentIsStreaming,
        formatTimestamp,
      }),
    ) ?? []
  );
}

export function formatContentBlockTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function projectContentBlockBase(
  block: ContentBlock,
  parentIsStreaming: boolean,
  formatTimestamp: ((timestamp: number) => string) | undefined,
): ContentBlockProjectionBase {
  const metadata = CONTENT_BLOCK_HEADER_METADATA[block.type];

  return {
    id: block.id,
    block,
    parentIsStreaming,
    header: {
      ...metadata,
      timestamp: block.timestamp,
      timestampLabel: formatTimestamp
        ? formatTimestamp(block.timestamp)
        : formatContentBlockTimestamp(block.timestamp),
      showStreamingBadge: block.isStreaming === true,
      streamingLabel: 'streaming...',
    },
  };
}
