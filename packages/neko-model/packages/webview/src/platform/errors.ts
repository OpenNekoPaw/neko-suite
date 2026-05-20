import type { ErrorDisplayOptions, IErrorHandler } from '@neko/shared';
import { BaseError, getDefaultDisplayOptions, toBaseError } from '@neko/shared';
import { t } from '../i18n';
import { getLogger } from './logger';

export type ModelWebviewErrorKey =
  | 'error.retry'
  | 'error.cameraUpdateFailed'
  | 'error.cameraAckViewportMismatch'
  | 'error.hitTestFailed'
  | 'error.webCodecsUnavailable'
  | 'error.engineStreamDisconnected'
  | 'error.engineStreamUnavailable'
  | 'error.routeAUnavailable'
  | 'error.sceneCommandRejected'
  | 'error.sceneCommandStatus'
  | 'error.sceneControlDisconnected'
  | 'error.noEngineCharacterSelected';

const logger = getLogger('Errors');

class WebviewErrorHandler implements IErrorHandler {
  async handleError(
    error: Error | BaseError,
    options?: Partial<ErrorDisplayOptions>,
  ): Promise<string | undefined> {
    const normalized = error instanceof BaseError ? error : toBaseError(error);
    const defaults = getDefaultDisplayOptions(normalized.category);
    const display = { ...defaults, ...options };

    switch (display.severity) {
      case 'info':
        logger.info(normalized.message, normalized);
        break;
      case 'warning':
        logger.warn(normalized.message, normalized);
        break;
      case 'fatal':
      case 'error':
        logger.error(normalized.message, normalized);
        break;
    }

    return undefined;
  }
}

export const webviewErrorHandler: IErrorHandler = new WebviewErrorHandler();

export function modelErrorMessage(
  key: ModelWebviewErrorKey,
  params?: Record<string, string | number>,
): string {
  return t(key, params);
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
