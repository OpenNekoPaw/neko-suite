import { describe, expect, it } from 'vitest';
import {
  TuiDebugAutomationProtocolError,
  parseTuiDebugAutomationRequest,
  validateTuiDebugAutomationTimeout,
} from '../protocol';
import { TUI_DEBUG_AUTOMATION_REQUEST_SCHEMA } from '../types';

describe('TUI debug automation protocol', () => {
  it('parses a valid request', () => {
    const request = parseTuiDebugAutomationRequest(
      JSON.stringify({
        schema: TUI_DEBUG_AUTOMATION_REQUEST_SCHEMA,
        id: '1',
        method: 'session.facts',
        params: { sessionId: 'debug-session-1' },
      }),
    );

    expect(request).toMatchObject({
      id: '1',
      method: 'session.facts',
      params: { sessionId: 'debug-session-1' },
    });
  });

  it('fails visibly for invalid json, schema, and unknown method', () => {
    expect(() => parseTuiDebugAutomationRequest('{')).toThrow(TuiDebugAutomationProtocolError);
    expect(() =>
      parseTuiDebugAutomationRequest(
        JSON.stringify({ schema: 'wrong', id: '1', method: 'session.facts' }),
      ),
    ).toThrow('request schema');
    expect(() =>
      parseTuiDebugAutomationRequest(
        JSON.stringify({
          schema: TUI_DEBUG_AUTOMATION_REQUEST_SCHEMA,
          id: '1',
          method: 'agent.turn',
        }),
      ),
    ).toThrow('Unknown debug automation method');
  });

  it('validates timeout values without provider credentials', () => {
    expect(validateTuiDebugAutomationTimeout(undefined, { defaultMs: 42, label: 'timeoutMs' })).toBe(
      42,
    );
    expect(() =>
      validateTuiDebugAutomationTimeout(0, { defaultMs: 42, label: 'timeoutMs' }),
    ).toThrow('positive integer');
    expect(() =>
      validateTuiDebugAutomationTimeout(20, {
        defaultMs: 42,
        label: 'timeoutMs',
        maxMs: 10,
      }),
    ).toThrow('<= 10ms');
  });
});
