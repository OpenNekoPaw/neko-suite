import type { CodeDiff, ContentBlock, ToolCall } from '@/components/types';
import type { Plan } from '@neko-agent/types';

export type ContentBlockRenderKind = 'thinking' | 'markdown' | 'tool' | 'diff' | 'plan' | 'empty';

export type ContentBlockHeaderIconKind = 'thinking' | 'response' | 'tool' | 'edit' | 'plan';

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

export interface EmptyContentBlockProjection extends ContentBlockProjectionBase {
  renderKind: 'empty';
}

export type ContentBlockUiProjection =
  | ThinkingContentBlockProjection
  | MarkdownContentBlockProjection
  | ToolContentBlockProjection
  | DiffContentBlockProjection
  | PlanContentBlockProjection
  | EmptyContentBlockProjection;

export interface ProjectContentBlockUiInput {
  block: ContentBlock;
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
  }
}

export function projectContentBlocksUi(
  blocks: readonly ContentBlock[] | undefined,
  parentIsStreaming = false,
  formatTimestamp?: (timestamp: number) => string,
): ContentBlockUiProjection[] {
  return (
    blocks?.map((block) => projectContentBlockUi({ block, parentIsStreaming, formatTimestamp })) ??
    []
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
