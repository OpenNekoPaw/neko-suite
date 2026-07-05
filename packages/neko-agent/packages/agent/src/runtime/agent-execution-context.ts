import type { ExecutionContext } from '../session/types';
import { buildAgentExecutionMetadata } from './turn/message-runtime';

export interface AgentExecutionContextSource {
  readonly workspaceRoot?: string;
  readonly projectType?: string;
  readonly activeFile?: string;
  readonly metadata?: Record<string, unknown>;
  readonly multimodalContextPacket?: unknown;
}

export interface BuildAgentSessionExecutionContextInput {
  readonly context: AgentExecutionContextSource;
  readonly conversationId?: string;
  readonly parentAgentId?: string;
}

export function createAgentParentAgentId(conversationId: string): string {
  return `agent-${conversationId}`;
}

export function buildAgentSessionExecutionContext(
  input: BuildAgentSessionExecutionContextInput,
): ExecutionContext {
  return {
    workspaceRoot: input.context.workspaceRoot,
    projectType: input.context.projectType,
    activeFile: input.context.activeFile,
    metadata: buildAgentExecutionMetadata({
      metadata: input.context.metadata,
      multimodalContextPacket: input.context.multimodalContextPacket,
      ...(input.conversationId
        ? {
            conversationId: input.conversationId,
            parentAgentId: input.parentAgentId ?? createAgentParentAgentId(input.conversationId),
          }
        : {}),
    }),
  };
}
