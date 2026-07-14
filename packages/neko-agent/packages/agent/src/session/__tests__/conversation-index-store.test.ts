import { describe, expect, it, vi } from 'vitest';
import { ConversationIndexStore } from '../conversation-index-store';

describe('retired ConversationIndexStore', () => {
  it('cannot return normal JSON index success after SQLite cutover', () => {
    expect(
      () =>
        new ConversationIndexStore({
          filePath: '/tmp/conversations-index.json',
          readFile: vi.fn(),
          writeFile: vi.fn(),
          exists: vi.fn(),
        }),
    ).toThrowError(
      expect.objectContaining({
        code: 'agent-retired-metadata-store',
        storeKind: 'conversation-index-json',
      }),
    );
  });
});
