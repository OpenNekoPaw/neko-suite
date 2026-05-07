import * as vscode from 'vscode';
import type {
  DisposableLike,
  ILogger,
  TrackingData,
  TrackingServiceApi,
  TrackingSource,
  TrackingStartOptions,
  TrackingStatus,
} from '@neko/shared';
import { VmcReceiver } from '../vmc/VmcReceiver';

interface TrackingReceiver {
  readonly isRunning: boolean;
  readonly fps: number;
  on(event: 'tracking', listener: (data: TrackingData) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  on(event: 'started', listener: () => void): void;
  on(event: 'stopped', listener: () => void): void;
  start(): Promise<void>;
  stop(): void;
}

export type TrackingReceiverFactory = (port: number, logger: ILogger) => TrackingReceiver;

// TODO(P2): Move TrackingService ownership from neko-live to the neko-suite aggregation or platform extension.
export class TrackingService implements TrackingServiceApi, vscode.Disposable {
  private receiver: TrackingReceiver | undefined;
  private statusValue: TrackingStatus = { source: 'vmc', active: false, fps: 0 };
  private readonly dataListeners = new Set<(data: TrackingData) => void>();
  private readonly statusListeners = new Set<(status: TrackingStatus) => void>();

  constructor(
    private readonly logger: ILogger,
    private readonly defaultPort: number,
    private readonly receiverFactory: TrackingReceiverFactory = createVmcReceiver,
  ) {}

  async start(options: TrackingStartOptions = {}): Promise<TrackingStatus> {
    const source = options.source ?? 'vmc';
    if (source !== 'vmc') {
      return this.publishStatus({
        source,
        active: false,
        fps: 0,
        errorMessage: `Tracking source ${source} is not implemented`,
      });
    }

    const port = options.port ?? this.defaultPort;
    if (this.receiver?.isRunning && this.statusValue.port === port) {
      return this.statusValue;
    }

    this.stop('vmc');
    const receiver = this.receiverFactory(port, this.logger);
    this.receiver = receiver;
    receiver.on('tracking', (data) => this.publishTrackingData(data));
    receiver.on('error', (error) => {
      this.logger.error('Tracking receiver error', error);
      this.publishStatus({
        source: 'vmc',
        active: false,
        fps: 0,
        port,
        errorMessage: error.message,
      });
    });
    receiver.on('started', () => {
      this.publishStatus({ source: 'vmc', active: true, fps: receiver.fps, port });
    });
    receiver.on('stopped', () => {
      this.publishStatus({ source: 'vmc', active: false, fps: 0, port });
    });

    try {
      await receiver.start();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to start tracking receiver', error);
      this.receiver = undefined;
      return this.publishStatus({
        source: 'vmc',
        active: false,
        fps: 0,
        port,
        errorMessage: message,
      });
    }

    return this.statusValue;
  }

  async stop(source: TrackingSource = 'vmc'): Promise<TrackingStatus> {
    if (source !== 'vmc') {
      return this.publishStatus({ source, active: false, fps: 0 });
    }
    if (this.receiver) {
      this.receiver.stop();
      this.receiver = undefined;
    }
    return this.publishStatus({
      source: 'vmc',
      active: false,
      fps: 0,
      port: this.statusValue.port,
    });
  }

  async status(source: TrackingSource = 'vmc'): Promise<TrackingStatus> {
    if (source !== this.statusValue.source) {
      return { source, active: false, fps: 0 };
    }
    return this.statusValue;
  }

  onTrackingData(listener: (data: TrackingData) => void): DisposableLike {
    this.dataListeners.add(listener);
    return { dispose: () => this.dataListeners.delete(listener) };
  }

  onStatusChange(listener: (status: TrackingStatus) => void): DisposableLike {
    this.statusListeners.add(listener);
    return { dispose: () => this.statusListeners.delete(listener) };
  }

  dispose(): void {
    void this.stop('vmc');
    this.dataListeners.clear();
    this.statusListeners.clear();
  }

  private publishTrackingData(data: TrackingData): void {
    for (const listener of this.dataListeners) {
      listener(data);
    }
  }

  private publishStatus(status: TrackingStatus): TrackingStatus {
    this.statusValue = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
    return status;
  }
}

export function registerTrackingCommands(
  context: vscode.ExtensionContext,
  service: TrackingServiceApi,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.tracking.getApi', () => service),
    vscode.commands.registerCommand('neko.tracking.start', (options?: TrackingStartOptions) =>
      service.start(options),
    ),
    vscode.commands.registerCommand('neko.tracking.stop', (source?: TrackingSource) =>
      service.stop(source),
    ),
    vscode.commands.registerCommand('neko.tracking.status', (source?: TrackingSource) =>
      service.status(source),
    ),
  );
}

function createVmcReceiver(port: number, logger: ILogger): TrackingReceiver {
  const receiver = new VmcReceiver(port, logger);
  return receiver as TrackingReceiver;
}
