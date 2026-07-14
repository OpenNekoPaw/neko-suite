import { describe, expect, it } from 'vitest';
import {
  HOME_BRIDGE_CHANNELS,
  assertHomeBridgeChannel,
  normalizeHomeAgentRuntimeMessageRequest,
} from './contracts';

describe('Neko Home bridge contracts', () => {
  it('accepts only registered channels', () => {
    expect(() => assertHomeBridgeChannel(HOME_BRIDGE_CHANNELS.getSnapshot)).not.toThrow();
    expect(() => assertHomeBridgeChannel('neko-home:unknown')).toThrow('Unknown Home bridge channel');
  });

  it('fails visibly for invalid Agent runtime messages', () => {
    expect(() => normalizeHomeAgentRuntimeMessageRequest({ message: {} })).toThrow(
      'runtimeId is required',
    );
  });
});
