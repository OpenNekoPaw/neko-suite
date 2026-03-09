/**
 * Message Helper Utilities
 *
 * Pure functions for working with ContentBlocks and ToolCalls.
 * Eliminates dual-update pattern by deriving toolCalls from contentBlocks.
 */

import type { ContentBlock, ToolCall } from '@/components/types';

/**
 * Derive toolCalls array from contentBlocks.
 * contentBlocks is the source of truth; toolCalls is auto-derived for backward compatibility.
 */
export function deriveToolCalls(blocks: ContentBlock[]): ToolCall[] {
  const toolCalls: ToolCall[] = [];
  for (const block of blocks) {
    if (block.type === 'tool_call' && block.toolCall) {
      toolCalls.push(block.toolCall);
    }
  }
  return toolCalls;
}

/**
 * Update a tool call within contentBlocks by toolCallId.
 * Returns new blocks array with the matched tool call updated.
 */
export function updateToolCallInBlocks(
  blocks: ContentBlock[],
  toolCallId: string,
  updater: (tc: ToolCall) => ToolCall,
): ContentBlock[] {
  return blocks.map((b) => {
    if (b.type !== 'tool_call' || !b.toolCall || b.toolCall.id !== toolCallId) return b;
    return { ...b, toolCall: updater(b.toolCall) };
  });
}

/**
 * Update the last tool_call block that has no result yet.
 * Used as fallback when no explicit toolCallId is provided.
 */
export function updateLastPendingToolCall(
  blocks: ContentBlock[],
  updater: (tc: ToolCall) => ToolCall,
): ContentBlock[] {
  // Find the last tool_call block without a result
  let lastPendingIndex = -1;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b?.type === 'tool_call' && b.toolCall && !b.toolCall.result) {
      lastPendingIndex = i;
      break;
    }
  }

  if (lastPendingIndex === -1) return blocks;

  return blocks.map((b, i) => {
    if (i !== lastPendingIndex || !b.toolCall) return b;
    return { ...b, toolCall: updater(b.toolCall) };
  });
}

/**
 * Add a new tool call as a content block.
 */
export function addToolCallBlock(blocks: ContentBlock[], toolCall: ToolCall): ContentBlock[] {
  const newBlock: ContentBlock = {
    id: `block-tool-${toolCall.id}`,
    type: 'tool_call',
    timestamp: Date.now(),
    toolCall,
  };
  return [...blocks, newBlock];
}
