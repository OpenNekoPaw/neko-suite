import * as vscode from 'vscode';
import { EngineClient } from '@neko/neko-client';
import {
  createHostContentPathResolver,
  getHostContentAuthorizedReadRoots,
  type DocumentEntryReader,
} from '@neko/shared/vscode/extension';

export function createCanvasEngineDocumentEntryReader(): DocumentEntryReader {
  let engineClient: EngineClient | undefined;

  return {
    readEntry: async (source, entryPath) => {
      const filePath = await resolveCanvasDocumentSourcePath(source.filePath);
      const engine = await getEngineClient(engineClient, filePath);
      engineClient = engine;
      return engine.withRegisteredFile(
        { filePath, purpose: 'document' },
        async (registered) =>
          new Uint8Array(await engine.readFileEntry(registered.token, entryPath)),
      );
    },
  };
}

async function getEngineClient(
  current: EngineClient | undefined,
  sourceFilePath: string,
): Promise<EngineClient> {
  const authorizedRoots = await readAuthorizedDocumentRoots(sourceFilePath);
  const result = await vscode.commands.executeCommand<{ port: number } | null>(
    'neko.engine.ensureFrameServer',
    authorizedRoots,
  );
  if (!result) {
    throw new Error('neko-engine Frame Server is unavailable for document entry reads.');
  }
  return current ?? new EngineClient(result.port);
}

async function resolveCanvasDocumentSourcePath(filePath: string): Promise<string> {
  const resolver = await createHostContentPathResolver({
    workspaceRoot: getWorkspaceRoot(),
    getExtension: vscode.extensions.getExtension,
  });
  const resolved = resolver.resolve(filePath);
  if (resolver.hasVariable(resolved)) {
    throw new Error(`Canvas document source path uses an unknown path variable: ${filePath}`);
  }
  return resolved;
}

async function readAuthorizedDocumentRoots(sourceFilePath: string): Promise<readonly string[]> {
  return dedupeNonEmptyPaths([
    ...(await getHostContentAuthorizedReadRoots({
      workspaceRoot: getWorkspaceRoot(),
      getExtension: vscode.extensions.getExtension,
    })),
    sourceFilePath,
  ]);
}

function dedupeNonEmptyPaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    const trimmed = path.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
