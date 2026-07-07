import {
  validateConversationLifecycleCommand,
  type ConversationLifecycleCommand,
  type CreativeAiConversationState,
  type CreativeAiDiagnostic,
} from '@neko/shared/types/creative-ai-invocation';
import type { CreativeAiConversationAssociationRecord } from './creativeAiConversationRoutingService';

export interface CreativeAiConversationLifecycleAssociationPort {
  getAssociations(): Promise<readonly CreativeAiConversationAssociationRecord[]>;
  markConversationState(conversationId: string, state: CreativeAiConversationState): Promise<void>;
}

export interface CreativeAiConversationLifecycleConversationPort {
  hasConversation(conversationId: string): boolean;
  deleteConversationHistory(conversationId: string): void | Promise<void>;
}

export interface CreativeAiConversationLifecycleRunPort {
  listActiveRunIds(conversationId: string): readonly string[];
  cancelRuns(
    conversationId: string,
    runIds: readonly string[],
    reason: string,
  ): void | Promise<void>;
}

export interface CreativeAiConversationLifecycleServiceOptions {
  readonly associations: CreativeAiConversationLifecycleAssociationPort;
  readonly conversations: CreativeAiConversationLifecycleConversationPort;
  readonly runs: CreativeAiConversationLifecycleRunPort;
}

export type CreativeAiConversationLifecycleResult =
  | {
      readonly ok: true;
      readonly conversationId: string;
      readonly state: CreativeAiConversationState;
      readonly diagnostics: readonly CreativeAiDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly CreativeAiDiagnostic[];
    };

export class CreativeAiConversationLifecycleService {
  constructor(private readonly options: CreativeAiConversationLifecycleServiceOptions) {}

  async handleCommand(command: unknown): Promise<CreativeAiConversationLifecycleResult> {
    const validation = validateConversationLifecycleCommand(command);
    if (!validation.valid || !validation.value) {
      return { ok: false, diagnostics: validation.diagnostics };
    }

    const request = validation.value;
    if (!this.options.conversations.hasConversation(request.conversationId)) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'creative-ai-lifecycle-conversation-unavailable',
            'Conversation is unavailable for lifecycle operation.',
            'conversationId',
          ),
        ],
      };
    }

    const activeRunIds = this.options.runs.listActiveRunIds(request.conversationId);
    if (requiresStopBeforeLifecycle(request, activeRunIds)) {
      return {
        ok: false,
        diagnostics: [
          {
            ...diagnostic(
              'creative-ai-lifecycle-active-runs',
              'Conversation has active creative AI runs. Use stop-and-archive or stop-and-delete.',
              'activeRunIds',
            ),
            metadata: {
              conversationId: request.conversationId,
              activeRunIds,
            },
          },
        ],
      };
    }

    if (request.action === 'stop-and-archive' || request.action === 'stop-and-delete') {
      await this.options.runs.cancelRuns(
        request.conversationId,
        activeRunIds,
        request.action === 'stop-and-archive' ? 'stop-and-archive' : 'stop-and-delete',
      );
    }

    switch (request.action) {
      case 'archive':
      case 'stop-and-archive':
        return this.transition(request, 'archived');
      case 'restore':
        return this.transition(request, 'active');
      case 'delete':
      case 'stop-and-delete':
        return this.deleteConversation(request);
    }
  }

  async handleEditorClosed(
    _documentAssociationKey: string,
  ): Promise<CreativeAiConversationLifecycleResult> {
    return {
      ok: true,
      conversationId: '',
      state: 'active',
      diagnostics: [
        diagnostic(
          'creative-ai-lifecycle-editor-close-ignored',
          'Editor close does not archive, delete, or TTL-expire background conversations.',
          'editor',
          'info',
        ),
      ],
    };
  }

  private async transition(
    command: ConversationLifecycleCommand,
    state: CreativeAiConversationState,
  ): Promise<CreativeAiConversationLifecycleResult> {
    await this.options.associations.markConversationState(command.conversationId, state);
    return {
      ok: true,
      conversationId: command.conversationId,
      state,
      diagnostics: [],
    };
  }

  private async deleteConversation(
    command: ConversationLifecycleCommand,
  ): Promise<CreativeAiConversationLifecycleResult> {
    await this.options.associations.markConversationState(command.conversationId, 'deleted');
    await this.options.conversations.deleteConversationHistory(command.conversationId);
    return {
      ok: true,
      conversationId: command.conversationId,
      state: 'deleted',
      diagnostics: [],
    };
  }
}

function requiresStopBeforeLifecycle(
  command: ConversationLifecycleCommand,
  activeRunIds: readonly string[],
): boolean {
  if (activeRunIds.length === 0) return false;
  return command.action === 'archive' || command.action === 'delete';
}

function diagnostic(
  code: string,
  message: string,
  target?: string,
  severity: CreativeAiDiagnostic['severity'] = 'error',
): CreativeAiDiagnostic {
  return {
    severity,
    code,
    message,
    ...(target ? { target } : {}),
  };
}
