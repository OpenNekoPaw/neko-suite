/**
 * NekoSketch command registration
 */
import * as vscode from 'vscode';
import type {
  NekoProjectAuthoringResult,
  NekoProjectAuthoringTarget,
  NekoCutAPI,
  SketchImportContext,
} from '@neko/shared';
import {
  createNekoProjectAuthoringDiagnostic,
  createNekoProjectAuthoringResult,
} from '@neko/shared';
import { createNewFile } from '@neko/shared/vscode/extension';
import { isRecord, readNonEmptyString } from '@neko/shared/vscode/extension/command-args';
import { SketchEditorProvider } from '../editor';
import type { ISketchProjectAuthoringService } from '../services/SketchProjectAuthoringService';
import { parsePsdToWire } from '../psd/psd-ag-adapter';
import { handleError } from '../utils/errorHandler';

/** Default .nks document template */
function getSketchTemplate(name: string, width = 1920, height = 1080): string {
  const data = {
    version: '1.0',
    canvas: {
      width,
      height,
      dpi: 72,
      backgroundColor: '#ffffff',
    },
    layers: [
      {
        id: 'layer-1',
        name: vscode.l10n.t('neko.sketch.template.layer.background'),
        type: 'fill',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        width,
        height,
        offsetX: 0,
        offsetY: 0,
        clippingMask: false,
        maskLayerId: null,
        children: [],
      },
      {
        id: 'layer-2',
        name: vscode.l10n.t('neko.sketch.template.layer.default'),
        type: 'raster',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        width,
        height,
        offsetX: 0,
        offsetY: 0,
        clippingMask: false,
        maskLayerId: null,
        children: [],
      },
    ],
    brushPresets: [],
    palette: ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff'],
    viewport: { panX: 0, panY: 0, zoom: 1, rotation: 0 },
  };
  return JSON.stringify(data, null, 2);
}

