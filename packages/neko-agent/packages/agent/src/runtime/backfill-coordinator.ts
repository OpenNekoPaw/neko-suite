import type { ToolResultBackfillDiagnostic, ToolResultBackfillPayload } from '@neko/shared';
import type { AgentEvent } from '../session/types';
import type { ToolResultPatchResult } from '../session/types';
import {
  applyAgentStreamEventToState,
  projectAgentStreamEventToHostMessages,
  type AgentStreamProjectionState,
  type AgentStreamProjectionMessage,
} from './agent-stream-state';

export interface BackfillCoordinatorSessionPort {
  patchToolResult(payload: ToolResultBackfillPayload): Promise<ToolResultPatchResult>;
}

export interface BackfillCoordinatorStreamPort {
  readonly state: AgentStreamProjectionState;
  readonly conversationId: string;
  readonly messageId: string;
}

export interface BackfillCoordinatorHostPort {
  postMessage(message: AgentStreamProjectionMessage): void | Promise<void>;
}

/** Migration alias. Prefer BackfillCoordinatorHostPort. */
export type BackfillCoordinatorWebviewPort = BackfillCoordinatorHostPort;

export interface BackfillCoordinatorConfig {
  readonly session?: BackfillCoordinatorSessionPort;
  readonly stream?: BackfillCoordinatorStreamPort;
  readonly host?: BackfillCoordinatorHostPort;
  /** Migration alias. Prefer host. */
  readonly webview?: BackfillCoordinatorHostPort;
  readonly recordDiagnostic?: (diagnostic: ToolResultBackfillDiagnostic) => void;
}

export interface BackfillCoordinatorApplyResult {
  readonly streamPatched: boolean;
  readonly sessionPatched: boolean;
  readonly webviewNotified: boolean;
  readonly diagnostics: readonly ToolResultBackfillDiagnostic[];
  readonly errors: readonly unknown[];
  readonly eventId?: string;
}

export class BackfillCoordinator {
  private readonly session?: BackfillCoordinatorSessionPort;
  private readonly stream?: BackfillCoordinatorStreamPort;
  private readonly host?: BackfillCoordinatorHostPort;
  private readonly recordDiagnostic?: (diagnostic: ToolResultBackfillDiagnostic) => void;

  constructor(config: BackfillCoordinatorConfig = {}) {
    this.session = config.session;
    this.stream = config.stream;
    this.host = config.host ?? config.webview;
    this.recordDiagnostic = config.recordDiagnostic;
  }

  async apply(payload: ToolResultBackfillPayload): Promise<BackfillCoordinatorApplyResult> {
    const event: AgentEvent = {
      type: 'tool_result_backfill',
      toolResultBackfill: payload,
    };

    const errors: unknown[] = [];
    const streamPatched = this.applyStreamBackfill(event, payload.toolCallId, errors);
    const sessionResult = await this.patchSession(payload, errors);
    const hostNotified = await this.notifyHost(event, errors);
    const diagnostics = collectCoordinatorDiagnostics({
      payload,
      streamPatched,
      sessionPatched: sessionResult?.patched === true,
    });

    for (const diagnostic of diagnostics) {
      this.recordDiagnostic?.(diagnostic);
    }

    return {
      streamPatched,
      sessionPatched: sessionResult?.patched === true,
      webviewNotified: hostNotified,
      diagnostics,
      errors,
      ...(sessionResult?.eventId ? { eventId: sessionResult.eventId } : {}),
    };
  }

  private applyStreamBackfill(event: AgentEvent, toolCallId: string, errors: unknown[]): boolean {
    if (!this.stream) {
      return false;
    }

    try {
      const before = this.stream.state.collectedToolCalls.find(
        (toolCall) => toolCall.id === toolCallId,
      )?.result;
      applyAgentStreamEventToState(this.stream.state, event);
      const after = this.stream.state.collectedToolCalls.find(
        (toolCall) => toolCall.id === toolCallId,
      )?.result;
      return before !== after && after !== undefined;
    } catch (error) {
      errors.push(error);
      return false;
    }
  }

  private async patchSession(
    payload: ToolResultBackfillPayload,
    errors: unknown[],
  ): Promise<ToolResultPatchResult | undefined> {
    try {
      return await this.session?.patchToolResult(payload);
    } catch (error) {
      errors.push(error);
      return undefined;
    }
  }

  private async notifyHost(event: AgentEvent, errors: unknown[]): Promise<boolean> {
    if (!this.stream || !this.host) {
      return false;
    }

    const messages = projectAgentStreamEventToHostMessages({
      conversationId: this.stream.conversationId,
      messageId: this.stream.messageId,
      event,
    });

    let notified = false;
    for (const message of messages) {
      try {
        await this.host.postMessage(message);
        notified = true;
      } catch (error) {
        errors.push(error);
      }
    }

    return notified;
  }
}

export function createBackfillCoordinator(
  config: BackfillCoordinatorConfig = {},
): BackfillCoordinator {
  return new BackfillCoordinator(config);
}

function collectCoordinatorDiagnostics(input: {
  readonly payload: ToolResultBackfillPayload;
  readonly streamPatched: boolean;
  readonly sessionPatched: boolean;
}): readonly ToolResultBackfillDiagnostic[] {
  if (input.streamPatched || input.sessionPatched) {
    return input.payload.diagnostics ?? [];
  }

  return [
    ...(input.payload.diagnostics ?? []),
    {
      path: input.payload.toolCallId,
      reason: 'missing-tool-call',
      incoming: input.payload,
    },
  ];
}
