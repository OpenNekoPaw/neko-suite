import { describe, expect, it, vi } from 'vitest';
import { createEngineContentAccessAdapter, readEnginePurpose } from '../engine-file-access';
import type { ContentAccessRequest } from '@neko/shared';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe('createEngineContentAccessAdapter', () => {
  it('registers and reads provider bytes through Engine with signal propagation', async () => {
    const engine = createEngine(PNG_BYTES);
    const adapter = createEngineContentAccessAdapter({
      engineClientProvider: { getOptionalClient: vi.fn(async () => engine as never) },
      maxProviderAssetBytes: PNG_BYTES.byteLength,
    });
    const signal = new AbortController().signal;

    const result = await adapter.readProviderAssetBytes({
      request: createRequest({ mimeType: 'image/png', enginePurpose: 'document' }, signal),
      filePath: '/project/page.png',
    });

    expect(Array.from(result.bytes)).toEqual(Array.from(PNG_BYTES));
    expect(result).toMatchObject({ mimeType: 'image/png', sizeBytes: PNG_BYTES.byteLength });
    expect(engine.registerFile).toHaveBeenCalledWith({
      filePath: '/project/page.png',
      purpose: 'document',
      mimeHint: 'image/png',
    });
    expect(engine.readFileRange).toHaveBeenCalledWith(
      'engine-token',
      0,
      PNG_BYTES.byteLength - 1,
      signal,
    );
    expect(engine.unregisterFile).toHaveBeenCalledWith('engine-token');
  });

  it('rejects whole archive document entry reads', async () => {
    const adapter = createEngineContentAccessAdapter({
      engineClientProvider: { getOptionalClient: vi.fn(async () => createEngine(PNG_BYTES) as never) },
    });

    await expect(
      adapter.readDocumentEntry({ sourcePath: '/project/book.epub' }),
    ).rejects.toThrow('whole document archive bytes are not valid provider assets');
  });

  it('rejects oversized provider assets before reading ranges', async () => {
    const engine = createEngine(PNG_BYTES);
    const adapter = createEngineContentAccessAdapter({
      engineClientProvider: { getOptionalClient: vi.fn(async () => engine as never) },
      maxProviderAssetBytes: PNG_BYTES.byteLength - 1,
    });

    await expect(
      adapter.readProviderAssetBytes({
        request: createRequest({ enginePurpose: 'agent-attachment' }),
        filePath: '/project/large.bin',
      }),
    ).rejects.toThrow(`Provider asset is too large: ${PNG_BYTES.byteLength} bytes.`);
    expect(engine.readFileRange).not.toHaveBeenCalled();
  });

  it('maps unsupported engine purposes to agent attachments', () => {
    expect(readEnginePurpose(createRequest({ enginePurpose: 'document' }))).toBe('document');
    expect(readEnginePurpose(createRequest({ enginePurpose: 'unsupported' }))).toBe(
      'agent-attachment',
    );
  });
});

function createRequest(
  metadata: Record<string, unknown>,
  signal?: AbortSignal,
): ContentAccessRequest {
  return {
    ref: { kind: 'file', path: '/project/source.bin' },
    intent: 'agent-context',
    target: 'bytes',
    metadata,
    ...(signal ? { signal } : {}),
  };
}

function createEngine(bytes: Uint8Array) {
  const engine = {
    registerFile: vi.fn(async () => ({
      token: 'engine-token',
      fileSizeBytes: bytes.byteLength,
    })),
    readFileRange: vi.fn(async () => bytes.buffer.slice(0)),
    readFileEntry: vi.fn(async () => bytes.buffer.slice(0)),
    unregisterFile: vi.fn(async () => undefined),
    withRegisteredFile: vi.fn(async (request, task) => {
      const registered = await engine.registerFile(request);
      try {
        return await task(registered);
      } finally {
        await engine.unregisterFile(registered.token);
      }
    }),
  };
  return engine;
}