export function registerCommands(
  context: vscode.ExtensionContext,
  editorProvider: SketchEditorProvider,
  authoringService: ISketchProjectAuthoringService,
): void {
  // New Sketch - create .nks file with inline rename
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.sketch.new', async (uri?: vscode.Uri) => {
      try {
        await createNewFile({
          targetFolder: uri,
          ext: '.nks',
          template: (title) => getSketchTemplate(title),
          noFolderErrorMessage: vscode.l10n.t('neko.sketch.new.noFolder'),
          onCreated: async (fileUri) => {
            await vscode.commands.executeCommand(
              'vscode.openWith',
              fileUri,
              SketchEditorProvider.viewType,
            );
          },
          onError: (error) => void handleError(error, { showToUser: true }),
        });
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),
  );

  // Import image file
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.sketch.import', () => {
      editorProvider.postKeyboardAction('import');
    }),
  );

  // Export
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.sketch.export', () => {
      editorProvider.postKeyboardAction('export');
    }),
  );

  // Command palette actions forwarded to the active webview.
  const keyboardActions = [
    'neko.sketch.deleteSelected',
    'neko.sketch.escape',
    'neko.sketch.selectAll',
    'neko.sketch.undo',
    'neko.sketch.redo',
    'neko.sketch.selectBrush',
    'neko.sketch.selectEraser',
    'neko.sketch.selectMove',
    'neko.sketch.selectShape',
    'neko.sketch.selectZoom',
    'neko.sketch.selectFill',
    'neko.sketch.selectSelect',
    'neko.sketch.selectTransform',
    'neko.sketch.adjustSize',
    'neko.sketch.pickColor',
    'neko.sketch.rotateViewLeft',
    'neko.sketch.rotateViewRight',
    'neko.sketch.resetRotation',
  ];
  for (const commandId of keyboardActions) {
    const action = commandId.replace('neko.sketch.', '');
    context.subscriptions.push(
      vscode.commands.registerCommand(commandId, () => {
        editorProvider.postKeyboardAction(action);
      }),
    );
  }

  // Outline: select layer from tree view
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.sketch.selectLayerFromOutline', (layerId: string) => {
      editorProvider.postKeyboardAction('selectLayer:' + layerId);
    }),
  );

  // Reset zoom
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.sketch.resetZoom', () => {
      editorProvider.postKeyboardAction('resetZoom');
    }),
  );

  // Export sprite sheet
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.sketch.exportSpriteSheet', () => {
      editorProvider.postKeyboardAction('exportSpriteSheet');
    }),
  );

  // Export scene
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.sketch.exportScene', () => {
      editorProvider.postKeyboardAction('exportScene');
    }),
  );

  // Import asset through host-side Sketch authoring.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.sketch.authoring.importImageSource',
      async (args?: unknown) => {
        const parsed = parseAuthoringImportArgs(args);
        if (!parsed) {
          return createNekoProjectAuthoringResult({
            ok: false,
            diagnostics: [
              createNekoProjectAuthoringDiagnostic({
                code: 'invalid-authoring-target',
                message: 'Sketch authoring import requires source path or bytes.',
              }),
            ],
          });
        }

        const target = await resolveSketchAuthoringTarget(
          parsed.target,
          editorProvider,
          parsed.name ?? basenamePath(parsed.path) ?? 'Sketch Import',
        );
        if (!target.ok) return target.result;

        const payload = { ...parsed, target: target.target };
        const result = await executeAuthoringImportSafely(authoringService, payload);
        if (result.ok && result.documentUri) {
          await editorProvider.reloadProjectFromDisk(vscode.Uri.parse(result.documentUri));
        }
        if (result.ok && payload.target.reveal && result.documentUri) {
          return revealSketchAuthoringResult(result);
        }
        return result;
      },
    ),
  );

  // Import image data — accepts base64 string + name, injects directly as a new layer.
  // Used by neko-agent SketchGenerate tool for AI-generated image import.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.sketch.importImageData',
      (base64: string, name: string) => {
        editorProvider.postImageData(base64, name);
      },
    ),
  );

  // ─── Phase 2: Cross-module workflow commands ───

  // Send current canvas export to neko-cut timeline
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.sketch.sendToTimeline', async () => {
      const base64 = await editorProvider.requestExport();
      if (!base64) {
        void handleError(new Error(vscode.l10n.t('neko.sketch.sendToTimeline.noCanvas')), {
          showToUser: true,
          severity: 'warning',
        });
        return;
      }
      try {
        const cutTarget = await selectExistingCutProjectTarget();
        await vscode.commands.executeCommand('neko.cut.authoring.importGeneratedClip', {
          data: base64,
          type: 'image',
          name: 'sketch-export',
          duration: 3,
          source: 'sketch',
          target: cutTarget.target,
          expectedProjectRevision: cutTarget.expectedProjectRevision,
        });
      } catch (error) {
        void handleError(error instanceof Error ? error : new Error(String(error)), {
          showToUser: true,
        });
      }
    }),
  );

  // Send current canvas export back to the source Canvas node
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.sketch.sendToCanvas', async () => {
      const ctx = editorProvider.getImportContext();
      if (!ctx?.sourceNodeId) {
        void handleError(new Error(vscode.l10n.t('neko.sketch.sendToCanvas.noContext')), {
          showToUser: true,
          severity: 'warning',
        });
        return;
      }
      const base64 = await editorProvider.requestExport();
      if (!base64) {
        void handleError(new Error(vscode.l10n.t('neko.sketch.sendToCanvas.noCanvas')), {
          showToUser: true,
          severity: 'warning',
        });
        return;
      }
      try {
        await vscode.commands.executeCommand('neko.canvas.updateNodeImage', {
          nodeId: ctx.sourceNodeId,
          cellId: ctx.metadata?.['cellId'],
          imageData: base64,
        });
      } catch (error) {
        void handleError(error instanceof Error ? error : new Error(String(error)), {
          showToUser: true,
        });
      }
    }),
  );

  // Open an image in Sketch with optional source context (called by canvas/preview)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.sketch.editImage',
      async (args: { base64: string; name: string; context: SketchImportContext }) => {
        if (editorProvider.isActive()) {
          editorProvider.importImageWithContext(args.base64, args.name, args.context);
        } else {
          const target = await resolveSketchAuthoringTarget(
            { kind: 'new', title: args.name, reveal: true },
            editorProvider,
            args.name,
          );
          if (!target.ok) {
            void handleError(new Error(formatAuthoringDiagnostics(target.result)), {
              showToUser: true,
              severity: 'warning',
            });
            return;
          }
          const result = await executeAuthoringImportSafely(authoringService, {
            target: target.target,
            bytes: base64ToBytes(args.base64),
            name: args.name,
            mimeType: inferImageMimeType(args.name) ?? inferDataUrlMimeType(args.base64),
          });
          if (!result.ok) {
            void handleError(new Error(formatAuthoringDiagnostics(result)), {
              showToUser: true,
              severity: 'error',
            });
            return;
          }
          editorProvider.setImportContext(args.context);
          await revealSketchAuthoringResult(result);
        }
      },
    ),
  );
}

async function selectExistingCutProjectTarget(): Promise<{
  readonly target: { readonly kind: 'file'; readonly documentUri: string };
  readonly expectedProjectRevision: string;
}> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { 'Neko Cut Project': ['nkv'] },
    openLabel: 'Select Cut Project',
  });
  const documentUri = selected?.[0]?.toString();
  if (!documentUri) {
    throw new Error('Cut authoring was cancelled before an explicit .nkv target was selected.');
  }
  const cutExtension = vscode.extensions.getExtension<NekoCutAPI>('neko.neko-cut');
  if (!cutExtension) throw new Error('Neko Cut is unavailable for explicit project authoring.');
  const cutApi = cutExtension.isActive ? cutExtension.exports : await cutExtension.activate();
  const info = await cutApi.timeline.getInfo({ documentUri });
  return {
    target: { kind: 'file', documentUri },
    expectedProjectRevision: info.projectRevision,
  };
}

