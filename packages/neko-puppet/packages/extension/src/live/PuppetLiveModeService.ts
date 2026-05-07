import * as vscode from 'vscode';
import type { DisposableLike, ILogger, TrackingData, TrackingServiceApi } from '@neko/shared';
import type { PuppetEditorProvider } from '../editor';
import { mapTrackingToPuppetParams } from './puppetMapping';

export interface PuppetLiveModeServiceConfig {
  readonly editorProvider: PuppetEditorProvider;
  readonly logger: ILogger;
  readonly getTrackingService?: () => Promise<TrackingServiceApi | undefined>;
}

export class PuppetLiveModeService implements vscode.Disposable {
  private trackingDataSubscription: DisposableLike | undefined;
  private active = false;

  constructor(private readonly config: PuppetLiveModeServiceConfig) {}

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
      void this.applyTrackingData(data);
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

  async applyTrackingData(data: TrackingData): Promise<Record<string, number>> {
    const availableNames = this.config.editorProvider.getAvailableFaceParamNames();
    const mapped = mapTrackingToPuppetParams(data, new Set(availableNames));
    if (Object.keys(mapped).length === 0) return mapped;

    try {
      await this.config.editorProvider.setFaceParams(mapped, { persist: false });
    } catch (error) {
      this.config.logger.error('Failed to apply puppet live tracking frame', error);
    }
    return mapped;
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
