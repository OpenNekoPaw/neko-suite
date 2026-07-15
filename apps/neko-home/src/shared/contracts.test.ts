import { describe, expect, it } from 'vitest';
import {
  HOME_BRIDGE_CHANNELS,
  assertHomeBridgeChannel,
  normalizeHomeAgentRuntimeMessageRequest,
  normalizeHomeSessionOperationRequest,
} from './contracts';

describe('Neko Home bridge contracts', () => {
  it('accepts only registered channels', () => {
    expect(() => assertHomeBridgeChannel(HOME_BRIDGE_CHANNELS.getSnapshot)).not.toThrow();
    expect(() => assertHomeBridgeChannel('neko-home:unknown')).toThrow('Unknown Home bridge channel');
  });

  it('normalizes explicit session identity and rejects unknown operations', () => {
    expect(
      normalizeHomeSessionOperationRequest({
        type: 'queue',
        sessionId: 'home-session-1',
        runtimeId: 'home-session-1:runtime-1',
        prompt: 'continue',
      }),
    ).toMatchObject({ type: 'queue', sessionId: 'home-session-1' });
    expect(() => normalizeHomeSessionOperationRequest({ type: 'activate' })).toThrow(
      'sessionId is required',
    );
  });

  it('fails visibly for invalid Agent runtime messages', () => {
    expect(() => normalizeHomeAgentRuntimeMessageRequest({ message: {} })).toThrow(
      'runtimeId is required',
    );
  });
});
