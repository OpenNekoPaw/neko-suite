import * as vscode from 'vscode';
import type { ProjectSourceAddRequest, ProjectSourceAddResult } from '@neko/shared';
import {
  handleProjectSourceAddRequest,
  ingestProjectSourceAddRequest,
} from '@neko/shared';
import type { VSCodeProjectFileIoAdapter } from '@neko/shared/vscode/extension';
import { normalizeVSCodeProjectSourceAddRequest } from '@neko/shared/vscode/extension';
import type { SketchProjectSourceIngest } from './SketchProjectAuthoringService';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);
const PSD_EXTENSIONS = new Set(['psd']);

export function createVSCodeSketchProjectSourceIngest(
  projectFileAdapter: VSCodeProjectFileIoAdapter,
): SketchProjectSourceIngest {
  return async (documentUri, request) =>
    addSketchProjectSource(
      normalizeVSCodeProjectSourceAddRequest(request),
      resolveDocumentUri(documentUri),
      projectFileAdapter,
    );
}

async function addSketchProjectSource(
  request: ProjectSourceAddRequest,
  documentUri: vscode.Uri,
  projectFileAdapter: VSCodeProjectFileIoAdapter,
): Promise<ProjectSourceAddResult> {
  const fileName = readSketchSourceAddFileName(request);
  if (!isSketchImportFileName(fileName)) {
    return {
      requestId: request.requestId,
      ok: false,
      diagnostics: [
        {
          code: 'invalid-document',
          severity: 'error',
          message: `Unsupported Sketch import source: ${fileName}`,
          recoverability: 'manual',
        },
      ],
    };
  }

  return handleProjectSourceAddRequest(
    {
      ...request,
      caller: request.caller ?? 'neko-sketch.authoring-import',
      target: request.target ?? { role: isPsdFileName(fileName) ? 'document' : 'image' },
      destination: {
        kind: 'project',
        directory: request.destination.directory ?? 'imports',
        copyMode: request.destination.copyMode ?? (request.bytes ? 'copy' : 'link'),
      },
      metadata: {
        ...(request.metadata ?? {}),
        sketchImport: true,
        name: fileName,
      },
    },
    {
      ingest: (ingestRequest) =>
        ingestProjectSourceAddRequest(ingestRequest, {
          documentPath: documentUri.fsPath,
          assetDirectory: request.destination.directory ?? 'imports',
          workspaceContext: projectFileAdapter.createWorkspaceMediaPathContext({
            documentUri,
          }),
          fileOps: {
            createDirectory: async (dirPath) =>
              vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath)),
            fileExists: async (filePath) => {
              try {
                await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
                return true;
              } catch {
                return false;
              }
            },
            writeFile: async (filePath, bytes) =>
              vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), bytes),
          },
          defaultFileName: fileName,
          unmanagedSourceMessage:
            'Sketch import source must be moved into the project, asset library, or a configured media root before importing.',
        }),
    },
  );
}

function resolveDocumentUri(documentUri: string): vscode.Uri {
  return documentUri.startsWith('file://') ? vscode.Uri.parse(documentUri) : vscode.Uri.file(documentUri);
}

function readSketchSourceAddFileName(request: ProjectSourceAddRequest): string {
  const metadataName = request.metadata?.['name'];
  if (typeof metadataName === 'string' && metadataName.length > 0) {
    return metadataName;
  }
  const source = request.browserFile?.name ?? request.sourcePath ?? request.sourceUri ?? 'imported';
  const normalized = source.split(/[?#]/, 1)[0]?.replace(/\\/g, '/') ?? source;
  const name = normalized.split('/').pop();
  return name && name.length > 0 ? decodeURIComponentSafe(name) : 'imported';
}

function isSketchImportFileName(fileName: string): boolean {
  const ext = fileName.split(/[?#]/, 1)[0]?.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.has(ext) || PSD_EXTENSIONS.has(ext);
}

function isPsdFileName(fileName: string): boolean {
  const ext = fileName.split(/[?#]/, 1)[0]?.split('.').pop()?.toLowerCase() ?? '';
  return PSD_EXTENSIONS.has(ext);
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
