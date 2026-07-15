import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
  validateCanvasBoardDeliveryRequest,
  validateCanvasBoardObservedTarget,
  type CanvasBoardDeliveryRequest,
  type CanvasBoardDeliveryResult,
  type CanvasBoardRoutingDiagnostic,
} from '@neko/shared';
import type { CanvasBoardIndexReader } from './canvasBoardResolverService';
import type { CanvasProjectAuthoringService } from './canvasProjectAuthoringService';

export interface CanvasBoardDeliveryServiceOptions {
  readonly index: CanvasBoardIndexReader;
  readonly authoring: Pick<
    CanvasProjectAuthoringService,
    'applyAgentContent' | 'createNode' | 'importAsset'
  >;
}

export class CanvasBoardDeliveryService {
  constructor(private readonly options: CanvasBoardDeliveryServiceOptions) {}

  async deliver(request: CanvasBoardDeliveryRequest): Promise<CanvasBoardDeliveryResult> {
    const contractDiagnostics = validateCanvasBoardDeliveryRequest(request);
    if (contractDiagnostics.length > 0) return blocked(request, contractDiagnostics);

    const observed = await this.options.index.get(request.target.documentRef);
    const targetDiagnostics = validateCanvasBoardObservedTarget(request.target, {
      exists: Boolean(observed),
      ...(observed ? { summary: observed } : {}),
    });
    if (targetDiagnostics.length > 0) return blocked(request, targetDiagnostics);

    const documentUri = resolveBoardDocumentUri(request.target.documentRef.path);
    const target = {
      kind: 'file' as const,
      documentUri,
      expectedRevision: request.target.revision,
    };
    const provenance = {
      source: 'agent' as const,
      conversationId: request.provenance.conversationId,
      messageId: request.provenance.artifactId,
      label: request.provenance.deliveryId,
    };

    try {
      const position = taskPlacementPosition(
        request.provenance.taskId ?? request.provenance.artifactId,
      );
      if (request.artifact.kind === 'markdown') {
        const result = await this.options.authoring.applyAgentContent({
          target,
          payload: {
            kind: 'text',
            text: request.artifact.markdown,
            title: request.artifact.title,
            format: 'markdown',
            provenance,
            target: { insertionPoint: position },
          },
        });
        return {
          version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
          status: result.status === 'noop' ? 'noop' : 'delivered',
          target: request.target,
          revision: result.projectRef?.projectRevision,
          nodeIds:
            result.createdNodes?.map(({ nodeId }) => nodeId) ??
            (result.applyAgentContentResult?.nodeId ? [result.applyAgentContentResult.nodeId] : []),
          diagnostics: [],
        };
      }

      if (request.artifact.kind === 'file-reference' || request.artifact.kind === 'file') {
        const result = await this.options.authoring.createNode({
          target,
          node: {
            type: 'document',
            position,
            data: {
              docPath: '',
              docType: inferDocumentType(request.artifact.title, request.artifact.mimeType),
              title: request.artifact.title,
              ...(request.artifact.mimeType ? { mimeType: request.artifact.mimeType } : {}),
              ...(request.artifact.resourceRef
                ? { resourceRef: request.artifact.resourceRef }
                : {}),
              ...(request.artifact.documentResourceRef
                ? { documentResourceRef: request.artifact.documentResourceRef }
                : {}),
              provenance,
            },
          },
        });
        return {
          version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
          status: 'delivered',
          target: request.target,
          revision: result.projectRef.projectRevision,
          nodeIds: [result.nodeId],
          diagnostics: [],
        };
      }

      if (
        request.artifact.kind !== 'image' &&
        request.artifact.kind !== 'audio' &&
        request.artifact.kind !== 'video'
      ) {
        return blocked(request, [
          {
            code: 'unsupported-delivery-kind',
            severity: 'error',
            message: 'Canvas file/reference delivery requires a compatible foundational renderer.',
          },
        ]);
      }
      const result = await this.options.authoring.importAsset({
        target,
        asset: {
          type: request.artifact.kind,
          name: request.artifact.title,
          ...(request.artifact.resourceRef ? { resourceRef: request.artifact.resourceRef } : {}),
          ...(request.artifact.documentResourceRef
            ? { documentResourceRef: request.artifact.documentResourceRef }
            : {}),
          position,
          provenance,
        },
      });
      return {
        version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
        status: 'delivered',
        target: request.target,
        revision: result.projectRef.projectRevision,
        nodeIds: [result.nodeId],
        diagnostics: [],
      };
    } catch (error) {
      return blocked(request, [toDeliveryDiagnostic(error)]);
    }
  }
}

function taskPlacementPosition(identity: string): { x: number; y: number } {
  let hash = 0;
  for (const character of identity) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return {
    x: 80 + (hash % 4) * 320,
    y: 80 + (Math.floor(hash / 4) % 6) * 240,
  };
}

function inferDocumentType(
  title: string,
  mimeType: string | undefined,
): 'pdf' | 'docx' | 'epub' | 'cbz' | 'file' {
  const normalized = title.toLocaleLowerCase();
  if (mimeType === 'application/pdf' || normalized.endsWith('.pdf')) return 'pdf';
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    normalized.endsWith('.docx')
  ) {
    return 'docx';
  }
  if (mimeType === 'application/epub+zip' || normalized.endsWith('.epub')) return 'epub';
  if (normalized.endsWith('.cbz')) return 'cbz';
  return 'file';
}

function resolveBoardDocumentUri(relativePath: string): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) throw new Error('No workspace folder open for Canvas Board delivery.');
  return vscode.Uri.file(path.join(folder.uri.fsPath, relativePath)).toString();
}

function blocked(
  request: CanvasBoardDeliveryRequest,
  diagnostics: readonly CanvasBoardRoutingDiagnostic[],
): CanvasBoardDeliveryResult {
  return {
    version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
    status: 'blocked',
    target: request.target,
    diagnostics,
  };
}

function toDeliveryDiagnostic(error: unknown): CanvasBoardRoutingDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  return {
    code: /stale-board-target/i.test(message) ? 'stale-board-target' : 'runtime-value-forbidden',
    severity: 'error',
    message,
  };
}
