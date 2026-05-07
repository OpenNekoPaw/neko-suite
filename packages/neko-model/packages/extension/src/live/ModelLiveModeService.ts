import * as vscode from 'vscode';
import type { DisposableLike, ILogger, TrackingData, TrackingServiceApi } from '@neko/shared';
import type { ModelEditorProvider } from '../editor/ModelEditorProvider';
import { mapTrackingToVrmExpressions, type VrmExpressionValues } from './vmcMapping';

export interface ModelLiveModeServiceConfig {
  readonly editorProvider: ModelEditorProvider;
  readonly logger: ILogger;
  readonly getTrackingService?: () => Promise<TrackingServiceApi | undefined>;
}

export class ModelLiveModeService implements vscode.Disposable {
  private trackingDataSubscription: DisposableLike | undefined;
  private active = false;

  constructor(private readonly config: ModelLiveModeServiceConfig) {}

  isActive(): boolean {
    return this.active;
  }

  async start(): Promise<void> {
    if (this.active) return;
    const trackingService = await this.getTrackingService();
    if (!trackingService) {
      throw new Error('Tracking service is not available');
    }

    this.trackingDataSubscription = trackingService.onTrackingData((data) => {
      this.applyTrackingData(data);
    });
    try {
      const status = await trackingService.start({ source: 'vmc' });
      if (!status.active && status.errorMessage) {
        throw new Error(status.errorMessage);
      }
    } catch (error) {
      this.trackingDataSubscription?.dispose();
      this.trackingDataSubscription = undefined;
      throw error;
    }
    this.active = true;
  }

  async stop(): Promise<void> {
    this.trackingDataSubscription?.dispose();
    this.trackingDataSubscription = undefined;
    this.active = false;
  }

  applyTrackingData(data: TrackingData): VrmExpressionValues {
    const expressions = mapTrackingToVrmExpressions(data);
    try {
      this.config.editorProvider.applyLiveExpressions(expressions);
    } catch (error) {
      this.config.logger.error('Failed to apply model live tracking frame', error);
    }
    return expressions;
  }

  dispose(): void {
    this.trackingDataSubscription?.dispose();
    this.trackingDataSubscription = undefined;
    this.active = false;
  }

  private async getTrackingService(): Promise<TrackingServiceApi | undefined> {
    if (this.config.getTrackingService) {
      return this.config.getTrackingService();
    }
    return vscode.commands.executeCommand<TrackingServiceApi>('neko.tracking.getApi');
  }
}
