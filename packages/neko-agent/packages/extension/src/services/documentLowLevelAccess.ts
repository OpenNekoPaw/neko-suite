import * as fs from 'fs/promises';
import type { DocumentLowLevelAccess } from '@neko/platform/document';
import type { IEngineClientProvider } from './engineClientProvider';

export function createDocumentLowLevelAccess(
  engineClientProvider?: IEngineClientProvider,
): DocumentLowLevelAccess {
  const access: DocumentLowLevelAccess = {
    async identify(filePath) {
      const stat = await fs.stat(filePath);
      return {
        fileId: `${filePath}:${stat.size}:${stat.mtimeMs}`,
        sizeBytes: stat.size,
        mtimeMs: stat.mtimeMs,
      };
    },
  };

  if (!engineClientProvider) {
    return access;
  }

  return {
    ...access,
    async readRange(filePath, start, end) {
      const engine = await engineClientProvider.getOptionalClient();
      if (!engine) {
        throw new Error('Engine file access is unavailable for document byte range reads');
      }

      return engine.withRegisteredFile(
        { filePath, purpose: 'document' },
        async (registered) =>
          new Uint8Array(await engine.readFileRange(registered.token, start, end)),
      );
    },

    async readEntry(filePath, entryPath) {
      const engine = await engineClientProvider.getOptionalClient();
      if (!engine) {
        throw new Error('Engine file access is unavailable for document entry reads');
      }

      return engine.withRegisteredFile(
        { filePath, purpose: 'document' },
        async (registered) =>
          new Uint8Array(await engine.readFileEntry(registered.token, entryPath)),
      );
    },
  };
}
