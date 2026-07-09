import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { runTuiDebugAutomationJsonLineServer } from '../stdio';
import { TUI_DEBUG_AUTOMATION_REQUEST_SCHEMA } from '../types';

describe('TUI debug automation stdio framing', () => {
  it('writes one JSON response per JSON line request', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on('data', (chunk) => chunks.push(chunk.toString()));

    const done = runTuiDebugAutomationJsonLineServer({
      input,
      output,
      handler: {
        async handle(request) {
          return { method: request.method };
        },
      },
    });

    input.write(
      `${JSON.stringify({
        schema: TUI_DEBUG_AUTOMATION_REQUEST_SCHEMA,
        id: '1',
        method: 'session.facts',
        params: { sessionId: 'debug-session-1' },
      })}\n`,
    );
    input.write('not-json\n');
    input.end();
    await done;

    const responses = chunks
      .join('')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { readonly ok: boolean; readonly error?: unknown });
    expect(responses).toHaveLength(2);
    expect(responses[0]).toMatchObject({ ok: true, result: { method: 'session.facts' } });
    expect(responses[1]).toMatchObject({ ok: false, error: { code: 'invalid-json' } });
  });
});
