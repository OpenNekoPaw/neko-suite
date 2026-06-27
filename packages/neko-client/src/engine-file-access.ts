import type {
  ContentAccessRequest,
  ContentEngineSource,
} from '@neko/shared';
import type { EngineClient, FileAccessPurpose } from './EngineClient';

export interface EngineClientProviderLike {
  getOptionalClient(): Promise<EngineClient | null>;
}

export interface CreateEngineContentAccessAdapterOptions {
  readonly engineClientProvider: EngineClientProviderLike;
  readonly maxProviderAssetBytes?: number;
}

export interface EngineContentAccessAdapter {
  createEngineSource(
    request: ContentAccessRequest,
    filePath: string,
  ): Promise<ContentEngineSource>;
  readProviderAssetBytes(input: {
    readonly request: ContentAccessRequest;
    readonly filePath: string;
    readonly maxBytes?: number;
  }): Promise<{ readonly bytes: Uint8Array; readonly mimeType?: string; readonly sizeBytes: number }>;
  readDocumentEntry(input: {
    readonly sourcePath: string;
    readonly entryPath?: string;
  }): Promise<Uint8Array>;
  createDocumentLowLevelAccess(): EngineDocumentLowLevelAccess;
}

export interface EngineDocumentLowLevelAccess {
  identify(filePath: string): Promise<{ fileId?: string; sizeBytes?: number; mtimeMs?: number }>;
  readText(filePath: string): Promise<string>;
  readFile(filePath: string): Promise<Uint8Array>;
  readRange(filePath: string, start: number, end: number): Promise<Uint8Array>;
  readEntry(filePath: string, entryPath: string): Promise<Uint8Array>;
}

const DEFAULT_PROVIDER_ASSET_RANGE_BYTES = 20 * 1024 * 1024;

export function createEngineContentAccessAdapter(
  options: CreateEngineContentAccessAdapterOptions,
): EngineContentAccessAdapter {
  const maxProviderAssetBytes =
    options.maxProviderAssetBytes ?? DEFAULT_PROVIDER_ASSET_RANGE_BYTES;

  async function getEngine(boundary: string): Promise<EngineClient> {
    const engine = await options.engineClientProvider.getOptionalClient();
    if (!engine) {
      throw new Error(`Engine file access is unavailable for ${boundary}.`);
    }
    return engine;
  }

  const adapter: EngineContentAccessAdapter = {
    async createEngineSource(request, filePath) {
      const engine = await getEngine('engine source access');
      const registered = await engine.registerFile({
        filePath,
        purpose: readEnginePurpose(request),
        mimeHint: readStringMetadata(request.metadata, 'mimeType'),
      });
      return {
        token: registered.token,
        sourcePath: filePath,
        runtimeOnly: true,
      };
    },

    async readProviderAssetBytes(input) {
      const engine = await getEngine('binary/media provider assets');
      const maxBytes = input.maxBytes ?? maxProviderAssetBytes;
      return engine.withRegisteredFile(
        {
          filePath: input.filePath,
          purpose: readEnginePurpose(input.request),
          mimeHint: readStringMetadata(input.request.metadata, 'mimeType'),
        },
        async (registered) => {
          if (input.request.signal?.aborted) {
            throw new Error('Operation aborted.');
          }
          if (registered.fileSizeBytes > maxBytes) {
            throw new Error(`Provider asset is too large: ${registered.fileSizeBytes} bytes.`);
          }
          if (registered.fileSizeBytes === 0) {
            return { bytes: new Uint8Array(), sizeBytes: 0 };
          }
          const bytes = new Uint8Array(
            await engine.readFileRange(
              registered.token,
              0,
              registered.fileSizeBytes - 1,
              input.request.signal,
            ),
          );
          return {
            bytes,
            mimeType: readStringMetadata(input.request.metadata, 'mimeType'),
            sizeBytes: registered.fileSizeBytes,
          };
        },
      );
    },

    async readDocumentEntry(input) {
      if (!input.entryPath) {
        throw new Error(
          'Document entry reads require a stable document entry path; whole document archive bytes are not valid provider assets.',
        );
      }
      const bytes = await adapter.createDocumentLowLevelAccess().readEntry(
        input.sourcePath,
        input.entryPath,
      );
      if (!bytes) {
        throw new Error(`Document entry cannot be read: ${input.entryPath}`);
      }
      return bytes;
    },

    createDocumentLowLevelAccess() {
      return {
        async identify(filePath) {
          const engine = await getEngine('document identity');
          return engine.withRegisteredFile({ filePath, purpose: 'document' }, async (registered) => ({
            fileId: `${filePath}:${registered.fileSizeBytes}`,
            sizeBytes: registered.fileSizeBytes,
          }));
        },

        async readText(filePath) {
          const bytes = await this.readFile(filePath);
          return new TextDecoder().decode(bytes);
        },

        async readFile(filePath) {
          const engine = await getEngine('document binary reads');
          return engine.withRegisteredFile({ filePath, purpose: 'document' }, async (registered) => {
            if (registered.fileSizeBytes === 0) return new Uint8Array();
            return new Uint8Array(
              await engine.readFileRange(registered.token, 0, registered.fileSizeBytes - 1),
            );
          });
        },

        async readRange(filePath, start, end) {
          const engine = await getEngine('document byte range reads');
          return engine.withRegisteredFile({ filePath, purpose: 'document' }, async (registered) =>
            new Uint8Array(await engine.readFileRange(registered.token, start, end)),
          );
        },

        async readEntry(filePath, entryPath) {
          const engine = await getEngine('document entry reads');
          return engine.withRegisteredFile({ filePath, purpose: 'document' }, async (registered) =>
            new Uint8Array(await engine.readFileEntry(registered.token, entryPath)),
          );
        },
      };
    },
  };

  return adapter;
}

export function readEnginePurpose(request: ContentAccessRequest): FileAccessPurpose {
  const purpose = readStringMetadata(request.metadata, 'enginePurpose');
  return purpose === 'document' ||
    purpose === 'media-decode' ||
    purpose === 'model' ||
    purpose === 'puppet' ||
    purpose === 'agent-attachment'
    ? purpose
    : 'agent-attachment';
}

function readStringMetadata(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
