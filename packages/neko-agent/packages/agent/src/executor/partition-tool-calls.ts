/**
 * Partition Tool Calls — Split tool calls into concurrent and serial batches
 *
 * Tools marked as isConcurrencySafe can run in parallel.
 * All others run sequentially after the concurrent batch completes.
 *
 * This implements the Fail-Closed pattern: unknown tools default to serial.
 */

import type { IToolRegistry, ToolCallInfo } from '@neko/shared';

export interface PartitionResult {
  /** Tool calls safe to run concurrently */
  concurrent: ToolCallInfo[];
  /** Tool calls that must run sequentially */
  serial: ToolCallInfo[];
}

/**
 * Partition tool calls by concurrency safety.
 *
 * Looks up each tool in the registry and checks isConcurrencySafe.
 * Unknown tools or tools without the flag default to serial (Fail-Closed).
 */
export function partitionToolCalls(
  toolCalls: ToolCallInfo[],
  toolRegistry: IToolRegistry,
): PartitionResult {
  const concurrent: ToolCallInfo[] = [];
  const serial: ToolCallInfo[] = [];

  for (const call of toolCalls) {
    const tool = toolRegistry.get(call.name);
    if (tool?.isConcurrencySafe === true) {
      concurrent.push(call);
    } else {
      serial.push(call);
    }
  }

  return { concurrent, serial };
}
