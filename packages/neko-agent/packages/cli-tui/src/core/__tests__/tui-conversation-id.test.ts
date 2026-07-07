import { describe, expect, it } from 'vitest';
import { createCliConversationId, isPathSafeCliConversationId } from '../tui-conversation-id';

describe('tui conversation id', () => {
  it('creates NekoPaths-safe CLI conversation ids', () => {
    const id = createCliConversationId(123456789, 0.123456789);

    expect(id).toMatch(/^cli-[a-z0-9]+-[a-z0-9]+$/);
    expect(id).not.toContain(':');
    expect(id).not.toContain('/');
    expect(isPathSafeCliConversationId(id)).toBe(true);
  });
});
