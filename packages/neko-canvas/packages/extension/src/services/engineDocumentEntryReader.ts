import * as vscode from 'vscode';
import { EngineClient } from '@neko/neko-client';
import type { DocumentEntryReader } from '@neko/shared/vscode/extension';

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
  const resolved = await vscode.commands.executeCommand<string | undefined>(
    'neko.assets.resolvePath',
    filePath,
  );
  return resolved && resolved.trim().length > 0 ? resolved : filePath;
}

async function readAuthorizedDocumentRoots(sourceFilePath: string): Promise<readonly string[]> {
  return dedupeNonEmptyPaths([...(await readAuthorizedMediaLibraryRoots()), sourceFilePath]);
}

async function readAuthorizedMediaLibraryRoots(): Promise<readonly string[]> {
  const roots = await vscode.commands.executeCommand<readonly string[] | undefined>(
    'neko.assets.getMediaLibraryRoots',
  );
  return Array.isArray(roots) ? dedupeNonEmptyPaths(roots) : [];
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
