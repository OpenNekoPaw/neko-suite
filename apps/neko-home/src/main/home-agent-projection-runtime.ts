import { randomUUID } from 'node:crypto';
import {
  AGENT_WEBVIEW_PROTOCOL_VERSION,
  isSameProjectionAttachment,
  type ConversationProjectionAttachmentHostFrame,
  type ExtensionToWebviewMessage,
  type ProjectionAttachmentKey,
  type WebviewToExtensionMessage,
} from '@neko-agent/types';

type ProjectionRouteMessage = Extract<
  WebviewToExtensionMessage,
  {
    readonly type:
      | 'projectionEndpointDiscover'
      | 'projectionAttach'
      | 'projectionSnapshotAck'
      | 'projectionDetach';
  }
>;

export interface HomeAgentProjectionRuntime {
  handle(
    message: ProjectionRouteMessage,
    hasConversation: (conversationId: string) => boolean,
  ): readonly ExtensionToWebviewMessage[];
}

export interface InMemoryHomeAgentProjectionRuntimeOptions {
  readonly endpointEpoch?: string;
}

/**
 * Home uses request/response IPC, so projection frames are returned as one
 * response batch instead of being pushed through a VS Code Webview endpoint.
 */
export class InMemoryHomeAgentProjectionRuntime implements HomeAgentProjectionRuntime {
  private readonly endpointEpoch: string;
  private readonly attachmentsById = new Map<string, ProjectionAttachmentKey>();
  private readonly attachmentIdByTabId = new Map<string, string>();

  constructor(options: InMemoryHomeAgentProjectionRuntimeOptions = {}) {
    this.endpointEpoch = options.endpointEpoch ?? randomUUID();
    if (this.endpointEpoch.trim().length === 0) {
      throw new Error('Home Agent projection endpoint epoch is required.');
    }
  }

  handle(
    message: ProjectionRouteMessage,
    hasConversation: (conversationId: string) => boolean,
  ): readonly ExtensionToWebviewMessage[] {
    switch (message.type) {
      case 'projectionEndpointDiscover':
        return [
          {
            type: 'projectionEndpointReady',
            protocolVersion: AGENT_WEBVIEW_PROTOCOL_VERSION,
            realmId: message.realmId,
            endpointEpoch: this.endpointEpoch,
          },
        ];
      case 'projectionAttach':
        return this.attach(message.key, hasConversation);
      case 'projectionSnapshotAck':
        return this.acknowledge(message.key, message.projectionVersion);
      case 'projectionDetach':
        return this.detach(message.key);
    }
  }

  private attach(
    key: ProjectionAttachmentKey,
    hasConversation: (conversationId: string) => boolean,
  ): readonly ExtensionToWebviewMessage[] {
    const identityDiagnostic = this.validateNewAttachment(key);
    if (identityDiagnostic) return [identityDiagnostic];
    if (!hasConversation(key.conversationId)) {
      return [
        createProtocolDiagnostic(
          key,
          'attachment-identity-mismatch',
          `Home Agent projection conversation does not exist: ${key.conversationId}`,
        ),
      ];
    }

    this.attachmentsById.set(key.attachmentId, { ...key });
    this.attachmentIdByTabId.set(key.tabId, key.attachmentId);
    return [
      {
        type: 'projectionSnapshot',
        key: { ...key },
        sequence: 0,
        projectionVersion: 0,
        projection: {
          conversationId: key.conversationId,
          projectionVersion: 0,
          turns: [],
        },
      },
    ];
  }

  private acknowledge(
    key: ProjectionAttachmentKey,
    projectionVersion: number,
  ): readonly ExtensionToWebviewMessage[] {
    const registered = this.requireAttachment(key);
    if (registered) return [registered];
    if (projectionVersion !== 0) {
      return [
        createProtocolDiagnostic(
          key,
          'attachment-stale-ack',
          `Home Agent projection snapshot version is 0, received acknowledgement ${projectionVersion}.`,
        ),
      ];
    }
    return [];
  }

  private detach(key: ProjectionAttachmentKey): readonly ExtensionToWebviewMessage[] {
    const registered = this.requireAttachment(key);
    if (registered) return [registered];
    this.attachmentsById.delete(key.attachmentId);
    this.attachmentIdByTabId.delete(key.tabId);
    return [];
  }

  private validateNewAttachment(
    key: ProjectionAttachmentKey,
  ): ConversationProjectionAttachmentHostFrame | undefined {
    if (key.endpointEpoch !== this.endpointEpoch) {
      return createProtocolDiagnostic(
        key,
        'attachment-identity-mismatch',
        `Home Agent projection endpoint mismatch: expected ${this.endpointEpoch}, received ${key.endpointEpoch}.`,
      );
    }
    if (this.attachmentsById.has(key.attachmentId)) {
      return createProtocolDiagnostic(
        key,
        'attachment-snapshot-required',
        `Home Agent projection attachment is already registered: ${key.attachmentId}`,
      );
    }
    const existingAttachmentId = this.attachmentIdByTabId.get(key.tabId);
    if (existingAttachmentId) {
      return createProtocolDiagnostic(
        key,
        'attachment-snapshot-required',
        `Home Agent projection Tab ${key.tabId} is already attached as ${existingAttachmentId}.`,
      );
    }
    return undefined;
  }

  private requireAttachment(
    key: ProjectionAttachmentKey,
  ): ConversationProjectionAttachmentHostFrame | undefined {
    const registered = this.attachmentsById.get(key.attachmentId);
    if (registered && isSameProjectionAttachment(registered, key)) return undefined;
    return createProtocolDiagnostic(
      key,
      'attachment-identity-mismatch',
      `Home Agent projection attachment is not registered: ${key.attachmentId}`,
    );
  }
}

function createProtocolDiagnostic(
  key: ProjectionAttachmentKey,
  code: Extract<ConversationProjectionAttachmentHostFrame, { type: 'projectionProtocolDiagnostic' }>['code'],
  message: string,
): ConversationProjectionAttachmentHostFrame {
  return {
    type: 'projectionProtocolDiagnostic',
    key: { ...key },
    code,
    severity: 'error',
    fatal: true,
    message,
  };
}