interface SketchAuthoringImportPayload {
  readonly target: NekoProjectAuthoringTarget;
  readonly path?: string;
  readonly bytes?: Uint8Array;
  readonly name?: string;
  readonly mimeType?: string;
}

function parseAuthoringImportArgs(args: unknown): SketchAuthoringImportPayload | null {
  if (!isRecord(args)) return null;
  const target = parseAuthoringTarget(args);
  const path = readNonEmptyString(args.path) ?? readNonEmptyString(args.sourcePath);
  const bytes = normalizeBytes(args.bytes);
  if (!path && !bytes) return null;
  return {
    target,
    ...(path ? { path: toFsPath(path) } : {}),
    ...(bytes ? { bytes } : {}),
    ...(readNonEmptyString(args.name) ? { name: readNonEmptyString(args.name) } : {}),
    ...(readNonEmptyString(args.mimeType) ? { mimeType: readNonEmptyString(args.mimeType) } : {}),
  };
}

function parseAuthoringTarget(args: Record<string, unknown>): NekoProjectAuthoringTarget {
  const nested = isRecord(args.target) ? args.target : {};
  const documentUri =
    readNonEmptyString(nested.documentUri) ?? readNonEmptyString(args.documentUri);
  const kind = readAuthoringTargetKind(nested.kind ?? args.targetKind ?? args.kind);
  const reveal = readBoolean(nested.reveal ?? args.reveal);
  const title = readNonEmptyString(nested.title) ?? readNonEmptyString(args.title);
  return {
    ...(kind ? { kind } : {}),
    ...(documentUri ? { documentUri } : {}),
    ...(title ? { title } : {}),
    ...(reveal !== undefined ? { reveal } : {}),
  };
}

function readAuthoringTargetKind(value: unknown): NekoProjectAuthoringTarget['kind'] | undefined {
  return value === 'active' || value === 'file' || value === 'new' ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function normalizeBytes(value: unknown): Uint8Array | undefined {
  if (!value) return undefined;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value) && value.every((item) => typeof item === 'number')) {
    return Uint8Array.from(value);
  }
  return undefined;
}

async function resolveSketchAuthoringTarget(
  target: NekoProjectAuthoringTarget,
  editorProvider: SketchEditorProvider,
  title: string,
): Promise<
  | { readonly ok: true; readonly target: NekoProjectAuthoringTarget }
  | { readonly ok: false; readonly result: NekoProjectAuthoringResult }
> {
  const reveal = target.reveal ?? false;
  if (target.documentUri) {
    return { ok: true, target: { ...target, reveal } };
  }

  const activeDocumentUri = editorProvider.getActiveDocumentUri()?.toString();
  if (target.kind === 'active') {
    if (activeDocumentUri) {
      return { ok: true, target: { kind: 'active', documentUri: activeDocumentUri, reveal } };
    }
    return {
      ok: false,
      result: createNekoProjectAuthoringResult({
        ok: false,
        diagnostics: [
          createNekoProjectAuthoringDiagnostic({
            code: 'interactive-editor-required',
            message: 'No active Sketch editor is available for active-target authoring.',
          }),
        ],
      }),
    };
  }

  if (target.kind === 'file') {
    return {
      ok: false,
      result: createNekoProjectAuthoringResult({
        ok: false,
        diagnostics: [
          createNekoProjectAuthoringDiagnostic({
            code: 'missing-authoring-target',
            message: 'Sketch file authoring target requires documentUri.',
          }),
        ],
      }),
    };
  }

  if (!target.kind && activeDocumentUri) {
    return { ok: true, target: { kind: 'active', documentUri: activeDocumentUri, reveal } };
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return {
      ok: false,
      result: createNekoProjectAuthoringResult({
        ok: false,
        diagnostics: [
          createNekoProjectAuthoringDiagnostic({
            code: 'workspace-required',
            message:
              'Sketch authoring needs documentUri, active Sketch project, or workspace for create-new.',
          }),
        ],
      }),
    };
  }

  const safeTitle = sanitizeSketchFileName(target.title ?? title);
  const fileUri = await createAvailableSketchFileUri(workspaceFolder.uri, safeTitle);
  return {
    ok: true,
    target: {
      kind: 'new',
      documentUri: fileUri.toString(),
      title: safeTitle,
      reveal,
    },
  };
}

