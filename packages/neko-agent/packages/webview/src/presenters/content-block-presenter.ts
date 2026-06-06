import type { CodeDiff, ContentBlock, ToolCall } from '@/components/types';
import type { Plan } from '@neko-agent/types';
import {
  projectCompositeBlockRichContent,
  type CompositeRichContentProjection,
} from './composite-content-presenter';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';

export type ContentBlockRenderKind =
  | 'thinking'
  | 'markdown'
  | 'tool'
  | 'toolGroup'
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
  siblingBlocks?: readonly ContentBlock[];
  toolCalls?: readonly ToolCall[];
}

export interface ToolContentBlockProjection extends ContentBlockProjectionBase {
  renderKind: 'tool';
  toolCall: ToolCall;
}

export interface ToolGroupContentBlockProjection extends ContentBlockProjectionBase {
  renderKind: 'toolGroup';
  toolCalls: ToolCall[];
  toolName: string;
  count: number;
  successCount: number;
  failureCount: number;
  pendingCount: number;
  targetLabel: string | null;
  durationLabel: string | null;
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
  | ToolGroupContentBlockProjection
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
  plugins?: PluginsAvailable;
}

interface ContentBlockHeaderMetadata {
  iconKind: ContentBlockHeaderIconKind;
  label: string;
  tone: ContentBlockHeaderTone;
}

const NON_COLLAPSIBLE_TOOL_NAMES = new Set(['ReadImage', 'ReadDocumentImage']);

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
        ...(input.siblingBlocks ? { siblingBlocks: input.siblingBlocks } : {}),
        ...(input.toolCalls ? { toolCalls: input.toolCalls } : {}),
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
          plugins: input.plugins,
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
  plugins?: PluginsAvailable,
): ContentBlockUiProjection[] {
  if (!blocks || blocks.length === 0) return [];

  const projections = blocks.map((block) =>
    projectContentBlockUi({
      block,
      siblingBlocks,
      toolCalls,
      parentIsStreaming,
      formatTimestamp,
      plugins,
    }),
  );

  return aggregateConsecutiveToolProjections(projections);
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

function aggregateConsecutiveToolProjections(
  projections: readonly ContentBlockUiProjection[],
): ContentBlockUiProjection[] {
  const aggregated: ContentBlockUiProjection[] = [];
  let index = 0;

  while (index < projections.length) {
    const projection = projections[index];
    if (!projection || projection.renderKind !== 'tool' || !isAggregatableTool(projection)) {
      if (projection) aggregated.push(projection);
      index += 1;
      continue;
    }

    const group = [projection];
    const key = getToolAggregationKey(projection.toolCall);
    index += 1;

    while (index < projections.length) {
      const next = projections[index];
      if (
        !next ||
        next.renderKind !== 'tool' ||
        !isAggregatableTool(next) ||
        getToolAggregationKey(next.toolCall) !== key
      ) {
        break;
      }
      group.push(next);
      index += 1;
    }

    if (group.length < 2) {
      aggregated.push(...group);
      continue;
    }

    aggregated.push(projectToolGroup(group));
  }

  return aggregated;
}

function projectToolGroup(
  projections: readonly ToolContentBlockProjection[],
): ToolGroupContentBlockProjection {
  const first = projections[0];
  if (!first) {
    throw new Error('Cannot project an empty tool group');
  }
  const toolCalls = projections.map((projection) => projection.toolCall);
  const durations = toolCalls
    .map((toolCall) => toolCall.result?.duration)
    .filter((duration): duration is number => typeof duration === 'number' && duration >= 0);

  return {
    id: `${first.id}-group-${toolCalls.length}`,
    block: first.block,
    header: first.header,
    parentIsStreaming: first.parentIsStreaming,
    renderKind: 'toolGroup',
    toolCalls,
    toolName: first.toolCall.name,
    count: toolCalls.length,
    successCount: toolCalls.filter((toolCall) => toolCall.result?.success === true).length,
    failureCount: toolCalls.filter((toolCall) => toolCall.result?.success === false).length,
    pendingCount: toolCalls.filter((toolCall) => !toolCall.result).length,
    targetLabel: getToolTargetLabel(first.toolCall),
    durationLabel: formatDurationRange(durations),
  };
}

function isAggregatableTool(projection: ToolContentBlockProjection): boolean {
  const toolCall = projection.toolCall;
  return (
    !NON_COLLAPSIBLE_TOOL_NAMES.has(toolCall.name) &&
    toolCall.pendingConfirmation !== true &&
    toolCall.result?.success === true &&
    getToolTargetLabel(toolCall) !== null
  );
}

function getToolAggregationKey(toolCall: ToolCall): string {
  return `${toolCall.name}:${getToolTargetLabel(toolCall) ?? ''}`;
}

function getToolTargetLabel(toolCall: ToolCall): string | null {
  return readToolTargetLabel(toolCall.arguments) ?? readToolTargetLabel(toolCall.result?.data);
}

function readToolTargetLabel(value: unknown): string | null {
  if (!isRecord(value)) return null;

  return (
    readToolString(value, 'file_path') ??
    readToolString(value, 'filePath') ??
    readToolString(value, 'path') ??
    readToolString(value, 'url') ??
    readToolString(value.source, 'file_path') ??
    readToolString(value.source, 'filePath') ??
    readToolString(value.source, 'path') ??
    readToolString(value.source, 'url') ??
    null
  );
}

function readToolString(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const field = value[key];
  return typeof field === 'string' && field.trim().length > 0 ? field.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatDurationRange(durations: readonly number[]): string | null {
  if (durations.length === 0) return null;

  const min = Math.min(...durations);
  const max = Math.max(...durations);
  if (min === max) return `${min}ms`;
  return `${min}-${max}ms`;
}
