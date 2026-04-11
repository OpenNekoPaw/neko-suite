import type * as vscode from 'vscode';
import type { EngineClient } from '@neko/neko-client';
import type { IEngineMediaService } from '../../contracts/IEngineMediaService';
import type { MediaDiffService } from '../services/MediaDiffService';
import { MediaDiffMessageHandler } from './MediaDiffMessageHandler';
import {
  type IMediaDiffEditorMessageHandler,
  type IMediaDiffEditorSession,
  type IMediaDiffEditorSessionFactory,
  type IMediaDiffEditorSessionOptions,
  MediaDiffEditorSession,
} from './MediaDiffEditorSession';

export interface IMediaDiffEditorMessageHandlerFactoryOptions {
  webview: vscode.Webview;
  documentUri: vscode.Uri;
  diffService: MediaDiffService;
  engineClient: EngineClient | null;
  previousUri?: vscode.Uri;
}

export type MediaDiffEditorMessageHandlerFactory = (
  options: IMediaDiffEditorMessageHandlerFactoryOptions,
) => IMediaDiffEditorMessageHandler;

export class MediaDiffEditorSessionFactory implements IMediaDiffEditorSessionFactory {
  constructor(
    private readonly diffService: MediaDiffService,
    private readonly engineMediaService: IEngineMediaService,
    private readonly createMessageHandler: MediaDiffEditorMessageHandlerFactory = (options) =>
      new MediaDiffMessageHandler(
        options.webview,
        options.documentUri,
        options.diffService,
        options.engineClient,
        options.previousUri,
      ),
  ) {}

  async createSession(options: IMediaDiffEditorSessionOptions): Promise<IMediaDiffEditorSession> {
    const engineClient = await this.engineMediaService.ensureClient();
    const messageHandler = this.createMessageHandler({
      webview: options.webviewPanel.webview,
      documentUri: options.documentUri,
      diffService: this.diffService,
      engineClient,
      previousUri: options.previousUri,
    });

    return new MediaDiffEditorSession(options.webviewPanel, messageHandler, engineClient !== null);
  }
}