async function createAvailableSketchFileUri(
  workspaceUri: vscode.Uri,
  title: string,
): Promise<vscode.Uri> {
  const baseName = sanitizeSketchFileName(title) || 'Sketch Import';
  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : `-${index}`;
    const uri = vscode.Uri.joinPath(workspaceUri, `${baseName}${suffix}.nks`);
    if (!(await fileExists(uri))) return uri;
  }
  throw new Error(`Unable to allocate a new Sketch project file for ${baseName}.`);
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

function sanitizeSketchFileName(value: string): string {
  return (
    value
      .trim()
      .replace(/[\\/:"*?<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/^\.+/, '')
      .slice(0, 80) || 'Sketch Import'
  );
}

async function executeAuthoringImport(
  authoringService: ISketchProjectAuthoringService,
  payload: SketchAuthoringImportPayload,
): Promise<NekoProjectAuthoringResult> {
  const name = payload.name ?? basenamePath(payload.path);
  if (isPsdPath(name ?? payload.path ?? '')) {
    const bytes =
      payload.bytes ??
      (payload.path
        ? await vscode.workspace.fs.readFile(vscode.Uri.file(payload.path))
        : undefined);
    if (!bytes) {
      return createNekoProjectAuthoringResult({
        ok: false,
        diagnostics: [
          createNekoProjectAuthoringDiagnostic({
            code: 'source-resolution-failed',
            message: 'Sketch PSD authoring import requires readable PSD bytes.',
          }),
        ],
      });
    }
    const psdPayload = await parsePsdToWire(name ?? 'imported.psd', bytes);
    return authoringService.importPsdSource({
      target: payload.target,
      payload: psdPayload,
      ...(payload.path ? { sourcePath: payload.path } : {}),
      ...(payload.bytes ? { bytes: payload.bytes } : {}),
      ...(name ? { name } : {}),
    });
  }

  return authoringService.importImageSource({
    target: payload.target,
    ...(payload.path ? { sourcePath: payload.path } : {}),
    ...(payload.bytes ? { bytes: payload.bytes } : {}),
    ...(name ? { name } : {}),
    mimeType: payload.mimeType ?? inferImageMimeType(name ?? payload.path),
  });
}

async function executeAuthoringImportSafely(
  authoringService: ISketchProjectAuthoringService,
  payload: SketchAuthoringImportPayload,
): Promise<NekoProjectAuthoringResult> {
  try {
    return await executeAuthoringImport(authoringService, payload);
  } catch (error) {
    return createNekoProjectAuthoringResult({
      ok: false,
      diagnostics: [
        createNekoProjectAuthoringDiagnostic({
          code: 'write-failed',
          message: error instanceof Error ? error.message : 'Sketch authoring import failed.',
        }),
      ],
    });
  }
}

async function revealSketchAuthoringResult<T>(
  result: NekoProjectAuthoringResult<T>,
): Promise<NekoProjectAuthoringResult<T>> {
  if (!result.documentUri) {
    return result;
  }
  try {
    await vscode.commands.executeCommand(
      'vscode.openWith',
      vscode.Uri.parse(result.documentUri),
      SketchEditorProvider.viewType,
    );
    return { ...result, revealed: true };
  } catch (error) {
    return {
      ...result,
      revealed: false,
      diagnostics: [
        ...result.diagnostics,
        createNekoProjectAuthoringDiagnostic({
          code: 'authoring-reveal-failed',
          severity: 'warning',
          message: error instanceof Error ? error.message : 'Failed to reveal Sketch project.',
        }),
      ],
    };
  }
}

function toFsPath(value: string): string {
  return value.startsWith('file://') ? vscode.Uri.parse(value).fsPath : value;
}

function base64ToBytes(value: string): Uint8Array {
  const base64 = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  return Buffer.from(base64, 'base64');
}

function inferDataUrlMimeType(value: string): string | undefined {
  const match = /^data:([^;,]+)[;,]/.exec(value);
  return match?.[1];
}

function formatAuthoringDiagnostics(result: NekoProjectAuthoringResult): string {
  return (
    result.diagnostics.map((diagnostic) => diagnostic.message).join('; ') ||
    'Sketch authoring failed.'
  );
}

function basenamePath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.split(/[?#]/, 1)[0]?.replace(/\\/g, '/') ?? value;
  return normalized.split('/').pop() || normalized;
}

function isPsdPath(value: string): boolean {
  return value.split(/[?#]/, 1)[0]?.toLowerCase().endsWith('.psd') ?? false;
}

function inferImageMimeType(value: string | undefined): string | undefined {
  const ext = value?.split(/[?#]/, 1)[0]?.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'bmp') return 'image/bmp';
  if (ext === 'svg') return 'image/svg+xml';
  return undefined;
}
