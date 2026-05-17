import { describe, expect, it, vi } from 'vitest';
import { EngineClient, type RegisteredFile } from '../index';

function dispatchResponse(data: unknown): Response {
  return new Response(JSON.stringify({ id: 'req-1', status: 'ok', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lastDispatchBody(): Record<string, unknown> {
  const calls = vi.mocked(globalThis.fetch).mock.calls;
  const call = calls[calls.length - 1];
  if (!call) throw new Error('fetch was not called');
  const init = call[1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe('EngineClient file access helpers', () => {
  it('registers and unregisters files through files dispatch', async () => {
    const registered: RegisteredFile = {
      token: 'token-1',
      fileSizeBytes: 42,
      mimeType: 'application/pdf',
      purpose: 'document',
      rangeUrl: '/v1/files/token-1',
      entryBaseUrl: '/v1/files/token-1/entries/',
      resourceBaseUrl: '/v1/files/token-1/resources/',
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(dispatchResponse(registered))
      .mockResolvedValueOnce(dispatchResponse({ released: true }));
    const client = new EngineClient(3456);

    await expect(
      client.registerFile({ filePath: '/project/book.pdf', purpose: 'document' }),
    ).resolves.toEqual(registered);
    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'files',
        action: 'register',
        options: { filePath: '/project/book.pdf', purpose: 'document' },
      }),
    );

    await expect(client.unregisterFile('token-1')).resolves.toBeUndefined();
    expect(lastDispatchBody()).toEqual(
      expect.objectContaining({
        group: 'files',
        action: 'unregister',
        id: 'token-1',
      }),
    );

    fetchMock.mockRestore();
  });

  it('cleans scoped registrations on success and failure', async () => {
    const registered: RegisteredFile = {
      token: 'token-2',
      fileSizeBytes: 7,
      mimeType: 'application/octet-stream',
      purpose: 'subtitle',
      rangeUrl: '/v1/files/token-2',
      entryBaseUrl: null,
      resourceBaseUrl: null,
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(dispatchResponse(registered))
      .mockResolvedValueOnce(dispatchResponse({ released: true }))
      .mockResolvedValueOnce(dispatchResponse(registered))
      .mockResolvedValueOnce(dispatchResponse({ released: true }));
    const client = new EngineClient(3456);

    await expect(
      client.withRegisteredFile({ source: '/media/movie.mkv', purpose: 'subtitle' }, async (file) =>
        file.token.toUpperCase(),
      ),
    ).resolves.toBe('TOKEN-2');
    await expect(
      client.withRegisteredFile('/media/movie.mkv', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const unregisterCalls = vi
      .mocked(globalThis.fetch)
      .mock.calls.filter((call) => String((call[1] as RequestInit).body).includes('unregister'));
    expect(unregisterCalls).toHaveLength(2);

    fetchMock.mockRestore();
  });

  it('reads ranges and entries through general file routes', async () => {
    const rangeBytes = new Uint8Array([1, 2, 3]).buffer;
    const entryBytes = new Uint8Array([4, 5]).buffer;
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(rangeBytes, { status: 206 }))
      .mockResolvedValueOnce(new Response(entryBytes, { status: 200 }));
    const client = new EngineClient(3456);

    await expect(client.readFileRange('token/1', 4, 6)).resolves.toEqual(rangeBytes);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://127.0.0.1:3456/v1/files/token%2F1',
      expect.objectContaining({ headers: { Range: 'bytes=4-6' } }),
    );

    await expect(client.readFileEntry('token/1', '/OPS/chapter 1.xhtml')).resolves.toEqual(
      entryBytes,
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://127.0.0.1:3456/v1/files/token%2F1/entries/OPS/chapter%201.xhtml',
    );

    fetchMock.mockRestore();
  });

  it('builds token-scoped resource URLs for model sibling assets', () => {
    const client = new EngineClient(3456);

    expect(client.getFileResourceBaseUrl('model/token')).toBe(
      'http://127.0.0.1:3456/v1/files/model%2Ftoken/resources/',
    );
    expect(client.getFileResourceUrl('model/token', '/textures/albedo map.png')).toBe(
      'http://127.0.0.1:3456/v1/files/model%2Ftoken/resources/textures/albedo%20map.png',
    );
  });
});
