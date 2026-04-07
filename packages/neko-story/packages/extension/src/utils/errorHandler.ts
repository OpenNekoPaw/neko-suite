/**
 * NekoStory Extension Error Handler Registry
 *
 * Global error handler access for module-level code.
 * Initialized in activate() with VSCodeErrorHandler.
 * Falls back to a no-op handler before initialization.
 */

import type { IErrorHandler } from '@neko/shared';

/** No-op handler used before activate() */
const noopHandler: IErrorHandler = {
  async handleError() {
    return undefined;
  },
};

let _errorHandler: IErrorHandler = noopHandler;

/** Set the global error handler (called once in activate()) */
export function setErrorHandler(handler: IErrorHandler): void {
  _errorHandler = handler;
}
