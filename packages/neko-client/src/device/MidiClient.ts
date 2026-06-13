import { DeviceStreamClient } from './DeviceStreamClient';
import type { DeviceEngineClient, DeviceStreamClientConfig, MidiEvent } from './types';

export class MidiClient extends DeviceStreamClient<MidiEvent> {
  constructor(config: DeviceStreamClientConfig<MidiEvent>) {
    super(config);
  }

  static async connectToPort(
    engine: Pick<DeviceEngineClient, 'connectMidi'>,
    portId: string,
    config: Omit<DeviceStreamClientConfig<MidiEvent>, 'url'>,
  ): Promise<{ streamId: string; client: MidiClient }> {
    const result = await engine.connectMidi(portId);
    const client = new MidiClient({ ...config, url: result.wsUrl });
    client.connect();
    return { streamId: result.streamId, client };
  }

  protected override parseEvent(value: Record<string, unknown>): MidiEvent | undefined {
    const timestampUs = getNumber(value.timestampUs ?? value.timestamp_us);
    const channel = getNumber(value.channel);
    const data1 = getNumber(value.data1);
    const data2 = getNumber(value.data2);
    const status = getNumber(value.status);
    const kind = getString(value.kind);

    if (!kind) return undefined;
    return { timestampUs, kind, channel, data1, data2, status };
  }
}

function getNumber(value: unknown, defaultValue = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : defaultValue;
}

function getString(value: unknown, defaultValue = ''): string {
  return typeof value === 'string' ? value : defaultValue;
}
