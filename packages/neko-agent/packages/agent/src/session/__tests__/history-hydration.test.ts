import { describe, expect, it } from 'vitest';
import { formatToolResultContext, hydrateAgentHistoryWithToolResults } from '../history-hydration';

describe('history hydration', () => {
  it('hydrates assistant tool results as user context messages', () => {
    expect(
      hydrateAgentHistoryWithToolResults([
        { role: 'user', content: 'Generate an image' },
        {
          role: 'assistant',
          content: 'I will call a tool.',
          toolResults: [{ callId: 'call-1', success: true, data: { url: '/tmp/a.png' } }],
        },
      ]),
    ).toEqual([
      { role: 'user', content: 'Generate an image' },
      { role: 'assistant', content: 'I will call a tool.' },
      {
        role: 'user',
        content: '[Tool Result for call-1]: Success\n{\n  "url": "/tmp/a.png"\n}',
      },
    ]);
  });

  it('does not inject tool result context for non-assistant messages', () => {
    expect(
      hydrateAgentHistoryWithToolResults([
        {
          role: 'user',
          content: 'Here is context',
          toolResults: [{ callId: 'call-1', success: true, data: { ignored: true } }],
        },
        { role: 'assistant', content: 'No tool results' },
      ]),
    ).toEqual([
      { role: 'user', content: 'Here is context' },
      { role: 'assistant', content: 'No tool results' },
    ]);
  });

  it('sanitizes circular tool result data before hydrating history', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(
      formatToolResultContext({
        callId: 'call-circular',
        success: false,
        data: circular,
      }),
    ).toBe('[Tool Result for call-circular]: Failed\n{}');
  });

});
