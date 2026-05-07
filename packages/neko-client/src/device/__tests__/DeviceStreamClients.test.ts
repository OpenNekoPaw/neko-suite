import { describe, expect, it, vi } from 'vitest';
import { GamepadClient } from '../GamepadClient';
import { MidiClient } from '../MidiClient';
import type { DeviceWebSocketLike } from '../types';

class FakeWebSocket implements DeviceWebSocketLike {
  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;

  close(): void {
    this.readyState = 3;
    this.onclose?.({});
  }

  fail(): void {
    this.onerror?.({});
  }

  emit(value: unknown): void {
    this.onmessage?.({ data: JSON.stringify(value) });
  }

  emitRaw(data: unknown): void {
    this.onmessage?.({ data });
  }
}

describe('MIDI and gamepad stream clients', () => {
  it('connects MIDI through EngineClient and parses JSON events from an injectable WebSocket', async () => {
    const events: unknown[] = [];
    let fake: FakeWebSocket | undefined;
    const engine = {
      connectMidi: vi.fn(async () => ({ streamId: 'midi-session-1', wsUrl: 'ws://midi' })),
    };

    const result = await MidiClient.connectToPort(engine, 'midi-1', {
      webSocketFactory: (url) => {
        expect(url).toBe('ws://midi');
        fake = new FakeWebSocket();
        return fake;
      },
      onEvent: (event) => events.push(event),
    });
    fake?.emit({
      timestampUs: 10,
      kind: 'noteOn',
      channel: 1,
      data1: 64,
      data2: 127,
      status: 144,
    });

    expect(engine.connectMidi).toHaveBeenCalledWith('midi-1');
    expect(result.streamId).toBe('midi-session-1');
    expect(events).toEqual([
      { timestampUs: 10, kind: 'noteOn', channel: 1, data1: 64, data2: 127, status: 144 },
    ]);
  });

  it('connects gamepad through EngineClient and parses JSON events from an injectable WebSocket', async () => {
    const events: unknown[] = [];
    let fake: FakeWebSocket | undefined;
    const engine = {
      connectGamepad: vi.fn(async () => ({ streamId: 'gamepad-session-1', wsUrl: 'ws://gamepad' })),
    };

    const result = await GamepadClient.connectToGamepad(engine, 'gamepad-1', {
      webSocketFactory: (url) => {
        expect(url).toBe('ws://gamepad');
        fake = new FakeWebSocket();
        return fake;
      },
      onEvent: (event) => events.push(event),
    });
    fake?.emit({
      timestamp_us: 20,
      gamepad_id: 'gamepad-1',
      kind: 'axis',
      axis: 'leftX',
      value: 0.5,
    });

    expect(engine.connectGamepad).toHaveBeenCalledWith('gamepad-1');
    expect(result.streamId).toBe('gamepad-session-1');
    expect(events).toEqual([
      {
        timestampUs: 20,
        gamepadId: 'gamepad-1',
        kind: 'axis',
        axis: 'leftX',
        value: 0.5,
      },
    ]);
  });

  it('reports malformed stream messages and socket errors', () => {
    const errors: string[] = [];
    let fake: FakeWebSocket | undefined;
    const client = new MidiClient({
      url: 'ws://midi',
      webSocketFactory: () => {
        fake = new FakeWebSocket();
        return fake;
      },
      onError: (error) => errors.push(error.message),
    });

    client.connect();
    fake?.emitRaw('{');
    fake?.emitRaw(new Uint8Array());
    fake?.fail();

    expect(errors).toEqual([
      'Invalid device stream JSON message',
      'Device stream message must be text JSON',
      'Device stream WebSocket error',
    ]);
  });

  it('notifies close and clears ready state', () => {
    let fake: FakeWebSocket | undefined;
    const onClose = vi.fn();
    const client = new GamepadClient({
      url: 'ws://gamepad',
      webSocketFactory: () => {
        fake = new FakeWebSocket();
        return fake;
      },
      onClose,
    });

    client.connect();
    expect(client.readyState).toBe(0);
    fake?.close();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(client.readyState).toBeUndefined();
  });
});
