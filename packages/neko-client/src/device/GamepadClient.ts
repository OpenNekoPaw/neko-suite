import { DeviceStreamClient } from './DeviceStreamClient';
import type { DeviceEngineClient, DeviceStreamClientConfig, GamepadEvent } from './types';

export class GamepadClient extends DeviceStreamClient<GamepadEvent> {
  constructor(config: DeviceStreamClientConfig<GamepadEvent>) {
    super(config);
  }

  static async connectToGamepad(
    engine: Pick<DeviceEngineClient, 'connectGamepad'>,
    gamepadId: string,
    config: Omit<DeviceStreamClientConfig<GamepadEvent>, 'url'>,
  ): Promise<{ streamId: string; client: GamepadClient }> {
    const result = await engine.connectGamepad(gamepadId);
    const client = new GamepadClient({ ...config, url: result.wsUrl });
    client.connect();
    return { streamId: result.streamId, client };
  }

  protected override parseEvent(value: Record<string, unknown>): GamepadEvent | undefined {
    const timestampUs = getNumber(value.timestampUs ?? value.timestamp_us);
    const gamepadId = getString(value.gamepadId ?? value.gamepad_id);
    const kind = getString(value.kind);
    const button = getOptionalString(value.button);
    const axis = getOptionalString(value.axis);
    const eventValue = getNumber(value.value);

    if (!gamepadId || !kind) return undefined;
    return { timestampUs, gamepadId, kind, button, axis, value: eventValue };
  }
}

function getNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function getString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
