import { describe, expect, it, vi } from 'vitest';
import { FileConversationStorage } from '../file-conversation-storage';

describe('retired FileConversationStorage', () => {
  it('cannot recreate conversations-index.json as a runtime authority', () => {
    expect(
      () =>
        new FileConversationStorage({
          indexFilePath: '/tmp/conversations-index.json',
          workDir: '/workspace',
          readFile: vi.fn(),
          writeFile: vi.fn(),
          exists: vi.fn(),
        }),
    ).toThrowError(
      expect.objectContaining({
        code: 'agent-retired-metadata-store',
        storeKind: 'conversation-file-storage',
      }),
    );
  });
});
