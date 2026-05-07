import type { DeviceStreamClientConfig, DeviceWebSocketLike } from './types';

const WS_OPEN = 1;

export abstract class DeviceStreamClient<TEvent> {
  private socket: DeviceWebSocketLike | null = null;

  protected constructor(private readonly config: DeviceStreamClientConfig<TEvent>) {}

  connect(): void {
    const socket = this.createSocket(this.config.url);
    this.socket = socket;
    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onerror = () => this.reportError(new Error('Device stream WebSocket error'));
    socket.onclose = () => {
      this.socket = null;
      this.config.onClose?.();
    };
  }

  close(code?: number, reason?: string): void {
    this.socket?.close(code, reason);
    this.socket = null;
  }

  get readyState(): number | undefined {
    return this.socket?.readyState;
  }

  protected abstract parseEvent(value: Record<string, unknown>): TEvent | undefined;

  private createSocket(url: string): DeviceWebSocketLike {
    if (this.config.webSocketFactory) {
      return this.config.webSocketFactory(url);
    }
    return createNativeWebSocket(url);
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') {
      this.reportError(new Error('Device stream message must be text JSON'));
      return;
    }
    const value = parseJsonObject(data);
    if (!value) {
      this.reportError(new Error('Invalid device stream JSON message'));
      return;
    }
    const event = this.parseEvent(value);
    if (event) {
      this.config.onEvent?.(event);
    }
  }

  private reportError(error: Error): void {
    this.config.onError?.(error);
  }
}

function parseJsonObject(data: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(data);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function createNativeWebSocket(url: string): DeviceWebSocketLike {
  if (typeof WebSocket === 'undefined') {
    throw new Error('WebSocket is not available; provide webSocketFactory');
  }

  const socket = new WebSocket(url);
  let onopen: ((event: unknown) => void) | null = null;
  let onmessage: ((event: { data: unknown }) => void) | null = null;
  let onerror: ((event: unknown) => void) | null = null;
  let onclose: ((event: unknown) => void) | null = null;

  socket.onopen = (event) => onopen?.(event);
  socket.onmessage = (event) => onmessage?.({ data: event.data });
  socket.onerror = (event) => onerror?.(event);
  socket.onclose = (event) => onclose?.(event);

  return {
    get readyState() {
      return socket.readyState;
    },
    get onopen() {
      return onopen;
    },
    set onopen(handler) {
      onopen = handler;
    },
    get onmessage() {
      return onmessage;
    },
    set onmessage(handler) {
      onmessage = handler;
    },
    get onerror() {
      return onerror;
    },
    set onerror(handler) {
      onerror = handler;
    },
    get onclose() {
      return onclose;
    },
    set onclose(handler) {
      onclose = handler;
    },
    close(code?: number, reason?: string) {
      socket.close(code, reason);
    },
  };
}

export function isSocketOpen(socket: DeviceWebSocketLike | null): boolean {
  return socket?.readyState === WS_OPEN;
}
